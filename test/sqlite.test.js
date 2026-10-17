import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { createSqliteStore } from "../src/data/sqliteStore.js";
import { createMemoryStore } from "../src/data/memoryStore.js";
import { createEventServiceAsOrganizer as createEventService, organizerOf, attendeeOf, bearer, TEST_SECRET } from "./actors.js";
import { createBookingServiceAsAttendee as createBookingService } from "./actors.js";
import { createServer } from "../src/server.js";
import { naiveBook } from "../scripts/naiveBooking.js";
import { runCrowd } from "../scripts/crowd.js";

const publicDir = fileURLToPath(new URL("../public", import.meta.url));
let tmp;
before(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "sqlite-tests-"));
});
after(() => {
  try {
    fs.rmSync(tmp, { recursive: true, force: true });
  } catch {
    /* Windows may keep a file busy for a moment. Not worth failing a test for. */
  }
});
let fileCounter = 0;
const newFile = () => path.join(tmp, `db-${++fileCounter}.sqlite`);

const eventInput = { title: "Lagos Jazz Night", city: "Lagos", venue: "Terra Kulture", date: "2026-12-05" };

// A store with one published event and one tier.
function setUp(file = ":memory:", capacity = 3) {
  const store = createSqliteStore(file);
  const events = createEventService(store);
  const bookings = createBookingService(store);
  const event = events.create(eventInput);
  events.addTier(event.id, { name: "Regular", priceCents: 500000, capacity });
  events.publish(event.id);
  return { store, events, bookings, eventId: event.id, tierId: "T1" };
}

// ---------------------------------------------------------------------------------
describe("SQLite: the database refuses nonsense (constraints)", () => {
  test("sold can never be more than capacity, even with raw SQL", () => {
    const { store, eventId } = setUp(newFile(), 3);
    const db = new DatabaseSync(path.join(tmp, `db-${fileCounter}.sqlite`));
    assert.throws(() => db.prepare("UPDATE tiers SET sold = 4 WHERE event_id = ?").run(eventId), /CHECK constraint/);
    assert.throws(() => db.prepare("UPDATE tiers SET sold = -1 WHERE event_id = ?").run(eventId), /CHECK constraint/);
    db.close();
    store.close();
  });

  test("a booking for a tier that does not exist is refused (foreign key)", () => {
    const file = newFile();
    const { store, eventId } = setUp(file);
    const db = new DatabaseSync(file);
    db.exec("PRAGMA foreign_keys = ON");
    assert.throws(
      () =>
        db
          .prepare("INSERT INTO bookings (ref, event_id, tier_id, buyer_name, quantity, total_cents, status) VALUES (?,?,?,?,?,?,?)")
          .run("X", eventId, "NOPE", "Ada", 1, 100, "pending"),
      /FOREIGN KEY/
    );
    db.close();
    store.close();
  });

  test("bad values are refused: negative price, zero capacity, unknown status, quantity 11", () => {
    const file = newFile();
    const { store, eventId } = setUp(file);
    const db = new DatabaseSync(file);
    db.exec("PRAGMA foreign_keys = ON");
    const addTier = db.prepare("INSERT INTO tiers (event_id, id, name, price_cents, capacity) VALUES (?, ?, ?, ?, ?)");
    assert.throws(() => addTier.run(eventId, "a", "A", -1, 5), /CHECK constraint/);
    assert.throws(() => addTier.run(eventId, "b", "B", 100, 0), /CHECK constraint/);
    const addBooking = db.prepare("INSERT INTO bookings (ref, event_id, tier_id, buyer_name, quantity, total_cents, status) VALUES (?,?,?,?,?,?,?)");
    assert.throws(() => addBooking.run("Y", eventId, "T1", "Ada", 1, 100, "dancing"), /CHECK constraint/);
    assert.throws(() => addBooking.run("Z", eventId, "T1", "Ada", 11, 100, "pending"), /CHECK constraint/);
    db.close();
    store.close();
  });

  test("the same tier id cannot exist twice on one event (primary key)", () => {
    const file = newFile();
    const { store, eventId } = setUp(file);
    const db = new DatabaseSync(file);
    assert.throws(
      () => db.prepare("INSERT INTO tiers (event_id, id, name, price_cents, capacity) VALUES (?, 'T1', 'Again', 1, 1)").run(eventId),
      /UNIQUE|PRIMARY KEY/
    );
    db.close();
    store.close();
  });
});

