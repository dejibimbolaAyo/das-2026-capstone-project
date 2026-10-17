import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { BookingBook } from "../src/bookings.js";
import { seatsLeft, unpublishEvent } from "../src/events.js";
import { makeEvent } from "./helpers.js";

// These follow the acceptance criteria for S06 in docs/user-stories.md.
describe("S06: book tickets", () => {
  test("3 seats left, book 2: a pending booking for 2 seats, priced in whole cents, 1 seat left", () => {
    const event = makeEvent({ capacity: 3, priceCents: 250000 });
    const book = new BookingBook();
    const booking = book.book(event, "ga", "Ada", 2);
    assert.equal(booking.status, "pending");
    assert.equal(booking.quantity, 2);
    assert.equal(booking.totalCents, 500000);
    assert.ok(Number.isInteger(booking.totalCents));
    assert.equal(seatsLeft(event.tiers.get("ga")), 1);
  });

  test("1 seat left, book 2: SOLD_OUT and nothing changes", () => {
    const event = makeEvent({ capacity: 3 });
    const book = new BookingBook();
    book.book(event, "ga", "Ada", 2);
    assert.throws(() => book.book(event, "ga", "Bola", 2), { code: "SOLD_OUT" });
    assert.equal(seatsLeft(event.tiers.get("ga")), 1);
    assert.equal(book.size, 1);
  });

  test("the last seat can be booked, and then the tier is sold out", () => {
    const event = makeEvent({ capacity: 1 });
    const book = new BookingBook();
    book.book(event, "ga", "Ada", 1);
    assert.equal(seatsLeft(event.tiers.get("ga")), 0);
    assert.throws(() => book.book(event, "ga", "Bola", 1), { code: "SOLD_OUT" });
  });

  test("quantity 0, negative, fractional, too big or not a number: VALIDATION", () => {
    const event = makeEvent({ capacity: 50 });
    const book = new BookingBook();
    for (const quantity of [0, -1, 1.5, 11, "2", NaN, null]) {
      assert.throws(
        () => book.book(event, "ga", "Ada", quantity),
        { code: "VALIDATION" },
        `quantity ${String(quantity)}`
      );
    }
    assert.equal(seatsLeft(event.tiers.get("ga")), 50);
    assert.equal(book.size, 0);
  });

  test("quantity 1 and quantity 10 are both allowed (edges of the range)", () => {
    const event = makeEvent({ capacity: 50 });
    const book = new BookingBook();
    assert.doesNotThrow(() => book.book(event, "ga", "Ada", 1));
    assert.doesNotThrow(() => book.book(event, "ga", "Bola", 10));
  });

  test("a missing buyer name is rejected", () => {
    const event = makeEvent();
    assert.throws(() => new BookingBook().book(event, "ga", "  ", 1), { code: "VALIDATION" });
  });

  test("an event that is not published cannot be booked", () => {
    const event = makeEvent({ publish: false });
    assert.throws(() => new BookingBook().book(event, "ga", "Ada", 1), { code: "NOT_PUBLISHED" });
    const live = makeEvent();
    unpublishEvent(live);
    assert.throws(() => new BookingBook().book(live, "ga", "Ada", 1), { code: "NOT_PUBLISHED" });
  });

  test("an unknown tier is NOT_FOUND", () => {
    const event = makeEvent();
    assert.throws(() => new BookingBook().book(event, "nope", "Ada", 1), { code: "NOT_FOUND" });
  });
});

describe("lookup by reference code", () => {
  test("find returns the booking, or undefined for an unknown code", () => {
    const event = makeEvent();
    const book = new BookingBook();
    const booking = book.book(event, "ga", "Ada", 1);
    assert.equal(book.find(booking.ref), booking);
    assert.equal(book.find("BK-999999"), undefined);
  });
});

describe("cancel and waitlist", () => {
  test("cancelling gives the seats back", () => {
    const event = makeEvent({ capacity: 3 });
    const book = new BookingBook();
    const booking = book.book(event, "ga", "Ada", 2);
    book.cancel(event, booking.ref);
    assert.equal(booking.status, "cancelled");
    assert.equal(seatsLeft(event.tiers.get("ga")), 3);
  });

  test("cancelling twice is rejected and the seats are not released twice", () => {
    const event = makeEvent({ capacity: 3 });
    const book = new BookingBook();
    const first = book.book(event, "ga", "Ada", 1);
    book.book(event, "ga", "Bola", 1);
    book.cancel(event, first.ref);
    assert.throws(() => book.cancel(event, first.ref), { code: "ALREADY_CANCELLED" });
    assert.equal(seatsLeft(event.tiers.get("ga")), 2); // 3 capacity - Bola's 1 seat
  });

  test("cancelling an unknown code is NOT_FOUND", () => {
    const event = makeEvent();
    assert.throws(() => new BookingBook().cancel(event, "BK-000001"), { code: "NOT_FOUND" });
  });

  test("you can only join the waitlist when the tier is sold out", () => {
    const event = makeEvent({ capacity: 2 });
    const book = new BookingBook();
    assert.throws(() => book.joinWaitlist(event, "ga", "Chidi"), { code: "NOT_SOLD_OUT" });
  });

  test("the waitlist is first in, first out: the first person in line is named on cancel", () => {
    const event = makeEvent({ capacity: 1 });
    const book = new BookingBook();
    const booking = book.book(event, "ga", "Ada", 1);
    assert.equal(book.joinWaitlist(event, "ga", "Chidi"), 1);
    assert.equal(book.joinWaitlist(event, "ga", "Dayo"), 2);
    const { nextInLine } = book.cancel(event, booking.ref);
    assert.equal(nextInLine.name, "Chidi");
    assert.equal(event.tiers.get("ga").waitlist.size, 1);
  });

  test("cancelling with nobody waiting names nobody", () => {
    const event = makeEvent();
    const book = new BookingBook();
    const booking = book.book(event, "ga", "Ada", 1);
    assert.equal(book.cancel(event, booking.ref).nextInLine, null);
  });
});
