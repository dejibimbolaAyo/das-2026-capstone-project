import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { createEvent, addTier } from "../src/events.js";
import { searchEvents } from "../src/search.js";
import { makeEvent } from "./helpers.js";

// Found while writing the Build 3 service tests: leaving out the whole input crashed
// with a TypeError instead of a clean VALIDATION error.
describe("missing input is VALIDATION, never a crash", () => {
  test("createEvent with nothing, null, or something that is not an object", () => {
    for (const bad of [undefined, null, "event", 42, true]) {
      assert.throws(() => createEvent(bad), { code: "VALIDATION" }, String(bad));
    }
  });

  test("addTier with nothing, null, or something that is not an object", () => {
    const event = makeEvent({ publish: false });
    for (const bad of [undefined, null, "tier", 42, true]) {
      assert.throws(() => addTier(event, bad), { code: "VALIDATION" }, String(bad));
    }
  });

  test("searchEvents with no filters, or null filters, shows every published event", () => {
    const events = [makeEvent({ id: "a" }), makeEvent({ id: "b", publish: false })];
    assert.deepEqual(searchEvents(events).map((e) => e.id), ["a"]);
    assert.deepEqual(searchEvents(events, null).map((e) => e.id), ["a"]);
    assert.deepEqual(searchEvents(events, undefined).map((e) => e.id), ["a"]);
  });
});
