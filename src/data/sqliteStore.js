import { DatabaseSync } from "node:sqlite";
import { Queue } from "../queue.js";
import { DomainError } from "../errors.js";
import { INITIAL_STATE, STATES, nextState, holdsSeats } from "../bookingStates.js";
import { checkBookingRequest, MAX_PER_BOOKING } from "../bookings.js";
import { MAX_PRICE_CENTS, MAX_CAPACITY } from "../events.js";

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

// Schema history:  v1 = Build 5 (events, tiers, bookings, waitlist).  v2 = Build 7 (users, owners).
const SCHEMA_VERSION = 2;

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
const MIGRATIONS = {
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
  };
}

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
    const waitRows = db.prepare("SELECT * FROM waitlist WHERE event_id = ? ORDER BY id").all(id);
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
      db.prepare("SELECT * FROM waitlist ORDER BY id").all()
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
    // If someone is waiting, the person at the FRONT of the line is named and leaves the line.
    cancel(event, ref) {
      return inTransaction(() => {
        const row = typeof ref === "string" ? db.prepare("SELECT * FROM bookings WHERE ref = ?").get(ref) : undefined;
        if (!row || row.event_id !== event.id) {
          throw new DomainError("NOT_FOUND", `No booking with code ${ref}.`);
        }
        if (row.status === "cancelled" || row.status === "refunded") {
          throw new DomainError("ALREADY_CANCELLED", `Booking ${ref} is already cancelled.`);
        }
        const next = nextState(row.status, "CANCEL");
        db.prepare("UPDATE bookings SET status = ? WHERE ref = ?").run(next, ref);
        if (holdsSeats(row.status) && !holdsSeats(next)) {
          db.prepare("UPDATE tiers SET sold = sold - ? WHERE event_id = ? AND id = ?").run(row.quantity, row.event_id, row.tier_id);
        }
        const first = db
          .prepare("SELECT id, name FROM waitlist WHERE event_id = ? AND tier_id = ? ORDER BY id LIMIT 1")
          .get(row.event_id, row.tier_id);
        if (first) db.prepare("DELETE FROM waitlist WHERE id = ?").run(first.id);
        return { booking: { ...bookingFromRow(row), status: next }, nextInLine: first ? { name: first.name } : null };
      });
    },

    // Only a sold-out tier has a waitlist. Returns your place in line.
    joinWaitlist(event, tierId, name) {
      if (typeof name !== "string" || name.trim() === "") {
        throw new DomainError("VALIDATION", "A waitlist entry needs a name.");
      }
      return inTransaction(() => {
        const tier = db
          .prepare("SELECT name, capacity, sold FROM tiers WHERE event_id = ? AND id = ?")
          .get(event.id, typeof tierId === "string" ? tierId : "");
        if (!tier) throw new DomainError("NOT_FOUND", `No tier "${tierId}" on this event.`);
        const left = tier.capacity - tier.sold;
        if (left > 0) {
          throw new DomainError("NOT_SOLD_OUT", `${tier.name} still has ${left} seats. Book instead of waiting.`);
        }
        db.prepare("INSERT INTO waitlist (event_id, tier_id, name) VALUES (?, ?, ?)").run(event.id, tierId, name);
        return db.prepare("SELECT COUNT(*) AS n FROM waitlist WHERE event_id = ? AND tier_id = ?").get(event.id, tierId).n;
      });
    },
  };

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
