import { DomainError } from './errors.js';

export const BOOKING_STATES = Object.freeze({
  PENDING: 'pending',
  PAID: 'paid',
  CANCELLED: 'cancelled',
  REFUNDED: 'refunded',
  CHECKED_IN: 'checked_in',
});

export const states = Object.freeze(Object.values(BOOKING_STATES));
export const STATES = states;

export const ALLOWED_TRANSITIONS = Object.freeze({
  pending: Object.freeze(['paid', 'cancelled']),
  paid: Object.freeze(['checked_in', 'refunded', 'cancelled']),
  cancelled: Object.freeze([]),
  refunded: Object.freeze([]),
  checked_in: Object.freeze([]),
});

export function canTransition(from, to) {
  return Object.hasOwn(ALLOWED_TRANSITIONS, from)
    && ALLOWED_TRANSITIONS[from].includes(to);
}

export function assertTransition(from, to) {
  if (!canTransition(from, to)) {
    throw new DomainError(
      'INVALID_TRANSITION',
      `Cannot transition booking from ${from} to ${to}`,
    );
  }
  return true;
}
