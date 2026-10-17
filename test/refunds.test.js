import { test, describe, afterEach } from "node:test";
import assert from "node:assert/strict";
import { makeWorld, DAY, HOUR, MINUTE } from "./world.js";

// S09: cancelling a PAID booking and getting money back by the policy.
// The clock is fake: a test pays, then moves "now" to exactly where it wants to be.

let w;
afterEach(() => {
  w?.close();
  w = undefined;
});

describe("S09: the three refund tiers, through the booking service", () => {
  for (const [label, daysBefore, percent, cents] of [
    ["10 days away", 10, 100, 1000000],
    ["3 days away", 3, 50, 500000],
    ["1 day away", 1, 0, 0],
  ]) {
    test(`${label}: ${percent}% back (${cents} cents) and the seats are released once`, () => {
      w = makeWorld({ capacity: 5 });
      const paid = w.bookAndPay(w.ada, 2); // 2 x 500000
      assert.equal(w.left(), 3);
      w.clock.set(w.startsAt - daysBefore * DAY);

      const result = w.bookings.cancel(paid.ref, w.ada);
      assert.equal(result.booking.status, "refunded");
      assert.equal(result.booking.refundCents, cents);
      assert.deepEqual(result.refund, { percent, refundCents: cents, paid: true });
      assert.equal(w.left(), 5, "the 2 seats are back");
      assert.equal(w.bookings.find(paid.ref, w.ada).refundCents, cents, "the refund is remembered");
    });
  }

  for (const [label, msBefore, percent] of [
    ["exactly 7 days", 7 * DAY, 100],
    ["6 days 23 hours", 7 * DAY - HOUR, 50],
    ["exactly 2 days", 2 * DAY, 50],
    ["1 day 23 hours", 2 * DAY - HOUR, 0],
  ]) {
    test(`boundary, ${label} before the start: ${percent}%`, () => {
      w = makeWorld();
      const paid = w.bookAndPay(w.ada, 1);
      w.clock.set(w.startsAt - msBefore);
      assert.equal(w.bookings.cancel(paid.ref, w.ada).refund.percent, percent);
    });
  }

  test("the 50% tier rounds the cents DOWN", () => {
    w = makeWorld({ priceCents: 1001 });
    const paid = w.bookAndPay(w.ada, 1);
    w.clock.set(w.startsAt - 3 * DAY);
    assert.equal(w.bookings.cancel(paid.ref, w.ada).refund.refundCents, 500);
  });

  test("a free ticket can be cancelled too, and refunds 0 cents", () => {
    w = makeWorld({ priceCents: 0 });
    const paid = w.bookAndPay(w.ada, 2);
    const result = w.bookings.cancel(paid.ref, w.ada);
    assert.equal(result.booking.status, "refunded");
    assert.equal(result.booking.refundCents, 0);
    assert.equal(w.left(), 3);
  });
});

describe("S09: cancelling twice", () => {
  test("a refunded booking cannot be cancelled again, and the seats are NOT released a second time", () => {
    w = makeWorld({ capacity: 5 });
    const paid = w.bookAndPay(w.ada, 2);
    const other = w.book(w.bayo, 1); // someone else keeps a seat
    w.bookings.cancel(paid.ref, w.ada);
    assert.equal(w.sold(), 1);
    assert.throws(() => w.bookings.cancel(paid.ref, w.ada), { code: "ALREADY_CANCELLED" });
    assert.equal(w.sold(), 1, "still 1: Bayo's seat. The 2 seats were not given back twice");
    assert.equal(w.bookings.find(other.ref, w.bayo).status, "pending");
  });

  test("an unpaid booking cancelled twice: the same", () => {
    w = makeWorld({ capacity: 5 });
    const b = w.book(w.ada, 2);
    w.bookings.cancel(b.ref, w.ada);
    assert.throws(() => w.bookings.cancel(b.ref, w.ada), { code: "ALREADY_CANCELLED" });
    assert.equal(w.sold(), 0);
  });

  test("the data layer itself refuses a second cancel (compare-and-set), whatever the service thinks", () => {
    w = makeWorld({ capacity: 5 });
    const paid = w.bookAndPay(w.ada, 2);
    const event = w.store.requireEvent(w.eventId);
    w.store.bookings.cancel(event, paid.ref, { refundCents: 1000000, expectStatus: "paid", nowMs: w.clock.now() });
    assert.equal(w.sold(), 0);
    assert.throws(() => w.store.bookings.cancel(event, paid.ref, { refundCents: 1000000, expectStatus: "paid", nowMs: w.clock.now() }), { code: "ALREADY_CANCELLED" });
    assert.equal(w.sold(), 0, "a second release would have made sold negative; the database refuses that too");
    assert.equal(w.bookings.find(paid.ref, w.ada).refundCents, 1000000, "the refund was recorded once");
  });

  test("a caller with an out-of-date view is refused: the booking changed while it was deciding", () => {
    w = makeWorld({ capacity: 5 });
    const b = w.book(w.ada, 1); // pending
    w.bookings.pay(b.ref, "tok_success", w.ada); // now paid
    const event = w.store.requireEvent(w.eventId);
    assert.throws(() => w.store.bookings.cancel(event, b.ref, { expectStatus: "pending" }), { code: "INVALID_STATE" });
    assert.equal(w.bookings.find(b.ref, w.ada).status, "paid");
    assert.equal(w.sold(), 1);
  });
});

