# API examples (Build 4)

Every call the API supports, with `curl`, in the order you would use them:
create, publish, book, pay. Start the server first:

```bash
npm start          # listens on http://localhost:3000
```

The full reference, where you can also try each call, is at http://localhost:3000/docs.

Since Build 5 the data is stored in SQLite (`data/ticketing.db`), so it survives
a restart. Run `npm run seed` once for a few sample events, or delete the
`data/` folder to start empty. Ids and booking references are new for every
event and booking: copy them from each response into the variables below.

Until Build 7 adds login, the caller says who they are with the `x-user-id`
header. Calls that change data need it.

## Errors

Every error has the same shape:

```json
{ "error": { "code": "SOLD_OUT", "message": "Only 1 ticket(s) left in General" } }
```

| Code | Status | When |
|---|---|---|
| `VALIDATION`, `INVALID_JSON` | 400 | The input is missing or wrong |
| `UNAUTHENTICATED` | 401 | No `x-user-id` header |
| `PAYMENT_DECLINED` | 402 | The mock card was declined. The booking stays pending |
| `FORBIDDEN` | 403 | Not your event or not your booking |
| `NOT_FOUND` | 404 | No such event, tier, booking or route |
| `SOLD_OUT`, `INVALID_STATE`, `INVALID_TRANSITION` | 409 | The request clashes with the current state |

## 1. Create an event (organizer)

```bash
curl -s -X POST http://localhost:3000/api/events \
  -H 'content-type: application/json' -H 'x-user-id: org-1' \
  -d '{"title":"Lagos Tech Meetup","city":"Lagos","venue":"Landmark Centre","startsAt":"2026-12-05T17:00:00Z"}'
```

`201` with the new draft event. Copy its id:

```bash
EVENT_ID=paste-the-id-here
```

## 2. Add a ticket tier (organizer)

`priceCents` is whole cents (or kobo): 500000 is 5,000.00.

```bash
curl -s -X POST http://localhost:3000/api/events/$EVENT_ID/tiers \
  -H 'content-type: application/json' -H 'x-user-id: org-1' \
  -d '{"name":"General","priceCents":500000,"capacity":100}'
```

`201` with the tier, `sold: 0` and `seatsLeft: 100`. Copy its id:

```bash
TIER_ID=paste-the-id-here
```

## 3. Publish the event (organizer)

```bash
curl -s -X POST http://localhost:3000/api/events/$EVENT_ID/publish -H 'x-user-id: org-1'
```

`200` with `"status":"published"`. An event with no tiers gets `409 INVALID_STATE`.

To take it off the public list again:

```bash
curl -s -X POST http://localhost:3000/api/events/$EVENT_ID/unpublish -H 'x-user-id: org-1'
```

(Publish it again before you carry on.)

## 4. Search published events (anyone)

All query parameters are optional: `q` (title or venue), `city`, `from`, `to`
(a date-only `to` includes the whole day), `maxPriceCents`, `onlyAvailable=true`,
and `sort` = `date` (default), `price` or `availability`.

```bash
curl -s 'http://localhost:3000/api/events?city=lagos&maxPriceCents=600000&sort=price'
```

`200` with `{"events":[...]}`. Drafts are never listed.

## 5. View one event (anyone)

```bash
curl -s http://localhost:3000/api/events/$EVENT_ID
```

`200` with the event and its tiers, including `seatsLeft` for each.

## 6. Book tickets (attendee)

```bash
curl -s -X POST http://localhost:3000/api/bookings \
  -H 'content-type: application/json' -H 'x-user-id: ada' \
  -d "{\"tierId\":\"$TIER_ID\",\"quantity\":2}"
```

`201` with a `pending` booking, its `amountCents` and its `reference`. Copy the reference:

```bash
REF=paste-the-reference-here
```

## 7. View a booking (the attendee who made it)

```bash
curl -s http://localhost:3000/api/bookings/$REF -H 'x-user-id: ada'
```

## 8. Pay for a booking (the attendee who made it)

The mock gateway never sees a card number. It takes a payment token instead:
`tok_success` pays, `tok_declined` is declined.

A declined card (`402 PAYMENT_DECLINED`, the booking stays pending):

```bash
curl -s -X POST http://localhost:3000/api/bookings/$REF/pay \
  -H 'content-type: application/json' -H 'x-user-id: ada' \
  -d '{"paymentToken":"tok_declined"}'
```

A valid card (`200`, `"status":"paid"`):

```bash
curl -s -X POST http://localhost:3000/api/bookings/$REF/pay \
  -H 'content-type: application/json' -H 'x-user-id: ada' \
  -d '{"paymentToken":"tok_success"}'
```

Paying again gets `409 INVALID_TRANSITION`, and the card is not charged a second time.

## 9. Cancel an unpaid booking (the attendee who made it)

Make a second booking (step 6) and cancel it. Its seats go back to the tier.

```bash
curl -s -X POST http://localhost:3000/api/bookings/$REF/cancel -H 'x-user-id: ada'
```

`200` with `"status":"cancelled"`. A paid booking gets `409 INVALID_STATE`:
cancelling paid bookings means refunds, which arrive in Build 8.

## Health check

```bash
curl -s http://localhost:3000/health
```
