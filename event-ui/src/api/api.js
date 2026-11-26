// The API seam. The only file that knows URLs, headers and the token.
// Build 9: every request carries "Authorization: Bearer <token>" when someone is logged in.

import { clearSession, loadSession, SESSION_EXPIRED } from './session.js';

const HOLD_SECONDS = 10 * 60; // the server does not send holdUntil, so we work it out

async function request(path, { method = 'GET', body } = {}) {
  const token = loadSession()?.token;
  let response;
  try {
    response = await fetch(path, {
      method,
      headers: {
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...(body ? { 'content-type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw Object.assign(new Error('Cannot reach the server. Is it running?'), { status: 0, code: 'NETWORK' });
  }

  let data = null;
  try {
    data = await response.json();
  } catch {
    // an empty or non-JSON body: handled below
  }

  if (!response.ok) {
    const { code = 'ERROR', message = 'Something went wrong' } = data?.error ?? {};
    // A token that the server no longer accepts (expired, forged, secret changed):
    // forget it and tell the app, so it can show the login page.
    if (response.status === 401 && code === 'UNAUTHENTICATED' && token) {
      clearSession();
      window.dispatchEvent(new Event(SESSION_EXPIRED));
    }
    throw Object.assign(new Error(message), { status: response.status, code });
  }
  return data;
}

function withHold(booking) {
  const created = new Date(booking.createdAt ?? Date.now()).getTime();
  return { ...booking, holdUntil: booking.holdUntil ?? new Date(created + HOLD_SECONDS * 1000).toISOString() };
}

// ---- accounts ----

// POST /api/auth/signup -> { token, user }
export function signup({ name, email, password, role }) {
  return request('/api/auth/signup', { method: 'POST', body: { name, email, password, role } });
}

// POST /api/auth/login -> { token, user }
export function login({ email, password }) {
  return request('/api/auth/login', { method: 'POST', body: { email, password } });
}

// GET /api/auth/me -> the user the token belongs to
export function me() {
  return request('/api/auth/me');
}

// ---- events (everyone) ----

// GET /api/events -> { events, total, limit, offset }. One page at a time.
export function listEvents({ q = '', city = '', maxPriceCents, onlyAvailable = false, sort = 'date', limit = 20, offset = 0 } = {}) {
  const params = new URLSearchParams();
  if (q.trim()) params.set('q', q.trim());
  if (city) params.set('city', city);
  if (Number.isFinite(maxPriceCents)) params.set('maxPriceCents', String(maxPriceCents));
  if (onlyAvailable) params.set('onlyAvailable', 'true');
  params.set('sort', sort);
  params.set('limit', String(limit));
  params.set('offset', String(offset));
  return request(`/api/events?${params}`);
}

export function getEvent(id) {
  return request(`/api/events/${encodeURIComponent(id)}`);
}

// ---- attendee ----

export async function createBooking({ tierId, quantity }) {
  return withHold(await request('/api/bookings', { method: 'POST', body: { tierId, quantity } }));
}

export async function pay(reference, paymentToken) {
  return withHold(await request(`/api/bookings/${encodeURIComponent(reference)}/pay`, { method: 'POST', body: { paymentToken } }));
}

// GET /api/bookings -> { bookings: [...] }, newest first, only the caller's own
export function listMyBookings() {
  return request('/api/bookings');
}

// ---- organizer ----

// GET /api/my/events -> { events: [...] }, drafts included
export function listMyEvents() {
  return request('/api/my/events');
}

export function createEvent({ title, city, venue, startsAt }) {
  return request('/api/events', { method: 'POST', body: { title, city, venue, startsAt } });
}

export function addTier(eventId, { name, priceCents, capacity }) {
  return request(`/api/events/${encodeURIComponent(eventId)}/tiers`, { method: 'POST', body: { name, priceCents, capacity } });
}

export function publishEvent(eventId) {
  return request(`/api/events/${encodeURIComponent(eventId)}/publish`, { method: 'POST' });
}

export function unpublishEvent(eventId) {
  return request(`/api/events/${encodeURIComponent(eventId)}/unpublish`, { method: 'POST' });
}
