// Build 4/7: the booking rules.
//
// Receives the repository and a payment gateway. Reuses the shared state
// machine so allowed moves between booking states are defined in one place.
//
// From Build 7 every method takes the caller's id. A booking belongs to the
// person who made it: paying, cancelling or reading someone else's booking is
// refused with FORBIDDEN, and "my bookings" only ever returns the caller's own.

import { DomainError } from '../domain/errors.js';
import { newId, referenceCode } from '../domain/ids.js';
import { seatsLeft } from '../domain/inventory.js';
import { requireQuantity } from '../domain/validation.js';
import { assertTransition } from '../domain/bookingStateMachine.js';

export function createBookingService(repository, paymentGateway) {
  async function getBookingOrThrow(reference) {
    const booking = await repository.findBookingByReference(reference);
    if (!booking) throw new DomainError('NOT_FOUND', 'Booking not found');
    return booking;
  }

  function assertOwner(booking, userId) {
    if (booking.userId !== userId) {
      throw new DomainError('FORBIDDEN', 'This booking belongs to someone else');
    }
  }

  async function uniqueReference() {
    let reference;
    let taken = true;
    while (taken) {
      reference = referenceCode();
      taken = (await repository.findBookingByReference(reference)) !== null;
    }
    return reference;
  }

  // A booking row only stores the tier id, but "my tickets" should say which
  // event and tier it is for. The two READ paths below add the few fields the
  // screen shows. This runs only for the caller's own booking, so it can never
  // expose anyone else's data.
  async function withEventContext(booking) {
    const tier = await repository.findTierById(booking.tierId);
    const event = tier ? await repository.findEventById(tier.eventId) : null;
    return {
      ...booking,
      tierName: tier?.name ?? null,
      eventId: event?.id ?? null,
      eventTitle: event?.title ?? null,
      eventCity: event?.city ?? null,
      eventVenue: event?.venue ?? null,
      eventStartsAt: event?.startsAt ?? null,
    };
  }

  return {
    async book({ tierId, userId, quantity }) {
      requireQuantity(quantity);
      if (!userId) throw new DomainError('UNAUTHENTICATED', 'Authentication required');

      const tier = await repository.findTierById(tierId);
      if (!tier) throw new DomainError('NOT_FOUND', 'Ticket tier not found');

      // Reserve the seats FIRST, atomically, and only then build the booking.
      // If two callers race for the last seat, exactly one UPDATE changes a row
      // (the other gets changes = 0) so only one wins. Never check then save:
      // an await between the two lets another caller slip in.
      const won = await repository.reserveSeats(tierId, quantity);
      if (!won) {
        const fresh = await repository.findTierById(tierId);
        const left = fresh ? seatsLeft(fresh) : 0;
        const message = left <= 0
          ? `${tier.name} is sold out`
          : `Only ${left} ticket(s) left in ${tier.name}`;
        throw new DomainError('SOLD_OUT', message, { seatsLeft: left });
      }

      const booking = {
        id: newId(),
        reference: await uniqueReference(),
        userId,
        tierId,
        quantity,
        amountCents: tier.priceCents * quantity,
        status: 'pending',
        createdAt: new Date().toISOString(),
      };

      return repository.saveBooking(booking);
    },

    // Pay for an unpaid booking with the mock gateway. A decline leaves the
    // booking pending, and a card is only charged once (the state machine stops
    // a second charge).
    async pay({ reference, userId, card }) {
      const booking = await getBookingOrThrow(reference);
      assertOwner(booking, userId);
      assertTransition(booking.status, 'paid');

      const result = await paymentGateway.charge({
        amountCents: booking.amountCents,
        reference: booking.reference,
        card,
      });
      if (!result.ok) {
        throw new DomainError('PAYMENT_DECLINED', result.message ?? 'The card was declined');
      }

      booking.status = 'paid';
      booking.paymentId = result.paymentId;
      booking.paidAt = new Date().toISOString();
      return repository.saveBooking(booking);
    },

    // Build 4 only cancels UNPAID (pending) bookings and returns the seats.
    // Refunds arrive in Build 8.
    async cancel({ reference, userId }) {
      const booking = await getBookingOrThrow(reference);
      assertOwner(booking, userId);
      if (booking.status !== 'pending') {
        throw new DomainError('INVALID_TRANSITION', 'Only an unpaid booking can be cancelled');
      }

      // Give the seats back with the same atomic step, never a bare assignment.
      await repository.releaseSeats(booking.tierId, booking.quantity);

      booking.status = 'cancelled';
      booking.cancelledAt = new Date().toISOString();
      return repository.saveBooking(booking);
    },

    // S13: only the owner may read a booking. A caller who asks for someone
    // else's booking is refused with FORBIDDEN, the code the acceptance criteria
    // name, and the answer only ever carries the caller's own data.
    async getBooking(reference, userId) {
      const booking = await getBookingOrThrow(reference);
      assertOwner(booking, userId);
      return withEventContext(booking);
    },

    // The "my tickets" screen: never every booking, only the caller's.
    async listForUser(userId) {
      if (!userId) throw new DomainError('UNAUTHENTICATED', 'Authentication required');
      const mine = typeof repository.listBookingsForUser === 'function'
        ? await repository.listBookingsForUser(userId)
        : (await repository.listBookings()).filter((booking) => booking.userId === userId);
      return Promise.all(mine.map(withEventContext));
    },
  };
}
