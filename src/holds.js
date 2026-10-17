// How long things are promised to a person. Kept in one place so the rules, the store and the
// tests all use the same numbers.

// An unpaid booking keeps its seats for this long. After that the server lets them go.
export const HOLD_MINUTES = 10;

// A waitlist OFFER keeps its seat for this long. If the person does not accept in time,
// the seat passes to the next person in line.
export const OFFER_MINUTES = 15;

export const HOLD_MS = HOLD_MINUTES * 60_000;
export const OFFER_MS = OFFER_MINUTES * 60_000;
