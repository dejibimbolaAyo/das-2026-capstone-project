// API routes. Each handler only translates HTTP into a service call and the
// result back into HTTP. No business rules here.
//
// Build 9: who is calling comes from a signed token (Authorization: Bearer ...),
// and each route says which roles may use it.

import { createGuards } from './guards.js';
import { openApiDocument } from './openapi.js';
import { DomainError } from '../domain/errors.js';

// Brute-force / credential-stuffing throttle for the two unauthenticated
// account endpoints: at most a handful of attempts per IP per window.
const AUTH_ATTEMPT_LIMIT = 10;
const AUTH_ATTEMPT_WINDOW_MS = 15 * 60 * 1000;
const authAttemptsByIp = new Map();

function throttleAuthAttempt(request, now) {
  const ip = request.socket?.remoteAddress ?? 'unknown';
  const timestamp = now();
  const attempt = authAttemptsByIp.get(ip);
  if (!attempt || timestamp - attempt.windowStart >= AUTH_ATTEMPT_WINDOW_MS) {
    authAttemptsByIp.set(ip, { windowStart: timestamp, count: 1 });
    return;
  }
  attempt.count += 1;
  if (attempt.count > AUTH_ATTEMPT_LIMIT) {
    throw new DomainError('RATE_LIMITED', 'Too many attempts. Please try again later.');
  }
}

// Query strings are always text. Turn the number and flag fields into real
// types, and let the domain rules decide whether they are valid.
function toNumber(value) {
  return value === undefined || value === '' ? undefined : Number(value);
}

function searchCriteria(query) {
  return {
    q: query.q,
    city: query.city,
    from: query.from,
    to: query.to,
    maxPriceCents: toNumber(query.maxPriceCents),
    onlyAvailable: query.onlyAvailable === 'true' || query.onlyAvailable === '1',
  };
}

export function registerApiRoutes(router, { eventService, bookingService, authService, authSecret, now = Date.now }) {
  const { optionalUser, requireUser, requireRole } = createGuards({ authSecret, now });

  router.get('/openapi.json', () => ({ status: 200, body: openApiDocument }));

  // --- Accounts: anyone can reach these two, but each IP is throttled to
  // slow down brute-force and credential-stuffing attempts ---
  router.post('/api/auth/signup', async ({ request, body }) => {
    throttleAuthAttempt(request, now);
    return { status: 201, body: await authService.signup(body) };
  });
  router.post('/api/auth/login', async ({ request, body }) => {
    throttleAuthAttempt(request, now);
    return { status: 200, body: await authService.login(body) };
  });
  router.get('/api/auth/me', async ({ request }) => ({
    status: 200,
    body: await authService.me(requireUser(request).id),
  }));

  // --- Events: organizers write, everyone reads ---
  router.post('/api/events', async ({ request, body }) => ({
    status: 201,
    body: await eventService.createEvent(requireRole(request, 'organizer').id, body),
  }));

  router.get('/api/events', async ({ query }) => ({
    status: 200,
    body: await eventService.searchPublishedEventsPage(searchCriteria(query), query.sort || 'date', {
      limit: toNumber(query.limit),
      offset: toNumber(query.offset),
    }),
  }));

  // The organizer's own events, drafts included.
  router.get('/api/my/events', async ({ request }) => ({
    status: 200,
    body: { events: await eventService.listOwnEvents(requireRole(request, 'organizer').id) },
  }));

  router.get('/api/events/:id', async ({ request, params }) => ({
    status: 200,
    body: await eventService.getEvent(optionalUser(request)?.id, params.id),
  }));

  router.post('/api/events/:id/tiers', async ({ request, params, body }) => ({
    status: 201,
    body: await eventService.addTier(requireRole(request, 'organizer').id, params.id, body),
  }));

  router.post('/api/events/:id/publish', async ({ request, params }) => ({
    status: 200,
    body: await eventService.publishEvent(requireRole(request, 'organizer').id, params.id),
  }));

  router.post('/api/events/:id/unpublish', async ({ request, params }) => ({
    status: 200,
    body: await eventService.unpublishEvent(requireRole(request, 'organizer').id, params.id),
  }));

  // --- Bookings: attendees only, and only their own ---
  router.post('/api/bookings', async ({ request, body }) => ({
    status: 201,
    body: await bookingService.book(requireRole(request, 'attendee').id, body),
  }));

  router.get('/api/bookings', async ({ request }) => ({
    status: 200,
    body: { bookings: await bookingService.listMine(requireRole(request, 'attendee').id) },
  }));

  router.get('/api/bookings/:reference', async ({ request, params }) => ({
    status: 200,
    body: await bookingService.getBooking(requireRole(request, 'attendee').id, params.reference),
  }));

  router.post('/api/bookings/:reference/pay', async ({ request, params, body }) => ({
    status: 200,
    body: await bookingService.pay(requireRole(request, 'attendee').id, params.reference, body),
  }));

  router.post('/api/bookings/:reference/cancel', async ({ request, params }) => ({
    status: 200,
    body: await bookingService.cancel(requireRole(request, 'attendee').id, params.reference),
  }));

  return router;
}
