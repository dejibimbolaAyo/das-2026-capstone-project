import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { searchEvents } from "../src/search.js";
import { makeEvent } from "./helpers.js";

const ids = (events) => events.map((e) => e.id);

function catalogue() {
  return [
    makeEvent({ id: "tech", title: "Lagos Tech Night", city: "Lagos", venue: "Landmark Centre", date: "2026-12-05", priceCents: 1500000 }),
    makeEvent({ id: "jazz", title: "Abuja Jazz Evening", city: "Abuja", venue: "Transcorp Hall", date: "2026-11-20", priceCents: 800000 }),
    makeEvent({ id: "food", title: "Food Fair", city: "Lagos", venue: "Tafawa Balewa Square", date: "2026-11-20", priceCents: 500000 }),
    makeEvent({ id: "draft", title: "Secret Launch", city: "Lagos", venue: "Private", date: "2026-12-01", priceCents: 100000, publish: false }),
  ];
}

describe("S05: search and filter", () => {
  test("no filters: every PUBLISHED event, and drafts stay hidden", () => {
    assert.deepEqual(ids(searchEvents(catalogue())), ["tech", "jazz", "food"]);
  });

  test("text matches the title, city or venue, in any capital letters", () => {
    const events = catalogue();
    assert.deepEqual(ids(searchEvents(events, { text: "NIGHT" })), ["tech"]);
    assert.deepEqual(ids(searchEvents(events, { text: "abuja" })), ["jazz"]);
    assert.deepEqual(ids(searchEvents(events, { text: "square" })), ["food"]);
    assert.deepEqual(ids(searchEvents(events, { text: "nothing matches this" })), []);
  });

  test("city matches exactly, in any capital letters", () => {
    assert.deepEqual(ids(searchEvents(catalogue(), { city: "LAGOS" })), ["tech", "food"]);
  });

  test("date range includes both end dates", () => {
    const events = catalogue();
    assert.deepEqual(ids(searchEvents(events, { dateFrom: "2026-11-20", dateTo: "2026-11-20" })), ["jazz", "food"]);
    assert.deepEqual(ids(searchEvents(events, { dateFrom: "2026-12-01" })), ["tech"]);
    assert.deepEqual(ids(searchEvents(events, { dateTo: "2026-11-19" })), []);
  });

  test("price range uses the cheapest tier and includes both ends", () => {
    const events = catalogue();
    assert.deepEqual(ids(searchEvents(events, { minPriceCents: 800000 })), ["tech", "jazz"]);
    assert.deepEqual(ids(searchEvents(events, { maxPriceCents: 800000 })), ["jazz", "food"]);
    assert.deepEqual(ids(searchEvents(events, { minPriceCents: 800000, maxPriceCents: 800000 })), ["jazz"]);
  });

  test("a price of 0 is a real filter, not 'no filter'", () => {
    assert.deepEqual(ids(searchEvents(catalogue(), { maxPriceCents: 0 })), []);
  });

  test("filters work together", () => {
    const events = catalogue();
    assert.deepEqual(ids(searchEvents(events, { city: "Lagos", maxPriceCents: 600000 })), ["food"]);
    assert.deepEqual(ids(searchEvents(events, { text: "night", city: "Abuja" })), []);
  });

  test("an unpublished event cannot be found, and a published one can", () => {
    const events = catalogue();
    assert.deepEqual(ids(searchEvents(events, { text: "secret" })), []);
    events[3].status = "published";
    assert.deepEqual(ids(searchEvents(events, { text: "secret" })), ["draft"]);
  });

  test("never changes the original list or its events", () => {
    const events = catalogue();
    const before = JSON.stringify(events.map((e) => [e.id, e.status, e.title]));
    const found = searchEvents(events, { city: "Lagos" });
    assert.equal(events.length, 4);
    assert.equal(JSON.stringify(events.map((e) => [e.id, e.status, e.title])), before);
    assert.notEqual(found, events);
  });

  test("an empty list gives an empty list", () => {
    assert.deepEqual(searchEvents([], { text: "x" }), []);
  });

  test("bad filters are rejected with VALIDATION", () => {
    const events = catalogue();
    const bad = [
      { dateFrom: "soon" },
      { dateTo: "2026-02-30" },
      { dateFrom: "2026-12-31", dateTo: "2026-12-01" },
      { minPriceCents: -1 },
      { maxPriceCents: 10.5 },
      { minPriceCents: 900, maxPriceCents: 100 },
    ];
    for (const filters of bad) {
      assert.throws(() => searchEvents(events, filters), { code: "VALIDATION" }, JSON.stringify(filters));
    }
  });
});
