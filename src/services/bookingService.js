// Booking rules for the API: book, pay (mock), cancel.
//
// Overselling (Build 5): in Build 4 we read the tier, checked for room, and then
// saved `sold + quantity`. With an `await` between the read and the save, fifty
// requests could all read "1 seat left" and all succeed. Now the repository
// checks and takes the seats in one atomic step (`reserveSeats`), and the
// number of rows it changed tells us whether we won the seat.

import { assertTransition } from '../domain/bookingStateMachine.js';
import { DomainError } from '../domain/errors.js';
import { newId, referenceCode } from '../domain/ids.js';
import { requireQuantity, requireText, soldOutError } from '../domain/validation.js';
import { requireActor } from './eventService.js';

function toPublicBooking(booking) {
  const { id, userId, chargeId, ...visible } = booking;
  return visible;
}

export function createBookingService({ repository, paymentGateway, now = () => new Date() }) {
  async function getOwnBooking(actorId, reference) {
    const booking = await repository.findBookingByReference(String(reference).toUpperCase());
    if (!booking) throw new DomainError('NOT_FOUND', 'Booking not found');
    if (booking.userId !== actorId) {
      throw new DomainError('FORBIDDEN', 'Only the person who made this booking can do that');
    }
    return booking;
  }

  async function uniqueReference() {
    let reference;
    do {
      reference = referenceCode();
    } while (await repository.findBookingByReference(reference));
    return reference;
  }

  return {
    async book(actorId, input) {
      const userId = requireActor(actorId);
      if (input === null || typeof input !== 'object' || Array.isArray(input)) {
        throw new DomainError('VALIDATION', 'Request body must be a JSON object');
      }
      const { tierId, quantity } = input;
      requireText(tierId, 'tierId');
      requireQuantity(quantity);

      const tier = await repository.findTier(tierId);
      if (!tier) throw new DomainError('NOT_FOUND', 'Ticket tier not found');
      const event = await repository.findEvent(tier.eventId);
      if (!event || event.status !== 'published') {
        throw new DomainError('INVALID_STATE', 'This event is not open for booking');
      }

      // One atomic step decides who gets the seats. No check before it: a check
      // here would read a number that may already be out of date.
      if (!(await repository.reserveSeats(tierId, quantity))) {
        // Read again only to say how many seats are left in the message.
        throw soldOutError((await repository.findTier(tierId)) ?? tier);
      }

      const booking = {
        id: newId(),
        reference: await uniqueReference(),
        userId,
        eventId: event.id,
        tierId,
        quantity,
        amountCents: tier.priceCents * quantity,
        status: 'pending',
        createdAt: now().toISOString(),
      };
      try {
        return toPublicBooking(await repository.insertBooking(booking));
      } catch (error) {
        // The seats are ours but the booking was not saved: give them back.
        await repository.releaseSeats(tierId, quantity);
        throw error;
      }
    },

    async getBooking(actorId, reference) {
      return toPublicBooking(await getOwnBooking(requireActor(actorId), reference));
    },

    async pay(actorId, reference, input) {
      const booking = await getOwnBooking(requireActor(actorId), reference);
      // Paying a paid or cancelled booking is refused before any money moves.
      assertTransition(booking.status, 'paid');
      const paymentToken = requireText(input?.paymentToken, 'paymentToken');

      // The booking reference is the idempotency key: even if two pay requests
      // race past the check above, the gateway charges only once.
      const charge = await paymentGateway.charge({
        amountCents: booking.amountCents,
        paymentToken,
        idempotencyKey: booking.reference,
      });
      if (charge.status !== 'succeeded') {
        // The booking stays pending, so the attendee can try again.
        throw new DomainError('PAYMENT_DECLINED', 'The card was declined. Try another card.');
      }

      const paid = { ...booking, status: 'paid', chargeId: charge.chargeId, paidAt: now().toISOString() };
      return toPublicBooking(await repository.updateBooking(paid));
    },

    async cancel(actorId, reference) {
      const booking = await getOwnBooking(requireActor(actorId), reference);
      assertTransition(booking.status, 'cancelled');
      if (booking.status !== 'pending') {
        // Cancelling a paid booking means a refund. That arrives in Build 8.
        throw new DomainError('INVALID_STATE', 'Only unpaid bookings can be cancelled for now');
      }

      await repository.releaseSeats(booking.tierId, booking.quantity);
      const cancelled = { ...booking, status: 'cancelled', cancelledAt: now().toISOString() };
      return toPublicBooking(await repository.updateBooking(cancelled));
    },
  };
}
