import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { BookingBook } from "../src/bookings.js";
import { seatsLeft } from "../src/events.js";
import { makeEvent } from "./helpers.js";

// The state machine, working inside the real BookingBook.
describe("booking life cycle", () => {
  function setup(capacity = 5) {
    const event = makeEvent({ capacity });
    const tier = event.tiers.get("ga");
    return { event, tier, book: new BookingBook() };
  }

  test("a new booking is pending; paying it makes it paid and keeps its seats", () => {
    const { event, tier, book } = setup();
    const booking = book.book(event, "ga", "Ada", 2);
    assert.equal(booking.status, "pending");
    book.pay(booking.ref);
    assert.equal(booking.status, "paid");
    assert.equal(seatsLeft(tier), 3);
  });

  test("paying a cancelled booking is refused, and nothing changes", () => {
    const { event, tier, book } = setup();
    const booking = book.book(event, "ga", "Ada", 2);
    book.cancel(event, booking.ref);
    assert.equal(seatsLeft(tier), 5);
    assert.throws(() => book.pay(booking.ref), { code: "INVALID_STATE" });
    assert.equal(booking.status, "cancelled");
    assert.equal(seatsLeft(tier), 5); // the seats were not taken again
  });

  test("paying twice is refused", () => {
    const { event, book } = setup();
    const booking = book.book(event, "ga", "Ada", 1);
    book.pay(booking.ref);
    assert.throws(() => book.pay(booking.ref), { code: "INVALID_STATE" });
    assert.equal(booking.status, "paid");
  });

  test("paying a booking that does not exist is NOT_FOUND", () => {
    assert.throws(() => new BookingBook().pay("BK-000001"), { code: "NOT_FOUND" });
  });

  test("cancelling a pending booking gives its seats back", () => {
    const { event, tier, book } = setup();
    const booking = book.book(event, "ga", "Ada", 3);
    book.cancel(event, booking.ref);
    assert.equal(booking.status, "cancelled");
    assert.equal(seatsLeft(tier), 5);
  });

  test("cancelling a paid booking makes it refunded and gives its seats back once", () => {
    const { event, tier, book } = setup();
    const booking = book.book(event, "ga", "Ada", 2);
    book.book(event, "ga", "Bola", 1);
    book.pay(booking.ref);
    book.cancel(event, booking.ref);
    assert.equal(booking.status, "refunded");
    assert.equal(seatsLeft(tier), 4); // 5 seats - Bola's 1
    // cancelling again is refused and must NOT release the seats a second time
    assert.throws(() => book.cancel(event, booking.ref), { code: "ALREADY_CANCELLED" });
    assert.equal(seatsLeft(tier), 4);
  });

  test("cancelling twice is refused and the seats are not released twice", () => {
    const { event, tier, book } = setup();
    const first = book.book(event, "ga", "Ada", 1);
    book.book(event, "ga", "Bola", 1);
    book.cancel(event, first.ref);
    assert.throws(() => book.cancel(event, first.ref), { code: "ALREADY_CANCELLED" });
    assert.equal(seatsLeft(tier), 4);
  });

  test("a booking cannot be cancelled through a different event", () => {
    const one = makeEvent({ id: "one", capacity: 5 });
    const two = makeEvent({ id: "two", capacity: 5 });
    const book = new BookingBook();
    const booking = book.book(one, "ga", "Ada", 2);
    assert.throws(() => book.cancel(two, booking.ref), { code: "NOT_FOUND" });
    assert.equal(booking.status, "pending");
    assert.equal(seatsLeft(one.tiers.get("ga")), 3);
    assert.equal(seatsLeft(two.tiers.get("ga")), 5);
  });

  test("the first person on the waitlist is still named when a paid booking is cancelled", () => {
    const { event, book } = setup(1);
    const booking = book.book(event, "ga", "Ada", 1);
    book.pay(booking.ref);
    book.joinWaitlist(event, "ga", "Chidi");
    const { nextInLine } = book.cancel(event, booking.ref);
    assert.equal(nextInLine.name, "Chidi");
  });
});
