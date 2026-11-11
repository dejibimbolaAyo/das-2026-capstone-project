import { DomainError } from './errors.js';

export const BOOKING_STATES = Object.freeze([
  'pending',
  'paid',
  'cancelled',
  'refunded',
  'checked_in',
]);

export const BOOKING_TRANSITIONS = Object.freeze({
  pending: Object.freeze(['paid', 'cancelled']),
  paid: Object.freeze(['checked_in', 'refunded', 'cancelled']),
  cancelled: Object.freeze([]),
  refunded: Object.freeze([]),
  checked_in: Object.freeze([]),
});

export function canTransition(from, to) {
  return Object.hasOwn(BOOKING_TRANSITIONS, from) && BOOKING_TRANSITIONS[from].includes(to);
}

export function assertTransition(from, to) {
  if (!canTransition(from, to)) {
    throw new DomainError('INVALID_TRANSITION', `Cannot transition booking from ${from} to ${to}`);
  }
  return true;
}
