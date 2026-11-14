import assert from "node:assert/strict";
import test from "node:test";
import {
  addTier,
  bookTickets,
  createEvent,
  createStore,
  listEventSummaries,
  publishEvent,
} from "../src/domain/inventory.js";
import { DomainError } from "../src/domain/errors.js";
import { filterEvents, searchEvents, sortEvents } from "../src/domain/eventSearch.js";
import { mergeSort } from "../src/domain/sorting.js";

function assertCode(code, action) {
  assert.throws(action, (error) => error instanceof DomainError && error.code === code);
}

function makeEvent(store, details = {}) {
  return createEvent(store, {
    title: "Lagos Tech Meetup",
    city: "Lagos",
    venue: "Civic Hall",
    date: "2026-12-05",
    ...details,
  });
}

function summary({ id, title, city = "Lagos", venue = "Hall", date, prices = [], available = 0 }) {
  return {
    id,
    title,
    city,
    venue,
    date,
    tiers: prices.map((priceCents, index) => ({
      id: `${id}-tier-${index}`,
      priceCents,
      available: Array.isArray(available) ? available[index] ?? 0 : available,
    })),
  };
}

test("S02: valid event creation saves a new draft that is absent from the public list", () => {
  const store = createStore();
  const event = makeEvent(store);

  assert.ok(event.id);
  assert.equal(event.status, "DRAFT");
  assert.equal(store.events.get(event.id), event);
  assert.deepEqual(listEventSummaries(store), []);
});

test("S02: missing required text or an impossible date is rejected without saving", () => {
  const store = createStore();

  for (const details of [
    { title: "", city: "Lagos", venue: "Hall", date: "2026-12-05" },
    { title: "Meetup", city: "", venue: "Hall", date: "2026-12-05" },
    { title: "Meetup", city: "Lagos", venue: "Hall", date: "2026-02-30" },
  ]) {
    assertCode("VALIDATION", () => createEvent(store, details));
  }
  assert.equal(store.events.size, 0);
});

test("S03: a tier starts with zero sold and all capacity available", () => {
  const store = createStore();
  const event = makeEvent(store);
  const tier = addTier(store, event.id, { name: "General", priceCents: 500000, capacity: 100 });

  assert.equal(tier.sold, 0);
  assert.equal(tier.available, 100);
});

test("S03: fractional prices and capacities below one are rejected", () => {
  const store = createStore();
  const event = makeEvent(store);

  assertCode("VALIDATION", () => addTier(store, event.id, {
    name: "Fractional",
    priceCents: 1.5,
    capacity: 10,
  }));
  for (const capacity of [0, -1]) {
    assertCode("VALIDATION", () => addTier(store, event.id, {
      name: "Invalid capacity",
      priceCents: 100,
      capacity,
    }));
  }
  assert.equal(event.tiers.size, 0);
});

test("S03: adding a tier to a missing event returns NOT_FOUND", () => {
  const store = createStore();
  assertCode("NOT_FOUND", () => addTier(store, "missing", {
    name: "General",
    priceCents: 500000,
    capacity: 100,
  }));
});

test("S03: duplicate tier names return CONFLICT", () => {
  const store = createStore();
  const event = makeEvent(store);
  addTier(store, event.id, { name: "General", priceCents: 500000, capacity: 100 });

  assertCode("CONFLICT", () => addTier(store, event.id, {
    name: "general",
    priceCents: 500000,
    capacity: 100,
  }));
});

test("S04: publishing a tiered draft sets PUBLISHED and adds it to the default list", () => {
  const store = createStore();
  const event = makeEvent(store);
  addTier(store, event.id, { name: "General", priceCents: 1200, capacity: 20 });

  assert.equal(publishEvent(store, event.id).status, "PUBLISHED");
  assert.deepEqual(listEventSummaries(store).map((item) => item.id), [event.id]);
});

test("S04: drafts are hidden by default and included when requested", () => {
  const store = createStore();
  const event = makeEvent(store);

  assert.deepEqual(listEventSummaries(store), []);
  assert.deepEqual(listEventSummaries(store, { publishedOnly: false }).map((item) => item.id), [event.id]);
  assertCode("VALIDATION", () => listEventSummaries(store, null));
});

