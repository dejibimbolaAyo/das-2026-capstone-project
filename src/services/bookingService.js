import { DomainError } from "../errors.js";
import { nextState } from "../bookingStates.js";
import { chargeMock } from "../payment.js";
import { requireRole, requireLogin } from "./access.js";

// How long an unpaid booking is promised its seats. (Build 7 only SHOWS the deadline.
// Build 8 makes the server really release the seats when it passes.)
export const HOLD_MINUTES = 10;

// SERVICES layer: what an attendee wants to DO with bookings.
// A booking belongs to the attendee who made it. Nobody else can read or change it.
export function createBookingService(store, { now = Date.now } = {}) {
  // Look a booking up AND check it is yours. Someone else's looks like "not found".
  function find(ref, actor) {
    requireLogin(actor);
    const booking = store.bookings.find(ref);
    if (!booking || booking.userId === null || booking.userId !== actor.id) {
      throw new DomainError("NOT_FOUND", `No booking with code ${ref}.`);
    }
    return booking;
  }

  // The caller only knows the booking code. We find its event for them.
  // (Low-level step: call find(ref, actor) first. The public methods below do.)
  function cancel(ref, actor) {
    const booking = find(ref, actor);
    return store.bookings.cancel(store.requireEvent(booking.eventId), ref);
  }

  return {
    // S06: only attendees book. The booking is stamped with who made it and when the hold ends.
    book(eventId, tierId, buyerName, quantity, actor) {
      requireRole(actor, "attendee");
      if (typeof eventId !== "string" || typeof tierId !== "string") {
        throw new DomainError("VALIDATION", "A booking needs an eventId and a tierId.");
      }
      const holdExpiresAt = new Date(now() + HOLD_MINUTES * 60_000).toISOString();
      return store.bookings.book(store.requireEvent(eventId), tierId, buyerName, quantity, { userId: actor.id, holdExpiresAt });
    },

    find,

    // S13: "my tickets". Only this user's bookings.
    listMine(actor) {
      requireLogin(actor);
      return store.bookings.listForUser(actor.id);
    },

    // S07: pay with the mock payment.
    // Order matters: first check it is YOURS, then ask the state machine "is paying allowed?",
    // then charge, then change the booking. A declined payment therefore leaves it pending.
    pay(ref, paymentToken, actor) {
      const booking = find(ref, actor);
      nextState(booking.status, "PAY");
      chargeMock(paymentToken);
      return store.bookings.pay(ref);
    },

    cancel,

    // The API only cancels UNPAID bookings. A paid one needs a refund (Build 8).
    cancelUnpaid(ref, actor) {
      const booking = find(ref, actor);
      if (booking.status === "paid") {
        throw new DomainError(
          "INVALID_STATE",
          "A paid booking needs a refund. Refunds are built in Build 8."
        );
      }
      return cancel(ref, actor);
    },
  };
}
