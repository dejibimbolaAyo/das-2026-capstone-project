// API routes. Each handler only translates HTTP into a service call and the
// result back into HTTP. No business rules here.

import { openApiDocument } from './openapi.js';

// Until Build 7 adds login, callers say who they are with this header.
const userId = (request) => request.headers['x-user-id'];

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

export function registerApiRoutes(router, { eventService, bookingService }) {
  router.get('/openapi.json', () => ({ status: 200, body: openApiDocument }));

  router.post('/api/events', async ({ request, body }) => ({
    status: 201,
    body: await eventService.createEvent(userId(request), body),
  }));

  router.get('/api/events', async ({ query }) => ({
    status: 200,
    body: { events: await eventService.searchPublishedEvents(searchCriteria(query), query.sort || 'date') },
  }));

  router.get('/api/events/:id', async ({ request, params }) => ({
    status: 200,
    body: await eventService.getEvent(userId(request), params.id),
  }));

  router.post('/api/events/:id/tiers', async ({ request, params, body }) => ({
    status: 201,
    body: await eventService.addTier(userId(request), params.id, body),
  }));

  router.post('/api/events/:id/publish', async ({ request, params }) => ({
    status: 200,
    body: await eventService.publishEvent(userId(request), params.id),
  }));

  router.post('/api/events/:id/unpublish', async ({ request, params }) => ({
    status: 200,
    body: await eventService.unpublishEvent(userId(request), params.id),
  }));

  router.post('/api/bookings', async ({ request, body }) => ({
    status: 201,
    body: await bookingService.book(userId(request), body),
  }));

  router.get('/api/bookings/:reference', async ({ request, params }) => ({
    status: 200,
    body: await bookingService.getBooking(userId(request), params.reference),
  }));

  router.post('/api/bookings/:reference/pay', async ({ request, params, body }) => ({
    status: 200,
    body: await bookingService.pay(userId(request), params.reference, body),
  }));

  router.post('/api/bookings/:reference/cancel', async ({ request, params }) => ({
    status: 200,
    body: await bookingService.cancel(userId(request), params.reference),
  }));

  return router;
}
