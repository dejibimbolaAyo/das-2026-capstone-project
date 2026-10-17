import { DomainError } from "../errors.js";

// S09: how much money comes back when a PAID booking is cancelled.
// It depends only on how long is left before the event starts.
//
//   7 days or more   -> 100%
//   2 days or more   ->  50%
//   less than 2 days ->   0%   (the seats are still given back, only the money is not)
//
// A boundary belongs to the BETTER tier: exactly 7 days is 100%, exactly 2 days is 50%.
// An event that has started cannot be refunded at all (EVENT_STARTED).
//
// This is a PURE function: it only looks at its inputs, so it is easy to test.

const DAY_MS = 24 * 60 * 60 * 1000;

export const REFUND_TIERS = Object.freeze([
  { minDays: 7, percent: 100 },
  { minDays: 2, percent: 50 },
  { minDays: 0, percent: 0 },
]);

function toMs(value, what) {
  const ms = value instanceof Date ? value.getTime() : typeof value === "string" ? Date.parse(value) : value;
  if (!Number.isFinite(ms)) throw new DomainError("VALIDATION", `${what} must be a real time.`);
  return ms;
}

// Events only have a DATE for now (like 2026-12-31), so the event starts at the very
// beginning of that day (midnight, UTC). Build 9 or later can add a start time.
export function eventStartsAt(dateText) {
  return Date.parse(`${dateText}T00:00:00Z`);
}

// amountCents: whole cents that were paid. startsAt and now: milliseconds, a Date, or date text.
// Returns { percent, refundCents }. Cents are rounded DOWN (Math.floor), never up.
export function calculateRefund({ amountCents, startsAt, now }) {
  if (!Number.isSafeInteger(amountCents) || amountCents < 0) {
    throw new DomainError("VALIDATION", "amountCents must be a whole number of cents, 0 or more.");
  }
  const msLeft = toMs(startsAt, "startsAt") - toMs(now, "now");
  if (msLeft <= 0) {
    throw new DomainError("EVENT_STARTED", "This event has already started, so it can no longer be refunded.");
  }
  const tier = REFUND_TIERS.find((t) => msLeft >= t.minDays * DAY_MS);
  return { percent: tier.percent, refundCents: Math.floor((amountCents * tier.percent) / 100) };
}
