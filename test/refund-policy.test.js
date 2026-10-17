import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { calculateRefund, eventStartsAt, REFUND_TIERS } from "../src/domain/refundPolicy.js";

const DAY = 24 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;
const START = Date.parse("2026-12-05T00:00:00Z");
const refund = (amountCents, msBefore) => calculateRefund({ amountCents, startsAt: START, now: START - msBefore });

describe("refund policy: the three tiers (S09)", () => {
  test("10 days away: everything comes back", () => {
    assert.deepEqual(refund(1000000, 10 * DAY), { percent: 100, refundCents: 1000000 });
  });
  test("3 days away: half comes back", () => {
    assert.deepEqual(refund(1000000, 3 * DAY), { percent: 50, refundCents: 500000 });
  });
  test("1 day away: nothing comes back", () => {
    assert.deepEqual(refund(1000000, 1 * DAY), { percent: 0, refundCents: 0 });
  });
});

describe("refund policy: every boundary (a boundary belongs to the BETTER tier)", () => {
  test("exactly 7 days: 100%", () => assert.equal(refund(10000, 7 * DAY).percent, 100));
  test("6 days 23 hours: 50%", () => assert.equal(refund(10000, 7 * DAY - HOUR).percent, 50));
  test("one millisecond under 7 days: 50%", () => assert.equal(refund(10000, 7 * DAY - 1).percent, 50));
  test("one millisecond over 7 days: 100%", () => assert.equal(refund(10000, 7 * DAY + 1).percent, 100));
  test("exactly 2 days: 50%", () => assert.equal(refund(10000, 2 * DAY).percent, 50));
  test("1 day 23 hours: 0%", () => assert.equal(refund(10000, 2 * DAY - HOUR).percent, 0));
  test("one millisecond under 2 days: 0%", () => assert.equal(refund(10000, 2 * DAY - 1).percent, 0));
  test("one millisecond before the start: still allowed, 0%", () => assert.deepEqual(refund(10000, 1), { percent: 0, refundCents: 0 }));
});

describe("refund policy: an event that has started", () => {
  test("exactly at the start: EVENT_STARTED", () => {
    assert.throws(() => refund(10000, 0), { code: "EVENT_STARTED" });
  });
  test("after the start: EVENT_STARTED", () => {
    assert.throws(() => refund(10000, -1), { code: "EVENT_STARTED" });
    assert.throws(() => refund(10000, -30 * DAY), { code: "EVENT_STARTED" });
  });
});

describe("refund policy: money is whole cents, rounded DOWN", () => {
  test("half of an odd amount drops the half cent", () => {
    assert.equal(refund(1001, 3 * DAY).refundCents, 500);
    assert.equal(refund(99, 3 * DAY).refundCents, 49);
    assert.equal(refund(1, 3 * DAY).refundCents, 0);
  });
  test("a free ticket refunds 0 cents at every tier", () => {
    for (const d of [10, 3, 1]) assert.equal(refund(0, d * DAY).refundCents, 0);
  });
  test("the answer is always a whole number, never more than was paid", () => {
    for (const amount of [0, 1, 2, 3, 99, 100, 101, 12345, 999999, 100_000_000_000]) {
      for (const d of [10, 7, 3, 2, 1, 0.5]) {
        const r = refund(amount, d * DAY);
        assert.ok(Number.isSafeInteger(r.refundCents), `${amount} / ${d}`);
        assert.ok(r.refundCents >= 0 && r.refundCents <= amount, `${amount} / ${d}`);
      }
    }
  });
  test("the biggest booking in the system (10 tickets at the maximum price) is exact", () => {
    const biggest = 100_000_000_000 * 10;
    assert.equal(refund(biggest, 10 * DAY).refundCents, biggest);
    assert.equal(refund(biggest, 3 * DAY).refundCents, biggest / 2);
  });
  test("the further away the event, the same or more comes back (never less)", () => {
    let last = -1;
    for (let hours = 1; hours <= 24 * 14; hours++) {
      const r = refund(100000, hours * HOUR).refundCents;
      assert.ok(r >= last, `at ${hours} hours`);
      last = r;
    }
  });
});

describe("refund policy: checks its inputs", () => {
  test("a bad amount is VALIDATION", () => {
    for (const amountCents of [-1, 1.5, NaN, Infinity, "100", null, undefined]) {
      assert.throws(() => calculateRefund({ amountCents, startsAt: START, now: START - 10 * DAY }), { code: "VALIDATION" }, String(amountCents));
    }
  });
  test("a bad time is VALIDATION", () => {
    assert.throws(() => calculateRefund({ amountCents: 1, startsAt: "soon", now: START }), { code: "VALIDATION" });
    assert.throws(() => calculateRefund({ amountCents: 1, startsAt: START, now: undefined }), { code: "VALIDATION" });
  });
  test("times may be milliseconds, Dates or date text", () => {
    const now = START - 3 * DAY;
    const a = calculateRefund({ amountCents: 100, startsAt: START, now });
    assert.deepEqual(calculateRefund({ amountCents: 100, startsAt: new Date(START), now: new Date(now) }), a);
    assert.deepEqual(calculateRefund({ amountCents: 100, startsAt: "2026-12-05T00:00:00Z", now: new Date(now).toISOString() }), a);
  });
  test("an event starts at midnight (UTC) of its date", () => {
    assert.equal(eventStartsAt("2026-12-05"), START);
  });
  test("the tier table is the policy in the brief: 7 days 100, 2 days 50, otherwise 0", () => {
    assert.deepEqual(REFUND_TIERS.map((t) => [t.minDays, t.percent]), [[7, 100], [2, 50], [0, 0]]);
    assert.ok(Object.isFrozen(REFUND_TIERS));
  });
});
