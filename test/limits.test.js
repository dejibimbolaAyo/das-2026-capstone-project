import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { createEvent, addTier, MAX_PRICE_CENTS, MAX_CAPACITY } from "../src/events.js";

// The database keeps whole numbers in 64 bits and JavaScript is exact only up to 2^53.
// So prices and capacities have limits, and the rules say so clearly instead of a crash.
function freshEvent() {
  return createEvent({ id: "e1", title: "T", city: "Lagos", venue: "V", date: "2026-12-05" });
}

describe("limits on prices and capacities", () => {
  test("the biggest allowed price and capacity are accepted", () => {
    const tier = addTier(freshEvent(), { id: "a", name: "A", priceCents: MAX_PRICE_CENTS, capacity: MAX_CAPACITY });
    assert.equal(tier.priceCents, MAX_PRICE_CENTS);
  });

  test("a price or capacity over the limit is VALIDATION", () => {
    const bad = [
      { priceCents: MAX_PRICE_CENTS + 1, capacity: 1 },
      { priceCents: 1e30, capacity: 1 },
      { priceCents: 100, capacity: MAX_CAPACITY + 1 },
      { priceCents: 100, capacity: 2 ** 53 },
      { priceCents: Number.MAX_SAFE_INTEGER + 2, capacity: 1 },
    ];
    for (const input of bad) {
      assert.throws(() => addTier(freshEvent(), { id: "a", name: "A", ...input }), { code: "VALIDATION" }, JSON.stringify(input));
    }
  });
});
