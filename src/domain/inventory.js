// Build 1: the domain core, running entirely in memory.
// No server, no database. Just objects, Maps and rules.
//
// Build 4 splits the API side of this into src/services/ + src/repositories/.
// This file stays as the pure rules and keeps the terminal demos working; the
// services reuse the same validators, the state machine and the search rules.

import { newId, referenceCode } from './ids.js';
import { Queue } from './waitlistQueue.js';
import { DomainError } from './errors.js';
import {
  requireText,
  requireWholeNumber,
  requireValidDate,
  requireQuantity,
} from './validation.js';

export { MAX_TICKETS_PER_BOOKING } from './validation.js';

// Bookings in these states are holding seats. A cancelled one is not.
const HOLDS_SEATS = new Set(['pending', 'paid']);

export function createStore() {
  return {
    events: new Map(), // eventId -> event
    tiers: new Map(), // tierId -> tier
    bookings: new Map(), // bookingId -> booking
    bookingsByReference: new Map(), // reference -> booking  (hash map = O(1) lookup)
    waitlists: new Map(), // tierId -> Queue
  };
}

function getTier(store, tierId) {
  const tier = store.tiers.get(tierId);
  if (!tier) throw new DomainError('NOT_FOUND', 'Ticket tier not found');
  return tier;
}

export function createEvent(store, { title, city, venue = '', startsAt, organizerId }) {
  const date = requireValidDate(startsAt, 'startsAt');
  const event = {
    id: newId(),
    organizerId,
    title: requireText(title, 'Title'),
    city: requireText(city, 'City'),
    venue: String(venue).trim(),
    startsAt: date.toISOString(),
    status: 'draft',
    tierIds: [],
  };
  store.events.set(event.id, event);
  return event;
}

export function addTier(store, eventId, { name, priceCents, capacity }) {
  const event = store.events.get(eventId);
  if (!event) throw new DomainError('NOT_FOUND', 'Event not found');

  const tier = {
    id: newId(),
    eventId,
    name: requireText(name, 'Tier name'),
    // Money is ALWAYS whole cents. 0.1 + 0.2 !== 0.3 in floating point.
    priceCents: requireWholeNumber(priceCents, 'priceCents', 0),
    capacity: requireWholeNumber(capacity, 'capacity', 1),
    sold: 0,
  };
  store.tiers.set(tier.id, tier);
  store.waitlists.set(tier.id, new Queue());
  event.tierIds.push(tier.id);
  return tier;
}

export function seatsLeft(tier) {
  return tier.capacity - tier.sold;
}

export function bookTickets(store, tierId, userId, quantity) {
  const tier = getTier(store, tierId);
  requireQuantity(quantity);

  const left = seatsLeft(tier);
  if (left < quantity) {
    const message = left === 0 ? `${tier.name} is sold out` : `Only ${left} ticket(s) left in ${tier.name}`;
    throw new DomainError('SOLD_OUT', message, { seatsLeft: left });
  }

  tier.sold += quantity;

  let reference;
  do {
    reference = referenceCode();
  } while (store.bookingsByReference.has(reference));

  const booking = {
    id: newId(),
    reference,
    userId,
    tierId,
    quantity,
    amountCents: tier.priceCents * quantity,
    status: 'pending',
    createdAt: new Date().toISOString(),
  };
  store.bookings.set(booking.id, booking);
  store.bookingsByReference.set(reference, booking);
  return booking;
}

export function findBookingByReference(store, reference) {
  return store.bookingsByReference.get(reference);
}

export function cancelBooking(store, reference) {
  const booking = findBookingByReference(store, reference);
  if (!booking) throw new DomainError('NOT_FOUND', 'Booking not found');
  if (!HOLDS_SEATS.has(booking.status)) {
    throw new DomainError('INVALID_STATE', `A ${booking.status} booking cannot be cancelled`);
  }
  getTier(store, booking.tierId).sold -= booking.quantity;
  booking.status = 'cancelled';
  return booking;
}

export function joinWaitlist(store, tierId, userId, quantity) {
  const tier = getTier(store, tierId);
  requireQuantity(quantity);
  if (seatsLeft(tier) >= quantity) {
    throw new DomainError('NOT_SOLD_OUT', 'Seats are available, so book them instead');
  }
  const queue = store.waitlists.get(tierId);
  queue.enqueue({ userId, quantity });
  return { position: queue.size };
}

// Strict first-in-first-out: only the person at the head of the line is considered.
// Discussion question for class: what happens if the head wants 4 seats and only 1 is free?
export function offerNextOnWaitlist(store, tierId) {
  const tier = getTier(store, tierId);
  const queue = store.waitlists.get(tierId);
  const head = queue.peek();
  if (!head || seatsLeft(tier) < head.quantity) return undefined;
  return queue.dequeue();
}

export function publishEvent(store, eventId) {
  const event = store.events.get(eventId);
  if (!event) throw new DomainError('NOT_FOUND', 'Event not found');
  if (event.status === 'published') return event;
  if (!Array.isArray(event.tierIds) || event.tierIds.length === 0) {
    throw new DomainError('INVALID_STATE', 'Cannot publish an event with no ticket tiers');
  }
  event.status = 'published';
  return event;
}

export function unpublishEvent(store, eventId) {
  const event = store.events.get(eventId);
  if (!event) throw new DomainError('NOT_FOUND', 'Event not found');
  event.status = 'draft';
  return event;
}

// A public summary of an event, built from its tiers. Pure, so both the store
// version below and the Build 4 services can use it.
export function summariseEvent(event, tiers) {
  let minPriceCents = null;
  let totalSeatsLeft = 0;
  for (const tier of tiers) {
    if (minPriceCents === null || tier.priceCents < minPriceCents) minPriceCents = tier.priceCents;
    totalSeatsLeft += Math.max(0, tier.capacity - tier.sold);
  }
  return {
    id: event.id,
    title: event.title,
    city: event.city,
    venue: event.venue,
    startsAt: event.startsAt,
    status: event.status,
    minPriceCents,
    totalSeatsLeft,
    tierCount: tiers.length,
  };
}

export function listEventSummaries(store, { publishedOnly = true } = {}) {
  const results = [];
  for (const event of store.events.values()) {
    if (publishedOnly && event.status !== 'published') continue;
    const tiers = (event.tierIds || []).map((id) => store.tiers.get(id)).filter(Boolean);
    results.push(summariseEvent(event, tiers));
  }
  return results;
}
