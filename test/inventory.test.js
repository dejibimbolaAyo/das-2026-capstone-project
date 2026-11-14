import assert from "node:assert/strict";
import test from "node:test";
import {
  addTier,
  bookTickets,
  cancelBooking,
  createEvent,
  createStore,
  findBookingByReference,
  joinWaitlist,
} from "../src/domain/inventory.js";
import { DomainError } from "../src/domain/errors.js";
import { Queue } from "../src/domain/waitlistQueue.js";

function setup(capacity = 3) {
  const store = createStore();
  const event = createEvent(store, {
    title: "Test Event",
    city: "Wellington",
    venue: "Town Hall",
    date: "2027-02-01",
  });
  const tier = addTier(store, event.id, {
    name: "General",
    priceCents: 1250,
    capacity,
  });
  return { store, event, tier };
}

test("booking rejects sold-out quantities without changing inventory or bookings", () => {
  const { store, event, tier } = setup(1);
  const booking = bookTickets(store, {
    eventId: event.id,
    tierId: tier.id,
    attendeeName: "Avery",
    quantity: 1,
  });

  assert.throws(
    () => bookTickets(store, {
      eventId: event.id,
      tierId: tier.id,
      attendeeName: "Riley",
      quantity: 1,
    }),
    (error) => error instanceof DomainError && error.code === "SOLD_OUT",
  );
  assert.equal(tier.available, 0);
  assert.equal(store.bookingsByReference.size, 1);
  assert.equal(findBookingByReference(store, booking.reference), booking);
});

test("booking validates quantity and stores whole-cent totals", () => {
  const { store, event, tier } = setup();
  assert.throws(
    () => bookTickets(store, {
      eventId: event.id,
      tierId: tier.id,
      attendeeName: "Avery",
      quantity: 1.5,
    }),
    (error) => error instanceof DomainError && error.code === "VALIDATION",
  );

  const booking = bookTickets(store, {
    eventId: event.id,
    tierId: tier.id,
    attendeeName: "Avery",
    quantity: 2,
  });
  assert.equal(booking.totalCents, 2500);
  assert.equal(tier.available, 1);
});

test("cancellation restores seats once and rejects a repeated cancellation", () => {
  const { store, event, tier } = setup(2);
  const booking = bookTickets(store, {
    eventId: event.id,
    tierId: tier.id,
    attendeeName: "Avery",
    quantity: 2,
  });

  cancelBooking(store, booking.reference);
  assert.equal(tier.available, 2);
  assert.equal(booking.status, "CANCELLED");
  assert.throws(
    () => cancelBooking(store, booking.reference),
    (error) => error instanceof DomainError && error.code === "INVALID_STATE",
  );
  assert.equal(tier.available, 2);
});

test("waitlist accepts attendees only for a sold-out tier and preserves FIFO order", () => {
  const { store, event, tier } = setup(1);
  assert.throws(
    () => joinWaitlist(store, {
      eventId: event.id,
      tierId: tier.id,
      attendeeName: "Jordan",
    }),
    (error) => error instanceof DomainError && error.code === "NOT_SOLD_OUT",
  );

  bookTickets(store, {
    eventId: event.id,
    tierId: tier.id,
    attendeeName: "Avery",
    quantity: 1,
  });
  const first = joinWaitlist(store, {
    eventId: event.id,
    tierId: tier.id,
    attendeeName: "Jordan",
  });
  joinWaitlist(store, {
    eventId: event.id,
    tierId: tier.id,
    attendeeName: "Casey",
  });

  assert.equal(tier.waitlist.peek(), first);
  assert.equal(tier.waitlist.dequeue(), first);
});

test("linked queue handles empty reads and FIFO operations", () => {
  const queue = new Queue();
  assert.equal(queue.size, 0);
  assert.equal(queue.peek(), undefined);
  assert.equal(queue.dequeue(), undefined);

  queue.enqueue("first");
  queue.enqueue("second");
  assert.equal(queue.size, 2);
  assert.equal(queue.peek(), "first");
  assert.equal(queue.dequeue(), "first");
  assert.equal(queue.dequeue(), "second");
  assert.equal(queue.size, 0);
});
