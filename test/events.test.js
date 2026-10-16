import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { createEvent, addTier, publishEvent, unpublishEvent, seatsLeft } from "../src/events.js";
import { makeEvent } from "./helpers.js";

const validEvent = { id: "e1", title: "Night", city: "Lagos", venue: "Hall", date: "2026-12-05" };

describe("S02: create an event", () => {
  test("a new event starts as a draft with the details it was given", () => {
    const event = createEvent(validEvent);
    assert.equal(event.status, "draft");
    assert.equal(event.title, "Night");
    assert.equal(event.venue, "Hall");
  });

  test("a missing title, city or venue is rejected with VALIDATION", () => {
    for (const field of ["title", "city", "venue"]) {
      assert.throws(
        () => createEvent({ ...validEvent, [field]: "  " }),
        { code: "VALIDATION" }
      );
    }
  });

  test("a bad date is rejected, including dates that do not exist", () => {
    for (const date of ["tomorrow", "2026-13-01", "2026-02-30", "", undefined]) {
      assert.throws(() => createEvent({ ...validEvent, date }), { code: "VALIDATION" });
    }
  });
});

describe("S03: add ticket tiers", () => {
  test("a tier keeps its price in whole cents and its capacity", () => {
    const event = createEvent(validEvent);
    const tier = addTier(event, { id: "vip", name: "VIP", priceCents: 1500000, capacity: 5 });
    assert.equal(tier.priceCents, 1500000);
    assert.equal(seatsLeft(tier), 5);
  });

  test("a free tier (price 0) is allowed", () => {
    const event = createEvent(validEvent);
    assert.doesNotThrow(() => addTier(event, { id: "free", name: "Free", priceCents: 0, capacity: 5 }));
  });

  test("bad prices and capacities are rejected with VALIDATION", () => {
    const event = createEvent(validEvent);
    const bad = [
      { priceCents: -1, capacity: 5 },
      { priceCents: 10.5, capacity: 5 },
      { priceCents: 100, capacity: 0 },
      { priceCents: 100, capacity: 2.5 },
    ];
    for (const [i, values] of bad.entries()) {
      assert.throws(() => addTier(event, { id: "t" + i, name: "T", ...values }), { code: "VALIDATION" });
    }
  });

  test("the same tier id twice is rejected", () => {
    const event = createEvent(validEvent);
    addTier(event, { id: "ga", name: "General", priceCents: 100, capacity: 5 });
    assert.throws(
      () => addTier(event, { id: "ga", name: "General", priceCents: 100, capacity: 5 }),
      { code: "VALIDATION" }
    );
  });
});

describe("S04: publish and unpublish", () => {
  test("an event with no tiers cannot be published", () => {
    const event = createEvent(validEvent);
    assert.throws(() => publishEvent(event), { code: "VALIDATION" });
    assert.equal(event.status, "draft");
  });

  test("publish then unpublish changes the status each time", () => {
    const event = makeEvent({ publish: false });
    assert.equal(event.status, "draft");
    publishEvent(event);
    assert.equal(event.status, "published");
    unpublishEvent(event);
    assert.equal(event.status, "draft");
  });
});
