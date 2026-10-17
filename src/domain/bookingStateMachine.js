// Build 3: the booking life cycle as an explicit state machine.
//
// A booking is only ever in one of these five states, and it may only move along
// the arrows below. Everything else is an INVALID_TRANSITION.
//
//   pending ──▶ paid ──▶ checked_in   (final)
//      │          ├──▶ refunded       (final)
//      │          └──▶ cancelled      (final)
//      └──▶ cancelled                 (final)

import { DomainError } from './errors.js';

export const BOOKING_STATES = ['pending', 'paid', 'cancelled', 'refunded', 'checked_in'];

// States you cannot leave. Once a booking is cancelled, refunded or checked in,
// it stays there forever.
export const FINAL_STATES = new Set(['cancelled', 'refunded', 'checked_in']);

// The whole graph, as data: for each state, the states it may move to.
export const ALLOWED_TRANSITIONS = Object.freeze({
  pending: Object.freeze(['paid', 'cancelled']),
  paid: Object.freeze(['checked_in', 'refunded', 'cancelled']),
  cancelled: Object.freeze([]),
  refunded: Object.freeze([]),
  checked_in: Object.freeze([]),
});

export function isKnownState(state) {
  return Object.prototype.hasOwnProperty.call(ALLOWED_TRANSITIONS, state);
}

export function isFinalState(state) {
  return FINAL_STATES.has(state);
}

export function canTransition(from, to) {
  if (!isKnownState(from)) return false;
  return ALLOWED_TRANSITIONS[from].includes(to);
}

// Throws a DomainError (code INVALID_TRANSITION) for any move that is not allowed.
export function assertTransition(from, to) {
  if (!canTransition(from, to)) {
    throw new DomainError('INVALID_TRANSITION', `A ${from} booking cannot move to ${to}`);
  }
  return to;
}
