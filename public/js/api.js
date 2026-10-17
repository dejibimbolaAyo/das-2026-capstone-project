// Build 7: the ONE place the browser pages get data from - now the real API.
//
// Every function returns a Promise and resolves to the same shapes the mock
// api.js returned in Build 6, so the pages did not have to change. The bodies
// are now `fetch` calls to src/http/routes.js, and the token from session.js is
// sent as `Authorization: Bearer <token>`.
//
// The pages must never call fetch directly; they import from here.
//
// The Build 6 copy of the search/filter/sort rules is GONE: the server does the
// filtering now, and this file only turns the filter object into a query string.

import { getSession, setSession, clearSession } from './session.js';

// An error the same shape as the API's {"error":{"code","message"}}: the pages
// catch an ApiError and read `.code`, exactly as they did on mock data.
export class ApiError extends Error {
  constructor(code, message, status) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
  }
}

function queryString(filters = {}) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value === undefined || value === null || value === '' || value === false) continue;
    params.set(key, String(value));
  }
  const text = params.toString();
  return text === '' ? '' : `?${text}`;
}

async function request(path, { method = 'GET', body, auth = false } = {}) {
  const headers = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  const token = getSession()?.token ?? null;
  // `auth` forces the token; public calls still send it when they have one, so
  // the owner can see their own draft on /api/events/:id.
  if (token) headers.Authorization = `Bearer ${token}`;
  else if (auth) throw new ApiError('UNAUTHENTICATED', 'Please log in first.');

  let response;
  try {
    response = await fetch(path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError('NETWORK', 'Could not reach the server. Is it running?');
  }

  const text = await response.text();
  let payload = null;
  if (text !== '') {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = null;
    }
  }

  if (!response.ok) {
    const code = payload?.error?.code ?? 'UNEXPECTED';
    const message = payload?.error?.message ?? `Request failed (${response.status})`;
    // An expired or tampered token is not worth keeping around.
    if (code === 'UNAUTHENTICATED') clearSession();
    throw new ApiError(code, message, response.status);
  }

  return payload;
}

// --- auth ---

export async function signup({ email, password, role }) {
  const session = await request('/api/auth/signup', { method: 'POST', body: { email, password, role } });
  setSession(session);
  return session;
}

export async function login({ email, password }) {
  const session = await request('/api/auth/login', { method: 'POST', body: { email, password } });
  setSession(session);
  return session;
}

export function logout() {
  clearSession();
}

export function me() {
  return request('/api/auth/me', { auth: true });
}

// --- events ---

export function listEvents(filters = {}) {
  return request(`/api/events${queryString(filters)}`);
}

// The real API has no "cities" endpoint; the home page filter is built from the
// published events, which is one call and always in step with what is listed.
export async function listCities() {
  const events = await listEvents();
  const cities = new Set();
  for (const event of events) {
    if (event.city) cities.add(event.city);
  }
  return [...cities].sort((a, b) => a.localeCompare(b));
}

export function getEvent(eventId) {
  return request(`/api/events/${encodeURIComponent(eventId)}`);
}

export function myEvents() {
  return request('/api/events/mine', { auth: true });
}

export function createEvent(event) {
  return request('/api/events', { method: 'POST', body: event, auth: true });
}

export function addTier(eventId, tier) {
  return request(`/api/events/${encodeURIComponent(eventId)}/tiers`, { method: 'POST', body: tier, auth: true });
}

export function publishEvent(eventId) {
  return request(`/api/events/${encodeURIComponent(eventId)}/publish`, { method: 'POST', auth: true });
}

export function unpublishEvent(eventId) {
  return request(`/api/events/${encodeURIComponent(eventId)}/unpublish`, { method: 'POST', auth: true });
}

// --- bookings ---

export function createBooking({ tierId, quantity }) {
  return request('/api/bookings', { method: 'POST', body: { tierId, quantity }, auth: true });
}

export function pay({ reference, card }) {
  return request(`/api/bookings/${encodeURIComponent(reference)}/pay`, { method: 'POST', body: { card }, auth: true });
}

export function cancelBooking({ reference }) {
  return request(`/api/bookings/${encodeURIComponent(reference)}/cancel`, { method: 'POST', auth: true });
}

export function myBookings() {
  return request('/api/bookings/me', { auth: true });
}
