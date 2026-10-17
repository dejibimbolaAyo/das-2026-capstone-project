# API examples (Build 7)

Every call is `curl`, in the order you would really use them: sign up, create an
event, add a tier, publish it, find it, book it, pay for it. From Build 7 every
request that touches your data carries a **signed token**, not a plain header:

```
Authorization: Bearer <token>
```

The `x-user-id` header from Build 4 is gone. The token comes back from signup and
login, and the server decides who you are from it (the role is inside the signed
token, so editing it in the browser changes nothing).

Start the server with a secret you keep between restarts:

```bash
TOKEN_SECRET=dev-secret npm start        # PowerShell: $env:TOKEN_SECRET='dev-secret'; npm start
```

If `TOKEN_SECRET` is missing the server invents a random one for that process and
warns you: everything still works, but every token stops working on restart.

Every error is the same shape:

```json
{ "error": { "code": "UNAUTHENTICATED", "message": "Authentication required" } }
```

## 1. Sign up

`role` is `attendee`, `organizer` or `staff`, and the password must be at least 8
characters. Passwords are stored only as a salted hash and are never returned.

```bash
curl -s -X POST http://localhost:3000/api/auth/signup \
  -H 'content-type: application/json' \
  -d '{"email":"ada@example.com","password":"password123","role":"organizer"}'
```

`201 Created`:

```json
{ "user": { "id": "8c1f...", "email": "ada@example.com", "role": "organizer" }, "token": "eyJhbGci..." }
```

A second signup with the same email returns `409 EMAIL_TAKEN`; a short password
returns `400 VALIDATION`.

## 2. Log in

```bash
curl -s -X POST http://localhost:3000/api/auth/login \
  -H 'content-type: application/json' \
  -d '{"email":"ada@example.com","password":"password123"}'
```

`200 OK`, the same `{ "user", "token" }` shape. A wrong password and an unknown
email both return `401 INVALID_CREDENTIALS` with the **same** message, so nobody
can find out which emails have accounts.

Save the token and send it on every call below:

```bash
TOKEN=eyJhbGci...
```

## 3. Who am I

```bash
curl -s http://localhost:3000/api/auth/me -H "Authorization: Bearer $TOKEN"
```

`200 OK` with `{ "id", "email", "role" }`. A missing, edited, expired or wrongly
signed token returns `401 UNAUTHENTICATED`.

## 4. Create an event (organizer)

An `attendee` or `staff` token gets `403 FORBIDDEN` here: the role is checked on
the server, not in the page.

```bash
curl -s -X POST http://localhost:3000/api/events \
  -H 'content-type: application/json' \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"title":"Jazz Night","city":"Lagos","venue":"The Shrine","startsAt":"2026-03-01T19:00:00Z"}'
```

`201 Created`, `status` is `draft`:

```json
{
  "id": "3f1c...",
  "organizerId": "8c1f...",
  "title": "Jazz Night",
  "city": "Lagos",
  "venue": "The Shrine",
  "startsAt": "2026-03-01T19:00:00.000Z",
  "status": "draft",
  "tierIds": []
}
```

Keep the `id` as `EVENT_ID`.

## 5. Add a ticket tier (organizer)

```bash
curl -s -X POST http://localhost:3000/api/events/EVENT_ID/tiers \
  -H 'content-type: application/json' \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"name":"General","priceCents":5000,"capacity":100}'
```

`200 OK`. Money is whole cents, so `5000` means ₦50.00. Another organizer's event
returns `403 FORBIDDEN`.

```json
{ "id": "TIER_ID", "eventId": "EVENT_ID", "name": "General", "priceCents": 5000, "capacity": 100, "sold": 0 }
```

## 6. Publish and unpublish

An event must have at least one tier before it can be published.

```bash
curl -s -X POST http://localhost:3000/api/events/EVENT_ID/publish -H "Authorization: Bearer $TOKEN"
curl -s -X POST http://localhost:3000/api/events/EVENT_ID/unpublish -H "Authorization: Bearer $TOKEN"
```

`200 OK` with `"status":"published"` or `"status":"draft"`. Publishing with no
tiers returns `409 INVALID_STATE`.

## 7. Search published events (public)

No token needed.

```bash
curl -s 'http://localhost:3000/api/events'
curl -s 'http://localhost:3000/api/events?q=jazz&city=Lagos&onlyAvailable=true&sortBy=price'
```

| Query        | Meaning                                              |
| ------------ | ---------------------------------------------------- |
| `q`          | title or venue contains the text (case-insensitive)  |
| `city`       | exact city match (case-insensitive)                  |
| `from`/`to`  | ISO date window; a date-only `to` means the whole day |
| `maxPriceCents` | cheapest tier is at most this many cents          |
| `onlyAvailable` | `true` keeps events that still have seats         |
| `sortBy`     | `date`, `price` or `availability`                    |

Only `published` events are ever returned.

## 8. One event with its tiers

The event page needs the tiers, so this call returns them with `seatsLeft`.

```bash
curl -s http://localhost:3000/api/events/EVENT_ID
```

A `draft` is only visible to the organizer who owns it (send the token); to
everybody else it is `404 NOT_FOUND`, so a draft cannot be found by guessing ids.

## 9. My events (organizer)

```bash
curl -s http://localhost:3000/api/events/mine -H "Authorization: Bearer $TOKEN"
```

`200 OK` with only this organizer's events (drafts included), each with a `tiers`
array. An `attendee` token returns `403 FORBIDDEN`.

## 10. Book tickets

Any signed-in user may book.

```bash
curl -s -X POST http://localhost:3000/api/bookings \
  -H 'content-type: application/json' \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"tierId":"TIER_ID","quantity":2}'
```

`201 Created`. The booking is `pending` but the seats are already held:

```json
{
  "id": "b1...",
  "reference": "Q7F2M9KD",
  "userId": "8c1f...",
  "tierId": "TIER_ID",
  "quantity": 2,
  "amountCents": 10000,
  "status": "pending",
  "createdAt": "2026-02-01T10:00:00.000Z"
}
```

Ordering more than 10 tickets, or more than are left, gives `400 VALIDATION`
or `409 SOLD_OUT`.

## 11. My tickets (private)

```bash
curl -s http://localhost:3000/api/bookings/me -H "Authorization: Bearer $TOKEN"
```

`200 OK` with **only the caller's own** bookings. Each one carries the event and
tier so the page can show them without a second call.

```bash
curl -s http://localhost:3000/api/bookings/REFERENCE -H "Authorization: Bearer $TOKEN"
```

The same shape for one booking. Someone else's reference returns `403 FORBIDDEN`
(the S13 rule), so a stolen reference is useless.

## 12. Pay with the mock card

```bash
curl -s -X POST http://localhost:3000/api/bookings/REFERENCE/pay \
  -H 'content-type: application/json' \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"card":"ok"}'
```

`200 OK` with `"status":"paid"` and a `paymentId`. The gateway never sees a card
number, only the token.

A declined card (`"card":"declined"`) returns `402 PAYMENT_DECLINED`; the booking
stays `pending`, so it can be tried again. Paying an already-paid booking returns
`409 INVALID_TRANSITION` (you are never charged twice). Paying someone else's
booking returns `403 FORBIDDEN`.

## 13. Cancel an unpaid booking

```bash
curl -s -X POST http://localhost:3000/api/bookings/REFERENCE/cancel \
  -H "Authorization: Bearer $TOKEN"
```

`200 OK` with `"status":"cancelled"`; the seats go back. Only `pending` bookings
can be cancelled, so cancelling a `paid` one returns `409 INVALID_TRANSITION`.
Refunds arrive in Build 8.
