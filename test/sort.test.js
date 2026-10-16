import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { mergeSort, sortEvents } from "../src/sort.js";
import { BookingBook } from "../src/bookings.js";
import { makeEvent } from "./helpers.js";

const byNumber = (a, b) => a - b;

describe("mergeSort", () => {
  test("sorts numbers, including an empty list and a list of one", () => {
    assert.deepEqual(mergeSort([], byNumber), []);
    assert.deepEqual(mergeSort([7], byNumber), [7]);
    assert.deepEqual(mergeSort([5, 2, 9, 1, 5, 6], byNumber), [1, 2, 5, 5, 6, 9]);
  });

  test("handles already sorted, reversed and all-equal lists", () => {
    assert.deepEqual(mergeSort([1, 2, 3, 4], byNumber), [1, 2, 3, 4]);
    assert.deepEqual(mergeSort([4, 3, 2, 1], byNumber), [1, 2, 3, 4]);
    assert.deepEqual(mergeSort([3, 3, 3], byNumber), [3, 3, 3]);
  });

  test("never changes the original list and returns a new one", () => {
    const original = [3, 1, 2];
    const sorted = mergeSort(original, byNumber);
    assert.deepEqual(original, [3, 1, 2]);
    assert.notEqual(sorted, original);
  });

  test("is STABLE: items that tie keep their original order", () => {
    const items = [
      { name: "a", rank: 2 },
      { name: "b", rank: 1 },
      { name: "c", rank: 2 },
      { name: "d", rank: 1 },
      { name: "e", rank: 2 },
    ];
    const sorted = mergeSort(items, (x, y) => x.rank - y.rank);
    assert.deepEqual(sorted.map((i) => i.name), ["b", "d", "a", "c", "e"]);
  });

  test("gives the same answer as the built-in sort on 1,000 random numbers", () => {
    let seed = 42; // fixed seed, so the test gives the same result every run
    const next = () => (seed = (seed * 1103515245 + 12345) % 2147483648);
    const numbers = Array.from({ length: 1000 }, () => next() % 500);
    assert.deepEqual(mergeSort(numbers, byNumber), [...numbers].sort(byNumber));
  });
});

describe("sortEvents", () => {
  const cheap = () => makeEvent({ id: "cheap", date: "2026-12-10", priceCents: 100000, capacity: 50 });
  const mid = () => makeEvent({ id: "mid", date: "2026-11-01", priceCents: 300000, capacity: 20 });
  const dear = () => makeEvent({ id: "dear", date: "2027-01-05", priceCents: 900000, capacity: 5 });
  const ids = (events) => events.map((e) => e.id);

  test("by date, earliest first, and latest first", () => {
    const events = [cheap(), mid(), dear()];
    assert.deepEqual(ids(sortEvents(events, "date")), ["mid", "cheap", "dear"]);
    assert.deepEqual(ids(sortEvents(events, "date", "desc")), ["dear", "cheap", "mid"]);
  });

  test("by price, using the cheapest tier", () => {
    const events = [dear(), cheap(), mid()];
    assert.deepEqual(ids(sortEvents(events, "price")), ["cheap", "mid", "dear"]);
    assert.deepEqual(ids(sortEvents(events, "price", "desc")), ["dear", "mid", "cheap"]);
  });

  test("by availability, which changes as seats are booked", () => {
    const events = [cheap(), mid(), dear()]; // seats left: 50, 20, 5
    assert.deepEqual(ids(sortEvents(events, "availability")), ["dear", "mid", "cheap"]);
    new BookingBook().book(events[0], "ga", "Ada", 10); // cheap: 50 -> 40, still the most
    new BookingBook().book(events[1], "ga", "Bola", 10); // mid: 20 -> 10
    assert.deepEqual(ids(sortEvents(events, "availability", "desc")), ["cheap", "mid", "dear"]);
  });

  test("ties keep their original order, both ascending and descending", () => {
    const a = makeEvent({ id: "a", priceCents: 500000 });
    const b = makeEvent({ id: "b", priceCents: 500000 });
    const c = makeEvent({ id: "c", priceCents: 500000 });
    assert.deepEqual(ids(sortEvents([a, b, c], "price")), ["a", "b", "c"]);
    assert.deepEqual(ids(sortEvents([a, b, c], "price", "desc")), ["a", "b", "c"]);
  });

  test("never changes the original list", () => {
    const events = [dear(), cheap(), mid()];
    const before = ids(events);
    sortEvents(events, "date");
    assert.deepEqual(ids(events), before);
  });

  test("a bad key or direction is rejected with VALIDATION", () => {
    assert.throws(() => sortEvents([], "colour"), { code: "VALIDATION" });
    assert.throws(() => sortEvents([], "date", "sideways"), { code: "VALIDATION" });
  });

  test("an empty list sorts to an empty list", () => {
    assert.deepEqual(sortEvents([], "date"), []);
  });
});
