import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { createServer } from "../src/server.js";
import { createMemoryStore } from "../src/data/memoryStore.js";
import { createSqliteStore, SCHEMA_V1 } from "../src/data/sqliteStore.js";
import { signToken } from "../src/tokens.js";

const publicDir = fileURLToPath(new URL("../public", import.meta.url));
const CHEAP = { N: 1024, r: 8, p: 1 };
const PASSWORD = "correct horse battery";
const eventBody = { title: "Lagos Jazz Night", city: "Lagos", venue: "Terra Kulture", date: "2026-12-05" };

// Login, roles and "only your own data", checked over real HTTP on BOTH stores.
for (const [label, makeStore] of [
  ["memory", () => createMemoryStore()],
  ["SQLite", () => createSqliteStore(":memory:")],
]) {
  describe(`login, roles and privacy on the ${label} store`, () => {
    let server, store, base, clock;

    beforeEach(async () => {
      clock = Date.parse("2026-10-15T10:00:00Z");
      store = makeStore();
      server = createServer({ publicDir, store, hashCost: CHEAP, now: () => clock, tokenSecret: "the-secret-for-these-tests" });
      await new Promise((r) => server.listen(0, "127.0.0.1", r));
      base = `http://127.0.0.1:${server.address().port}`;
    });
    afterEach(async () => {
      server.closeAllConnections();
      await new Promise((r) => server.close(r));
      store.close();
    });

    async function call(method, url, { body, token, headers = {} } = {}) {
      const init = { method, headers: { ...headers } };
      if (body !== undefined) {
        init.body = JSON.stringify(body);
        init.headers["Content-Type"] = "application/json";
      }
      if (token) init.headers.Authorization = `Bearer ${token}`;
      const res = await fetch(base + url, init);
      const text = await res.text();
      let json = null;
      try { json = JSON.parse(text); } catch { /* not json */ }
      return { status: res.status, headers: res.headers, text, json };
    }
    const signup = (name, role, email = `${name.toLowerCase()}@example.com`) =>
      call("POST", "/api/auth/signup", { body: { name, email, password: PASSWORD, role } });
    async function person(name, role) {
      const res = await signup(name, role);
      assert.equal(res.status, 201, res.text);
      return { id: res.json.user.id, token: res.json.token };
    }
    async function publishedEvent(owner, capacity = 5) {
      const ev = await call("POST", "/api/events", { body: eventBody, token: owner.token });
      assert.equal(ev.status, 201, ev.text);
      const id = ev.json.event.id;
      await call("POST", `/api/events/${id}/tiers`, { body: { name: "Regular", priceCents: 500000, capacity }, token: owner.token });
      await call("POST", `/api/events/${id}/publish`, { token: owner.token });
      return id;
    }
    const book = (eventId, who, quantity = 1) =>
      call("POST", "/api/bookings", { body: { eventId, tierId: "T1", buyerName: "Ada", quantity }, token: who.token });

    describe("signup (S01)", () => {
      test("201 with the user and a token, and the password is never sent back", async () => {
        const res = await signup("Ada", "attendee");
        assert.equal(res.status, 201);
        assert.deepEqual(res.json.user, { id: "U-000001", name: "Ada", email: "ada@example.com", role: "attendee" });
        assert.equal(res.json.token.split(".").length, 3);
        assert.ok(!res.text.includes(PASSWORD));
        assert.ok(!/hash|scrypt/i.test(res.text));
      });
      test("the password is stored only as a salted hash", async () => {
        await signup("Ada", "attendee");
        const saved = store.users.findByEmail("ada@example.com");
        assert.match(saved.passwordHash, /^scrypt\$/);
        assert.ok(!saved.passwordHash.includes(PASSWORD));
      });
      test("the same email twice is EMAIL_TAKEN, even with other capital letters", async () => {
        await signup("Ada", "attendee", "ada@example.com");
        const again = await signup("Other", "organizer", "ADA@Example.com");
        assert.equal(again.status, 409);
        assert.equal(again.json.error.code, "EMAIL_TAKEN");
        assert.equal(store.users.findById("U-000002"), undefined);
      });
      test("bad signups are 400 VALIDATION, and staff is 403", async () => {
        const bad = (body) => call("POST", "/api/auth/signup", { body });
        const ok = { name: "Ada", email: "ada@example.com", password: PASSWORD, role: "attendee" };
        for (const body of [{ ...ok, email: "nope" }, { ...ok, password: "short" }, { ...ok, name: "" }, { ...ok, role: "admin" }, {}]) {
          const res = await bad(body);
          assert.equal(res.status, 400, JSON.stringify(body));
          assert.equal(res.json.error.code, "VALIDATION");
        }
        const staff = await bad({ ...ok, role: "staff" });
        assert.equal(staff.status, 403);
        assert.equal(staff.json.error.code, "FORBIDDEN");
        assert.equal(store.users.findByEmail("ada@example.com"), undefined);
      });
      test("a body cannot smuggle in extra powers (an id or a hash is ignored)", async () => {
        const res = await call("POST", "/api/auth/signup", { body: { name: "Ada", email: "ada@example.com", password: PASSWORD, role: "attendee", id: "U-999999", passwordHash: "x" } });
        assert.equal(res.json.user.id, "U-000001");
        assert.match(store.users.findByEmail("ada@example.com").passwordHash, /^scrypt\$/);
      });
    });

    describe("login (S01)", () => {
      test("the right email and password give a token that works", async () => {
        await signup("Ada", "attendee");
        const res = await call("POST", "/api/auth/login", { body: { email: "ADA@example.com", password: PASSWORD } });
        assert.equal(res.status, 200);
        const me = await call("GET", "/api/me", { token: res.json.token });
        assert.equal(me.status, 200);
        assert.equal(me.json.user.email, "ada@example.com");
      });
      test("a wrong password and an unknown email get the SAME 401 answer", async () => {
        await signup("Ada", "attendee");
        const wrongPassword = await call("POST", "/api/auth/login", { body: { email: "ada@example.com", password: "not the password" } });
        const unknownEmail = await call("POST", "/api/auth/login", { body: { email: "nobody@example.com", password: PASSWORD } });
        assert.equal(wrongPassword.status, 401);
        assert.equal(unknownEmail.status, 401);
        assert.deepEqual(wrongPassword.json, unknownEmail.json);
        assert.equal(wrongPassword.json.error.code, "UNAUTHENTICATED");
        assert.equal(wrongPassword.headers.get("www-authenticate"), "Bearer");
      });
      test("missing or silly values are 400, never a crash", async () => {
        for (const body of [{}, { email: "a@b.co" }, { password: PASSWORD }, { email: 5, password: 5 }, { email: "a@b.co", password: "x".repeat(500) }]) {
          const res = await call("POST", "/api/auth/login", { body });
          assert.equal(res.status, 400, JSON.stringify(body).slice(0, 60));
        }
      });
    });

    describe("tokens (who are you?)", () => {
      test("no token on a private address: 401", async () => {
        const res = await call("GET", "/api/me");
        assert.equal(res.status, 401);
        assert.equal(res.json.error.code, "UNAUTHENTICATED");
        assert.equal(res.headers.get("www-authenticate"), "Bearer");
      });
      test("bad tokens: garbage, tampered, wrong secret, wrong word, all 401", async () => {
        const ada = await person("Ada", "attendee");
        const [h, , s] = ada.token.split(".");
        const forged = Buffer.from(JSON.stringify({ sub: ada.id, role: "organizer", iat: 1, exp: 99999999999 })).toString("base64url");
        const otherSecret = signToken({ sub: ada.id, role: "attendee" }, "some-other-secret-1234", { now: clock });
        for (const token of ["garbage", `${h}.${forged}.${s}`, otherSecret, ada.token.slice(0, -2) + "xx"]) {
          const res = await call("GET", "/api/me", { token });
          assert.equal(res.status, 401, token.slice(0, 20));
        }
        const basic = await call("GET", "/api/me", { headers: { Authorization: "Basic YWRhOnB3" } });
        assert.equal(basic.status, 401);
      });
      test("an expired token is 401, and logging in again fixes it", async () => {
        const ada = await person("Ada", "attendee");
        clock += 2 * 60 * 60 * 1000 + 1000;
        const late = await call("GET", "/api/me", { token: ada.token });
        assert.equal(late.status, 401);
        assert.match(late.json.error.message, /expired/);
        const again = await call("POST", "/api/auth/login", { body: { email: "ada@example.com", password: PASSWORD } });
        assert.equal((await call("GET", "/api/me", { token: again.json.token })).status, 200);
      });
      test("a token for an account that no longer exists is refused", async () => {
        const ghost = signToken({ sub: "U-424242", role: "organizer" }, "the-secret-for-these-tests", { now: clock });
        assert.equal((await call("GET", "/api/me", { token: ghost })).status, 401);
      });
      test("two servers with different secrets do not accept each other's tokens", async () => {
        const ada = await person("Ada", "attendee");
        const other = createServer({ publicDir, store, hashCost: CHEAP, now: () => clock }); // makes its own random secret
        await new Promise((r) => other.listen(0, "127.0.0.1", r));
        try {
          const res = await fetch(`http://127.0.0.1:${other.address().port}/api/me`, { headers: { Authorization: `Bearer ${ada.token}` } });
          assert.equal(res.status, 401);
        } finally {
          other.closeAllConnections();
          await new Promise((r) => other.close(r));
        }
      });
      test("public pages work with no token, and a bad token on a public page just means 'not logged in'", async () => {
        const org = await person("Olu", "organizer");
        const id = await publishedEvent(org);
        assert.equal((await call("GET", "/api/events")).json.events.length, 1);
        assert.equal((await call("GET", `/api/events/${id}`)).status, 200);
        assert.equal((await call("GET", `/api/events/${id}`, { token: "garbage" })).status, 200);
        assert.equal((await call("GET", "/api/events", { token: "garbage" })).status, 200);
      });
    });

    describe("roles (who may do what?)", () => {
      test("nobody logged in: creating an event or a booking is 401", async () => {
        assert.equal((await call("POST", "/api/events", { body: eventBody })).status, 401);
        assert.equal((await call("POST", "/api/bookings", { body: { eventId: "EV-000001", tierId: "T1", buyerName: "A", quantity: 1 } })).status, 401);
      });
      test("an attendee cannot create, edit or publish events (403)", async () => {
        const org = await person("Olu", "organizer");
        const ada = await person("Ada", "attendee");
        const id = await publishedEvent(org);
        const attempts = [
          ["POST", "/api/events", eventBody],
          ["POST", `/api/events/${id}/tiers`, { name: "VIP", priceCents: 1, capacity: 1 }],
          ["POST", `/api/events/${id}/publish`],
          ["POST", `/api/events/${id}/unpublish`],
        ];
        for (const [method, url, body] of attempts) {
          const res = await call(method, url, { body, token: ada.token });
          assert.equal(res.status, 403, url);
          assert.equal(res.json.error.code, "FORBIDDEN");
        }
        assert.equal((await call("GET", `/api/events/${id}`)).json.event.status, "published");
        assert.equal((await call("GET", "/api/me/events", { token: ada.token })).status, 403);
      });
      test("an organizer cannot book tickets (403)", async () => {
        const org = await person("Olu", "organizer");
        const id = await publishedEvent(org);
        const res = await book(id, org);
        assert.equal(res.status, 403);
        assert.equal((await call("GET", `/api/events/${id}`)).json.event.tiers[0].seatsLeft, 5);
      });
    });

    describe("ownership: one organizer cannot touch another's event", () => {
      test("changing someone else's PUBLISHED event is 403 and changes nothing", async () => {
        const olu = await person("Olu", "organizer");
        const bisi = await person("Bisi", "organizer");
        const id = await publishedEvent(olu);
        for (const [url, body] of [[`/api/events/${id}/tiers`, { name: "Sneaky", priceCents: 1, capacity: 1 }], [`/api/events/${id}/unpublish`], [`/api/events/${id}/publish`]]) {
          const res = await call("POST", url, { body, token: bisi.token });
          assert.equal(res.status, 403, url);
          assert.equal(res.json.error.code, "FORBIDDEN");
        }
        const event = (await call("GET", `/api/events/${id}`)).json.event;
        assert.equal(event.status, "published");
        assert.equal(event.tiers.length, 1);
        // the real owner still can
        assert.equal((await call("POST", `/api/events/${id}/unpublish`, { token: olu.token })).status, 200);
      });
      test("someone else's DRAFT is invisible: 404 to read it, 404 to change it", async () => {
        const olu = await person("Olu", "organizer");
        const bisi = await person("Bisi", "organizer");
        const draft = await call("POST", "/api/events", { body: eventBody, token: olu.token });
        const id = draft.json.event.id;
        assert.equal((await call("GET", `/api/events/${id}`, { token: olu.token })).status, 200);
        assert.equal((await call("GET", `/api/events/${id}`, { token: bisi.token })).status, 404);
        assert.equal((await call("GET", `/api/events/${id}`)).status, 404);
        assert.equal((await call("POST", `/api/events/${id}/publish`, { token: bisi.token })).status, 404);
        assert.equal((await call("POST", `/api/events/${id}/tiers`, { body: { name: "x", priceCents: 1, capacity: 1 }, token: bisi.token })).status, 404);
      });
      test("the owner is always the logged-in organizer, whatever the body says", async () => {
        const olu = await person("Olu", "organizer");
        const bisi = await person("Bisi", "organizer");
        const res = await call("POST", "/api/events", { body: { ...eventBody, ownerId: bisi.id }, token: olu.token });
        assert.equal(res.status, 201);
        assert.equal(store.getEvent(res.json.event.id).ownerId, olu.id);
        assert.equal((await call("POST", `/api/events/${res.json.event.id}/publish`, { token: bisi.token })).status, 404);
      });
      test("the dashboard list (/api/me/events) shows only my events, drafts included", async () => {
        const olu = await person("Olu", "organizer");
        const bisi = await person("Bisi", "organizer");
        await publishedEvent(olu);
        await call("POST", "/api/events", { body: { ...eventBody, title: "Olu draft" }, token: olu.token });
        await call("POST", "/api/events", { body: { ...eventBody, title: "Bisi draft" }, token: bisi.token });
        const mine = (await call("GET", "/api/me/events", { token: olu.token })).json.events;
        assert.deepEqual(mine.map((e) => e.title), ["Lagos Jazz Night", "Olu draft"]);
        assert.deepEqual(mine.map((e) => e.status), ["published", "draft"]);
        assert.deepEqual((await call("GET", "/api/me/events", { token: bisi.token })).json.events.map((e) => e.title), ["Bisi draft"]);
      });
    });

    describe("privacy: one attendee cannot see another's booking (S13)", () => {
      test("reading, paying and cancelling someone else's booking all look like 404", async () => {
        const org = await person("Olu", "organizer");
        const ada = await person("Ada", "attendee");
        const bayo = await person("Bayo", "attendee");
        const id = await publishedEvent(org);
        const booking = (await book(id, ada, 2)).json.booking;

        for (const [method, url] of [["GET", `/api/bookings/${booking.ref}`], ["POST", `/api/bookings/${booking.ref}/pay`], ["POST", `/api/bookings/${booking.ref}/cancel`]]) {
          const res = await call(method, url, { token: bayo.token });
          assert.equal(res.status, 404, `${method} ${url}`);
          assert.equal(res.json.error.code, "NOT_FOUND");
        }
        // the SAME answer as a booking that does not exist, so codes cannot be guessed
        const missing = await call("GET", "/api/bookings/BK-999999", { token: bayo.token });
        const theirs = await call("GET", `/api/bookings/${booking.ref}`, { token: bayo.token });
        assert.equal(missing.status, theirs.status);
        assert.equal(missing.json.error.code, theirs.json.error.code);
        // nothing happened to Ada's booking
        const mine = await call("GET", `/api/bookings/${booking.ref}`, { token: ada.token });
        assert.equal(mine.json.booking.status, "pending");
        // the organizer of the event cannot read attendee bookings either
        assert.equal((await call("GET", `/api/bookings/${booking.ref}`, { token: org.token })).status, 404);
        // and nobody logged in gets 401
        assert.equal((await call("GET", `/api/bookings/${booking.ref}`)).status, 401);
      });
      test("my tickets (/api/me/bookings) lists only mine, newest first", async () => {
        const org = await person("Olu", "organizer");
        const ada = await person("Ada", "attendee");
        const bayo = await person("Bayo", "attendee");
        const id = await publishedEvent(org);
        const first = (await book(id, ada)).json.booking;
        await book(id, bayo);
        const second = (await book(id, ada, 2)).json.booking;
        const list = (await call("GET", "/api/me/bookings", { token: ada.token })).json.bookings;
        assert.deepEqual(list.map((b) => b.ref), [second.ref, first.ref]);
        assert.equal((await call("GET", "/api/me/bookings", { token: bayo.token })).json.bookings.length, 1);
        assert.deepEqual((await call("GET", "/api/me/bookings", { token: org.token })).json.bookings, []);
      });
      test("the owner can pay and the answer never contains the owner's user id", async () => {
        const org = await person("Olu", "organizer");
        const ada = await person("Ada", "attendee");
        const id = await publishedEvent(org);
        const booking = (await book(id, ada)).json.booking;
        const paid = await call("POST", `/api/bookings/${booking.ref}/pay`, { token: ada.token });
        assert.equal(paid.json.booking.status, "paid");
        assert.ok(!paid.text.includes(ada.id));
        assert.ok(!("userId" in paid.json.booking));
      });
      test("a booking made before logins existed (no owner) cannot be read by anyone", async () => {
        const org = await person("Olu", "organizer");
        const ada = await person("Ada", "attendee");
        const id = await publishedEvent(org);
        const old = store.bookings.book(store.requireEvent(id), "T1", "Old Customer", 1); // no userId, like an old row
        assert.equal((await call("GET", `/api/bookings/${old.ref}`, { token: ada.token })).status, 404);
      });
    });
  });
}

