import { Router } from './router.js';
import {
  createEvent,
  addTier,
  publishEvent,
  unpublishEvent,
  listPublishedEvents,
} from '../services/eventService.js';

import {
  createBooking,
  payBooking,
  cancelUnpaidBooking,
} from '../services/bookingService.js';

import { createMockPaymentGateway } from '../lib/mockPaymentGateway.js';
import { DomainError } from '../domain/errors.js';

function requireUserId(request) {
  const userId = request.headers['x-user-id'];

  if (!userId || typeof userId !== 'string' || !userId.trim()) {
    throw new DomainError('UNAUTHORIZED', 'The x-user-id header is required');
  }

  return userId.trim();
}

function requireBody(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new DomainError('VALIDATION', 'A JSON request body is required');
  }

  return body;
}

function parseBoolean(value) {
  if (value === null || value === undefined) {
    return false;
  }

  if (value === 'true') return true;
  if (value === 'false') return false;

  throw new DomainError(
    'VALIDATION',
    'onlyAvailable must be true or false'
  );
}

function parseInteger(value, field) {
  if (value === undefined) return undefined;

  const number = Number(value);

  if (!Number.isInteger(number)) {
    throw new DomainError('VALIDATION', `${field} must be a whole number`);
  }

  return number;
}

export function createApiRouter({
  router = new Router(),
  repository,
  paymentGateway = createMockPaymentGateway(),
} = {}) {
  if (!repository) {
    throw new Error('A repository is required to create the API router');
  }

  // Publish an event
  router.post('/api/events', async ({ request, body }) => {
    const userId = requireUserId(request);
    const event = await createEvent(repository, requireBody(body), userId);

    return { status: 201, body: event };
  });

  // Unpublish an event
router.post('/api/events/:id/unpublish', async ({ params, request }) => {
  requireUserId(request);

  const event = await unpublishEvent(repository, params.id);

  return { status: 200, body: event };
});

  // Add a ticket tier
  router.post('/api/events/:id/tiers', async ({ params, body, request }) => {
    requireUserId(request);

    const tier = await addTier(repository, params.id, requireBody(body));

    return { status: 201, body: tier };
  });

  // Publish an event
  router.post('/api/events/:id/publish', async ({ params, request }) => {
    requireUserId(request);

    const event = await publishEvent(repository, params.id);

    return { status: 200, body: event };
  });

  // Search and filter published events
  router.get('/api/events', async ({ request }) => {
    const url = new URL(request.url, 'http://localhost');

    const criteria = {
      query: url.searchParams.get('query') ?? undefined,
      city: url.searchParams.get('city') ?? undefined,
      from: url.searchParams.get('from') ?? undefined,
      to: url.searchParams.get('to') ?? undefined,
      maxPriceCents: parseInteger(
        url.searchParams.get('maxPriceCents') ?? undefined,
        'maxPriceCents'
      ),
      onlyAvailable: parseBoolean(url.searchParams.get('onlyAvailable')),
    };

    const sortBy = url.searchParams.get('sortBy') ?? 'date';

    const events = await listPublishedEvents(repository, criteria, sortBy);

    return { status: 200, body: events };
  });

  // Create a booking
  router.post('/api/bookings', async ({ request, body }) => {
    const userId = requireUserId(request);
    const input = requireBody(body);

    const booking = await createBooking(
      repository,
      input.tierId,
      userId,
      input.quantity
    );

    return { status: 201, body: booking };
  });

  // Pay for a booking
  router.post('/api/bookings/:reference/pay', async ({ request, params, body }) => {
    const userId = requireUserId(request);
    const input = requireBody(body ?? {});

    const booking = await payBooking(
      repository,
      params.reference,
      userId,
      paymentGateway,
      { decline: input.decline === true }
    );

    return { status: 200, body: booking };
  });

  // Cancel an unpaid booking
router.post('/api/bookings/:reference/cancel', async ({ params, request }) => {
  const userId = requireUserId(request);

  const booking = await cancelUnpaidBooking(
    repository,
    params.reference,
    userId
  );

  return { status: 200, body: booking };
});
}