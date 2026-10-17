import { DatabaseSync } from "node:sqlite";
import { Queue } from "../queue.js";
import { DomainError } from "../errors.js";
import { INITIAL_STATE, STATES, nextState, holdsSeats } from "../bookingStates.js";
import { checkBookingRequest, MAX_PER_BOOKING } from "../bookings.js";
import { MAX_PRICE_CENTS, MAX_CAPACITY } from "../events.js";
import { HOLD_MS, OFFER_MS } from "../holds.js";

// DATA layer: the same job as memoryStore.js, but the things are kept in a SQLite file,
// so they are still there after the server stops and starts again.
//
// The three ideas that matter in this file:
//   1. CONSTRAINTS. The database itself refuses nonsense (sold more than capacity,
//      a negative price, a booking for a tier that does not exist).
//   2. PARAMETERISED QUERIES. Every value goes in through a "?". We never glue text into SQL.
//   3. ATOMIC OPERATIONS. Taking seats is ONE step: "add to sold, but only if there is room".
//      It runs inside a transaction, so two buyers can never both get the last seat.
//      (docs/overselling.md explains the bug this prevents.)
//
// Build 8 adds one more idea: a tier's "sold" number counts every seat that is SPOKEN FOR:
//   pending bookings + paid bookings + waitlist offers that have not run out yet.
// So a seat that was freed and offered to the first person in line can never be sold to
// somebody else while the offer lasts.
//
// Changing a status uses COMPARE-AND-SET: "UPDATE ... SET status = new WHERE status = old".
// If somebody else changed it first, zero rows change, and we stop. That is how a seat is
// given back exactly once, even if the same cancel arrives twice.

// Schema history:  v1 = Build 5 (events, tiers, bookings, waitlist).  v2 = Build 7 (users, owners).
//                  v3 = Build 8 (refund amounts, waitlist offers).
const SCHEMA_VERSION = 3;

export const SCHEMA_V1 = `
CREATE TABLE events (
  id     TEXT PRIMARY KEY,
  title  TEXT NOT NULL,
  city   TEXT NOT NULL,
  venue  TEXT NOT NULL,
  date   TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('draft', 'published'))
);

CREATE TABLE tiers (
  event_id    TEXT    NOT NULL REFERENCES events(id),
  id          TEXT    NOT NULL,
  name        TEXT    NOT NULL,
  price_cents INTEGER NOT NULL CHECK (price_cents >= 0 AND price_cents <= ${MAX_PRICE_CENTS}),
  capacity    INTEGER NOT NULL CHECK (capacity >= 1 AND capacity <= ${MAX_CAPACITY}),
  sold        INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (event_id, id),
  CHECK (sold >= 0 AND sold <= capacity)
);

CREATE TABLE bookings (
  ref         TEXT    PRIMARY KEY,
  event_id    TEXT    NOT NULL,
  tier_id     TEXT    NOT NULL,
  buyer_name  TEXT    NOT NULL,
  quantity    INTEGER NOT NULL CHECK (quantity >= 1 AND quantity <= ${MAX_PER_BOOKING}),
  total_cents INTEGER NOT NULL CHECK (total_cents >= 0),
  status      TEXT    NOT NULL CHECK (status IN (${STATES.map((s) => `'${s}'`).join(", ")})),
  FOREIGN KEY (event_id, tier_id) REFERENCES tiers(event_id, id)
);

CREATE TABLE waitlist (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id TEXT NOT NULL,
  tier_id  TEXT NOT NULL,
  name     TEXT NOT NULL,
  FOREIGN KEY (event_id, tier_id) REFERENCES tiers(event_id, id)
);

CREATE TABLE counters (
  name  TEXT PRIMARY KEY,
  value INTEGER NOT NULL
);
INSERT INTO counters (name, value) VALUES ('event', 0), ('booking', 0);
`;