// ---------------------------------------------------------------------------------
describe("SQLite: parameterised queries (no SQL injection)", () => {
  test("a title that looks like SQL is just stored as text", () => {
    const store = createSqliteStore(":memory:");
    const events = createEventService(store);
    const nasty = "x'); DROP TABLE events; --";
    const event = events.create({ ...eventInput, title: nasty });
    assert.equal(store.requireEvent(event.id).title, nasty);
    assert.equal(store.listEvents().length, 1); // the table is still there
    store.close();
  });

  test("an id that looks like SQL finds nothing and breaks nothing", () => {
    const { store } = setUp();
    assert.equal(store.getEvent("EV-000001' OR '1'='1"), undefined);
    assert.equal(store.bookings.find("BK-000001' OR '1'='1"), undefined);
    assert.equal(store.listEvents().length, 1);
    store.close();
  });

  test("the source code never glues values into SQL text", () => {
    const source = fs.readFileSync(fileURLToPath(new URL("../src/data/sqliteStore.js", import.meta.url)), "utf8");
    const calls = [...source.matchAll(/\.prepare\(\s*([`"'])([\s\S]*?)\1\s*\)/g)];
    assert.ok(calls.length >= 15, `found only ${calls.length} prepare() calls`);
    for (const [, , sql] of calls) {
      assert.ok(!sql.includes("${"), `SQL with a value glued in: ${sql.slice(0, 60)}`);
    }
    // and every prepare() call was a plain string, not built from pieces
    assert.equal(calls.length, (source.match(/\.prepare\(/g) ?? []).length, "a prepare() call is not a plain string");
  });
});

// ---------------------------------------------------------------------------------
describe("SQLite: data survives a restart", () => {
  test("close the store, open the file again: everything is still there", () => {
    const file = newFile();
    const a = setUp(file);
    const booking = a.bookings.book(a.eventId, a.tierId, "Ada", 2);
    a.bookings.pay(booking.ref);
    a.store.close();

    const store = createSqliteStore(file);
    const bookings = createBookingService(store);
    const event = store.requireEvent("EV-000001");
    assert.equal(event.title, eventInput.title);
    assert.equal(event.status, "published");
    assert.equal(event.tiers.get("T1").sold, 2);
    assert.equal(bookings.find(booking.ref).status, "paid");
    assert.equal(bookings.find(booking.ref).totalCents, 1000000);
    store.close();
  });

  test("ids keep counting after a restart (no EV-000001 twice)", () => {
    const file = newFile();
    const a = setUp(file);
    a.bookings.book(a.eventId, a.tierId, "Ada", 1);
    a.store.close();

    const store = createSqliteStore(file);
    const events = createEventService(store);
    const bookings = createBookingService(store);
    assert.equal(events.create(eventInput).id, "EV-000002");
    assert.equal(bookings.book("EV-000001", "T1", "Bayo", 1).ref, "BK-000002");
    store.close();
  });

  test("the waitlist order survives a restart", () => {
    const file = newFile();
    const a = setUp(file, 1);
    const booking = a.bookings.book(a.eventId, a.tierId, "Ada", 1);
    const event = a.store.requireEvent(a.eventId);
    a.store.bookings.joinWaitlist(event, "T1", "Bayo");
    assert.equal(a.store.bookings.joinWaitlist(event, "T1", "Chi"), 2);
    a.store.close();

    const store = createSqliteStore(file);
    const cancelled = createBookingService(store).cancel(booking.ref);
    assert.deepEqual(cancelled.nextInLine, { name: "Bayo" });
    store.close();
  });

  test("the whole server: create things, stop it, start a new one on the same file", async () => {
    const file = newFile();
    let org, att;
    async function withServer(fn) {
      const store = createSqliteStore(file);
      const server = createServer({ publicDir, store, tokenSecret: TEST_SECRET });
      await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
      const base = `http://127.0.0.1:${server.address().port}`;
      org = organizerOf(store); // the accounts live in the file too, so they survive the restart
      att = attendeeOf(store);
      try {
        return await fn(base);
      } finally {
        server.closeAllConnections();
        await new Promise((resolve) => server.close(resolve));
        store.close();
      }
    }
    const post = (base, url, body, who = url.startsWith("/api/bookings") ? att : org) =>
      fetch(base + url, { method: "POST", headers: { "Content-Type": "application/json", ...bearer(who) }, body: body && JSON.stringify(body) }).then(async (r) => ({ status: r.status, json: await r.json() }));

    await withServer(async (base) => {
      await post(base, "/api/events", eventInput);
      await post(base, "/api/events/EV-000001/tiers", { name: "Regular", priceCents: 500000, capacity: 3 });
      await post(base, "/api/events/EV-000001/publish");
      const booked = await post(base, "/api/bookings", { eventId: "EV-000001", tierId: "T1", buyerName: "Ada", quantity: 2 });
      assert.equal(booked.status, 201);
      assert.equal((await post(base, "/api/bookings/BK-000001/pay")).json.booking.status, "paid");
    });

    // ... the first server is gone. A brand new one starts on the same file:
    await withServer(async (base) => {
      const event = await (await fetch(base + "/api/events/EV-000001")).json();
      assert.equal(event.event.tiers[0].seatsLeft, 1);
      const booking = await (await fetch(base + "/api/bookings/BK-000001", { headers: bearer(att) })).json();
      assert.equal(booking.booking.status, "paid");
      const search = await (await fetch(base + "/api/events?city=Lagos")).json();
      assert.equal(search.events.length, 1);
      const next = await post(base, "/api/events", eventInput);
      assert.equal(next.json.event.id, "EV-000002");
    });
  });
});

// ---------------------------------------------------------------------------------
describe("SQLite: the schema version", () => {
  test("a new file gets the newest schema version (3)", () => {
    const file = newFile();
    createSqliteStore(file).close();
    const db = new DatabaseSync(file);
    assert.equal(db.prepare("PRAGMA user_version").get().user_version, 3);
    db.close();
  });

  test("opening twice does not wipe or redo anything", () => {
    const file = newFile();
    const a = setUp(file);
    a.store.close();
    const again = createSqliteStore(file);
    assert.equal(again.listEvents().length, 1);
    again.close();
  });

  test("a database from a NEWER version is refused with a clear message", () => {
    const file = newFile();
    const db = new DatabaseSync(file);
    db.exec("PRAGMA user_version = 99");
    db.close();
    assert.throws(() => createSqliteStore(file), /newer version/);
  });
});

// ---------------------------------------------------------------------------------
describe("SQLite: updates cannot overwrite each other", () => {
  test("saving an OLD copy of an event does not undo bookings made since", () => {
    const { store, bookings, eventId } = setUp(":memory:", 3);
    const oldCopy = store.requireEvent(eventId); // sold = 0 in this copy
    bookings.book(eventId, "T1", "Ada", 2); // the database now says sold = 2
    store.saveEvent(oldCopy); // saving the old copy must NOT put sold back to 0
    assert.equal(store.requireEvent(eventId).tiers.get("T1").sold, 2);
    store.close();
  });

  test("two tiers added in a row get different ids and both are kept", () => {
    const { store, events, eventId } = setUp();
    const t2 = events.addTier(eventId, { name: "VIP", priceCents: 1, capacity: 1 });
    const t3 = events.addTier(eventId, { name: "Late", priceCents: 1, capacity: 1 });
    assert.deepEqual([t2.id, t3.id], ["T2", "T3"]);
    assert.deepEqual([...store.requireEvent(eventId).tiers.keys()], ["T1", "T2", "T3"]);
    store.close();
  });

  test("a failed change leaves the database exactly as it was (rollback)", () => {
    const { store, eventId } = setUp();
    assert.throws(() =>
      store.updateEvent(eventId, (event) => {
        event.status = "draft";
        throw new Error("something went wrong halfway");
      })
    );
    assert.equal(store.requireEvent(eventId).status, "published");
    store.close();
  });

  test("a failed booking changes nothing: seats, counters, bookings", () => {
    const { store, bookings, eventId } = setUp(":memory:", 3);
    bookings.book(eventId, "T1", "Ada", 2);
    assert.throws(() => bookings.book(eventId, "T1", "Bayo", 2), { code: "SOLD_OUT" });
    assert.equal(store.requireEvent(eventId).tiers.get("T1").sold, 2);
    assert.equal(store.bookings.size, 1);
    assert.equal(bookings.book(eventId, "T1", "Chi", 1).ref, "BK-000002"); // the counter was not wasted
    store.close();
  });
});

// ---------------------------------------------------------------------------------
describe("S08: the last ticket", () => {
  test("an OLD view of the event cannot be used to oversell (the stale-copy test)", () => {
    // This is the bug in slow motion: look, then another buyer wins, then write using the old look.
    const { store, eventId } = setUp(":memory:", 1);
    const oldLook = store.requireEvent(eventId); // says: 1 seat left
    store.bookings.book(store.requireEvent(eventId), "T1", "Ada", 1); // someone else takes it

    assert.equal(oldLook.tiers.get("T1").sold, 0); // our look is out of date
    assert.throws(() => store.bookings.book(oldLook, "T1", "Bayo", 1), { code: "SOLD_OUT" });
    assert.equal(store.requireEvent(eventId).tiers.get("T1").sold, 1);
    assert.equal(store.bookings.size, 1);
    store.close();
  });

  test("an OLD view cannot book an event that was unpublished meanwhile", () => {
    const { store, events, eventId } = setUp(":memory:", 5);
    const oldLook = store.requireEvent(eventId);
    events.unpublish(eventId);
    assert.throws(() => store.bookings.book(oldLook, "T1", "Ada", 1), { code: "NOT_PUBLISHED" });
    store.close();
  });

  test("50 people, each on their own database connection, go for the last ticket: exactly 1 wins", async () => {
    for (let round = 1; round <= 3; round++) {
      const file = newFile();
      const { store, eventId, tierId } = setUp(file, 1);
      const result = await runCrowd({ dbFile: file, eventId, tierId, workers: 5, attemptsEach: 10, mode: "safe" });

      assert.deepEqual(result.failed, [], `round ${round}: unexpected errors`);
      assert.equal(result.succeeded, 1, `round ${round}: exactly one person must get the ticket`);
      assert.equal(result.soldOut, 49, `round ${round}: everyone else must be told SOLD_OUT`);
      assert.equal(store.requireEvent(eventId).tiers.get(tierId).sold, 1, "sold must equal capacity");
      assert.equal(store.bookings.size, 1, "exactly one booking exists");
      store.close();
    }
  });

  test("50 people, 3 tickets left: exactly 3 win and sold never passes capacity", async () => {
    const file = newFile();
    const { store, eventId, tierId } = setUp(file, 3);
    const result = await runCrowd({ dbFile: file, eventId, tierId, workers: 5, attemptsEach: 10, mode: "safe" });
    assert.deepEqual(result.failed, []);
    assert.equal(result.succeeded, 3);
    assert.equal(result.soldOut, 47);
    assert.equal(store.requireEvent(eventId).tiers.get(tierId).sold, 3);
    store.close();
  });

  test("the same crowd against the BUGGY look-then-write code DOES oversell (so the test above can fail)", async () => {
    const file = newFile();
    const { store, eventId, tierId } = setUp(file, 1);
    const result = await runCrowd({ dbFile: file, eventId, tierId, workers: 5, attemptsEach: 1, mode: "naive" });
    assert.ok(result.succeeded > 1, `the buggy code should sell the last ticket more than once, but sold ${result.succeeded}`);
    assert.ok(store.bookings.size > 1, "more bookings than tickets exist");
    store.close();
  });

  test("the buggy code oversells even inside one program, when there is a gap between look and write", async () => {
    const file = newFile();
    const { store, eventId, tierId } = setUp(file, 1);
    const db = new DatabaseSync(file);
    const outcomes = await Promise.all(
      Array.from({ length: 50 }, (_, i) => naiveBook(db, eventId, tierId, `P${i}`).then(() => "ok", () => "no"))
    );
    assert.equal(outcomes.filter((o) => o === "ok").length, 50);
    assert.equal(store.bookings.size, 50); // 50 bookings for 1 ticket
    db.close();
    store.close();
  });

  test("over HTTP: 50 requests at once for the last ticket give one 201 and 49 SOLD_OUT", async () => {
    const store = createSqliteStore(":memory:");
    const events = createEventService(store);
    const event = events.create(eventInput);
    events.addTier(event.id, { name: "Last", priceCents: 500000, capacity: 1 });
    events.publish(event.id);
    const server = createServer({ publicDir, store, tokenSecret: TEST_SECRET });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    const who = attendeeOf(store);
    try {
      const replies = await Promise.all(
        Array.from({ length: 50 }, (_, i) =>
          fetch(base + "/api/bookings", {
            method: "POST",
            headers: { "Content-Type": "application/json", ...bearer(who) },
            body: JSON.stringify({ eventId: event.id, tierId: "T1", buyerName: `Person ${i + 1}`, quantity: 1 }),
          }).then(async (r) => ({ status: r.status, json: await r.json() }))
        )
      );
      assert.equal(replies.filter((r) => r.status === 201).length, 1);
      const refused = replies.filter((r) => r.status === 409);
      assert.equal(refused.length, 49);
      assert.ok(refused.every((r) => r.json.error.code === "SOLD_OUT"));
      assert.equal(store.requireEvent(event.id).tiers.get("T1").sold, 1);
    } finally {
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
      store.close();
    }
  });

  test("a cancelled booking gives its seats back exactly once, and the seat can be sold again", () => {
    const { store, bookings, eventId } = setUp(":memory:", 1);
    const first = bookings.book(eventId, "T1", "Ada", 1);
    assert.throws(() => bookings.book(eventId, "T1", "Bayo", 1), { code: "SOLD_OUT" });
    bookings.cancel(first.ref);
    assert.throws(() => bookings.cancel(first.ref), { code: "ALREADY_CANCELLED" });
    assert.equal(store.requireEvent(eventId).tiers.get("T1").sold, 0); // not -1
    assert.equal(bookings.book(eventId, "T1", "Bayo", 1).status, "pending");
    assert.throws(() => bookings.book(eventId, "T1", "Chi", 1), { code: "SOLD_OUT" });
    store.close();
  });
});

// ---------------------------------------------------------------------------------
describe("SQLite: when the database stays locked", () => {
  test("a booking that cannot get the write lock says BUSY (and over HTTP: 503), and changes nothing", async () => {
    const file = newFile();
    const first = setUp(file, 3);
    first.store.close();

    const store = createSqliteStore(file, { busyTimeoutMs: 30 }); // give up quickly, for the test
    const attendee = attendeeOf(store); // made BEFORE the lock is taken: creating an account needs to write
    const locker = new DatabaseSync(file);
    locker.exec("BEGIN IMMEDIATE"); // somebody else is writing, and takes their time

    try {
      assert.throws(() => store.bookings.book(store.requireEvent("EV-000001"), "T1", "Ada", 1), { code: "BUSY" });

      const server = createServer({ publicDir, store, tokenSecret: TEST_SECRET });
      await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
      try {
        const res = await fetch(`http://127.0.0.1:${server.address().port}/api/bookings`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...bearer(attendee) },
          body: JSON.stringify({ eventId: "EV-000001", tierId: "T1", buyerName: "Ada", quantity: 1 }),
        });
        assert.equal(res.status, 503);
        assert.equal((await res.json()).error.code, "BUSY");
      } finally {
        server.closeAllConnections();
        await new Promise((resolve) => server.close(resolve));
      }
    } finally {
      locker.exec("ROLLBACK");
      locker.close();
    }
    // the lock is gone: booking works again and nothing was half-done
    assert.equal(store.requireEvent("EV-000001").tiers.get("T1").sold, 0);
    assert.equal(store.bookings.book(store.requireEvent("EV-000001"), "T1", "Ada", 1).ref, "BK-000001");
    store.close();
  });

  test("a bad busyTimeoutMs is refused", () => {
    assert.throws(() => createSqliteStore(":memory:", { busyTimeoutMs: -1 }), /busyTimeoutMs/);
    assert.throws(() => createSqliteStore(":memory:", { busyTimeoutMs: "5; DROP" }), /busyTimeoutMs/);
  });
});

describe("both stores enforce the booking life cycle themselves", () => {
  for (const [label, make] of [["memory", () => createMemoryStore()], ["SQLite", () => createSqliteStore(":memory:")]]) {
    test(`${label}: the store refuses illegal moves even when called directly`, () => {
      const store = make();
      const events = createEventService(store);
      const event = events.create(eventInput);
      events.addTier(event.id, { name: "Regular", priceCents: 100, capacity: 5 });
      events.publish(event.id);
      const e = () => store.requireEvent(event.id);

      const a = store.bookings.book(e(), "T1", "Ada", 1);
      store.bookings.pay(a.ref);
      assert.throws(() => store.bookings.pay(a.ref), { code: "INVALID_STATE" }); // paid -> paid

      const b = store.bookings.book(e(), "T1", "Bayo", 1);
      store.bookings.cancel(e(), b.ref);
      assert.throws(() => store.bookings.pay(b.ref), { code: "INVALID_STATE" }); // cancelled -> paid
      assert.equal(store.bookings.find(b.ref).status, "cancelled");
      assert.equal(e().tiers.get("T1").sold, 1);
      store.close();
    });
  }
});

// ---------------------------------------------------------------------------------
// The memory store and the SQLite store make the same promises. Same steps, same answers.
describe("both stores behave the same (contract)", () => {
  function scenario(store) {
    const events = createEventService(store);
    const bookings = createBookingService(store, { now: () => 1_800_000_000_000 }); // a frozen clock, so both stores see the same deadline
    const log = [];
    const attempt = (label, fn) => {
      try {
        const out = fn();
        // copy it now: the memory store hands out live objects that change later
        log.push([label, "ok", JSON.parse(JSON.stringify(out ?? null))]);
      } catch (err) {
        log.push([label, err.code ?? "CRASH", err.message]);
      }
    };

    const event = events.create(eventInput);
    attempt("add tier", () => events.addTier(event.id, { name: "Regular", priceCents: 500000, capacity: 3 }).id);
    attempt("add tier again with the same id", () => events.addTier(event.id, { id: "T1", name: "Dup", priceCents: 1, capacity: 1 }).id);
    attempt("book before publish", () => bookings.book(event.id, "T1", "Ada", 1).ref);
    attempt("publish", () => events.publish(event.id).status);
    attempt("book 2", () => bookings.book(event.id, "T1", "Ada", 2));
    attempt("book 2 more", () => bookings.book(event.id, "T1", "Bayo", 2));
    attempt("quantity 0", () => bookings.book(event.id, "T1", "Bayo", 0));
    attempt("quantity 11", () => bookings.book(event.id, "T1", "Bayo", 11));
    attempt("quantity 1.5", () => bookings.book(event.id, "T1", "Bayo", 1.5));
    attempt("no name", () => bookings.book(event.id, "T1", " ", 1));
    attempt("unknown tier", () => bookings.book(event.id, "NOPE", "Bayo", 1));
    attempt("unknown event", () => bookings.book("NOPE", "T1", "Bayo", 1));
    attempt("pay", () => bookings.pay("BK-000001").status);
    attempt("pay again", () => bookings.pay("BK-000001").status);
    attempt("pay unknown", () => bookings.pay("BK-999999").status);
    attempt("book last seat", () => bookings.book(event.id, "T1", "Chi", 1).ref);
    attempt("cancel unpaid", () => bookings.cancel("BK-000002").booking.status);
    attempt("cancel again", () => bookings.cancel("BK-000002").booking.status);
    attempt("cancel paid (refund by the policy)", () => bookings.cancel("BK-000001").booking.status);
    attempt("cancel paid (refund path)", () => bookings.cancel("BK-000001").booking.status);
    attempt("cancel unknown", () => bookings.cancel("BK-999999").booking.status);
    attempt("find", () => bookings.find("BK-000001").status);
    attempt("find unknown", () => bookings.find("BK-999999"));
    attempt("waitlist while seats left", () => store.bookings.joinWaitlist(store.requireEvent(event.id), "T1", "Dee"));
    attempt("fill up", () => bookings.book(event.id, "T1", "Eze", 3).ref);
    attempt("waitlist 1", () => store.bookings.joinWaitlist(store.requireEvent(event.id), "T1", "Dee"));
    attempt("waitlist 2", () => store.bookings.joinWaitlist(store.requireEvent(event.id), "T1", "Fay"));
    attempt("waitlist no name", () => store.bookings.joinWaitlist(store.requireEvent(event.id), "T1", ""));
    attempt("cancel names the next in line", () => bookings.cancel("BK-000003").nextInLine);
    attempt("unpublish", () => events.unpublish(event.id).status);
    attempt("search finds nothing", () => events.search({ city: "Lagos" }).length);
    attempt("publish again", () => events.publish(event.id).status);
    attempt("search finds it", () => events.search({ city: "Lagos" }, "price", "asc").map((e) => e.id));
    attempt("search bad filter", () => events.search({ dateFrom: "tomorrow" }).length);
    attempt("get missing event", () => events.get("EV-999999").id);
    attempt("next event id", () => events.create(eventInput).id);
    attempt("seats sold", () => store.requireEvent(event.id).tiers.get("T1").sold);
    return log;
  }

  test("the same steps give the same answers on both stores", () => {
    const memory = scenario(createMemoryStore());
    const sqlite = scenario(createSqliteStore(":memory:"));
    assert.equal(memory.length, sqlite.length);
    for (let i = 0; i < memory.length; i++) {
      assert.deepEqual(sqlite[i], memory[i], `step "${memory[i][0]}" differs between the stores`);
    }
    // and the scenario really did exercise both good and bad paths
    const codes = new Set(memory.map((s) => s[1]));
    for (const wanted of ["ok", "VALIDATION", "NOT_PUBLISHED", "SOLD_OUT", "NOT_FOUND", "INVALID_STATE", "ALREADY_CANCELLED", "NOT_SOLD_OUT"]) {
      assert.ok(codes.has(wanted), `the scenario never produced ${wanted}`);
    }
    assert.ok(!codes.has("CRASH"), "an error with no code means a crash");
  });
});
