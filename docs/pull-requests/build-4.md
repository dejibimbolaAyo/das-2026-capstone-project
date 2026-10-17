# Build 4: in-memory REST API (services + repositories)

> Branch: `build-4` -> `main`. Ready to paste into a PR. Follows
> `.github/pull_request_template.md`.

## Summary

Makes the app work end to end over HTTP with data held in memory: create events
and tiers, publish, search, book, pay with a mock card, and cancel an unpaid
booking. Business rules move out of the route handlers into a service layer that
receives its repository as an argument, so the same rules can run against a real
database in Build 5 without changing.

## What is in this PR

- `src/repositories/memory.js`: an async repository for events, tiers and
  bookings. No rules, just storage.
- `src/services/eventService.js` and `src/services/bookingService.js`: all
  business rules. They reuse `src/domain/` (the state machine, search, sorting)
  instead of copying it, and never import a repository.
- `src/domain/validation.js`: validators extracted so the services and the pure
  domain share one implementation (`requireText`, `requireWholeNumber`,
  `requireValidDate`, `requireQuantity`, `MAX_TICKETS_PER_BOOKING`).
- `src/lib/mockPaymentGateway.js`: an async `charge()` that succeeds, or
  declines when asked. It only ever sees a token, never a card number.
- Routes with the same error shape as `/health`: `POST /api/events`,
  `POST /api/events/:id/tiers`, `POST /api/events/:id/publish`,
  `GET /api/events` (search/filter/sort), `POST /api/bookings`,
  `POST /api/bookings/:reference/pay`, `POST /api/bookings/:reference/cancel`.
  Identity is an `x-user-id` header until Build 7.
- `src/http/app.js` now honours a handler-set `res.statusCode` (for `201`) and
  maps `PAYMENT_DECLINED` to `402`.
- `docs/api-examples.md`: one `curl` example for every call, in order.
- `test/api.test.js`: starts the real server on a free port and exercises the
  whole flow.

## User stories

S02 to S06 must now pass through the API, and S07 is delivered:

- **S02 (create event):** `POST /api/events` returns `201` with a draft event.
- **S03 (add tiers):** `POST /api/events/:id/tiers` returns the tier with
  `priceCents` and `capacity`.
- **S04 (publish):** `POST /api/events/:id/publish` flips to `published`;
  publishing with no tiers is `409 INVALID_STATE`.
- **S05 (search/filter/sort):** `GET /api/events` with `q`, `city`, `from`,
  `to`, `maxPriceCents`, `onlyAvailable`, `sortBy`; only `published` returned.
- **S06 (book):** `POST /api/bookings` holds the seats and returns a `pending`
  booking with a reference; above 10 or above the seats left is refused.
- **S07 (pay):** a valid mock card makes the booking `paid`; a declined card is
  `402 PAYMENT_DECLINED` and the booking stays `pending` so it can be retried;
  paying a cancelled or already-paid booking is `409 INVALID_TRANSITION`.

## How to run and test

```bash
npm test            # domain + router + API-level tests
npm start           # http://localhost:3000
# then walk through docs/api-examples.md with curl, in order
```

## Rules I had to respect

- [x] Money is whole cents, never a decimal.
- [x] Errors use the one shape `{"error":{"code","message"}}`.
- [x] No stack trace ever reaches the client.
- [x] Business rules live in `src/services/` and `src/domain/`, not in routes.
- [x] The services do not import the repository; it is passed in.

## AI log

- `docs/ai-log.md` -> Build 4

## Checklist

- [x] `npm test` is green.
- [x] Every call in `docs/api-examples.md` works with `curl`.
- [x] Tests added for the new behaviour.
- [x] Docs updated (`docs/architecture.md`, `docs/ai-log.md`,
      `docs/api-examples.md`).
- [x] Not merged: this PR is for review.

## Notes for the reviewer

- Cancelling only handles `pending` bookings here; refunds arrive in Build 8.
- No locks or transactions yet, on purpose. The last-ticket race is Build 5.
