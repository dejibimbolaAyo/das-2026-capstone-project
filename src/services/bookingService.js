import { DomainError } from "../errors.js";
import { nextState } from "../bookingStates.js";
import { chargeMock, refundMock } from "../payment.js";
import { calculateRefund, eventStartsAt } from "../domain/refundPolicy.js";
import { HOLD_MINUTES, HOLD_MS, OFFER_MS } from "../holds.js";
import { requireRole, requireLogin } from "./access.js";
import { createSeatService } from "./seatService.js";

export { HOLD_MINUTES };

// SERVICES layer: what an attendee wants to DO with bookings.
// A booking belongs to the attendee who made it. Nobody else can read or change it.
//
// Since Build 8 the server really enforces the hold: an unpaid booking whose time has run out
// becomes "expired", its seats are given back, and paying it is refused (BOOKING_EXPIRED).
// Every call below first runs the seat service's sweep, so that is true at the exact moment you ask.
export function createBookingService(store, { now = Date.now, holdMs = HOLD_MS, offerMs = OFFER_MS } = {}) {
  const seats = createSeatService(store, { now, offerMs });

  // Look a booking up AND check it is yours. Someone else's looks like "not found".
  function find(ref, actor) {
    requireLogin(actor);
    seats.sweep();
    const booking = store.bookings.find(ref);
    if (!booking || booking.userId === null || booking.userId !== actor.id) {
      throw new DomainError("NOT_FOUND", `No booking with code ${ref}.`);
    }
    return booking;
  }

  const isFinished = (status) => status === "cancelled" || status === "refunded" || status === "expired";

  // What would cancelling give back, right now? Unpaid: nothing was paid, so nothing comes back.
  function refundFor(booking) {
    if (isFinished(booking.status)) {
      throw new DomainError("ALREADY_CANCELLED", `Booking ${booking.ref} is already cancelled.`);
    }
    if (booking.status !== "paid") return { percent: 0, refundCents: 0, paid: false };
    const event = store.requireEvent(booking.eventId);
    const { percent, refundCents } = calculateRefund({
      amountCents: booking.totalCents,
      startsAt: eventStartsAt(event.date),
      now: now(),
    });
    return { percent, refundCents, paid: true };
  }

  return {
    // S06: only attendees book. The booking is stamped with who made it and when the hold ends.
    book(eventId, tierId, buyerName, quantity, actor) {
      requireRole(actor, "attendee");
      if (typeof eventId !== "string" || typeof tierId !== "string") {
        throw new DomainError("VALIDATION", "A booking needs an eventId and a tierId.");
      }
      seats.sweep(); // seats whose time ran out are free again before we count
      const holdExpiresAt = new Date(now() + holdMs).toISOString();
      return store.bookings.book(store.requireEvent(eventId), tierId, buyerName, quantity, { userId: actor.id, holdExpiresAt });
    },

    find,

    // S13: "my tickets". Only this user's bookings.
    listMine(actor) {
      requireLogin(actor);
      seats.sweep();
      return store.bookings.listForUser(actor.id);
    },

    // S07: pay with the mock payment.
    // Order matters: first check it is YOURS (this also lets an overdue hold expire), then say
    // BOOKING_EXPIRED if it did, then ask the state machine "is paying allowed?", then charge,
    // then change the booking. A declined payment therefore leaves it pending.
    pay(ref, paymentToken, actor) {
      const booking = find(ref, actor);
      if (booking.status === "expired") {
        throw new DomainError("BOOKING_EXPIRED", "The time to pay for this booking has run out. The seats were released.");
      }
      nextState(booking.status, "PAY");
      chargeMock(paymentToken);
      return store.bookings.pay(ref);
    },

    // S09 (preview): how much would you get back if you cancelled now? Changes nothing.
    refundPreview(ref, actor) {
      return refundFor(find(ref, actor));
    },

    // S09: cancel. Unpaid: seats back. Paid: the refund the POLICY gives, seats back, once.
    // Order matters for money:
    //   1. work out the refund (a started event is refused here, before anything changes)
    //   2. in ONE data step: compare-and-set the status AND give the seats back AND offer them on
    //   3. only then tell the (mock) payment gateway to send the money
    // Step 2 can succeed only once per booking, so the money can only be sent once.
    cancel(ref, actor) {
      const booking = find(ref, actor);
      const refund = refundFor(booking);
      const result = store.bookings.cancel(store.requireEvent(booking.eventId), ref, {
        refundCents: booking.status === "paid" ? refund.refundCents : null,
        expectStatus: booking.status,
        nowMs: now(),
        offerMs,
      });
      if (booking.status === "paid") refundMock(refund.refundCents);
      return { booking: result.booking, refund, nextInLine: result.nextInLine };
    },
  };
}
