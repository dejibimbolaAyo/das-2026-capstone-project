# Build 4: Working REST API (in memory)

*Week 7 of the course. Starts from the finished state of Build 3.*

**You deliver:** an API that works end to end with data held in memory: create events and tiers, publish, search, book, pay with a mock payment, and cancel an unpaid booking.

**You practise:** REST design, status codes, validation, `async`/`await`, separating routes from rules.

**Done when**
- Every call in `docs/api-examples.md` works with `curl`.
- Errors always come back in the same shape.
- `npm test` includes API-level tests.

## User stories in this build

Stories S02 to S06 now have to pass through the API as well, with the criteria from Build 2.

### S02: As an organizer, I want to create an event with title, city, venue and date, so that people can find it

Criteria: see [Build 2](build-2.md). They must now also pass through the API.

### S03: As an organizer, I want to add ticket tiers with a price and capacity, so that I can sell different kinds of ticket

Criteria: see [Build 2](build-2.md). They must now also pass through the API.

### S04: As an organizer, I want to publish and unpublish an event, so that I control when it goes public

Criteria: see [Build 2](build-2.md). They must now also pass through the API.

### S05: As an attendee, I want to search, filter and sort published events, so that I can find one I like

Criteria: see [Build 2](build-2.md). They must now also pass through the API.

### S06: As an attendee, I want to book a number of tickets from a tier, so that I get a place

Criteria: see [Build 2](build-2.md). They must now also pass through the API.

### S07: As an attendee, I want to pay for a booking (mock payment), so that the booking is confirmed

- **Given** a pending booking
  **When** the attendee pays with a valid mock card
  **Then** the booking becomes paid and the reference code is shown.
- **Given** a pending booking
  **When** the mock card is declined
  **Then** the request is rejected with `PAYMENT_DECLINED`, the booking stays pending, and the attendee can try again.
- **Given** a cancelled booking
  **When** someone tries to pay for it
  **Then** the request is rejected with `INVALID_TRANSITION`.
- **Given** a booking that is already paid
  **When** the attendee pays again
  **Then** the request is rejected and the card is charged only once.

## AI prompt

Give your AI tool these files first: README.md, docs/user-stories.md, docs/build-4.md, docs/architecture.md and everything in src/.

Then paste the prompt below. When it answers, do not trust it yet: read the code, run the checks in "Done when", and write what was wrong in `docs/ai-log.md`.

```text
We are building Build 4 of the Event Ticketing capstone, in plain JavaScript
(ES modules, Node 22.13 or newer, no outside packages). Read README.md,
docs/user-stories.md, docs/build-4.md, docs/architecture.md and everything in
src/ before you write anything. Follow the layer rules in the architecture doc.

Build a working REST API that keeps its data in memory.

1. src/repositories/memory.js: a repository with async methods for events,
   tiers and bookings. Services receive the repository as an argument; they do
   not import it.

2. src/services/eventService.js and bookingService.js. All business rules live
   here. Reuse the rules from src/domain/ (the state machine, search and
   sorting). Do not copy them.

3. src/lib/mockPaymentGateway.js: an async charge() that returns success, or a
   decline when asked. It never sees a card number.

4. Routes, with the same error shape as /health:
   - POST /api/events and POST /api/events/:id/tiers
   - POST /api/events/:id/publish
   - GET /api/events (search, filter and sort through query parameters)
   - POST /api/bookings (book tickets from a tier)
   - POST /api/bookings/:reference/pay (success, or PAYMENT_DECLINED)
   - POST /api/bookings/:reference/cancel (unpaid bookings only for now)
   Until Build 7, the caller identifies themselves with an x-user-id header.

5. docs/api-examples.md: one curl example for every call, in the order
   create, publish, book, pay.

6. API tests with node:test that start the real server on a free port.

Rules: money is whole cents; a declined card leaves the booking pending; a
booking can only be paid by the person who made it. Keep it simple. Do not add
locks or transactions yet. When you are done, list every file you changed and
any rule from this prompt that you were unsure about.
```

## Definition of done

The Definition of done in [user-stories.md](user-stories.md) applies to every story in this build.

[All milestones](milestones.md) · [Build 3](build-3.md) · [Build 5](build-5.md)
