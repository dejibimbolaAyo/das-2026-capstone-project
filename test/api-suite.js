import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "../src/server.js";
import { STATUS_BY_CODE } from "../src/routes/errors.js";

const publicDir = fileURLToPath(new URL("../public", import.meta.url));
const SRC = fileURLToPath(new URL("../src/", import.meta.url));

// The whole API test suite, written once and run against every kind of store.
// test/api.test.js runs it for the in-memory store AND for the SQLite store,
// so both must give exactly the same answers.
export function defineApiTests(label, makeStore) {
  describe(`API on the ${label} store`, () => {
    let server;
    let store;
    let base;

    // Since Build 7 most calls need a login. Every test starts with one organizer and one attendee,
    // made through the real signup call, and `call` sends the right token by itself (see `as` below).
    let tokens;

    beforeEach(async () => {
      store = makeStore();
      // A cheap password hash keeps the tests fast. (Real servers use the strong default.)
      server = createServer({ publicDir, store, hashCost: { N: 1024, r: 8, p: 1 } });
      await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
      base = `http://127.0.0.1:${server.address().port}`;
      tokens = {};
      for (const [who, role] of [["org", "organizer"], ["att", "attendee"]]) {
        const res = await fetch(base + "/api/auth/signup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: `Test ${role}`, email: `${role}@example.com`, password: "correct horse battery", role }),
        });
        tokens[who] = (await res.json()).token;
      }
    });

    afterEach(async () => {
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
      store.close();
    });


    // One call to the API. `body` objects are sent as JSON. `raw` is sent exactly as written.
    // `as`: who is asking. "org" = the organizer, "att" = the attendee, "anon" = nobody logged in.
    // The default picks the person the old (pre-login) tests meant: attendee for bookings, organizer otherwise.
    async function call(method, url, { body, raw, type = "application/json", as, token } = {}) {
      const init = { method, headers: {} };
      const who = as ?? (url.startsWith("/api/bookings") ? "att" : url.startsWith("/api/auth") ? "anon" : url === "/api/events" && method === "GET" ? "anon" : "org");
      if (token !== undefined) init.headers.Authorization = `Bearer ${token}`;
      else if (who !== "anon") init.headers.Authorization = `Bearer ${tokens[who]}`;
      if (body !== undefined) {
        init.body = JSON.stringify(body);
        init.headers["Content-Type"] = type;
      } else if (raw !== undefined) {
        init.body = raw;
        init.headers["Content-Type"] = type;
      }
      const res = await fetch(base + url, init);
      const text = await res.text();
      let json = null;
      try {
        json = JSON.parse(text);
      } catch {
        /* not json */
      }
      return { status: res.status, headers: res.headers, text, json };
    }

    function assertErrorShape(res, status, code) {
      assert.equal(res.status, status, res.text);
      assert.match(res.headers.get("content-type"), /^application\/json/);
      assert.deepEqual(Object.keys(res.json), ["error"]);
      assert.deepEqual(Object.keys(res.json.error).sort(), ["code", "message"]);
      assert.equal(res.json.error.code, code);
      assert.equal(typeof res.json.error.message, "string");
    }

    const newEvent = { title: "Lagos Jazz Night", city: "Lagos", venue: "Terra Kulture", date: "2026-12-05" };

    // Make a published event with one tier. Returns { eventId, tierId }.
    async function publishedEvent({ capacity = 3, priceCents = 500000, ...over } = {}) {
      const ev = await call("POST", "/api/events", { body: { ...newEvent, ...over } });
      const eventId = ev.json.event.id;
      const tier = await call("POST", `/api/events/${eventId}/tiers`, {
        body: { name: "Regular", priceCents, capacity },
      });
      await call("POST", `/api/events/${eventId}/publish`);
      return { eventId, tierId: tier.json.tier.id };
    }

    describe("API: events and tiers (S02, S03, S04)", () => {
      test("create an event: 201, Location header, draft, server-made id", async () => {
        const res = await call("POST", "/api/events", { body: newEvent });
        assert.equal(res.status, 201);
        assert.equal(res.headers.get("location"), "/api/events/EV-000001");
        assert.deepEqual(res.json.event, { id: "EV-000001", ...newEvent, status: "draft", tiers: [] });
      });

      test("a client-chosen event id is ignored", async () => {
        const res = await call("POST", "/api/events", { body: { ...newEvent, id: "HACK" } });
        assert.equal(res.json.event.id, "EV-000001");
      });

      test("event ids count up", async () => {
        await call("POST", "/api/events", { body: newEvent });
        const second = await call("POST", "/api/events", { body: newEvent });
        assert.equal(second.json.event.id, "EV-000002");
      });

      test("bad events are VALIDATION (400)", async () => {
        for (const body of [{}, { ...newEvent, title: "" }, { ...newEvent, date: "2026-13-45" }, { ...newEvent, city: 5 }]) {
          assertErrorShape(await call("POST", "/api/events", { body }), 400, "VALIDATION");
        }
      });

      test("add a tier: 201, id T1, seatsLeft = capacity", async () => {
        await call("POST", "/api/events", { body: newEvent });
        const res = await call("POST", "/api/events/EV-000001/tiers", {
          body: { name: "VIP", priceCents: 1500000, capacity: 10 },
        });
        assert.equal(res.status, 201);
        assert.deepEqual(res.json.tier, { id: "T1", name: "VIP", priceCents: 1500000, capacity: 10, seatsLeft: 10 });
      });

      test("a second tier is T2, and a given tier id is respected", async () => {
        await call("POST", "/api/events", { body: newEvent });
        await call("POST", "/api/events/EV-000001/tiers", { body: { name: "A", priceCents: 1, capacity: 1 } });
        const t2 = await call("POST", "/api/events/EV-000001/tiers", { body: { name: "B", priceCents: 1, capacity: 1 } });
        assert.equal(t2.json.tier.id, "T2");
        const own = await call("POST", "/api/events/EV-000001/tiers", {
          body: { id: "vip", name: "C", priceCents: 1, capacity: 1 },
        });
        assert.equal(own.json.tier.id, "vip");
        assertErrorShape(
          await call("POST", "/api/events/EV-000001/tiers", { body: { id: "vip", name: "D", priceCents: 1, capacity: 1 } }),
          400,
          "VALIDATION"
        );
      });

      test("bad tiers: decimal price, zero capacity, no name", async () => {
        await call("POST", "/api/events", { body: newEvent });
        for (const body of [
          { name: "A", priceCents: 10.5, capacity: 1 },
          { name: "A", priceCents: -1, capacity: 1 },
          { name: "A", priceCents: 100, capacity: 0 },
          { name: "", priceCents: 100, capacity: 1 },
          { priceCents: 100, capacity: 1 },
        ]) {
          assertErrorShape(await call("POST", "/api/events/EV-000001/tiers", { body }), 400, "VALIDATION");
        }
      });

      test("tier on a missing event is NOT_FOUND (404)", async () => {
        assertErrorShape(
          await call("POST", "/api/events/EV-999999/tiers", { body: { name: "A", priceCents: 1, capacity: 1 } }),
          404,
          "NOT_FOUND"
        );
      });

      test("publish needs a tier; publish and unpublish work", async () => {
        await call("POST", "/api/events", { body: newEvent });
        assertErrorShape(await call("POST", "/api/events/EV-000001/publish"), 400, "VALIDATION");
        await call("POST", "/api/events/EV-000001/tiers", { body: { name: "A", priceCents: 1, capacity: 1 } });
        const pub = await call("POST", "/api/events/EV-000001/publish");
        assert.equal(pub.status, 200);
        assert.equal(pub.json.event.status, "published");
        const unpub = await call("POST", "/api/events/EV-000001/unpublish");
        assert.equal(unpub.json.event.status, "draft");
      });

      test("get one event, and a missing one is 404", async () => {
        await call("POST", "/api/events", { body: newEvent });
        const res = await call("GET", "/api/events/EV-000001");
        assert.equal(res.status, 200);
        assert.equal(res.json.event.title, "Lagos Jazz Night");
        assertErrorShape(await call("GET", "/api/events/nope"), 404, "NOT_FOUND");
      });

      test("the waitlist never appears in an event", async () => {
        const { eventId } = await publishedEvent();
        const res = await call("GET", `/api/events/${eventId}`);
        assert.deepEqual(Object.keys(res.json.event.tiers[0]).sort(), ["capacity", "id", "name", "priceCents", "seatsLeft"]);
      });
    });

    describe("API: search (S05)", () => {
      async function seed() {
        await publishedEvent({ title: "Afrobeats Fest", city: "Lagos", date: "2026-12-20", priceCents: 800000 });
        await publishedEvent({ title: "Jazz in Abuja", city: "Abuja", date: "2026-11-01", priceCents: 300000 });
        await publishedEvent({ title: "Comedy Night", city: "Lagos", date: "2026-12-01", priceCents: 500000 });
        await call("POST", "/api/events", { body: { ...newEvent, title: "Secret Draft" } }); // never published
      }
      const titles = (res) => res.json.events.map((e) => e.title);

      test("only published events are listed", async () => {
        await seed();
        const res = await call("GET", "/api/events");
        assert.equal(res.status, 200);
        assert.equal(res.json.events.length, 3);
        assert.ok(!titles(res).includes("Secret Draft"));
      });

      test("filter by city, text, dates and price", async () => {
        await seed();
        assert.deepEqual(titles(await call("GET", "/api/events?city=lagos")).sort(), ["Afrobeats Fest", "Comedy Night"]);
        assert.deepEqual(titles(await call("GET", "/api/events?q=jazz")), ["Jazz in Abuja"]);
        assert.deepEqual(titles(await call("GET", "/api/events?dateFrom=2026-12-01&dateTo=2026-12-10")), ["Comedy Night"]);
        assert.deepEqual(titles(await call("GET", "/api/events?minPriceCents=400000&maxPriceCents=600000")), ["Comedy Night"]);
      });

      test("sort by price and date, both ways", async () => {
        await seed();
        assert.deepEqual(titles(await call("GET", "/api/events?sort=price&order=asc")), ["Jazz in Abuja", "Comedy Night", "Afrobeats Fest"]);
        assert.deepEqual(titles(await call("GET", "/api/events?sort=price&order=desc")), ["Afrobeats Fest", "Comedy Night", "Jazz in Abuja"]);
        assert.deepEqual(titles(await call("GET", "/api/events?sort=date")), ["Jazz in Abuja", "Comedy Night", "Afrobeats Fest"]);
      });

      test("a search with no matches is 200 and an empty list, not an error", async () => {
        await seed();
        const res = await call("GET", "/api/events?city=Kano");
        assert.equal(res.status, 200);
        assert.deepEqual(res.json, { events: [] });
      });

      test("bad search options are VALIDATION (400)", async () => {
        for (const q of [
          "?sort=colour",
          "?sort=price&order=sideways",
          "?order=asc",
          "?minPriceCents=abc",
          "?minPriceCents=-5",
          "?minPriceCents=10.5",
          "?minPriceCents=9&maxPriceCents=1",
          "?dateFrom=tomorrow",
          "?dateFrom=2026-12-31&dateTo=2026-12-01",
          "?colour=red",
          "?city=Lagos&city=Abuja",
        ]) {
          assertErrorShape(await call("GET", "/api/events" + q), 400, "VALIDATION");
        }
      });
    });

    describe("API: booking (S06)", () => {
      test("book 2 of 3 seats: 201, pending, price in whole cents, Location header", async () => {
        const { eventId, tierId } = await publishedEvent({ capacity: 3, priceCents: 500000 });
        const res = await call("POST", "/api/bookings", { body: { eventId, tierId, buyerName: "Ada", quantity: 2 } });
        assert.equal(res.status, 201);
        assert.equal(res.headers.get("location"), "/api/bookings/BK-000001");
        const { holdExpiresAt, ...rest } = res.json.booking;
        assert.deepEqual(rest, {
          ref: "BK-000001",
          eventId,
          tierId,
          buyerName: "Ada",
          quantity: 2,
          totalCents: 1000000,
          status: "pending",
        });
        // The hold deadline is about 10 minutes from now (Build 8 makes the server enforce it).
        const minutes = (Date.parse(holdExpiresAt) - Date.now()) / 60000;
        assert.ok(minutes > 9.5 && minutes <= 10.01, `hold should be 10 minutes, got ${minutes}`);
        const event = await call("GET", `/api/events/${eventId}`);
        assert.equal(event.json.event.tiers[0].seatsLeft, 1);
      });

      test("quantity left out means 1", async () => {
        const { eventId, tierId } = await publishedEvent();
        const res = await call("POST", "/api/bookings", { body: { eventId, tierId, buyerName: "Ada" } });
        assert.equal(res.json.booking.quantity, 1);
      });

      test("1 seat left, book 2: SOLD_OUT (409) and nothing changes", async () => {
        const { eventId, tierId } = await publishedEvent({ capacity: 3 });
        await call("POST", "/api/bookings", { body: { eventId, tierId, buyerName: "Ada", quantity: 2 } });
        const res = await call("POST", "/api/bookings", { body: { eventId, tierId, buyerName: "Bayo", quantity: 2 } });
        assertErrorShape(res, 409, "SOLD_OUT");
        const event = await call("GET", `/api/events/${eventId}`);
        assert.equal(event.json.event.tiers[0].seatsLeft, 1);
        assertErrorShape(await call("GET", "/api/bookings/BK-000002"), 404, "NOT_FOUND");
      });

      test("quantity 0, negative, fractional, text or above 10 is VALIDATION (400)", async () => {
        const { eventId, tierId } = await publishedEvent({ capacity: 50 });
        for (const quantity of [0, -1, 1.5, "2", 11, null]) {
          assertErrorShape(
            await call("POST", "/api/bookings", { body: { eventId, tierId, buyerName: "Ada", quantity } }),
            400,
            "VALIDATION"
          );
        }
        const event = await call("GET", `/api/events/${eventId}`);
        assert.equal(event.json.event.tiers[0].seatsLeft, 50);
      });

      test("missing buyer name is VALIDATION", async () => {
        const { eventId, tierId } = await publishedEvent();
        assertErrorShape(await call("POST", "/api/bookings", { body: { eventId, tierId } }), 400, "VALIDATION");
      });

      test("an unpublished event cannot be booked: NOT_PUBLISHED (409)", async () => {
        await call("POST", "/api/events", { body: newEvent });
        await call("POST", "/api/events/EV-000001/tiers", { body: { name: "A", priceCents: 1, capacity: 5 } });
        assertErrorShape(
          await call("POST", "/api/bookings", { body: { eventId: "EV-000001", tierId: "T1", buyerName: "Ada" } }),
          409,
          "NOT_PUBLISHED"
        );
      });

      test("unknown event or tier is NOT_FOUND (404)", async () => {
        const { eventId } = await publishedEvent();
        assertErrorShape(await call("POST", "/api/bookings", { body: { eventId: "nope", tierId: "T1", buyerName: "Ada" } }), 404, "NOT_FOUND");
        assertErrorShape(await call("POST", "/api/bookings", { body: { eventId, tierId: "nope", buyerName: "Ada" } }), 404, "NOT_FOUND");
      });
    });

    describe("API: paying and cancelling (S07)", () => {
      async function pendingBooking() {
        const { eventId, tierId } = await publishedEvent({ capacity: 3 });
        const res = await call("POST", "/api/bookings", { body: { eventId, tierId, buyerName: "Ada", quantity: 2 } });
        return { eventId, ref: res.json.booking.ref };
      }

      test("pay with no body works (mock success)", async () => {
        const { ref } = await pendingBooking();
        const res = await call("POST", `/api/bookings/${ref}/pay`);
        assert.equal(res.status, 200);
        assert.equal(res.json.booking.status, "paid");
      });

      test("pay with tok_success works; a declined card is 402 and the booking stays pending", async () => {
        const { ref } = await pendingBooking();
        assertErrorShape(await call("POST", `/api/bookings/${ref}/pay`, { body: { paymentToken: "tok_declined" } }), 402, "PAYMENT_DECLINED");
        assert.equal((await call("GET", `/api/bookings/${ref}`)).json.booking.status, "pending");
        const ok = await call("POST", `/api/bookings/${ref}/pay`, { body: { paymentToken: "tok_success" } });
        assert.equal(ok.json.booking.status, "paid");
      });

      test("an unknown payment token is VALIDATION", async () => {
        const { ref } = await pendingBooking();
        assertErrorShape(await call("POST", `/api/bookings/${ref}/pay`, { body: { paymentToken: "tok_wat" } }), 400, "VALIDATION");
        assert.equal((await call("GET", `/api/bookings/${ref}`)).json.booking.status, "pending");
      });

      test("paying twice is INVALID_STATE (409)", async () => {
        const { ref } = await pendingBooking();
        await call("POST", `/api/bookings/${ref}/pay`);
        assertErrorShape(await call("POST", `/api/bookings/${ref}/pay`), 409, "INVALID_STATE");
      });

      test("an already-paid booking is not charged again, even with a declined token", async () => {
        const { ref } = await pendingBooking();
        await call("POST", `/api/bookings/${ref}/pay`);
        assertErrorShape(await call("POST", `/api/bookings/${ref}/pay`, { body: { paymentToken: "tok_declined" } }), 409, "INVALID_STATE");
      });

      test("pay a missing booking is 404", async () => {
        assertErrorShape(await call("POST", "/api/bookings/BK-999999/pay"), 404, "NOT_FOUND");
      });

      test("cancel an unpaid booking: 200 and the seats come back", async () => {
        const { eventId, ref } = await pendingBooking();
        const res = await call("POST", `/api/bookings/${ref}/cancel`);
        assert.equal(res.status, 200);
        assert.equal(res.json.booking.status, "cancelled");
        assert.deepEqual(Object.keys(res.json), ["booking"]);
        assert.equal((await call("GET", `/api/events/${eventId}`)).json.event.tiers[0].seatsLeft, 3);
      });

      test("cancelling twice is ALREADY_CANCELLED (409), and seats are not released twice", async () => {
        const { eventId, ref } = await pendingBooking();
        await call("POST", `/api/bookings/${ref}/cancel`);
        assertErrorShape(await call("POST", `/api/bookings/${ref}/cancel`), 409, "ALREADY_CANCELLED");
        assert.equal((await call("GET", `/api/events/${eventId}`)).json.event.tiers[0].seatsLeft, 3);
      });

      test("a paid booking cannot be cancelled here: INVALID_STATE, still paid", async () => {
        const { ref } = await pendingBooking();
        await call("POST", `/api/bookings/${ref}/pay`);
        const res = await call("POST", `/api/bookings/${ref}/cancel`);
        assertErrorShape(res, 409, "INVALID_STATE");
        assert.match(res.json.error.message, /refund/i);
        assert.equal((await call("GET", `/api/bookings/${ref}`)).json.booking.status, "paid");
      });

      test("cancel a missing booking is 404", async () => {
        assertErrorShape(await call("POST", "/api/bookings/BK-999999/cancel"), 404, "NOT_FOUND");
      });
    });

    describe("API: every error has the same shape", () => {
      test("bad addresses and methods", async () => {
        assertErrorShape(await call("GET", "/api/nothing"), 404, "NOT_FOUND");
        assertErrorShape(await call("GET", "/api"), 404, "NOT_FOUND");
        assertErrorShape(await call("DELETE", "/api/events"), 405, "METHOD_NOT_ALLOWED");
        const wrong = await call("GET", "/api/bookings"); // there is no list-all-bookings
        assertErrorShape(wrong, 405, "METHOD_NOT_ALLOWED");
        assert.equal(wrong.headers.get("allow"), "POST");
        const post = await call("POST", "/api/bookings/BK-000001");
        assertErrorShape(post, 405, "METHOD_NOT_ALLOWED");
        assert.equal(post.headers.get("allow"), "GET, HEAD");
      });

      test("a trailing slash and an encoded id both work", async () => {
        await call("POST", "/api/events", { body: newEvent });
        assert.equal((await call("GET", "/api/events/")).status, 200);
        assert.equal((await call("GET", "/api/events/EV-000001/")).status, 200);
        assertErrorShape(await call("GET", "/api/events/%E0%A4%A"), 404, "NOT_FOUND");
      });

      test("HEAD works like GET without a body", async () => {
        const res = await fetch(base + "/api/events", { method: "HEAD" });
        assert.equal(res.status, 200);
        assert.equal(await res.text(), "");
      });

      test("broken JSON is 400 BAD_REQUEST", async () => {
        assertErrorShape(await call("POST", "/api/events", { raw: "{ not json" }), 400, "BAD_REQUEST");
      });

      test("JSON that is not an object is 400 VALIDATION", async () => {
        for (const raw of ["null", "[1,2]", '"hi"', "42"]) {
          assertErrorShape(await call("POST", "/api/events", { raw }), 400, "VALIDATION");
        }
      });

      test("a body with the wrong Content-Type is 415", async () => {
        assertErrorShape(await call("POST", "/api/events", { raw: JSON.stringify(newEvent), type: "text/plain" }), 415, "UNSUPPORTED_MEDIA_TYPE");
      });

      test("a body that is too big is 413", async () => {
        assertErrorShape(await call("POST", "/api/events", { raw: JSON.stringify({ title: "x".repeat(200_000) }) }), 413, "PAYLOAD_TOO_LARGE");
      });

      test("a body with a Windows BOM in front still works", async () => {
        const res = await call("POST", "/api/events", { raw: "﻿" + JSON.stringify(newEvent) });
        assert.equal(res.status, 201);
      });

      test("an empty body on a route that needs fields is VALIDATION, not a crash", async () => {
        assertErrorShape(await call("POST", "/api/events"), 400, "VALIDATION");
        assertErrorShape(await call("POST", "/api/bookings"), 400, "VALIDATION");
      });

      test("the website and /health still work next to the API", async () => {
        assert.equal((await call("GET", "/health")).json.status, "ok");
        assert.equal((await call("GET", "/")).status, 200);
        assertErrorShape(await call("POST", "/health"), 405, "METHOD_NOT_ALLOWED");
      });
    });

    describe("API: no error code is forgotten", () => {
      function listJs(dir) {
        return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
          const full = path.join(dir, e.name);
          return e.isDirectory() ? listJs(full) : e.name.endsWith(".js") ? [full] : [];
        });
      }

      test("every code thrown anywhere in src/ has an HTTP status", () => {
        const codes = new Set();
        for (const file of listJs(SRC)) {
          const text = fs.readFileSync(file, "utf8");
          for (const m of text.matchAll(/new (?:DomainError|HttpProblem)\(\s*"([A-Z_]+)"/g)) codes.add(m[1]);
        }
        assert.ok(codes.size >= 8, "the scan found suspiciously few codes");
        for (const code of codes) {
          assert.ok(STATUS_BY_CODE[code], `error code ${code} has no HTTP status in src/routes/errors.js`);
        }
      });
    });
  });
}
