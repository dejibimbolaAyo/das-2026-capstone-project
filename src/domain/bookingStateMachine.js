import { DomainError } from './errors.js';

// All valid booking states.
export const BOOKING_STATES = Object.freeze([
  'pending',
  'paid',
  'cancelled',
  'refunded',
  'checked_in',
]);

// Explicitly define every permitted transition.
const ALLOWED_TRANSITIONS = Object.freeze({
  pending: Object.freeze(['paid', 'cancelled']),
  paid: Object.freeze(['checked_in', 'refunded', 'cancelled']),
  cancelled: Object.freeze([]),
  refunded: Object.freeze([]),
  checked_in: Object.freeze([]),
});

// Check whether a booking can move from one state to another.
export function canTransition(from, to) {
  return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false;
}

// Enforce the booking state transition rules.
export function assertTransition(from, to) {
  if (!canTransition(from, to)) {
    throw new DomainError(
      'INVALID_TRANSITION',
      `Booking cannot transition from "${from}" to "${to}"`
    );
  }

  return true;
}