// A MIGRATION moves an existing database file from one version to the next WITHOUT losing data.
// Old rows get NULL for the new columns: an old event has no owner, so nobody can edit it,
// and an old booking has no user, so nobody can read it. Failing closed is the safe choice.
export const MIGRATIONS = {
  2: `
CREATE TABLE users (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('attendee', 'organizer', 'staff'))
);
ALTER TABLE events   ADD COLUMN owner_id TEXT REFERENCES users(id);
ALTER TABLE bookings ADD COLUMN user_id TEXT REFERENCES users(id);
ALTER TABLE bookings ADD COLUMN hold_expires_at TEXT;
INSERT INTO counters (name, value) VALUES ('user', 0);
`,
  // Build 8. The waitlist grows: an entry is no longer just a name, it is a person who may hold an offer.
  // Any waitlist row from before had no person behind it and could never be offered a seat,
  // so those rows are marked 'left' (they would only block the line).
  3: `
ALTER TABLE bookings ADD COLUMN refund_cents INTEGER CHECK (refund_cents IS NULL OR refund_cents >= 0);
ALTER TABLE bookings ADD COLUMN refunded_at TEXT;
ALTER TABLE waitlist ADD COLUMN user_id TEXT REFERENCES users(id);
ALTER TABLE waitlist ADD COLUMN status TEXT NOT NULL DEFAULT 'waiting'
  CHECK (status IN ('waiting', 'offered', 'accepted', 'expired', 'left'));
ALTER TABLE waitlist ADD COLUMN offer_expires_at TEXT;
UPDATE waitlist SET status = 'left';
`,
};

// Open (or create) the database and make sure the tables exist.
function openDatabase(file, busyTimeoutMs) {
  const db = new DatabaseSync(file);
  // Wait (by default up to 5 seconds) when another connection is writing, instead of failing at once.
  db.exec(`PRAGMA busy_timeout = ${Number(busyTimeoutMs)}`);
  db.exec("PRAGMA foreign_keys = ON");
  if (file !== ":memory:") db.exec("PRAGMA journal_mode = WAL");

  // user_version is a number SQLite keeps inside the file. It tells us which schema it has.
  const { user_version: version } = db.prepare("PRAGMA user_version").get();
  if (version > SCHEMA_VERSION) {
    db.close();
    throw new Error(
      `This database was made by a newer version of the project (schema ${version}). ` +
        `This version understands schema ${SCHEMA_VERSION}.`
    );
  }
  if (version < SCHEMA_VERSION) {
    db.exec("BEGIN IMMEDIATE");
    try {
      // Another process may have upgraded the file while we waited for the lock, so look again.
      let current = db.prepare("PRAGMA user_version").get().user_version;
      if (current === 0) {
        db.exec(SCHEMA_V1);
        current = 1;
      }
      for (let next = current + 1; next <= SCHEMA_VERSION; next++) db.exec(MIGRATIONS[next]);
      db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
      db.exec("COMMIT");
    } catch (err) {
      db.exec("ROLLBACK");
      throw err;
    }
  }
  return db;
}

// "database is locked" (SQLITE_BUSY): somebody else held the write lock for too long.
function isBusyError(err) {
  return err?.errcode === 5 || /database is locked/i.test(err?.message ?? "");
}

function bookingFromRow(row) {
  return {
    ref: row.ref,
    eventId: row.event_id,
    tierId: row.tier_id,
    buyerName: row.buyer_name,
    quantity: row.quantity,
    totalCents: row.total_cents,
    status: row.status,
    userId: row.user_id ?? null,
    holdExpiresAt: row.hold_expires_at ?? null,
    refundCents: row.refund_cents ?? null,
    refundedAt: row.refunded_at ?? null,
  };
}

function entryFromRow(row, position = null) {
  return {
    id: row.id,
    eventId: row.event_id,
    tierId: row.tier_id,
    userId: row.user_id ?? null,
    name: row.name,
    status: row.status,
    offerExpiresAt: row.offer_expires_at ?? null,
    position,
  };
}

const isoOf = (ms) => new Date(ms).toISOString();