test("S04: publishing an event without tiers returns INVALID_STATE and keeps it a draft", () => {
  const store = createStore();
  const event = makeEvent(store);

  assertCode("INVALID_STATE", () => publishEvent(store, event.id));
  assert.equal(event.status, "DRAFT");
});

const searchFixtures = [
  summary({
    id: "lagos-tech",
    title: "Lagos Tech Meetup",
    city: "Lagos",
    venue: "Innovation Hub",
    date: "2026-12-05T17:00:00Z",
    prices: [5000, 2500],
    available: [2, 0],
  }),
  summary({
    id: "abuja-jazz",
    title: "Abuja Jazz Night",
    city: "Abuja",
    venue: "Blue Room",
    date: "2026-12-05",
    prices: [1000],
    available: 8,
  }),
  summary({
    id: "lagos-art",
    title: "Lagos Art Fair",
    city: "Lagos",
    venue: "Gallery",
    date: "2026-12-06",
    prices: [],
    available: 0,
  }),
  summary({
    id: "early-film",
    title: "Early Film",
    city: "Abuja",
    venue: "Cinema",
    date: "2026-12-04",
    prices: [3000],
    available: 1,
  }),
];

test("S05: query matches title or venue without regard to case", () => {
  assert.deepEqual(filterEvents(searchFixtures, { q: "JAZZ" }).map((event) => event.id), ["abuja-jazz"]);
  assert.deepEqual(filterEvents(searchFixtures, { q: "innovation" }).map((event) => event.id), ["lagos-tech"]);
});

test("S05: city matching is exact apart from letter case", () => {
  assert.deepEqual(filterEvents(searchFixtures, { city: "lagos" }).map((event) => event.id), [
    "lagos-tech",
    "lagos-art",
  ]);
});

test("S05: maximum price uses the cheapest tier, sorts ascending, and excludes events without tiers", () => {
  const results = searchEvents(searchFixtures, { maxPriceCents: 2500 }, "price");
  assert.deepEqual(results.map((event) => event.id), ["abuja-jazz", "lagos-tech"]);
});

test("S05: date sorting is earliest first and breaks same-date ties by title then id", () => {
  const sameDate = [
    summary({ id: "b", title: "Zulu", date: "2026-12-05", prices: [1] }),
    summary({ id: "z", title: "Alpha", date: "2026-12-05", prices: [1] }),
    summary({ id: "a", title: "Alpha", date: "2026-12-05", prices: [1] }),
    summary({ id: "early", title: "Later title", date: "2026-12-04", prices: [1] }),
  ];

  assert.deepEqual(sortEvents(sameDate, "date").map((event) => event.id), ["early", "a", "z", "b"]);
});

test("S05: a date-only upper bound includes events later that day", () => {
  const results = filterEvents(searchFixtures, { to: "2026-12-05" });
  assert.ok(results.some((event) => event.id === "lagos-tech"));
  assert.ok(results.some((event) => event.id === "abuja-jazz"));
  assert.ok(!results.some((event) => event.id === "lagos-art"));
});

test("S05: date range boundaries are inclusive and onlyAvailable excludes sold-out events", () => {
  const results = filterEvents(searchFixtures, {
    from: "2026-12-05",
    to: "2026-12-05T17:00:00Z",
    onlyAvailable: true,
  });
  assert.deepEqual(results.map((event) => event.id), ["lagos-tech", "abuja-jazz"]);
});

test("S05: bad dates, fractional prices, and unknown sort options return VALIDATION", () => {
  assertCode("VALIDATION", () => filterEvents(searchFixtures, { from: "2026-02-30" }));
  assertCode("VALIDATION", () => filterEvents(searchFixtures, { maxPriceCents: 1.5 }));
  assertCode("VALIDATION", () => sortEvents(searchFixtures, "popular"));
});

