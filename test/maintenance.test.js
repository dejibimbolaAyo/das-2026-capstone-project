import { test, describe, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { createServer } from "../src/server.js";
import { createSqliteStore, SCHEMA_V1, MIGRATIONS } from "../src/data/sqliteStore.js";
import { createMaintenance } from "../src/jobs/maintenance.js";
import { createFakeClock, createSystemClock } from "../src/lib/clock.js";
import { makeWorld, MINUTE } from "./world.js";

const publicDir = fileURLToPath(new URL("../public", import.meta.url));
let w;
afterEach(() => {
  w?.close();
  w = undefined;
});

describe("the clock", () => {
  test("a fake clock stands still until it is moved", () => {
    const clock = createFakeClock("2026-01-01T00:00:00Z");
    const t = clock.now();
    assert.equal(clock.now(), t);
    clock.advance(MINUTE);
    assert.equal(clock.now(), t + MINUTE);
    clock.set("2027-02-03T04:05:06Z");
    assert.equal(clock.now(), Date.parse("2027-02-03T04:05:06Z"));
    clock.set(5);
    assert.equal(clock.now(), 5);
  });
  test("bad times are refused", () => {
    assert.throws(() => createFakeClock("never"), /understand/);
    const clock = createFakeClock();
    assert.throws(() => clock.set("later"), /understand/);
    assert.throws(() => clock.advance(NaN), /milliseconds/);
  });
  test("the system clock is the real time", () => {
    assert.ok(Math.abs(createSystemClock().now() - Date.now()) < 1000);
  });
});

describe("the maintenance job", () => {
  test("run() reports what it did, and says so in the log", () => {
    w = makeWorld({ capacity: 1 });
    const lines = [];
    const job = createMaintenance({ seats: w.seats, log: (l) => lines.push(l) });
    w.book(w.ada, 1);
    w.waitlist.join(w.eventId, w.tierId, w.bayo);
    assert.deepEqual(job.run(), { expiredBookings: [], expiredOffers: [], newOffers: [] });
    assert.deepEqual(lines, [], "nothing to do, nothing to say");
    w.clock.advance(10 * MINUTE);
    const r = job.run();
    assert.equal(r.expiredBookings.length, 1);
    assert.equal(r.newOffers.length, 1);
    assert.match(lines[0], /1 unpaid booking\(s\) expired, 1 seat\(s\) offered/);
  });

  test("the timer needs a sensible interval", () => {
    const job = createMaintenance({ seats: { sweep: () => ({ expiredBookings: [], expiredOffers: [], newOffers: [] }) } });
    for (const bad of [0, 50, 1.5, "100", undefined]) assert.throws(() => job.start(bad), /interval/);
  });

  test("the timer runs the job by itself, and stop() ends it", async () => {
    let runs = 0;
    const job = createMaintenance({ seats: { sweep: () => (runs++, { expiredBookings: [], expiredOffers: [], newOffers: [] }) } });
    job.start(100);
    job.start(100); // starting twice does not start two timers
    await new Promise((r) => setTimeout(r, 450));
    job.stop();
    const after = runs;
    assert.ok(after >= 2 && after <= 5, `ran ${after} times in about 450 ms`);
    await new Promise((r) => setTimeout(r, 300));
    assert.equal(runs, after, "no more runs after stop()");
  });

  test("a failing run does not stop the timer", async () => {
    let runs = 0;
    const job = createMaintenance({ seats: { sweep: () => { runs++; throw new Error("database busy"); } } });
    const original = console.error;
    console.error = () => {};
    try {
      job.start(100);
      await new Promise((r) => setTimeout(r, 350));
      job.stop();
    } finally {
      console.error = original;
    }
    assert.ok(runs >= 2, `kept running after errors (${runs} runs)`);
  });
});

describe("the server runs the job on a timer, but only when asked to", () => {
  test("with maintenanceIntervalMs the server lets go of expired bookings by itself, and stops when it closes", async () => {
    const clock = createFakeClock("2026-06-01T12:00:00Z");
    const store = createSqliteStore(":memory:");
    const org = store.users.create({ name: "O", email: "o@x.example", passwordHash: "x", role: "organizer" });
    const att = store.users.create({ name: "A", email: "a@x.example", passwordHash: "x", role: "attendee" });
    const server = createServer({ publicDir, store, clock, maintenanceIntervalMs: 100 });
    // make an event and an unpaid booking directly in the store (no HTTP needed for this test)
    const e = { id: store.nextEventId(), title: "T", city: "Lagos", venue: "V", date: "2026-12-05", status: "published", ownerId: org.id, tiers: new Map([["T1", { id: "T1", name: "R", priceCents: 100, capacity: 2, sold: 0, waitlist: { size: 0 } }]]) };
    store.saveEvent(e);
    const booking = store.bookings.book(store.requireEvent(e.id), "T1", "A", 2, { userId: att.id, holdExpiresAt: new Date(clock.now() + 10 * MINUTE).toISOString() });
    clock.advance(11 * MINUTE);
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    try {
      let status = store.bookings.find(booking.ref).status;
      for (let i = 0; i < 30 && status === "pending"; i++) {
        await new Promise((r) => setTimeout(r, 50));
        status = store.bookings.find(booking.ref).status;
      }
      assert.equal(status, "expired", "the timer expired it without anybody asking");
      assert.equal(store.requireEvent(e.id).tiers.get("T1").sold, 0);
    } finally {
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
      store.close();
    }
  });

  test("by default (interval 0) there is no timer: tests stay in control", async () => {
    const server = createServer({ publicDir, store: createSqliteStore(":memory:") });
    assert.equal(typeof server.maintenance.run, "function");
    assert.deepEqual(server.maintenance.run(), { expiredBookings: [], expiredOffers: [], newOffers: [] });
  });
});

describe("upgrading a Build 7 database (schema 2) to schema 3", () => {
  test("old rows survive; old waitlist names cannot block the line; refunds and offers work afterwards", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "stub-migrate3-"));
    const file = path.join(dir, "v2.sqlite");
    const old = new DatabaseSync(file);
    old.exec(SCHEMA_V1);
    old.exec(MIGRATIONS[2]);
    old.exec("PRAGMA user_version = 2");
    old.exec(`INSERT INTO users VALUES ('U-000001', 'Olu', 'olu@x.example', 'hash', 'organizer');
              INSERT INTO users VALUES ('U-000002', 'Ada', 'ada@x.example', 'hash', 'attendee');
              INSERT INTO events (id, title, city, venue, date, status, owner_id) VALUES ('EV-000001', 'Old Event', 'Lagos', 'Hall', '2040-12-05', 'published', 'U-000001');
              INSERT INTO tiers VALUES ('EV-000001', 'T1', 'Regular', 500000, 1, 1);
              INSERT INTO bookings (ref, event_id, tier_id, buyer_name, quantity, total_cents, status, user_id, hold_expires_at)
                VALUES ('BK-000001', 'EV-000001', 'T1', 'Ada', 1, 500000, 'paid', 'U-000002', '2026-01-01T00:10:00.000Z');
              INSERT INTO waitlist (event_id, tier_id, name) VALUES ('EV-000001', 'T1', 'Old Name');
              UPDATE counters SET value = 1 WHERE name IN ('event', 'booking');
              UPDATE counters SET value = 2 WHERE name = 'user';`);
    old.close();

    const store = createSqliteStore(file);
    const check = new DatabaseSync(file);
    assert.equal(check.prepare("PRAGMA user_version").get().user_version, 3);
    const row = check.prepare("SELECT status, user_id, offer_expires_at FROM waitlist").get();
    assert.deepEqual({ ...row }, { status: "left", user_id: null, offer_expires_at: null });
    check.close();

    // the old data is all there
    assert.equal(store.requireEvent("EV-000001").title, "Old Event");
    const booking = store.bookings.find("BK-000001");
    assert.equal(booking.status, "paid");
    assert.equal(booking.refundCents, null);
    assert.equal(store.requireEvent("EV-000001").tiers.get("T1").waitlist.size, 0, "the old name no longer waits");

    // and the new features work on top of it
    const bob = store.users.create({ name: "Bob", email: "bob@x.example", passwordHash: "x", role: "attendee" });
    const waitlistEntry = store.waitlist.join({ eventId: "EV-000001", tierId: "T1", userId: bob.id, name: "Bob" });
    assert.equal(waitlistEntry.position, 1, "Bob is first: the old name does not count");
    store.bookings.cancel(store.requireEvent("EV-000001"), "BK-000001", { refundCents: 500000, expectStatus: "paid", nowMs: Date.parse("2026-06-01T00:00:00Z") });
    assert.equal(store.bookings.find("BK-000001").refundCents, 500000);
    assert.equal(store.waitlist.find(waitlistEntry.id).status, "offered");
    store.close();
  });

  test("a database from a NEWER version is still refused", () => {
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "stub-newer-")), "x.sqlite");
    createSqliteStore(file).close();
    const db = new DatabaseSync(file);
    db.exec("PRAGMA user_version = 4");
    db.close();
    assert.throws(() => createSqliteStore(file), /newer version/);
  });
});
