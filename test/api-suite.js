import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "../src/server.js";
import { STATUS_BY_CODE } from "../src/routes/errors.js";
import { createFakeClock } from "../src/lib/clock.js";

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
    // The server's clock is a FAKE one, standing still in mid 2026. The events in these tests are in
    // December 2026, so refunds are the same today as next year, and a test can jump forward in time.
    let clock;

    beforeEach(async () => {
      store = makeStore();
      clock = createFakeClock("2026-06-01T12:00:00Z");
      // A cheap password hash keeps the tests fast. (Real servers use the strong default.)
      server = createServer({ publicDir, store, clock, hashCost: { N: 1024, r: 8, p: 1 } });
      await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
      base = `http://127.0.0.1:${server.address().port}`;
      tokens = {};
      for (const [who, role, email] of [["org", "organizer", "organizer@example.com"], ["att", "attendee", "attendee@example.com"], ["att2", "attendee", "attendee2@example.com"]]) {
        const res = await fetch(base + "/api/auth/signup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: `Test ${who}`, email, password: "correct horse battery", role }),
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
      const who = as ?? (url.startsWith("/api/bookings") || url.startsWith("/api/waitlist") || url.startsWith("/api/me/waitlist") ? "att" : url.startsWith("/api/auth") ? "anon" : url === "/api/events" && method === "GET" ? "anon" : "org");
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
          refundCents: null,
        });
        // The hold deadline is exactly 10 minutes from now (the test clock stands still).
        assert.equal(Date.parse(holdExpiresAt) - clock.now(), 10 * 60_000);
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
        assert.deepEqual(Object.keys(res.json), ["booking", "refund"]);
        assert.deepEqual(res.json.refund, { percent: 0, refundCents: 0, paid: false });
        assert.equal((await call("GET", `/api/events/${eventId}`)).json.event.tiers[0].seatsLeft, 3);
      });

      test("cancelling twice is ALREADY_CANCELLED (409), and seats are not released twice", async () => {
        const { eventId, ref } = await pendingBooking();
        await call("POST", `/api/bookings/${ref}/cancel`);
        assertErrorShape(await call("POST", `/api/bookings/${ref}/cancel`), 409, "ALREADY_CANCELLED");
        assert.equal((await call("GET", `/api/events/${eventId}`)).json.event.tiers[0].seatsLeft, 3);
      });

      test("a paid booking is cancelled WITH a refund by the policy (event is months away: 100%)", async () => {
        const { eventId, ref } = await pendingBooking(); // 2 tickets x N5,000
        await call("POST", `/api/bookings/${ref}/pay`);
        const res = await call("POST", `/api/bookings/${ref}/cancel`);
        assert.equal(res.status, 200, res.text);
        assert.equal(res.json.booking.status, "refunded");
        assert.equal(res.json.booking.refundCents, 1000000);
        assert.deepEqual(res.json.refund, { percent: 100, refundCents: 1000000, paid: true });
        assert.equal((await call("GET", `/api/events/${eventId}`)).json.event.tiers[0].seatsLeft, 3);
        assertErrorShape(await call("POST", `/api/bookings/${ref}/cancel`), 409, "ALREADY_CANCELLED");
        assert.equal((await call("GET", `/api/events/${eventId}`)).json.event.tiers[0].seatsLeft, 3);
      });

      test("cancel a missing booking is 404", async () => {
        assertErrorShape(await call("POST", "/api/bookings/BK-999999/cancel"), 404, "NOT_FOUND");
      });
    });

    // ---- Build 8: refunds, expiry, waitlist ----
    // A login lasts 2 hours. When a test jumps the clock far ahead, the old logins would have expired,
    // so after every jump everybody logs in again (through the real login call).
    const LOGINS = { org: "organizer@example.com", att: "attendee@example.com", att2: "attendee2@example.com" };
    async function relogin() {
      for (const [who, email] of Object.entries(LOGINS)) {
        const res = await fetch(base + "/api/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password: "correct horse battery" }),
        });
        tokens[who] = (await res.json()).token;
      }
    }
    async function moveClockTo(ms) {
      clock.set(ms);
      await relogin();
    }
    async function moveClockBy(ms) {
      clock.advance(ms);
      await relogin();
    }

    const DAY = 24 * 60 * 60 * 1000;
    const MINUTE = 60 * 1000;
    const EVENT_START = Date.parse("2026-12-05T00:00:00Z"); // newEvent.date

    describe("API: refunds (S09)", () => {
      async function paidBooking(quantity = 2) {
        const { eventId, tierId } = await publishedEvent({ capacity: 5, priceCents: 500000 });
        const b = await call("POST", "/api/bookings", { body: { eventId, tierId, buyerName: "Ada", quantity } });
        const ref = b.json.booking.ref;
        await call("POST", `/api/bookings/${ref}/pay`);
        return { eventId, ref };
      }

      test("the preview says what you would get back, and changes nothing", async () => {
        const { eventId, ref } = await paidBooking(2);
        await moveClockTo(EVENT_START - 3 * DAY);
        const res = await call("GET", `/api/bookings/${ref}/refund`);
        assert.equal(res.status, 200);
        assert.deepEqual(res.json, { refund: { percent: 50, refundCents: 500000, paid: true } });
        assert.equal((await call("GET", `/api/bookings/${ref}`)).json.booking.status, "paid");
        assert.equal((await call("GET", `/api/events/${eventId}`)).json.event.tiers[0].seatsLeft, 3);
      });

      for (const [label, msBefore, percent, cents] of [
        ["exactly 7 days", 7 * DAY, 100, 1000000],
        ["6 days 23 hours", 7 * DAY - 60 * MINUTE, 50, 500000],
        ["exactly 2 days", 2 * DAY, 50, 500000],
        ["1 day 23 hours", 2 * DAY - 60 * MINUTE, 0, 0],
      ]) {
        test(`cancel ${label} before the start: ${percent}% back, 2 seats released`, async () => {
          const { eventId, ref } = await paidBooking(2);
          await moveClockTo(EVENT_START - msBefore);
          const res = await call("POST", `/api/bookings/${ref}/cancel`);
          assert.equal(res.status, 200, res.text);
          assert.deepEqual(res.json.refund, { percent, refundCents: cents, paid: true });
          assert.equal(res.json.booking.status, "refunded");
          assert.equal(res.json.booking.refundCents, cents);
          assert.equal((await call("GET", `/api/events/${eventId}`)).json.event.tiers[0].seatsLeft, 5);
        });
      }

      test("an event that has started: 409 EVENT_STARTED, and the booking stays paid", async () => {
        const { eventId, ref } = await paidBooking(2);
        await moveClockTo(EVENT_START);
        assertErrorShape(await call("GET", `/api/bookings/${ref}/refund`), 409, "EVENT_STARTED");
        assertErrorShape(await call("POST", `/api/bookings/${ref}/cancel`), 409, "EVENT_STARTED");
        assert.equal((await call("GET", `/api/bookings/${ref}`)).json.booking.status, "paid");
        assert.equal((await call("GET", `/api/events/${eventId}`)).json.event.tiers[0].seatsLeft, 3);
      });

      test("cancelling twice: 409 ALREADY_CANCELLED, seats released once; the preview is refused too", async () => {
        const { eventId, ref } = await paidBooking(2);
        assert.equal((await call("POST", `/api/bookings/${ref}/cancel`)).status, 200);
        assertErrorShape(await call("POST", `/api/bookings/${ref}/cancel`), 409, "ALREADY_CANCELLED");
        assertErrorShape(await call("GET", `/api/bookings/${ref}/refund`), 409, "ALREADY_CANCELLED");
        assert.equal((await call("GET", `/api/events/${eventId}`)).json.event.tiers[0].seatsLeft, 5);
      });

      test("somebody else's booking: 404 for preview and cancel; nobody logged in: 401", async () => {
        const { ref } = await paidBooking(1);
        assertErrorShape(await call("GET", `/api/bookings/${ref}/refund`, { token: tokens.att2 }), 404, "NOT_FOUND");
        assertErrorShape(await call("POST", `/api/bookings/${ref}/cancel`, { token: tokens.att2 }), 404, "NOT_FOUND");
        assertErrorShape(await call("GET", `/api/bookings/${ref}/refund`, { as: "anon" }), 401, "UNAUTHENTICATED");
        assertErrorShape(await call("POST", `/api/bookings/${ref}/cancel`, { as: "anon" }), 401, "UNAUTHENTICATED");
        assert.equal((await call("GET", `/api/bookings/${ref}`)).json.booking.status, "paid");
      });

      test("the preview of an unpaid booking: nothing was paid, nothing comes back", async () => {
        const { eventId, tierId } = await publishedEvent();
        const b = await call("POST", "/api/bookings", { body: { eventId, tierId, buyerName: "Ada", quantity: 1 } });
        assert.deepEqual((await call("GET", `/api/bookings/${b.json.booking.ref}/refund`)).json, { refund: { percent: 0, refundCents: 0, paid: false } });
      });

      test("the refund routes only allow their own method", async () => {
        const { ref } = await paidBooking(1);
        assertErrorShape(await call("POST", `/api/bookings/${ref}/refund`), 405, "METHOD_NOT_ALLOWED");
      });
    });

    describe("API: unpaid bookings expire (S10)", () => {
      async function pending(capacity = 3, quantity = 2) {
        const { eventId, tierId } = await publishedEvent({ capacity });
        const b = await call("POST", "/api/bookings", { body: { eventId, tierId, buyerName: "Ada", quantity } });
        return { eventId, tierId, ref: b.json.booking.ref };
      }

      test("after the hold the booking is expired, the seats are back, and paying is 409 BOOKING_EXPIRED", async () => {
        const { eventId, ref } = await pending(3, 2);
        await moveClockBy(10 * MINUTE);
        assert.equal((await call("GET", `/api/bookings/${ref}`)).json.booking.status, "expired");
        assert.equal((await call("GET", `/api/events/${eventId}`)).json.event.tiers[0].seatsLeft, 3);
        assertErrorShape(await call("POST", `/api/bookings/${ref}/pay`), 409, "BOOKING_EXPIRED");
        assert.equal((await call("GET", `/api/bookings/${ref}`)).json.booking.status, "expired");
      });

      test("one minute before the hold ends, paying still works", async () => {
        const { ref } = await pending();
        await moveClockBy(9 * MINUTE);
        assert.equal((await call("POST", `/api/bookings/${ref}/pay`)).json.booking.status, "paid");
      });

      test("the maintenance job does the same on its own", async () => {
        const { eventId, ref } = await pending(3, 2);
        await moveClockBy(11 * MINUTE);
        assert.deepEqual(server.maintenance.run().expiredBookings, [ref]);
        assert.deepEqual(server.maintenance.run().expiredBookings, [], "nothing left to do the second time");
        assert.equal((await call("GET", `/api/events/${eventId}`)).json.event.tiers[0].seatsLeft, 3);
      });

      test("a paid booking never expires", async () => {
        const { ref } = await pending();
        await call("POST", `/api/bookings/${ref}/pay`);
        await moveClockBy(30 * DAY);
        server.maintenance.run();
        assert.equal((await call("GET", `/api/bookings/${ref}`)).json.booking.status, "paid");
      });

      test("my tickets shows the expired booking as expired", async () => {
        await pending();
        await moveClockBy(10 * MINUTE);
        assert.equal((await call("GET", "/api/me/bookings", { as: "att" })).json.bookings[0].status, "expired");
      });
    });

    describe("API: the waitlist (S11, S12)", () => {
      // A published tier with 2 seats, fully booked by att, so it is SOLD OUT.
      async function soldOut() {
        const { eventId, tierId } = await publishedEvent({ capacity: 2 });
        const b = await call("POST", "/api/bookings", { body: { eventId, tierId, buyerName: "Ada", quantity: 2 } });
        return { eventId, tierId, ref: b.json.booking.ref };
      }
      const join = (eventId, tierId, token = tokens.att2) => call("POST", "/api/waitlist", { body: { eventId, tierId }, token });

      test("join: 201, you are at the end of the line, and the answer shows only your own entry", async () => {
        const { eventId, tierId } = await soldOut();
        const res = await join(eventId, tierId);
        assert.equal(res.status, 201, res.text);
        assert.deepEqual(res.json, { entry: { id: 1, eventId, tierId, status: "waiting", position: 1, offerExpiresAt: null } });
        const mine = await call("GET", "/api/me/waitlist", { token: tokens.att2 });
        assert.deepEqual(mine.json.entries.map((e) => e.status), ["waiting"]);
        assert.deepEqual((await call("GET", "/api/me/waitlist")).json, { entries: [] }, "Ada sees nothing of Test att2's entry");
      });

      test("a tier with seats left: 409 NOT_SOLD_OUT. Joining twice: 409 ALREADY_ON_WAITLIST", async () => {
        const open = await publishedEvent({ capacity: 5 });
        assertErrorShape(await join(open.eventId, open.tierId), 409, "NOT_SOLD_OUT");
        const { eventId, tierId } = await soldOut();
        await join(eventId, tierId);
        assertErrorShape(await join(eventId, tierId), 409, "ALREADY_ON_WAITLIST");
      });

      test("who may join: nobody logged in 401, an organizer 403, bad input 400, unknown tier 404, draft 409", async () => {
        const { eventId, tierId } = await soldOut();
        assertErrorShape(await call("POST", "/api/waitlist", { body: { eventId, tierId }, as: "anon" }), 401, "UNAUTHENTICATED");
        assertErrorShape(await call("POST", "/api/waitlist", { body: { eventId, tierId }, as: "org" }), 403, "FORBIDDEN");
        assertErrorShape(await call("POST", "/api/waitlist", { body: {}, token: tokens.att2 }), 400, "VALIDATION");
        assertErrorShape(await join(eventId, "T99"), 404, "NOT_FOUND");
        await call("POST", `/api/events/${eventId}/unpublish`);
        assertErrorShape(await join(eventId, tierId), 409, "NOT_PUBLISHED");
      });

      test("a freed seat is offered to the first in line; accepting it makes a pending booking", async () => {
        const { eventId, tierId, ref } = await soldOut();
        await join(eventId, tierId);
        const cancel = await call("POST", `/api/bookings/${ref}/cancel`);
        assert.equal(cancel.status, 200);
        assert.deepEqual(Object.keys(cancel.json).sort(), ["booking", "refund"], "the answer never says who was offered the seat");

        const offer = (await call("GET", "/api/me/waitlist", { token: tokens.att2 })).json.entries[0];
        assert.equal(offer.status, "offered");
        assert.equal(Date.parse(offer.offerExpiresAt) - clock.now(), 15 * MINUTE);
        const left = (await call("GET", `/api/events/${eventId}`)).json.event.tiers[0].seatsLeft;
        assert.equal(left, 1, "2 seats were freed: 1 is held for the offer, 1 is really free");

        const accepted = await call("POST", `/api/waitlist/${offer.id}/accept`, { token: tokens.att2 });
        assert.equal(accepted.status, 201, accepted.text);
        assert.match(accepted.headers.get("location"), /^\/api\/bookings\/BK-\d{6}$/);
        assert.equal(accepted.json.booking.status, "pending");
        assert.equal(accepted.json.booking.quantity, 1);
        const paid = await call("POST", `/api/bookings/${accepted.json.booking.ref}/pay`, { token: tokens.att2 });
        assert.equal(paid.json.booking.status, "paid");
        assert.equal((await call("GET", "/api/me/waitlist", { token: tokens.att2 })).json.entries[0].status, "accepted");
      });

      test("an offer that is not accepted in time: OFFER_EXPIRED, and the seat moves on", async () => {
        const { eventId, tierId, ref } = await soldOut();
        await join(eventId, tierId, tokens.att2);
        await call("POST", `/api/bookings/${ref}/cancel`);
        const entryId = (await call("GET", "/api/me/waitlist", { token: tokens.att2 })).json.entries[0].id;
        await moveClockBy(15 * MINUTE);
        assertErrorShape(await call("POST", `/api/waitlist/${entryId}/accept`, { token: tokens.att2 }), 409, "OFFER_EXPIRED");
        assert.equal((await call("GET", "/api/me/waitlist", { token: tokens.att2 })).json.entries[0].status, "expired");
        assert.equal((await call("GET", `/api/events/${eventId}`)).json.event.tiers[0].seatsLeft, 2, "no one is waiting, so both seats are free");
      });

      test("an offer passes down the line: A is skipped after 15 minutes, B is offered", async () => {
        const { eventId, tierId, ref } = await soldOut();
        const a = await join(eventId, tierId, tokens.att2);
        // a second waiting attendee: the first attendee, after cancelling, rejoins behind them
        await call("POST", `/api/bookings/${ref}/cancel`); // A is offered 1 seat (2 freed, so 1 offer + 1 free)
        const filler = await call("POST", "/api/bookings", { body: { eventId, tierId, buyerName: "Ada", quantity: 1 } });
        assert.equal(filler.status, 201); // takes the really free seat; the tier is sold out again (held offer + filler)
        const b = await join(eventId, tierId, tokens.att);
        assert.equal(b.json.entry.position, 1);
        await moveClockBy(15 * MINUTE);
        server.maintenance.run();
        assert.equal((await call("GET", "/api/me/waitlist", { token: tokens.att2 })).json.entries[0].status, "expired");
        assert.equal((await call("GET", "/api/me/waitlist", { token: tokens.att })).json.entries[0].status, "offered");
        assert.equal(a.status, 201);
      });

      test("somebody else's entry: 404 to accept or leave; an entry with no offer yet: 409; a bad id: 404", async () => {
        const { eventId, tierId, ref } = await soldOut();
        await join(eventId, tierId);
        await call("POST", `/api/bookings/${ref}/cancel`);
        const entryId = (await call("GET", "/api/me/waitlist", { token: tokens.att2 })).json.entries[0].id;
        assertErrorShape(await call("POST", `/api/waitlist/${entryId}/accept`), 404, "NOT_FOUND");
        assertErrorShape(await call("POST", `/api/waitlist/${entryId}/leave`), 404, "NOT_FOUND");
        assertErrorShape(await call("POST", `/api/waitlist/abc/accept`, { token: tokens.att2 }), 404, "NOT_FOUND");
        assertErrorShape(await call("POST", `/api/waitlist/99999/accept`, { token: tokens.att2 }), 404, "NOT_FOUND");
        assertErrorShape(await call("POST", `/api/waitlist/${entryId}/accept`, { as: "anon" }), 401, "UNAUTHENTICATED");
        assertErrorShape(await call("POST", `/api/waitlist/${entryId}/accept`, { as: "org" }), 403, "FORBIDDEN");
      });

      test("leaving: your held offer goes to the next person; leaving twice is 409", async () => {
        const { eventId, tierId, ref } = await soldOut();
        await join(eventId, tierId);
        await call("POST", `/api/bookings/${ref}/cancel`);
        const entryId = (await call("GET", "/api/me/waitlist", { token: tokens.att2 })).json.entries[0].id;
        const left = await call("POST", `/api/waitlist/${entryId}/leave`, { token: tokens.att2 });
        assert.equal(left.status, 200);
        assert.equal(left.json.entry.status, "left");
        assertErrorShape(await call("POST", `/api/waitlist/${entryId}/leave`, { token: tokens.att2 }), 409, "INVALID_STATE");
        assert.equal((await call("GET", `/api/events/${eventId}`)).json.event.tiers[0].seatsLeft, 2);
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