test("S05: filtering and sorting leave the original list and its items unchanged", () => {
  const original = structuredClone(searchFixtures);
  const before = structuredClone(searchFixtures);

  filterEvents(searchFixtures, { city: "lagos" });
  sortEvents(searchFixtures, "availability");
  searchEvents(searchFixtures, { q: "lagos" }, "price");

  assert.deepEqual(searchFixtures, before);
  assert.deepEqual(searchFixtures, original);
});

test("S05: availability sorts most seats left first and all sort modes return a new empty list", () => {
  const availability = sortEvents(searchFixtures, "availability");
  assert.deepEqual(availability.map((event) => event.id), ["abuja-jazz", "lagos-tech", "early-film", "lagos-art"]);
  const empty = [];
  for (const sortBy of ["date", "price", "availability"]) {
    const emptyResult = sortEvents(empty, sortBy);
    assert.deepEqual(emptyResult, []);
    assert.notEqual(emptyResult, empty);
  }
});

test("S05: price sorting places events without prices last and breaks metric ties by title then id", () => {
  const events = [
    summary({ id: "z", title: "Beta", date: "2026-12-05", prices: [500], available: 2 }),
    summary({ id: "b", title: "Alpha", date: "2026-12-05", prices: [500], available: 2 }),
    summary({ id: "a", title: "Alpha", date: "2026-12-05", prices: [500], available: 2 }),
    summary({ id: "none", title: "Aardvark", date: "2026-12-05", prices: [] }),
  ];

  assert.deepEqual(sortEvents(events, "price").map((event) => event.id), ["a", "b", "z", "none"]);
  assert.deepEqual(sortEvents(events, "availability").map((event) => event.id), ["a", "b", "z", "none"]);
});

test("mergeSort is stable, returns a fresh array, and leaves its input unchanged", () => {
  const items = [
    { key: 2, order: "first" },
    { key: 1, order: "middle" },
    { key: 2, order: "last" },
  ];
  const original = structuredClone(items);
  const sorted = mergeSort(items, (left, right) => left.key - right.key);

  assert.notEqual(sorted, items);
  assert.deepEqual(sorted.map((item) => item.order), ["middle", "first", "last"]);
  assert.deepEqual(items, original);
});

test("S06: booking two of three seats creates a pending whole-cent booking and leaves one seat", () => {
  const store = createStore();
  const event = makeEvent(store);
  const tier = addTier(store, event.id, { name: "General", priceCents: 1250, capacity: 3 });
  publishEvent(store, event.id);
  const booking = bookTickets(store, {
    eventId: event.id,
    tierId: tier.id,
    attendeeName: "Avery",
    quantity: 2,
  });

  assert.equal(booking.status, "PENDING");
  assert.equal(booking.quantity, 2);
  assert.equal(booking.totalCents, 2500);
  assert.equal(tier.sold, 2);
  assert.equal(tier.available, 1);
});

test("S06: an over-capacity booking returns SOLD_OUT without changing seats or bookings", () => {
  const store = createStore();
  const event = makeEvent(store);
  const tier = addTier(store, event.id, { name: "General", priceCents: 1000, capacity: 1 });
  publishEvent(store, event.id);
  const bookingsBefore = store.bookingsByReference.size;

  assertCode("SOLD_OUT", () => bookTickets(store, {
    eventId: event.id,
    tierId: tier.id,
    attendeeName: "Avery",
    quantity: 2,
  }));
  assert.equal(tier.available, 1);
  assert.equal(tier.sold, 0);
  assert.equal(store.bookingsByReference.size, bookingsBefore);
});

test("S06: zero, negative, fractional, and over-ten quantities return VALIDATION", () => {
  const store = createStore();
  const event = makeEvent(store);
  const tier = addTier(store, event.id, { name: "General", priceCents: 1000, capacity: 20 });

  for (const quantity of [0, -1, 1.5, 11]) {
    assertCode("VALIDATION", () => bookTickets(store, {
      eventId: event.id,
      tierId: tier.id,
      attendeeName: "Avery",
      quantity,
    }));
  }
  assert.equal(tier.available, 20);
  assert.equal(store.bookingsByReference.size, 0);
});
