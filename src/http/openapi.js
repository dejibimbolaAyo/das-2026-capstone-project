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

// Calls that need a logged-in user. Log in at POST /api/auth/login, then send the token as a bearer token.
const asUser = [{ BearerAuth: [] }];
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
  unauthenticated: errorResponse('No token, or the token is edited or expired.', ['UNAUTHENTICATED']),
  forbidden: errorResponse('Your role is not allowed to do this, or the thing is not yours.', ['FORBIDDEN']),
  notFound: errorResponse('It does not exist (or is a draft you cannot see).', ['NOT_FOUND']),
};

export const openApiDocument = {
  openapi: '3.1.0',
  info: {
    title: 'Event Ticketing API',
    version: '0.9.0',
    description: [
      'The Build 4 API: create events and ticket tiers, publish them, search, book, pay with a mock card and cancel.',
      '',
      'Since Build 5, data is stored in **SQLite** (`data/ticketing.db`) and survives a restart. When many people book the last seats at the same moment, exactly enough of them succeed and the rest get `SOLD_OUT`.',
      '',
      '**Who you are.** Sign up or log in to get a token, then send `Authorization: Bearer <token>`. There are three roles: `attendee` (books and pays), `organizer` (creates and publishes events) and `staff`. The server checks the role on every call.',
      '',
      '**Money** is always a whole number of the smallest unit (kobo or cents): `500000` is 5,000.00.',
      '',
      '**Errors** always have the same shape: `{ "error": { "code": "SOLD_OUT", "message": "..." } }`.',
    ].join('\n'),
  },
  servers: [{ url: '/', description: 'This server' }],
  tags: [
    { name: 'Accounts', description: 'Sign up, log in and say who you are.' },
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
    '/api/auth/signup': {
      post: {
        tags: ['Accounts'],
        summary: 'Sign up',
        description: 'Creates an account and returns a token. The password is stored only as a hash. (S01)',
        operationId: 'signup',
        security: anyone,
        requestBody: { required: true, ...json(ref('NewAccount')) },
        responses: {
          201: { description: 'The new user and a signed token.', ...json(ref('AuthResult')) },
          400: errors.validation,
          409: errorResponse('That email is already registered.', ['EMAIL_TAKEN']),
        },
      },
    },
    '/api/auth/login': {
      post: {
        tags: ['Accounts'],
        summary: 'Log in',
        description: 'A wrong password and an unknown email give the same error, so the form cannot be used to find out who has an account. (S01)',
        operationId: 'login',
        security: anyone,
        requestBody: { required: true, ...json(ref('Credentials')) },
        responses: {
          200: { description: 'The user and a signed token.', ...json(ref('AuthResult')) },
          401: errorResponse('Wrong email or password.', ['INVALID_CREDENTIALS']),
        },
      },
    },
    '/api/auth/me': {
      get: {
        tags: ['Accounts'],
        summary: 'Who am I',
        operationId: 'me',
        security: asUser,
        responses: { 200: { description: 'The logged-in user.', ...json(ref('User')) }, 401: errors.unauthenticated },
      },
    },
    '/api/my/events': {
      get: {
        tags: ['Events'],
        summary: 'My events',
        description: 'The organizer\'s own events, drafts included.',
        operationId: 'listMyEvents',
        security: asUser,
        responses: {
          200: { description: 'Your events.', ...json({ type: 'object', properties: { events: { type: 'array', items: ref('EventDetail') } } }) },
          401: errors.unauthenticated,
          403: errors.forbidden,
        },
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
          { name: 'limit', in: 'query', description: 'How many events to return. At most 100.', schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 } },
          { name: 'offset', in: 'query', description: 'How many matches to skip, for the next page.', schema: { type: 'integer', minimum: 0, default: 0 } },
        ],
        responses: {
          200: {
            description: 'Matching events. Ties are broken by title, then id.',
            ...json({
              type: 'object',
              properties: {
                events: { type: 'array', items: ref('EventSummary') },
                total: { type: 'integer', description: 'All matches, before paging.' },
                limit: { type: 'integer' },
                offset: { type: 'integer' },
              },
            }),
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
        // Anyone can view a published event; send your token to see your own draft.
        security: [{}, { BearerAuth: [] }],
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
      get: {
        tags: ['Bookings'],
        summary: 'My bookings',
        description: 'Only the caller\'s own bookings, newest first, with the event and tier name. (S13)',
        operationId: 'listMyBookings',
        security: asUser,
        responses: {
          200: { description: 'Your bookings.', ...json({ type: 'object', properties: { bookings: { type: 'array', items: ref('BookingWithEvent') } } }) },
          401: errors.unauthenticated,
          403: errors.forbidden,
        },
      },
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
      BearerAuth: {
        type: 'http',
        scheme: 'bearer',
        description: 'The token from signup or login.',
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
      NewAccount: {
        type: 'object',
        required: ['name', 'email', 'password'],
        properties: {
          name: { type: 'string', example: 'Ada Obi' },
          email: { type: 'string', example: 'ada@example.com' },
          password: { type: 'string', minLength: 8, example: 'correct horse battery' },
          role: { type: 'string', enum: ['attendee', 'organizer', 'staff'], default: 'attendee' },
        },
      },
      Credentials: {
        type: 'object',
        required: ['email', 'password'],
        properties: { email: { type: 'string' }, password: { type: 'string' } },
      },
      User: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          email: { type: 'string' },
          role: { type: 'string', enum: ['attendee', 'organizer', 'staff'] },
        },
      },
      AuthResult: {
        type: 'object',
        properties: { token: { type: 'string' }, user: ref('User') },
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
      BookingWithEvent: {
        allOf: [
          ref('Booking'),
          {
            type: 'object',
            properties: {
              tierName: { type: 'string' },
              event: {
                type: 'object',
                properties: {
                  title: { type: 'string' },
                  city: { type: 'string' },
                  venue: { type: 'string' },
                  startsAt: { type: 'string', format: 'date-time' },
                },
              },
            },
          },
        ],
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
