// Build 4/7: the route table.
//
// A handler does three things only: ask a guard who is calling, call ONE
// service, and return a value (or let a DomainError become a status). No
// business rule lives here - in particular the role check is done by the guard
// on the server, never trusted from the page.
//
// The auth routes are registered from ./routes/auth.js. The Build 7 prompt says
// src/routes/auth.js, but architecture.md keeps every HTTP concern in src/http.

import { registerAuthRoutes } from './routes/auth.js';

function queryValue(query, name) {
  const value = query.get(name);
  return value === null || value === '' ? undefined : value;
}

function optionalNumber(value) {
  return value === undefined ? undefined : Number(value);
}

export function registerRoutes(router, { eventService, bookingService, authService, guards } = {}) {
  router.get('/health', () => ({ status: 'ok' }));

  if (authService && guards) {
    registerAuthRoutes(router, { authService, guards });
  }

  if (!eventService || !bookingService || !guards) return router;

  const { requireUser, requireRole } = guards;

  // --- auth-protected, organizer only ---

  router.post('/api/events', ({ req, res, body }) => {
    const user = requireRole(req, 'organizer');
    res.statusCode = 201;
    return eventService.createEvent({ ...(body ?? {}), organizerId: user.userId });
  });

  // `/api/events/mine` is registered BEFORE `/api/events/:id` so "mine" is not
  // read as an event id (the router takes the first match).
  router.get('/api/events/mine', ({ req }) => {
    const user = requireRole(req, 'organizer');
    return eventService.listForOrganizer(user.userId);
  });

  router.post('/api/events/:id/tiers', ({ req, params, body }) => {
    const user = requireRole(req, 'organizer');
    return eventService.addTier(params.id, body ?? {}, { organizerId: user.userId });
  });

  router.post('/api/events/:id/publish', ({ req, params }) => {
    const user = requireRole(req, 'organizer');
    return eventService.publishEvent(params.id, { organizerId: user.userId });
  });

  router.post('/api/events/:id/unpublish', ({ req, params }) => {
    const user = requireRole(req, 'organizer');
    return eventService.unpublishEvent(params.id, { organizerId: user.userId });
  });

  // --- public ---

  router.get('/api/events', ({ query }) => {
    return eventService.search({
      q: queryValue(query, 'q'),
      city: queryValue(query, 'city'),
      from: queryValue(query, 'from'),
      to: queryValue(query, 'to'),
      maxPriceCents: optionalNumber(queryValue(query, 'maxPriceCents')),
      onlyAvailable: query.get('onlyAvailable') === 'true',
      sortBy: queryValue(query, 'sortBy'),
    });
  });

  // One event with its tiers, for the event page. The owner sees their draft;
  // everybody else gets NOT_FOUND for a draft.
  router.get('/api/events/:id', ({ req, params }) => {
    const user = tryRequireUser(req, requireUser);
    return eventService.getEventWithTiers(params.id, { userId: user?.userId });
  });

  // --- bookings ---

  router.post('/api/bookings', ({ req, res, body }) => {
    const user = requireUser(req);
    res.statusCode = 201;
    return bookingService.book({
      tierId: body?.tierId,
      quantity: body?.quantity,
      userId: user.userId,
    });
  });

  router.post('/api/bookings/:reference/pay', ({ req, params, body }) => {
    const user = requireUser(req);
    return bookingService.pay({
      reference: params.reference,
      userId: user.userId,
      card: body?.card,
    });
  });

  router.post('/api/bookings/:reference/cancel', ({ req, params }) => {
    const user = requireUser(req);
    return bookingService.cancel({ reference: params.reference, userId: user.userId });
  });

  // The "my tickets" list. Registered before the :reference route so "me" is
  // not read as a reference.
  router.get('/api/bookings/me', ({ req }) => {
    const user = requireUser(req);
    return bookingService.listForUser(user.userId);
  });

  router.get('/api/bookings/:reference', ({ req, params }) => {
    const user = requireUser(req);
    return bookingService.getBooking(params.reference, user.userId);
  });

  return router;
}

// A route may be public AND personalised: /api/events/:id lets the owner see a
// draft. A missing or bad token is not an error here - it just means "anonymous".
function tryRequireUser(req, requireUser) {
  try {
    return requireUser(req);
  } catch {
    return undefined;
  }
}
