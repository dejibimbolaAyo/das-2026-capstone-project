import { DomainError } from "./errors.js";

// The life of a booking, written as an explicit state machine.
//
// A booking is always in exactly ONE state. Something happens to it (an EVENT).
// The table below says which state it moves to. If the table has no entry,
// that move is not allowed, and we refuse it.
//
// Money rules (refund amounts) and the expiry timer are built in Build 8.
// Build 3 only decides WHICH moves are allowed.

export const INITIAL_STATE = "pending";

export const STATES = ["pending", "paid", "cancelled", "expired", "refunded"];
export const EVENTS = ["PAY", "CANCEL", "EXPIRE"];

// state -> { event: next state }
const TRANSITIONS = Object.freeze({
  pending: Object.freeze({ PAY: "paid", CANCEL: "cancelled", EXPIRE: "expired" }),
  paid: Object.freeze({ CANCEL: "refunded" }),
  cancelled: Object.freeze({}),
  expired: Object.freeze({}),
  refunded: Object.freeze({}),
});

const VERBS = { PAY: "pay", CANCEL: "cancel", EXPIRE: "expire" };

// Object.hasOwn means odd words like "constructor" are not mistaken for states.
function isKnownState(state) {
  return Object.hasOwn(TRANSITIONS, state);
}

export function canTransition(state, event) {
  return isKnownState(state) && Object.hasOwn(TRANSITIONS[state], event);
}

// Returns the next state, or throws INVALID_STATE. It never changes anything itself.
export function nextState(state, event) {
  if (!isKnownState(state)) {
    throw new DomainError("INVALID_STATE", `Unknown booking state "${String(state)}".`);
  }
  if (!EVENTS.includes(event)) {
    throw new DomainError("INVALID_STATE", `Unknown booking event "${String(event)}".`);
  }
  if (!canTransition(state, event)) {
    throw new DomainError("INVALID_STATE", `Cannot ${VERBS[event]} a ${state} booking.`);
  }
  return TRANSITIONS[state][event];
}

// A final state has no way out.
export function isFinal(state) {
  return isKnownState(state) && Object.keys(TRANSITIONS[state]).length === 0;
}

// Pending and paid bookings are holding seats. Every other state has given them back.
export function holdsSeats(state) {
  return state === "pending" || state === "paid";
}
