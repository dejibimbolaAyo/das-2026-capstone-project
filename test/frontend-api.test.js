import { test, describe, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import * as api from "../public/js/api.js";
import { safeNext } from "../public/js/views/auth.js";
import { createServer } from "../src/server.js";
import { createSqliteStore } from "../src/data/sqliteStore.js";

// The website's ONE data file (public/js/api.js), tested against the REAL server.
// api.js uses the same fetch the browser has, so Node can run it. We hand it a pretend sessionStorage.
const publicDir = fileURLToPath(new URL("../public", import.meta.url));

function fakeStorage() {
  const data = new Map();
  return { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => data.set(k, String(v)), removeItem: (k) => data.delete(k), data };
}

describe("website data file (api.js) against the real server", () => {
  let server, store, base, storage, sentBodies;
  const realFetch = globalThis.fetch;

  before(async () => {
    store = createSqliteStore(":memory:");
    server = createServer({ publicDir, store, hashCost: { N: 1024, r: 8, p: 1 } });
    await new Promise((r) => server.listen(0, "127.0.0.1", r));
    base = `http://127.0.0.1:${server.address().port}`;
    // Spy on what api.js really sends over the wire.
    sentBodies = [];
    globalThis.fetch = (url, init = {}) => {
      sentBodies.push({ url: String(url), body: init.body ?? null, auth: init.headers?.Authorization ?? null });
      return realFetch(url, init);
    };
  });
  after(async () => {
    globalThis.fetch = realFetch;
    api.configureApi({ baseUrl: "", storage: null });
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
    store.close();
  });
  beforeEach(() => {
    storage = fakeStorage();
    api.configureApi({ baseUrl: base, storage });
    api.logout();
    sentBodies.length = 0;
  });

  const pw = "correct horse battery";
  let counter = 0;
  const uniqueEmail = (who) => `${who}${++counter}@example.com`;

  async function organizerWithEvent({ capacity = 3 } = {}) {
    await api.signup({ name: "Olu", email: uniqueEmail("olu"), password: pw, role: "organizer" });
    const { event } = await api.createEvent({ title: "Lagos Jazz Night", city: "Lagos", venue: "Terra Kulture", date: "2026-12-05" });
    await api.addTier(event.id, { name: "Regular", priceCents: 500000, capacity });
    await api.publishEvent(event.id);
    api.logout();
    return event.id;
  }

  test("signup logs you in: the session holds the user and the token, kept in storage", async () => {
    const user = await api.signup({ name: "Ada", email: uniqueEmail("ada"), password: pw, role: "attendee" });
    assert.equal(user.role, "attendee");
    assert.deepEqual(api.currentUser(), user);
    const saved = JSON.parse(storage.getItem("stub.session"));
    assert.equal(saved.user.name, "Ada");
    assert.equal(saved.token.split(".").length, 3);
    assert.ok(!JSON.stringify(saved).includes(pw), "the password must never be kept");
  });

  test("logout forgets everything, and listeners are told", async () => {
    const seen = [];
    const stop = api.onSessionChange((u) => seen.push(u?.name ?? null));
    await api.signup({ name: "Ada", email: uniqueEmail("ada"), password: pw, role: "attendee" });
    api.logout();
    stop();
    api.logout(); // nobody is listening any more
    assert.deepEqual(seen, ["Ada", null]);
    assert.equal(api.currentUser(), null);
    assert.equal(storage.getItem("stub.session"), null);
  });

  test("login works, a wrong password throws a UNAUTHENTICATED ApiError and logs nobody in", async () => {
    const email = uniqueEmail("ada");
    await api.signup({ name: "Ada", email, password: pw, role: "attendee" });
    api.logout();
    await assert.rejects(api.login({ email, password: "wrong password" }), (e) => e instanceof api.ApiError && e.code === "UNAUTHENTICATED" && e.status === 401);
    assert.equal(api.currentUser(), null);
    assert.equal((await api.login({ email, password: pw })).name, "Ada");
  });

  test("the token is sent only when logged in, and a stale token is dropped on 401", async () => {
    await api.listEvents();
    assert.equal(sentBodies.at(-1).auth, null);
    await api.signup({ name: "Ada", email: uniqueEmail("ada"), password: pw, role: "attendee" });
    await api.listMyBookings();
    assert.match(sentBodies.at(-1).auth, /^Bearer \S+\.\S+\.\S+$/);
    // pretend the server forgot us: a token signed with a different key
    const session = JSON.parse(storage.getItem("stub.session"));
    session.token = session.token.slice(0, -3) + "AAA";
    storage.setItem("stub.session", JSON.stringify(session));
    await assert.rejects(api.listMyBookings(), (e) => e.code === "UNAUTHENTICATED");
    assert.equal(api.currentUser(), null, "the dead login must be forgotten");
  });

  test("a failed signup does not wreck an existing login", async () => {
    await api.signup({ name: "Ada", email: uniqueEmail("ada"), password: pw, role: "attendee" });
    await assert.rejects(api.signup({ name: "", email: "x", password: "y", role: "attendee" }), (e) => e.code === "VALIDATION");
    assert.equal(api.currentUser().name, "Ada");
  });

  test("organizer: create, add a tier, publish, and see it in the public list", async () => {
    await organizerWithEvent();
    const { events } = await api.listEvents({ city: "Lagos", sort: "price", order: "asc" });
    assert.equal(events.length, 1);
    assert.equal(events[0].tiers[0].seatsLeft, 3);
    assert.equal((await api.listEvents({ q: "nothing" })).events.length, 0);
    assert.equal((await api.listEvents({ maxPriceCents: 100 })).events.length, 0);
  });

  test("bad filters come back as ApiError VALIDATION", async () => {
    await assert.rejects(api.listEvents({ sort: "size" }), (e) => e.code === "VALIDATION" && e.status === 400);
  });

  test("attendee: book, decline, retry, pay, and see it under my bookings", async () => {
    const eventId = await organizerWithEvent();
    await api.signup({ name: "Ada", email: uniqueEmail("ada"), password: pw, role: "attendee" });
    const { booking } = await api.createBooking({ eventId, tierId: "T1", buyerName: "Ada", quantity: 2 });
    assert.equal(booking.status, "pending");
    assert.equal(booking.totalCents, 1000000);
    assert.ok(Date.parse(booking.holdExpiresAt) > Date.now(), "the hold deadline is in the future");

    await assert.rejects(api.payBooking(booking.ref, { cardNumber: "4000 0000 0000 0002" }), (e) => e.code === "PAYMENT_DECLINED" && e.status === 402);
    assert.equal((await api.getBooking(booking.ref)).booking.status, "pending");

    const paid = await api.payBooking(booking.ref, { cardNumber: "4242 4242 4242 4242" });
    assert.equal(paid.booking.status, "paid");
    const mine = (await api.listMyBookings()).bookings;
    assert.deepEqual(mine.map((b) => b.ref), [booking.ref]);
  });

  test("card numbers never leave api.js: the server only gets a token", async () => {
    const eventId = await organizerWithEvent();
    await api.signup({ name: "Ada", email: uniqueEmail("ada"), password: pw, role: "attendee" });
    const { booking } = await api.createBooking({ eventId, tierId: "T1", buyerName: "Ada", quantity: 1 });
    sentBodies.length = 0;
    await api.payBooking(booking.ref, { cardNumber: "4242 4242 4242 4242" }).catch(() => {});
    const sent = sentBodies.map((s) => s.body).join(" ");
    assert.ok(!/4242/.test(sent), `a card number was sent: ${sent}`);
    assert.match(sent, /tok_success/);
  });

  test("a sold-out tier cannot be booked: SOLD_OUT 409", async () => {
    const eventId = await organizerWithEvent({ capacity: 1 });
    await api.signup({ name: "Ada", email: uniqueEmail("ada"), password: pw, role: "attendee" });
    await api.createBooking({ eventId, tierId: "T1", buyerName: "Ada", quantity: 1 });
    await assert.rejects(api.createBooking({ eventId, tierId: "T1", buyerName: "Ada", quantity: 1 }), (e) => e.code === "SOLD_OUT" && e.status === 409);
    assert.equal((await api.getEvent(eventId)).event.tiers[0].seatsLeft, 0);
  });

  test("privacy and roles come through as ApiErrors", async () => {
    const eventId = await organizerWithEvent();
    // not logged in
    await assert.rejects(api.createBooking({ eventId, tierId: "T1", buyerName: "A", quantity: 1 }), (e) => e.code === "UNAUTHENTICATED");
    // Ada books; Bayo cannot see it
    await api.signup({ name: "Ada", email: uniqueEmail("ada"), password: pw, role: "attendee" });
    const { booking } = await api.createBooking({ eventId, tierId: "T1", buyerName: "Ada", quantity: 1 });
    await api.signup({ name: "Bayo", email: uniqueEmail("bayo"), password: pw, role: "attendee" });
    await assert.rejects(api.getBooking(booking.ref), (e) => e.code === "NOT_FOUND" && e.status === 404);
    // an attendee cannot make events
    await assert.rejects(api.createEvent({ title: "x", city: "x", venue: "x", date: "2026-12-05" }), (e) => e.code === "FORBIDDEN" && e.status === 403);
  });

  test("organizer dashboard list shows my drafts; another organizer cannot edit my event", async () => {
    const eventId = await organizerWithEvent();
    await api.signup({ name: "Bisi", email: uniqueEmail("bisi"), password: pw, role: "organizer" });
    assert.deepEqual((await api.listMyEvents()).events, []);
    await assert.rejects(api.unpublishEvent(eventId), (e) => e.code === "FORBIDDEN");
    await assert.rejects(api.addTier(eventId, { name: "x", priceCents: 1, capacity: 1 }), (e) => e.code === "FORBIDDEN");
  });

  test("refund preview, cancel, waitlist, offer and accept all work through api.js", async () => {
    const eventId = await organizerWithEvent({ capacity: 1 });
    const { event } = await api.getEvent(eventId);
    const tierId = event.tiers[0].id;
    const adaEmail = uniqueEmail("ada");
    await api.signup({ name: "Ada", email: adaEmail, password: pw, role: "attendee" });
    const { booking } = await api.createBooking({ eventId, tierId, buyerName: "Ada", quantity: 1 });
    const preview = await api.getRefundPreview(booking.ref);
    assert.equal(preview.refund.paid, false);
    api.logout();

    const bolaEmail = uniqueEmail("bola");
    await api.signup({ name: "Bola", email: bolaEmail, password: pw, role: "attendee" });
    const { entry } = await api.joinWaitlist({ eventId, tierId });
    assert.equal(entry.status, "waiting");
    assert.equal(entry.position, 1);
    await assert.rejects(api.joinWaitlist({ eventId, tierId }), (e) => e.code === "ALREADY_ON_WAITLIST");
    assert.equal((await api.listMyWaitlist()).entries.length, 1);
    api.logout();

    await api.login({ email: adaEmail, password: pw });
    const cancelled = await api.cancelBooking(booking.ref);
    assert.equal(cancelled.booking.status, "cancelled");
    api.logout();

    await api.login({ email: bolaEmail, password: pw });
    const offered = (await api.listMyWaitlist()).entries[0];
    assert.equal(offered.status, "offered");
    assert.ok(offered.offerExpiresAt);
    const accepted = await api.acceptOffer(offered.id);
    assert.equal(accepted.booking.status, "pending");
    assert.equal((await api.getBooking(accepted.booking.ref)).booking.buyerName, "Bola");
  });

  test("leaving a waitlist works through api.js", async () => {
    const eventId = await organizerWithEvent({ capacity: 1 });
    const tierId = (await api.getEvent(eventId)).event.tiers[0].id;
    await api.signup({ name: "Ada", email: uniqueEmail("ada"), password: pw, role: "attendee" });
    await api.createBooking({ eventId, tierId, buyerName: "Ada", quantity: 1 });
    api.logout();
    await api.signup({ name: "Bola", email: uniqueEmail("bola"), password: pw, role: "attendee" });
    const { entry } = await api.joinWaitlist({ eventId, tierId });
    await api.leaveWaitlist(entry.id);
    assert.equal((await api.listMyWaitlist()).entries.filter((e) => e.status === "waiting").length, 0);
  });

  test("an unknown event is NOT_FOUND", async () => {
    await assert.rejects(api.getEvent("EV-999999"), (e) => e.code === "NOT_FOUND");
  });

  test("when the server cannot be reached the error is NETWORK, not a crash", async () => {
    api.configureApi({ baseUrl: "http://127.0.0.1:1" }); // nothing listens on port 1
    await assert.rejects(api.listEvents(), (e) => e instanceof api.ApiError && e.code === "NETWORK" && /Cannot reach the server/.test(e.message));
  });

  test("a broken storage (private browsing) falls back to memory and still works", async () => {
    const angry = { getItem() { throw new Error("no"); }, setItem() { throw new Error("no"); }, removeItem() { throw new Error("no"); } };
    api.configureApi({ storage: angry });
    const user = await api.signup({ name: "Ada", email: uniqueEmail("ada"), password: pw, role: "attendee" });
    assert.equal(api.currentUser()?.name, user.name);
    api.logout();
  });

  test("a damaged saved session is ignored", () => {
    storage.setItem("stub.session", "{not json");
    assert.equal(api.currentUser(), null);
    storage.setItem("stub.session", JSON.stringify({ token: 5 }));
    assert.equal(api.currentUser(), null);
  });
});

describe("the ?next= link after login", () => {
  test("only our own # pages are allowed", () => {
    assert.equal(safeNext("#/checkout/BK-000001"), "#/checkout/BK-000001");
    assert.equal(safeNext("#/?city=Lagos&sort=price-asc"), "#/?city=Lagos&sort=price-asc");
    for (const bad of [null, undefined, "", "https://evil.example", "//evil.example", "javascript:alert(1)", "#//evil.example", "#/a b", "/login"]) {
      assert.equal(safeNext(bad), null, String(bad));
    }
  });
});
