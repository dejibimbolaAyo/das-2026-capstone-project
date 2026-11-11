// Input rules shared by the Build 1 in-memory store and the Build 4 services.
// Pure functions: they return a clean value or throw a DomainError.

import { DomainError } from './errors.js';

export const MAX_TICKETS_PER_BOOKING = 10;

export function requireText(value, field) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new DomainError('VALIDATION', `${field} is required`);
  }
  return value.trim();
}

export function requireWholeNumber(value, field, min) {
  if (!Number.isInteger(value) || value < min) {
    throw new DomainError('VALIDATION', `${field} must be a whole number of at least ${min}`);
  }
  return value;
}

export function requireDate(value, field) {
  const date = new Date(value);
  if (value === undefined || value === null || Number.isNaN(date.getTime())) {
    throw new DomainError('VALIDATION', `${field} must be a valid date`);
  }
  return date.toISOString();
}

export function requireQuantity(quantity) {
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_TICKETS_PER_BOOKING) {
    throw new DomainError('VALIDATION', `quantity must be between 1 and ${MAX_TICKETS_PER_BOOKING}`);
  }
  return quantity;
}

export function seatsLeft(tier) {
  return tier.capacity - tier.sold;
}

// The SOLD_OUT error, with a message that says how many seats are left.
export function soldOutError(tier) {
  const left = seatsLeft(tier);
  const message = left <= 0 ? `${tier.name} is sold out` : `Only ${left} ticket(s) left in ${tier.name}`;
  return new DomainError('SOLD_OUT', message, { seatsLeft: Math.max(left, 0) });
}

export function assertSeatsAvailable(tier, quantity) {
  if (seatsLeft(tier) < quantity) throw soldOutError(tier);
}
