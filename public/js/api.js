// The API seam. Pages call only these functions and never call fetch.
// For now they read from mockData.js and return the same shapes as the real API
// (docs/api-examples.md). In Build 7 this ONE file switches to fetch('/api/...').

import { mockEvents } from './mockData.js';

const DELAY_MS = 300;          // pretend network time, so pages need a loading state
const HOLD_SECONDS = 10 * 60;  // how long a pending booking holds its seats (mock only)
const SUCCESS_TOKEN = 'tok_success';

// A working copy, so bookings change what the pages see.
const events = structuredClone(mockEvents);
const bookings = new Map();
let bookingCounter = 0;

function wait() {
  return new Promise((resolve) => setTimeout(resolve, DELAY_MS));
}

// Same shape as the real error body: { code, message }, plus the HTTP status.
function apiError(status, code, message) {
  return Object.assign(new Error(message), { status, code });
}

function copy(value) {
  return structuredClone(value);
}

function lowestPrice(event) {
  return Math.min(...event.tiers.map((t) => t.priceCents));
}

function seatsLeft(event) {
  return event.tiers.reduce((sum, t) => sum + t.seatsLeft, 0);
}

// GET /api/events -> { events: [...] }
export async function listEvents({ q = '', city = '', maxPriceCents, onlyAvailable = false, sort = 'date' } = {}) {
  await wait();
  const needle = q.trim().toLowerCase();
  let result = events.filter((e) => e.status === 'published');
  if (needle) result = result.filter((e) => `${e.title} ${e.venue}`.toLowerCase().includes(needle));
  if (city) result = result.filter((e) => e.city.toLowerCase() === city.toLowerCase());
  if (Number.isFinite(maxPriceCents)) result = result.filter((e) => lowestPrice(e) <= maxPriceCents);
  if (onlyAvailable) result = result.filter((e) => seatsLeft(e) > 0);

  const sorters = {
    date: (a, b) => a.startsAt.localeCompare(b.startsAt),
    price: (a, b) => lowestPrice(a) - lowestPrice(b),
    availability: (a, b) => seatsLeft(b) - seatsLeft(a),
  };
  result = [...result].sort(sorters[sort] ?? sorters.date);
  return { events: copy(result) };
}

// GET /api/events/:id -> the event with its tiers
export async function getEvent(id) {
  await wait();
  const event = events.find((e) => e.id === id && e.status === 'published');
  if (!event) throw apiError(404, 'NOT_FOUND', 'No such event');
  return copy(event);
}

// POST /api/bookings -> a pending booking
export async function createBooking({ tierId, quantity }) {
  await wait();
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 10) {
    throw apiError(400, 'VALIDATION', 'Quantity must be a whole number from 1 to 10');
  }
  const event = events.find((e) => e.tiers.some((t) => t.id === tierId));
  const tier = event?.tiers.find((t) => t.id === tierId);
  if (!tier) throw apiError(404, 'NOT_FOUND', 'No such ticket tier');
  if (quantity > tier.seatsLeft) {
    throw apiError(409, 'SOLD_OUT', `Only ${tier.seatsLeft} ticket(s) left in ${tier.name}`);
  }
  tier.sold += quantity;
  tier.seatsLeft -= quantity;

  bookingCounter += 1;
  const booking = {
    reference: `BK-${String(bookingCounter).padStart(4, '0')}`,
    eventId: event.id,
    tierId,
    quantity,
    amountCents: tier.priceCents * quantity,
    status: 'pending',
    holdUntil: new Date(Date.now() + HOLD_SECONDS * 1000).toISOString(), // the real API gets this in Build 8
  };
  bookings.set(booking.reference, booking);
  return copy(booking);
}

// POST /api/bookings/:reference/pay. tok_success pays, anything else is declined.
export async function pay(reference, paymentToken) {
  await wait();
  const booking = bookings.get(reference);
  if (!booking) throw apiError(404, 'NOT_FOUND', 'No such booking');
  if (booking.status === 'paid') return copy(booking);
  if (paymentToken !== SUCCESS_TOKEN) {
    // The booking stays pending, so the user can try again.
    throw apiError(402, 'PAYMENT_DECLINED', 'Card declined');
  }
  booking.status = 'paid';
  return copy(booking);
}