describe("upgrading an old (Build 5) database file keeps its data", () => {
  test("schema 1 -> 2: old rows survive, but nobody owns them, so nobody can change or read them", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "stub-migrate-"));
    const file = path.join(dir, "old.sqlite");
    const old = new DatabaseSync(file);
    old.exec(SCHEMA_V1);
    old.exec("PRAGMA user_version = 1");
    old.exec(`INSERT INTO events VALUES ('EV-000001', 'Old Event', 'Lagos', 'Old Hall', '2026-12-05', 'published');
              INSERT INTO tiers VALUES ('EV-000001', 'T1', 'Regular', 500000, 10, 2);
              INSERT INTO bookings VALUES ('BK-000001', 'EV-000001', 'T1', 'Old Buyer', 2, 1000000, 'paid');
              UPDATE counters SET value = 1 WHERE name IN ('event', 'booking');`);
    old.close();

    const store = createSqliteStore(file);
    const check = new DatabaseSync(file);
    assert.equal(check.prepare("PRAGMA user_version").get().user_version, 2);
    check.close();

    const event = store.requireEvent("EV-000001");
    assert.equal(event.title, "Old Event");
    assert.equal(event.ownerId, null);
    assert.equal(event.tiers.get("T1").sold, 2);
    const booking = store.bookings.find("BK-000001");
    assert.equal(booking.buyerName, "Old Buyer");
    assert.equal(booking.userId, null);
    assert.equal(store.nextEventId(), "EV-000002"); // counters carried over
    assert.equal(store.users.create({ name: "New", email: "new@example.com", passwordHash: "h", role: "organizer" }).id, "U-000001");
    store.close();

    // opening it again does nothing more
    createSqliteStore(file).close();

    const server = createServer({ publicDir, store: createSqliteStore(file), hashCost: CHEAP });
    await new Promise((r) => server.listen(0, "127.0.0.1", r));
    try {
      const url = `http://127.0.0.1:${server.address().port}`;
      const login = await (await fetch(url + "/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: "new@example.com", password: "x" }) })).json();
      assert.equal(login.error.code, "UNAUTHENTICATED"); // "h" is not a real hash, so nobody can log in as it
      const listing = await (await fetch(url + "/api/events")).json();
      assert.equal(listing.events.length, 1); // the old published event is still on sale
    } finally {
      server.closeAllConnections();
      await new Promise((r) => server.close(r));
    }
  });
});
