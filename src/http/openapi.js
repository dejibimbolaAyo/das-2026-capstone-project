// The API description in OpenAPI 3.1 format, served at GET /openapi.json.
// public/docs.html turns it into the readable docs at /docs.html.
// When you add or change a route in routes.js, change it here too:
// test/openapi.test.js fails if a documented route does not exist.

const json = (schema) => ({ content: { 'application/json': { schema } } });
const ref = (name) => ({ $ref: `#/components/schemas/${name}` });

const errorResponse = (description, codes) => ({
  description: `${description} Possible codes: ${codes.map((code) => `\`${code}\``).join(', ')}.`,
  ...json(ref('Error')),
});

// Calls that need to know who you are. Scalar shows an "x-user-id" box for these.
const asUser = [{ UserId: [] }];
const anyone = [];
const eventIdParam = { name: 'id', in: 'path', required: true, description: 'Event id', schema: { type: 'string' } };
const referenceParam = {
  name: 'reference',
  in: 'path',
  required: true,
  description: 'Booking reference, for example `A4WMMBBT`',
  schema: { type: 'string' },
};

const errors = {
  validation: errorResponse('The input is missing or wrong.', ['VALIDATION', 'INVALID_JSON']),
  unauthenticated: errorResponse('No `x-user-id` header.', ['UNAUTHENTICATED']),
  forbidden: errorResponse('You are not the owner.', ['FORBIDDEN']),
  notFound: errorResponse('It does not exist (or is a draft you cannot see).', ['NOT_FOUND']),
};

export const openApiDocument = {
  openapi: '3.1.0',
  info: {
    title: 'Event Ticketing API',
    version: '0.5.0',
    description: [
      'The Build 4 API: create events and ticket tiers, publish them, search, book, pay with a mock card and cancel.',
      '',
      'Since Build 5, data is stored in **SQLite** (`data/ticketing.db`) and survives a restart. When many people book the last seats at the same moment, exactly enough of them succeed and the rest get `SOLD_OUT`.',
      '',
      '**Who you are.** Until Build 7 adds login, send an `x-user-id` header on every call that changes data.',
      '',
      '**Money** is always a whole number of the smallest unit (kobo or cents): `500000` is 5,000.00.',
      '',
      '**Errors** always have the same shape: `{ "error": { "code": "SOLD_OUT", "message": "..." } }`.',
    ].join('\n'),
  },
  servers: [{ url: '/', description: 'This server' }],
  tags: [
    { name: 'Events', description: 'Organizers create and publish events. Anyone can search published ones.' },
    { name: 'Bookings', description: 'Attendees book, pay and cancel. Only the person who made a booking can see or change it.' },
    { name: 'System' },
  ],
  paths: {
    '/health': {
      get: {
        tags: ['System'],
        summary: 'Health check',
        operationId: 'health',
        security: anyone,
        responses: { 200: { description: 'The server is up.', ...json({ type: 'object', properties: { status: { const: 'ok' } } }) } },
      },
    },
    '/api/events': {
      post: {
        tags: ['Events'],
        summary: 'Create an event',
        description: 'Creates a **draft** event owned by the caller. Drafts are not on the public list. (S02)',
        operationId: 'createEvent',
        security: asUser,
        requestBody: { required: true, ...json(ref('NewEvent')) },
        responses: {
          201: { description: 'The new draft event.', ...json(ref('EventDetail')) },
          400: errors.validation,
          401: errors.unauthenticated,
        },
      },
      get: {
        tags: ['Events'],
        summary: 'Search published events',
        description: 'Search, filter and sort **published** events. Every parameter is optional. (S05)',
        operationId: 'searchEvents',
        security: anyone,
        parameters: [
          { name: 'q', in: 'query', description: 'Text in the title or venue, ignoring case.', schema: { type: 'string' } },
          { name: 'city', in: 'query', description: 'Exact city, ignoring case.', schema: { type: 'string' }, example: 'lagos' },
          { name: 'from', in: 'query', description: 'Earliest start, inclusive.', schema: { type: 'string', format: 'date' } },
          {
            name: 'to',
            in: 'query',
            description: 'Latest start, inclusive. A date-only value includes the whole day.',
            schema: { type: 'string', format: 'date' },
          },
          {
            name: 'maxPriceCents',
            in: 'query',
            description: 'Cheapest tier must cost at most this. Events with no tiers are left out.',
            schema: { type: 'integer', minimum: 0 },
          },
          { name: 'onlyAvailable', in: 'query', description: 'Only events with seats left.', schema: { type: 'boolean' } },
          { name: 'sort', in: 'query', schema: { type: 'string', enum: ['date', 'price', 'availability'], default: 'date' } },
        ],
        responses: {
          200: {
            description: 'Matching events. Ties are broken by title, then id.',
            ...json({ type: 'object', properties: { events: { type: 'array', items: ref('EventSummary') } } }),
          },
          400: errors.validation,
        },
      },
    },
    '/api/events/{id}': {
      get: {
        tags: ['Events'],
        summary: 'View an event',
        description: 'A published event, or your own draft. Includes each tier with its seats left.',
        operationId: 'getEvent',
        // Anyone can view a published event; send x-user-id to see your own draft.
        security: [{}, { UserId: [] }],
        parameters: [eventIdParam],
        responses: { 200: { description: 'The event and its tiers.', ...json(ref('EventDetail')) }, 404: errors.notFound },
      },
    },
    '/api/events/{id}/tiers': {
      post: {
        tags: ['Events'],
        summary: 'Add a ticket tier',
        description: 'Only the organizer of the event can add tiers. (S03)',
        operationId: 'addTier',
        security: asUser,
        parameters: [eventIdParam],
        requestBody: { required: true, ...json(ref('NewTier')) },
        responses: {
          201: { description: 'The new tier, with 0 sold.', ...json(ref('Tier')) },
          400: errors.validation,
          401: errors.unauthenticated,
          403: errors.forbidden,
          404: errors.notFound,
        },
      },
    },
    '/api/events/{id}/publish': {
      post: {
        tags: ['Events'],
        summary: 'Publish an event',
        description: 'Puts the event on the public list. It needs at least one tier. (S04)',
        operationId: 'publishEvent',
        security: asUser,
        parameters: [eventIdParam],
        responses: {
          200: { description: 'The published event.', ...json(ref('EventDetail')) },
          401: errors.unauthenticated,
          403: errors.forbidden,
          404: errors.notFound,
          409: errorResponse('The event has no tiers.', ['INVALID_STATE']),
        },
      },
    },
    '/api/events/{id}/unpublish': {
      post: {
        tags: ['Events'],
        summary: 'Unpublish an event',
        description: 'Takes the event off the public list and makes it a draft again. (S04)',
        operationId: 'unpublishEvent',
        security: asUser,
        parameters: [eventIdParam],
        responses: {
          200: { description: 'The event, now a draft.', ...json(ref('EventDetail')) },
          401: errors.unauthenticated,
          403: errors.forbidden,
          404: errors.notFound,
        },
      },
    },
    '/api/bookings': {
      post: {
        tags: ['Bookings'],
        summary: 'Book tickets',
        description: 'Holds seats in a tier of a published event. The booking starts as `pending`. (S06)',
        operationId: 'book',
        security: asUser,
        requestBody: { required: true, ...json(ref('NewBooking')) },
        responses: {
          201: { description: 'The pending booking.', ...json(ref('Booking')) },
          400: errors.validation,
          401: errors.unauthenticated,
          404: errors.notFound,
          409: errorResponse('Not enough seats left, or the event is not published.', ['SOLD_OUT', 'INVALID_STATE']),
        },
      },
    },
    '/api/bookings/{reference}': {
      get: {
        tags: ['Bookings'],
        summary: 'View a booking',
        operationId: 'getBooking',
        security: asUser,
        parameters: [referenceParam],
        responses: {
          200: { description: 'The booking.', ...json(ref('Booking')) },
          401: errors.unauthenticated,
          403: errors.forbidden,
          404: errors.notFound,
        },
      },
    },
    '/api/bookings/{reference}/pay': {
      post: {
        tags: ['Bookings'],
        summary: 'Pay for a booking (mock)',
        description: [
          'Pays a `pending` booking with a mock payment token. No card number is ever sent. (S07)',
          '',
          '- `tok_success` pays.',
          '- `tok_declined` is declined: you get `402 PAYMENT_DECLINED`, the booking stays pending, and you can try again.',
          '',
          'Paying a paid or cancelled booking is refused with `INVALID_TRANSITION`, and the card is never charged twice.',
        ].join('\n'),
        operationId: 'pay',
        security: asUser,
        parameters: [referenceParam],
        requestBody: {
          required: true,
          ...json({
            type: 'object',
            required: ['paymentToken'],
            properties: { paymentToken: { type: 'string', enum: ['tok_success', 'tok_declined'] } },
          }),
        },
        responses: {
          200: { description: 'The booking, now paid.', ...json(ref('Booking')) },
          400: errors.validation,
          401: errors.unauthenticated,
          402: errorResponse('The mock card was declined.', ['PAYMENT_DECLINED']),
          403: errors.forbidden,
          404: errors.notFound,
          409: errorResponse('The booking is already paid or cancelled.', ['INVALID_TRANSITION']),
        },
      },
    },
    '/api/bookings/{reference}/cancel': {
      post: {
        tags: ['Bookings'],
        summary: 'Cancel an unpaid booking',
        description: 'Cancels a `pending` booking and gives its seats back. Paid bookings need a refund, which arrives in Build 8.',
        operationId: 'cancel',
        security: asUser,
        parameters: [referenceParam],
        responses: {
          200: { description: 'The booking, now cancelled.', ...json(ref('Booking')) },
          401: errors.unauthenticated,
          403: errors.forbidden,
          404: errors.notFound,
          409: errorResponse('The booking is paid or already cancelled.', ['INVALID_STATE', 'INVALID_TRANSITION']),
        },
      },
    },
  },
  components: {
    securitySchemes: {
      UserId: {
        type: 'apiKey',
        in: 'header',
        name: 'x-user-id',
        description: 'Who is calling, for example `ada` or `org-1`. Stands in for login until Build 7.',
      },
    },
    schemas: {
      Error: {
        type: 'object',
        required: ['error'],
        properties: {
          error: {
            type: 'object',
            required: ['code', 'message'],
            properties: {
              code: { type: 'string', example: 'SOLD_OUT' },
              message: { type: 'string', example: 'Only 1 ticket(s) left in General' },
            },
          },
        },
      },
      NewEvent: {
        type: 'object',
        required: ['title', 'city', 'startsAt'],
        properties: {
          title: { type: 'string', example: 'Lagos Tech Meetup' },
          city: { type: 'string', example: 'Lagos' },
          venue: { type: 'string', example: 'Landmark Centre' },
          startsAt: { type: 'string', format: 'date-time', example: '2026-12-05T17:00:00Z' },
        },
      },
      EventSummary: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          title: { type: 'string' },
          city: { type: 'string' },
          venue: { type: 'string' },
          startsAt: { type: 'string', format: 'date-time' },
          status: { type: 'string', enum: ['draft', 'published'] },
          tierCount: { type: 'integer' },
          minPriceCents: { type: ['integer', 'null'], description: 'Price of the cheapest tier, or null with no tiers.' },
          seatsLeft: { type: 'integer', description: 'Seats left across all tiers.' },
        },
      },
      EventDetail: {
        allOf: [
          ref('EventSummary'),
          {
            type: 'object',
            properties: { organizerId: { type: 'string' }, tiers: { type: 'array', items: ref('Tier') } },
          },
        ],
      },
      NewTier: {
        type: 'object',
        required: ['name', 'priceCents', 'capacity'],
        properties: {
          name: { type: 'string', example: 'General' },
          priceCents: { type: 'integer', minimum: 0, example: 500000 },
          capacity: { type: 'integer', minimum: 1, example: 100 },
        },
      },
      Tier: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          eventId: { type: 'string' },
          name: { type: 'string' },
          priceCents: { type: 'integer' },
          capacity: { type: 'integer' },
          sold: { type: 'integer' },
          seatsLeft: { type: 'integer' },
        },
      },
      NewBooking: {
        type: 'object',
        required: ['tierId', 'quantity'],
        properties: { tierId: { type: 'string' }, quantity: { type: 'integer', minimum: 1, maximum: 10, example: 2 } },
      },
      Booking: {
        type: 'object',
        properties: {
          reference: { type: 'string', example: 'A4WMMBBT' },
          eventId: { type: 'string' },
          tierId: { type: 'string' },
          quantity: { type: 'integer' },
          amountCents: { type: 'integer', description: 'Tier price times quantity.' },
          status: { type: 'string', enum: ['pending', 'paid', 'cancelled', 'refunded', 'checked_in'] },
          createdAt: { type: 'string', format: 'date-time' },
          paidAt: { type: 'string', format: 'date-time' },
          cancelledAt: { type: 'string', format: 'date-time' },
        },
      },
    },
  },
};