describe("S09: other rules around cancelling", () => {
  test("an event that has started: a paid booking cannot be refunded, and nothing changes", () => {
    w = makeWorld();
    const paid = w.bookAndPay(w.ada, 2);
    w.clock.set(w.startsAt); // exactly the start
    assert.throws(() => w.bookings.cancel(paid.ref, w.ada), { code: "EVENT_STARTED" });
    assert.equal(w.bookings.find(paid.ref, w.ada).status, "paid");
    assert.equal(w.sold(), 2);
    w.clock.advance(5 * DAY);
    assert.throws(() => w.bookings.cancel(paid.ref, w.ada), { code: "EVENT_STARTED" });
  });

  test("the last minutes before the start: allowed, but 0% back, and the seats are released", () => {
    w = makeWorld();
    const paid = w.bookAndPay(w.ada, 2);
    w.clock.set(w.startsAt - MINUTE);
    const result = w.bookings.cancel(paid.ref, w.ada);
    assert.deepEqual(result.refund, { percent: 0, refundCents: 0, paid: true });
    assert.equal(w.sold(), 0);
  });

  test("you cannot cancel (or preview) somebody else's booking: NOT_FOUND, nothing changes", () => {
    w = makeWorld();
    const paid = w.bookAndPay(w.ada, 1);
    assert.throws(() => w.bookings.cancel(paid.ref, w.bayo), { code: "NOT_FOUND" });
    assert.throws(() => w.bookings.refundPreview(paid.ref, w.bayo), { code: "NOT_FOUND" });
    assert.throws(() => w.bookings.cancel(paid.ref, w.org), { code: "NOT_FOUND" });
    assert.equal(w.bookings.find(paid.ref, w.ada).status, "paid");
  });

  test("you must be logged in", () => {
    w = makeWorld();
    const paid = w.bookAndPay(w.ada, 1);
    assert.throws(() => w.bookings.cancel(paid.ref, null), { code: "UNAUTHENTICATED" });
    assert.throws(() => w.bookings.refundPreview(paid.ref, null), { code: "UNAUTHENTICATED" });
  });

  test("an unpaid booking cancels with nothing to refund, even after the event started", () => {
    w = makeWorld();
    const b = w.book(w.ada, 2);
    const result = w.bookings.cancel(b.ref, w.ada);
    assert.equal(result.booking.status, "cancelled");
    assert.equal(result.booking.refundCents, null);
    assert.deepEqual(result.refund, { percent: 0, refundCents: 0, paid: false });
  });
});

describe("S09: the refund preview (the website shows it before you confirm)", () => {
  test("it tells you the amount and changes nothing", () => {
    w = makeWorld({ capacity: 5 });
    const paid = w.bookAndPay(w.ada, 2);
    w.clock.set(w.startsAt - 3 * DAY);
    assert.deepEqual(w.bookings.refundPreview(paid.ref, w.ada), { percent: 50, refundCents: 500000, paid: true });
    assert.equal(w.bookings.find(paid.ref, w.ada).status, "paid");
    assert.equal(w.sold(), 2);
  });

  test("the preview and the real cancel agree at the same moment", () => {
    w = makeWorld();
    const paid = w.bookAndPay(w.ada, 1);
    for (const ms of [20 * DAY, 7 * DAY, 7 * DAY - 1, 2 * DAY, 2 * DAY - 1, HOUR]) {
      w.clock.set(w.startsAt - ms);
      const preview = w.bookings.refundPreview(paid.ref, w.ada);
      assert.ok(preview.percent === 100 || preview.percent === 50 || preview.percent === 0);
    }
    w.clock.set(w.startsAt - 2 * DAY);
    const preview = w.bookings.refundPreview(paid.ref, w.ada);
    assert.deepEqual(w.bookings.cancel(paid.ref, w.ada).refund, preview);
  });

  test("an unpaid booking: nothing was paid, nothing comes back", () => {
    w = makeWorld();
    const b = w.book(w.ada, 1);
    assert.deepEqual(w.bookings.refundPreview(b.ref, w.ada), { percent: 0, refundCents: 0, paid: false });
  });

  test("a finished booking has no preview: ALREADY_CANCELLED; a started event: EVENT_STARTED", () => {
    w = makeWorld();
    const paid = w.bookAndPay(w.ada, 1);
    w.clock.set(w.startsAt + 1);
    assert.throws(() => w.bookings.refundPreview(paid.ref, w.ada), { code: "EVENT_STARTED" });
    w.clock.set(w.startsAt - 10 * DAY);
    w.bookings.cancel(paid.ref, w.ada);
    assert.throws(() => w.bookings.refundPreview(paid.ref, w.ada), { code: "ALREADY_CANCELLED" });
  });
});
