import { DomainError } from "./errors.js";
import { seatsLeft } from "./events.js";
import { INITIAL_STATE, nextState, holdsSeats } from "./bookingStates.js";

// S06 says a booking is for 1 to 10 tickets.
export const MAX_PER_BOOKING = 10;

// The first two checks of S06: a name, and a quantity from 1 to 10.
// Shared by the in-memory BookingBook and the SQLite store, so both say the same thing.
export function checkBookingRequest(buyerName, quantity) {
  if (typeof buyerName !== "string" || buyerName.trim() === "") {
    throw new DomainError("VALIDATION", "A booking needs a buyer name.");
  }
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_PER_BOOKING) {
    throw new DomainError(
      "VALIDATION",
      `Quantity must be a whole number from 1 to ${MAX_PER_BOOKING}.`
    );
  }
}

// The BookingBook keeps every booking in a Map, keyed by reference code.
// Map lookup by key is O(1): it goes straight to the answer.
// Array.find is O(n): it checks one booking after another.
//
// Every status change goes through the state machine in bookingStates.js.
// This file never writes a status by hand, so an illegal move cannot slip through.
export class BookingBook {
  #byRef = new Map();
  #counter = 0;

  get size() {
    return this.#byRef.size;
  }

  #nextRef() {
    this.#counter++;
    return "BK-" + String(this.#counter).padStart(6, "0");
  }

  #getTier(event, tierId) {
    const tier = event.tiers.get(tierId);
    if (!tier) {
      throw new DomainError("NOT_FOUND", `No tier "${tierId}" on this event.`);
    }
    return tier;
  }

  // S06: book tickets.
  // Capacity rule: you only get seats if enough are left. All or nothing.
  // A new booking starts "pending". Paying it moves it to "paid".
  // userId = who owns the booking. holdExpiresAt = when an unpaid booking stops holding its seats.
  book(event, tierId, buyerName, quantity = 1, { userId = null, holdExpiresAt = null } = {}) {
    checkBookingRequest(buyerName, quantity);
    if (event.status !== "published") {
      throw new DomainError("NOT_PUBLISHED", "This event is not published, so it cannot be booked.");
    }
    const tier = this.#getTier(event, tierId);
    if (quantity > seatsLeft(tier)) {
      throw new DomainError(
        "SOLD_OUT",
        `Not enough seats in ${tier.name}: ${seatsLeft(tier)} left, ${quantity} wanted.`
      );
    }
    tier.sold += quantity;
    const booking = {
      ref: this.#nextRef(),
      eventId: event.id,
      tierId,
      buyerName,
      quantity,
      totalCents: tier.priceCents * quantity,
      status: INITIAL_STATE,
      userId,
      holdExpiresAt,
    };
    this.#byRef.set(booking.ref, booking);
    return booking;
  }

  // Fast lookup by reference code. O(1).
  find(ref) {
    return this.#byRef.get(ref);
  }

  // Mock payment. Only the state change happens here: pending -> paid.
  // (The pretend card and the API call come in Build 4.)
  // Paying a cancelled, expired, refunded or already paid booking is refused.
  pay(ref) {
    const booking = this.#byRef.get(ref);
    if (!booking) {
      throw new DomainError("NOT_FOUND", `No booking with code ${ref}.`);
    }
    booking.status = nextState(booking.status, "PAY"); // throws INVALID_STATE if not allowed
    return booking;
  }

  // Cancel a booking. pending -> cancelled, or paid -> refunded.
  // The seats go back. If someone is waiting, the person at the FRONT of the line
  // is named and leaves the line. (The refund AMOUNT and timed offers come in Build 8.)
  cancel(event, ref) {
    const booking = this.#byRef.get(ref);
    // A booking belongs to one event. Asking another event to cancel it is a mistake.
    if (!booking || booking.eventId !== event.id) {
      throw new DomainError("NOT_FOUND", `No booking with code ${ref}.`);
    }
    if (booking.status === "cancelled" || booking.status === "refunded") {
      throw new DomainError("ALREADY_CANCELLED", `Booking ${ref} is already cancelled.`);
    }
    const tier = this.#getTier(event, booking.tierId);
    const wasHoldingSeats = holdsSeats(booking.status);
    // Work out the next state FIRST. If the move is illegal this throws,
    // and nothing has been changed yet.
    const next = nextState(booking.status, "CANCEL");
    booking.status = next;
    // Seats are given back exactly once: only when leaving a seat-holding state.
    if (wasHoldingSeats && !holdsSeats(next)) {
      tier.sold -= booking.quantity;
    }
    const nextInLine = tier.waitlist.dequeue() ?? null;
    return { booking, nextInLine };
  }

  // Only a sold-out tier has a waitlist.
  joinWaitlist(event, tierId, name) {
    if (typeof name !== "string" || name.trim() === "") {
      throw new DomainError("VALIDATION", "A waitlist entry needs a name.");
    }
    const tier = this.#getTier(event, tierId);
    if (seatsLeft(tier) > 0) {
      throw new DomainError(
        "NOT_SOLD_OUT",
        `${tier.name} still has ${seatsLeft(tier)} seats. Book instead of waiting.`
      );
    }
    tier.waitlist.enqueue({ name });
    return tier.waitlist.size; // your place in line
  }

  // S13: only the bookings that belong to one user, newest first.
  listForUser(userId) {
    return [...this.#byRef.values()].filter((b) => b.userId === userId).reverse();
  }

  // Only used by the benchmark, to compare against Map.
  toArray() {
    return [...this.#byRef.values()];
  }
}