// file: a path like "data/tickets.sqlite", or ":memory:" for a throw-away database.
export function createSqliteStore(file = ":memory:", { busyTimeoutMs = 5000 } = {}) {
  if (!Number.isInteger(busyTimeoutMs) || busyTimeoutMs < 0) {
    throw new Error("busyTimeoutMs must be a whole number of milliseconds, 0 or more.");
  }
  const db = openDatabase(file, busyTimeoutMs);

  // Run fn as ONE all-or-nothing step.
  // BEGIN IMMEDIATE takes the write lock right away, so nobody else can change the
  // data between our "look" and our "write". If fn throws, everything is undone.
  function inTransaction(fn) {
    try {
      db.exec("BEGIN IMMEDIATE");
    } catch (err) {
      if (isBusyError(err)) throw new DomainError("BUSY", "The server is busy. Please try again.");
      throw err;
    }
    try {
      const result = fn();
      db.exec("COMMIT");
      return result;
    } catch (err) {
      db.exec("ROLLBACK");
      if (isBusyError(err)) throw new DomainError("BUSY", "The server is busy. Please try again.");
      throw err;
    }
  }

  // Counters live in the database, so ids keep counting after a restart.
  function nextCount(name) {
    return db.prepare("UPDATE counters SET value = value + 1 WHERE name = ? RETURNING value").get(name).value;
  }

  // ---- seats: giving back and offering (always called INSIDE a transaction) ----

  // Seats go back. The CHECK (sold >= 0) on the tiers table is the safety net against a double release.
  function releaseSeats(eventId, tierId, count) {
    db.prepare("UPDATE tiers SET sold = sold - ? WHERE event_id = ? AND id = ?").run(count, eventId, tierId);
  }

  // While a seat is free AND somebody is waiting, give the seat to the person at the FRONT of the
  // line as an offer. The offer HOLDS the seat (sold goes up by one), so nobody can buy it meanwhile.
  // Returns the entries that just received an offer, in order.
  function offerSeats(eventId, tierId, nowMs, offerMs) {
    const offered = [];
    for (;;) {
      const next = db
        .prepare("SELECT * FROM waitlist WHERE event_id = ? AND tier_id = ? AND status = 'waiting' ORDER BY id LIMIT 1")
        .get(eventId, tierId);
      if (!next) break;
      const taken = db
        .prepare("UPDATE tiers SET sold = sold + 1 WHERE event_id = ? AND id = ? AND sold + 1 <= capacity")
        .run(eventId, tierId);
      if (taken.changes !== 1) break; // no free seat
      const expiresAt = isoOf(nowMs + offerMs);
      db.prepare("UPDATE waitlist SET status = 'offered', offer_expires_at = ? WHERE id = ? AND status = 'waiting'").run(expiresAt, next.id);
      offered.push(entryFromRow({ ...next, status: "offered", offer_expires_at: expiresAt }));
    }
    return offered;
  }

  // Your place among the people still waiting for the same tier (1 = next to be offered).
  function positionOf(row) {
    if (row.status !== "waiting") return null;
    return db
      .prepare("SELECT COUNT(*) AS n FROM waitlist WHERE event_id = ? AND tier_id = ? AND status = 'waiting' AND id <= ?")
      .get(row.event_id, row.tier_id, row.id).n;
  }

  // ---- reading events ----

  function buildEvents(eventRows, tierRows, waitRows) {
    const events = new Map();
    for (const r of eventRows) {
      events.set(r.id, { id: r.id, title: r.title, city: r.city, venue: r.venue, date: r.date, status: r.status, ownerId: r.owner_id ?? null, tiers: new Map() });
    }
    const tiers = new Map();
    for (const r of tierRows) {
      const tier = { id: r.id, name: r.name, priceCents: r.price_cents, capacity: r.capacity, sold: r.sold, waitlist: new Queue() };
      events.get(r.event_id)?.tiers.set(r.id, tier);
      tiers.set(`${r.event_id}\u0000${r.id}`, tier);
    }
    for (const r of waitRows) {
      tiers.get(`${r.event_id}\u0000${r.tier_id}`)?.waitlist.enqueue({ name: r.name });
    }
    return [...events.values()];
  }

  function getEvent(id) {
    if (typeof id !== "string") return undefined;
    const eventRows = db.prepare("SELECT * FROM events WHERE id = ?").all(id);
    if (eventRows.length === 0) return undefined;
    const tierRows = db.prepare("SELECT * FROM tiers WHERE event_id = ? ORDER BY rowid").all(id);
    const waitRows = db.prepare("SELECT * FROM waitlist WHERE event_id = ? AND status = 'waiting' ORDER BY id").all(id);
    return buildEvents(eventRows, tierRows, waitRows)[0];
  }

  function requireEvent(id) {
    const event = getEvent(id);
    if (!event) throw new DomainError("NOT_FOUND", `No event with id "${id}".`);
    return event;
  }

  function listEvents() {
    return buildEvents(
      db.prepare("SELECT * FROM events ORDER BY rowid").all(),
      db.prepare("SELECT * FROM tiers ORDER BY rowid").all(),
      db.prepare("SELECT * FROM waitlist WHERE status = 'waiting' ORDER BY id").all()
    );
  }

  // ---- writing events ----

  // Writes the event's own fields, and any tier the database does not have yet.
  // It NEVER writes "sold": only a booking may change that, and only atomically.
  // (If it did, an old copy of an event could wipe out bookings made a moment ago.)
  function persist(event) {
    db.prepare(
      `INSERT INTO events (id, title, city, venue, date, status, owner_id) VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         title = excluded.title, city = excluded.city, venue = excluded.venue,
         date = excluded.date, status = excluded.status`
    ).run(event.id, event.title, event.city, event.venue, event.date, event.status, event.ownerId ?? null);
    // (owner_id is written only when the event is first created. It can never be changed later.)
    const addTier = db.prepare(
      `INSERT INTO tiers (event_id, id, name, price_cents, capacity, sold) VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(event_id, id) DO NOTHING`
    );
    for (const t of event.tiers.values()) {
      addTier.run(event.id, t.id, t.name, t.priceCents, t.capacity, t.sold);
    }
  }

  const bookings = {
    get size() {
      return db.prepare("SELECT COUNT(*) AS n FROM bookings").get().n;
    },

    find(ref) {
      if (typeof ref !== "string") return undefined;
      const row = db.prepare("SELECT * FROM bookings WHERE ref = ?").get(ref);
      return row ? bookingFromRow(row) : undefined;
    },

    // S06 + S08. The `event` you pass in is only used for its id.
    // It may be out of date, so every real decision is made again inside the transaction.
    book(event, tierId, buyerName, quantity = 1, { userId = null, holdExpiresAt = null } = {}) {
      checkBookingRequest(buyerName, quantity);
      return inTransaction(() => {
        const current = db.prepare("SELECT status FROM events WHERE id = ?").get(event.id);
        if (!current) throw new DomainError("NOT_FOUND", `No event with id "${event.id}".`);
        if (current.status !== "published") {
          throw new DomainError("NOT_PUBLISHED", "This event is not published, so it cannot be booked.");
        }
        const tier = db
          .prepare("SELECT name, price_cents, capacity, sold FROM tiers WHERE event_id = ? AND id = ?")
          .get(event.id, typeof tierId === "string" ? tierId : "");
        if (!tier) throw new DomainError("NOT_FOUND", `No tier "${tierId}" on this event.`);

        // THE FIX: take the seats and check there is room in ONE statement.
        // The WHERE clause is the guard. If there is not enough room, nothing changes.
        const taken = db
          .prepare("UPDATE tiers SET sold = sold + ? WHERE event_id = ? AND id = ? AND sold + ? <= capacity")
          .run(quantity, event.id, tierId, quantity);
        if (taken.changes !== 1) {
          throw new DomainError(
            "SOLD_OUT",
            `Not enough seats in ${tier.name}: ${tier.capacity - tier.sold} left, ${quantity} wanted.`
          );
        }

        const ref = "BK-" + String(nextCount("booking")).padStart(6, "0");
        const totalCents = tier.price_cents * quantity;
        db.prepare(
          `INSERT INTO bookings (ref, event_id, tier_id, buyer_name, quantity, total_cents, status, user_id, hold_expires_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(ref, event.id, tierId, buyerName, quantity, totalCents, INITIAL_STATE, userId, holdExpiresAt);
        return { ref, eventId: event.id, tierId, buyerName, quantity, totalCents, status: INITIAL_STATE, userId, holdExpiresAt };
      });
    },

    // S13: the bookings of ONE user, newest first. The user id goes in through a "?" like everything else.
    listForUser(userId) {
      if (typeof userId !== "string") return [];
      return db.prepare("SELECT * FROM bookings WHERE user_id = ? ORDER BY rowid DESC").all(userId).map(bookingFromRow);
    },

    // pending -> paid. The state machine decides if that is allowed.
    pay(ref) {
      return inTransaction(() => {
        const row = typeof ref === "string" ? db.prepare("SELECT * FROM bookings WHERE ref = ?").get(ref) : undefined;
        if (!row) throw new DomainError("NOT_FOUND", `No booking with code ${ref}.`);
        const next = nextState(row.status, "PAY"); // throws INVALID_STATE if not allowed
        db.prepare("UPDATE bookings SET status = ? WHERE ref = ?").run(next, ref);
        return { ...bookingFromRow(row), status: next };
      });
    },

    // pending -> cancelled, or paid -> refunded. Seats go back exactly once.
    // The freed seat is OFFERED to the first person waiting, if there is one: nextInLine names them.
    //   refundCents: the money that goes back (the service worked it out from the refund policy).
    //   expectStatus: the status the caller saw. If the booking changed meanwhile we refuse,
    //                 so a refund is never recorded against the wrong situation.
    cancel(event, ref, { refundCents = null, expectStatus = null, nowMs = Date.now(), offerMs = OFFER_MS } = {}) {
      return inTransaction(() => {
        const row = typeof ref === "string" ? db.prepare("SELECT * FROM bookings WHERE ref = ?").get(ref) : undefined;
        if (!row || row.event_id !== event.id) {
          throw new DomainError("NOT_FOUND", `No booking with code ${ref}.`);
        }
        if (row.status === "cancelled" || row.status === "refunded" || row.status === "expired") {
          throw new DomainError("ALREADY_CANCELLED", `Booking ${ref} is already cancelled.`);
        }
        if (expectStatus !== null && row.status !== expectStatus) {
          throw new DomainError("INVALID_STATE", `Booking ${ref} just changed to ${row.status}. Please look again.`);
        }
        const next = nextState(row.status, "CANCEL");
        // COMPARE-AND-SET: only change it if it is STILL what we just read.
        const changed = db
          .prepare("UPDATE bookings SET status = ?, refund_cents = ?, refunded_at = ? WHERE ref = ? AND status = ?")
          .run(next, next === "refunded" ? refundCents ?? 0 : null, next === "refunded" ? isoOf(nowMs) : null, ref, row.status);
        if (changed.changes !== 1) {
          throw new DomainError("ALREADY_CANCELLED", `Booking ${ref} is already cancelled.`);
        }
        if (holdsSeats(row.status) && !holdsSeats(next)) releaseSeats(row.event_id, row.tier_id, row.quantity);
        const offered = offerSeats(row.event_id, row.tier_id, nowMs, offerMs);
        const booking = bookingFromRow(db.prepare("SELECT * FROM bookings WHERE ref = ?").get(ref));
        return { booking, nextInLine: offered[0] ? { name: offered[0].name } : null };
      });
    },

    // Only a sold-out tier has a waitlist. Returns your place in line.
    // (The older name-only version. The website uses waitlist.join below, which knows WHO you are.)
    joinWaitlist(event, tierId, name) {
      if (typeof name !== "string" || name.trim() === "") {
        throw new DomainError("VALIDATION", "A waitlist entry needs a name.");
      }
      return inTransaction(() => positionOf(insertWaiting(event.id, tierId, null, name.trim(), false)));
    },
  };

  // Shared by both ways of joining. Gives back the new row.
  function insertWaiting(eventId, tierId, userId, name, requirePublished) {
    if (requirePublished) {
      const current = db.prepare("SELECT status FROM events WHERE id = ?").get(eventId);
      if (!current) throw new DomainError("NOT_FOUND", `No event with id "${eventId}".`);
      if (current.status !== "published") {
        throw new DomainError("NOT_PUBLISHED", "This event is not published, so it has no waitlist.");
      }
    }
    const tier = db
      .prepare("SELECT name, capacity, sold FROM tiers WHERE event_id = ? AND id = ?")
      .get(eventId, typeof tierId === "string" ? tierId : "");
    if (!tier) throw new DomainError("NOT_FOUND", `No tier "${tierId}" on this event.`);
    const left = tier.capacity - tier.sold;
    if (left > 0) {
      throw new DomainError("NOT_SOLD_OUT", `${tier.name} still has ${left} seats. Book instead of waiting.`);
    }
    if (
      userId !== null &&
      db
        .prepare("SELECT 1 FROM waitlist WHERE event_id = ? AND tier_id = ? AND user_id = ? AND status IN ('waiting', 'offered')")
        .get(eventId, tierId, userId)
    ) {
      throw new DomainError("ALREADY_ON_WAITLIST", `You are already on the waitlist for ${tier.name}.`);
    }
    const { id } = db
      .prepare("INSERT INTO waitlist (event_id, tier_id, name, user_id, status) VALUES (?, ?, ?, ?, 'waiting') RETURNING id")
      .get(eventId, tierId, name, userId);
    return db.prepare("SELECT * FROM waitlist WHERE id = ?").get(id);
  }

  // S11 + S12: people in the line, and the offers they receive.
  const waitlist = {
    // Join the END of the line for a sold-out tier.
    join({ eventId, tierId, userId, name }) {
      if (typeof name !== "string" || name.trim() === "") {
        throw new DomainError("VALIDATION", "A waitlist entry needs a name.");
      }
      return inTransaction(() => {
        const row = insertWaiting(eventId, tierId, userId, name.trim(), true);
        return entryFromRow(row, positionOf(row));
      });
    },

    find(id) {
      const row = Number.isSafeInteger(id) ? db.prepare("SELECT * FROM waitlist WHERE id = ?").get(id) : undefined;
      return row ? entryFromRow(row, positionOf(row)) : undefined;
    },

    // Newest first. Includes finished entries (accepted, expired, left) so the person can see what happened.
    listForUser(userId) {
      if (typeof userId !== "string") return [];
      return db
        .prepare("SELECT * FROM waitlist WHERE user_id = ? ORDER BY id DESC LIMIT 50")
        .all(userId)
        .map((row) => entryFromRow(row, positionOf(row)));
    },

    // Accept an offer: the seat that was held becomes a PENDING booking (to be paid within the hold time).
    // The seat is already counted in "sold", so nothing is added here.
    accept(id, userId, { nowMs = Date.now(), holdMs = HOLD_MS } = {}) {
      return inTransaction(() => {
        const row = Number.isSafeInteger(id) ? db.prepare("SELECT * FROM waitlist WHERE id = ?").get(id) : undefined;
        if (!row || row.user_id === null || row.user_id !== userId) {
          throw new DomainError("NOT_FOUND", `No waitlist entry ${id}.`);
        }
        if (row.status === "expired" || (row.status === "offered" && row.offer_expires_at <= isoOf(nowMs))) {
          throw new DomainError("OFFER_EXPIRED", "This offer has run out. The seat went to the next person.");
        }
        if (row.status !== "offered") {
          throw new DomainError("INVALID_STATE", `There is no open offer on this entry (it is ${row.status}).`);
        }
        const changed = db.prepare("UPDATE waitlist SET status = 'accepted' WHERE id = ? AND status = 'offered'").run(id);
        if (changed.changes !== 1) throw new DomainError("INVALID_STATE", "This offer was already used.");
        const tier = db.prepare("SELECT price_cents FROM tiers WHERE event_id = ? AND id = ?").get(row.event_id, row.tier_id);
        const ref = "BK-" + String(nextCount("booking")).padStart(6, "0");
        const holdExpiresAt = isoOf(nowMs + holdMs);
        db.prepare(
          `INSERT INTO bookings (ref, event_id, tier_id, buyer_name, quantity, total_cents, status, user_id, hold_expires_at)
           VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?)`
        ).run(ref, row.event_id, row.tier_id, row.name, tier.price_cents, INITIAL_STATE, userId, holdExpiresAt);
        return bookingFromRow(db.prepare("SELECT * FROM bookings WHERE ref = ?").get(ref));
      });
    },

    // Leave the line, or turn an offer down. A held seat goes back and is offered to the next person.
    leave(id, userId, { nowMs = Date.now(), offerMs = OFFER_MS } = {}) {
      return inTransaction(() => {
        const row = Number.isSafeInteger(id) ? db.prepare("SELECT * FROM waitlist WHERE id = ?").get(id) : undefined;
        if (!row || row.user_id === null || row.user_id !== userId) {
          throw new DomainError("NOT_FOUND", `No waitlist entry ${id}.`);
        }
        if (row.status !== "waiting" && row.status !== "offered") {
          throw new DomainError("INVALID_STATE", `This entry is already ${row.status}.`);
        }
        const changed = db.prepare("UPDATE waitlist SET status = 'left' WHERE id = ? AND status = ?").run(id, row.status);
        if (changed.changes !== 1) throw new DomainError("INVALID_STATE", "This entry just changed. Please look again.");
        if (row.status === "offered") {
          releaseSeats(row.event_id, row.tier_id, 1);
          offerSeats(row.event_id, row.tier_id, nowMs, offerMs);
        }
        return entryFromRow({ ...row, status: "left" });
      });
    },
  };

  // THE MAINTENANCE STEP (S10 and the "offer runs out" half of S12), in ONE transaction:
  //   1. unpaid bookings whose hold has run out become "expired" and give their seats back
  //   2. offers that have run out become "expired" and give their seat back
  //   3. every freed seat is offered to the next person waiting
  // Paid bookings are never touched. Running it twice in a row changes nothing the second time.
  function sweep(nowMs = Date.now(), { offerMs = OFFER_MS } = {}) {
    return inTransaction(() => {
      const nowIso = isoOf(nowMs);
      const touched = new Map();
      const expiredBookings = [];
      const expiredOffers = [];

      const overdueBookings = db
        .prepare("SELECT * FROM bookings WHERE status = 'pending' AND hold_expires_at IS NOT NULL AND hold_expires_at <= ? ORDER BY rowid")
        .all(nowIso);
      for (const row of overdueBookings) {
        const next = nextState(row.status, "EXPIRE");
        const changed = db.prepare("UPDATE bookings SET status = ? WHERE ref = ? AND status = 'pending'").run(next, row.ref);
        if (changed.changes !== 1) continue;
        releaseSeats(row.event_id, row.tier_id, row.quantity);
        touched.set(`${row.event_id}\u0000${row.tier_id}`, [row.event_id, row.tier_id]);
        expiredBookings.push(row.ref);
      }

      const overdueOffers = db
        .prepare("SELECT * FROM waitlist WHERE status = 'offered' AND offer_expires_at <= ? ORDER BY id")
        .all(nowIso);
      for (const row of overdueOffers) {
        const changed = db.prepare("UPDATE waitlist SET status = 'expired' WHERE id = ? AND status = 'offered'").run(row.id);
        if (changed.changes !== 1) continue;
        releaseSeats(row.event_id, row.tier_id, 1);
        touched.set(`${row.event_id}\u0000${row.tier_id}`, [row.event_id, row.tier_id]);
        expiredOffers.push(row.id);
      }

      const newOffers = [];
      for (const [eventId, tierId] of touched.values()) {
        for (const entry of offerSeats(eventId, tierId, nowMs, offerMs)) newOffers.push(entry.id);
      }
      return { expiredBookings, expiredOffers, newOffers };
    });
  }

  // S01: accounts. The UNIQUE constraint on email is the real guard: even two signups at the
  // same moment cannot both win. The password is stored only as a hash.
  const users = {
    create({ name, email, passwordHash, role }) {
      return inTransaction(() => {
        if (db.prepare("SELECT 1 FROM users WHERE email = ?").get(email)) {
          throw new DomainError("EMAIL_TAKEN", "That email already has an account. Log in instead.");
        }
        const id = "U-" + String(nextCount("user")).padStart(6, "0");
        db.prepare("INSERT INTO users (id, name, email, password_hash, role) VALUES (?, ?, ?, ?, ?)").run(id, name, email, passwordHash, role);
        return { id, name, email, passwordHash, role };
      });
    },
    findByEmail(email) {
      const r = typeof email === "string" ? db.prepare("SELECT * FROM users WHERE email = ?").get(email) : undefined;
      return r ? { id: r.id, name: r.name, email: r.email, passwordHash: r.password_hash, role: r.role } : undefined;
    },
    findById(id) {
      const r = typeof id === "string" ? db.prepare("SELECT * FROM users WHERE id = ?").get(id) : undefined;
      return r ? { id: r.id, name: r.name, email: r.email, passwordHash: r.password_hash, role: r.role } : undefined;
    },
  };

  return {
    bookings,
    users,
    waitlist,
    sweep,
    getEvent,
    requireEvent,
    listEvents,

    nextEventId() {
      return inTransaction(() => "EV-" + String(nextCount("event")).padStart(6, "0"));
    },

    saveEvent(event) {
      inTransaction(() => persist(event));
      return event;
    },

    // Load the event, let `change` alter it, save it: all in one step.
    // Because it all happens inside the transaction, two changes at the same moment
    // cannot overwrite each other (for example two people adding a tier at once).
    updateEvent(id, change) {
      return inTransaction(() => {
        const event = requireEvent(id);
        const result = change(event);
        persist(event);
        return result;
      });
    },

    close() {
      db.close();
    },
  };
}
