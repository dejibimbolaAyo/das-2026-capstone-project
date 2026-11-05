import {
  createStore,
  bookTickets as bookDomainTickets,
  cancelBooking as cancelDomainBooking,
} from '../domain/inventory.js';

import { assertTransition } from '../domain/bookingStateMachine.js';
import { DomainError } from '../domain/errors.js';

// Create a booking
export async function createBooking(repository, tierId, userId, quantity) {
  const tier = await repository.getTierById(tierId);

  if (!tier) {
    throw new DomainError('NOT_FOUND', 'Ticket tier not found');
  }

  const event = await repository.getEventById(tier.eventId);

  if (!event || event.status !== 'published') {
    throw new DomainError('INVALID_STATE', 'Tickets can only be booked for published events');
  }

  const store = createStore();
  store.tiers.set(tier.id, tier);

  const booking = bookDomainTickets(store, tierId, userId, quantity);

  await repository.updateTier(tierId, tier);
  await repository.createBooking(booking);

  return booking;
}

// Pay for a booking
export async function payBooking(
  repository,
  reference,
  userId,
  paymentGateway,
  { decline = false } = {}
) {
  const booking = await repository.getBookingByReference(reference);

  if (!booking) {
    throw new DomainError('NOT_FOUND', 'Booking not found');
  }

  if (booking.userId !== userId) {
    throw new DomainError('FORBIDDEN', 'You can only pay for your own booking');
  }

  assertTransition(booking.status, 'paid');

  const payment = await paymentGateway.charge({ decline });

  if (payment.status === 'declined') {
    throw new DomainError('PAYMENT_DECLINED', 'Your payment was declined');
  }

  const updatedBooking = {
    ...booking,
    status: 'paid',
  };

  return repository.updateBooking(reference, updatedBooking);
}

// Cancel an unpaid booking
export async function cancelUnpaidBooking(repository, reference, userId) {
  const booking = await repository.getBookingByReference(reference);

  if (!booking) {
    throw new DomainError('NOT_FOUND', 'Booking not found');
  }

  if (booking.userId !== userId) {
    throw new DomainError('FORBIDDEN', 'You can only cancel your own booking');
  }

  // Only pending (unpaid) bookings can be cancelled
  if (booking.status !== 'pending') {
    throw new DomainError(
      'INVALID_TRANSITION',
      'Only unpaid bookings can be cancelled'
    );
  }

  assertTransition(booking.status, 'cancelled');

  const tier = await repository.getTierById(booking.tierId);

  const store = createStore();
  store.tiers.set(tier.id, tier);
  store.bookingsByReference.set(reference, booking);

  const cancelledBooking = cancelDomainBooking(store, reference);

  await repository.updateTier(tier.id, tier);
  await repository.updateBooking(reference, cancelledBooking);

  return cancelledBooking;
}

  