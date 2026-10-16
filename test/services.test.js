import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { createMemoryStore } from "../src/data/memoryStore.js";
import { createEventServiceAsOrganizer as createEventService } from "./actors.js";
import { createBookingServiceAsAttendee as createBookingService } from "./actors.js";
import { seatsLeft } from "../src/events.js";

function setup() {
  const store = createMemoryStore();
  return { store, events: createEventService(store), bookings: createBookingService(store) };
}

const lagos = { id: "e1", title: "Lagos Tech Night", city: "Lagos", venue: "Landmark Centre", date: "2026-12-05" };
const abuja = { id: "e2", title: "Abuja Jazz Evening", city: "Abuja", venue: "Transcorp Hall", date: "2026-11-20" };

function publishedEvent(events, input, priceCents = 500000, capacity = 3) {
  events.create(input);
  events.addTier(input.id, { id: "ga", name: "General", priceCents, capacity });
  events.publish(input.id);
}

describe("data layer: memory store", () => {
  test("keeps an event, finds it again, and a missing one is undefined or NOT_FOUND", () => {
    const store = createMemoryStore();
    assert.equal(store.getEvent("e1"), undefined);
    assert.throws(() => store.requireEvent("e1"), { code: "NOT_FOUND" });
    const saved = store.saveEvent({ id: "e1" });
    assert.equal(store.getEvent("e1"), saved);
    assert.equal(store.requireEvent("e1"), saved);
  });

  test("listEvents gives a new array each time, so changing it does not change the store", () => {
    const store = createMemoryStore();
    store.saveEvent({ id: "e1" });
    const list = store.listEvents();
    list.pop();
    assert.equal(store.listEvents().length, 1);
  });

  test("two stores do not share anything", () => {
    const a = createMemoryStore();
    const b = createMemoryStore();
    a.saveEvent({ id: "e1" });
    assert.equal(b.getEvent("e1"), undefined);
    assert.notEqual(a.bookings, b.bookings);
  });
});

describe("services: events", () => {
  test("create, add a tier, publish, then it can be found", () => {
    const { events } = setup();
    publishedEvent(events, lagos);
    assert.deepEqual(events.search({ city: "Lagos" }).map((e) => e.id), ["e1"]);
  });

  test("a draft is not found until it is published, and not found after unpublishing", () => {
    const { events } = setup();
    events.create(lagos);
    events.addTier("e1", { id: "ga", name: "General", priceCents: 100, capacity: 5 });
    assert.deepEqual(events.search(), []);
    events.publish("e1");
    assert.equal(events.search().length, 1);
    events.unpublish("e1");
    assert.deepEqual(events.search(), []);
  });

  test("a second event with the same id is refused", () => {
    const { events } = setup();
    events.create(lagos);
    assert.throws(() => events.create(lagos), { code: "VALIDATION" });
  });

  test("a bad event is refused and nothing is stored", () => {
    const { events, store } = setup();
    assert.throws(() => events.create({ ...lagos, title: "" }), { code: "VALIDATION" });
    assert.throws(() => events.create(undefined), { code: "VALIDATION" });
    assert.equal(store.listEvents().length, 0);
  });

  test("an unknown event id is NOT_FOUND", () => {
    const { events } = setup();
    assert.throws(() => events.addTier("nope", { id: "ga", name: "G", priceCents: 1, capacity: 1 }), { code: "NOT_FOUND" });
    assert.throws(() => events.publish("nope"), { code: "NOT_FOUND" });
    assert.throws(() => events.unpublish("nope"), { code: "NOT_FOUND" });
  });

  test("search can sort, and never changes the stored order", () => {
    const { events, store } = setup();
    publishedEvent(events, lagos);
    publishedEvent(events, abuja);
    assert.deepEqual(events.search({}, "date").map((e) => e.id), ["e2", "e1"]);
    assert.deepEqual(events.search({}, "date", "desc").map((e) => e.id), ["e1", "e2"]);
    assert.deepEqual(store.listEvents().map((e) => e.id), ["e1", "e2"]);
  });

  test("a bad filter or sort key is VALIDATION", () => {
    const { events } = setup();
    assert.throws(() => events.search({ dateFrom: "soon" }), { code: "VALIDATION" });
    assert.throws(() => events.search({}, "colour"), { code: "VALIDATION" });
  });
});

describe("services: bookings", () => {
  test("the whole journey: book, pay, cancel", () => {
    const { events, bookings, store } = setup();
    publishedEvent(events, lagos, 500000, 3);
    const tier = store.requireEvent("e1").tiers.get("ga");

    const booking = bookings.book("e1", "ga", "Ada", 2);
    assert.equal(booking.status, "pending");
    assert.equal(seatsLeft(tier), 1);

    assert.equal(bookings.pay(booking.ref).status, "paid");
    assert.equal(bookings.find(booking.ref).status, "paid");

    const { booking: cancelled } = bookings.cancel(booking.ref);
    assert.equal(cancelled.status, "refunded");
    assert.equal(seatsLeft(tier), 3);
  });

  test("paying a cancelled booking is refused through the service too", () => {
    const { events, bookings } = setup();
    publishedEvent(events, lagos);
    const booking = bookings.book("e1", "ga", "Ada", 1);
    bookings.cancel(booking.ref);
    assert.throws(() => bookings.pay(booking.ref), { code: "INVALID_STATE" });
  });

  test("cancel needs only the booking code, and cancelling twice is refused", () => {
    const { events, bookings } = setup();
    publishedEvent(events, lagos);
    const booking = bookings.book("e1", "ga", "Ada", 1);
    bookings.cancel(booking.ref);
    assert.throws(() => bookings.cancel(booking.ref), { code: "ALREADY_CANCELLED" });
  });

  test("unknown events and unknown booking codes are NOT_FOUND", () => {
    const { bookings } = setup();
    assert.throws(() => bookings.book("nope", "ga", "Ada", 1), { code: "NOT_FOUND" });
    assert.throws(() => bookings.find("BK-000001"), { code: "NOT_FOUND" });
    assert.throws(() => bookings.pay("BK-000001"), { code: "NOT_FOUND" });
    assert.throws(() => bookings.cancel("BK-000001"), { code: "NOT_FOUND" });
  });

  test("the booking rules still apply: sold out and bad quantities", () => {
    const { events, bookings } = setup();
    publishedEvent(events, lagos, 500000, 2);
    assert.throws(() => bookings.book("e1", "ga", "Ada", 3), { code: "SOLD_OUT" });
    assert.throws(() => bookings.book("e1", "ga", "Ada", 11), { code: "VALIDATION" });
    assert.throws(() => bookings.book("e1", "ga", "Ada", 0), { code: "VALIDATION" });
  });
});
