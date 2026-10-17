# API examples

Every call below is a real `curl` command that works against this project (Build 8).
The answers shown were captured from a real run, and `npm test` replays every one of
them (see `test/api-examples.test.js`), so this page cannot drift from the code.

## How to use this page

1. Open a Command Prompt in the project folder and start a **fresh, empty** server:
   `set DB_FILE=:memory:&& npm start`
   (The normal `npm start` keeps your data in a file, so ids would not start at `EV-000001` again.
   `DB_FILE=:memory:` gives a clean throw-away database.)
2. Open a **second** Command Prompt in the same folder.
3. Run the examples **in order, from 1 to 41**. Later examples use things made by earlier ones.
4. Since Build 7 most calls need a **login token**. Examples 2, 3 and 24 give you tokens: copy the token from the answer and save it with `set NAME=token` as the example says. Use the **same** Command Prompt for the rest, so `%ORG%`, `%ATT%` and `%ATT2%` keep their value.
5. Add `-i` after `curl` to also see the status line, for example `curl -i "http://localhost:3000/health"`.

On Windows use `curl` in **Command Prompt**. (In PowerShell, type `curl.exe` and use `$env:ORG` instead of `%ORG%`.)
The example JSON bodies live in `docs/api-examples/`, so run the commands from the project folder.
The passwords in those files are examples for practice. Never use a real password in a practice file.

## Rules that hold for every call

- Success answers look like `{ "event": {...} }`, `{ "booking": {...} }`, `{ "events": [...] }`.
- Errors **always** look like `{ "error": { "code": "...", "message": "..." } }`.
- Money is whole cents. Dates are `YYYY-MM-DD`.
- A login token goes in a header: `Authorization: Bearer <token>`.

| Status | Code | Meaning |
|---|---|---|
| 400 | `VALIDATION` | A value is missing or wrong (quantity 0, bad date, short password, ...) |
| 400 | `BAD_REQUEST` | The body is not valid JSON |
| 401 | `UNAUTHENTICATED` | No login, a bad or expired token, or a wrong email or password |
| 402 | `PAYMENT_DECLINED` | The (mock) bank said no |
| 403 | `FORBIDDEN` | You are logged in, but your role (or ownership) does not allow this |
| 404 | `NOT_FOUND` | No such event, tier, booking or address. Other people's bookings and drafts look like this too |
| 405 | `METHOD_NOT_ALLOWED` | Wrong method for that address (see the `Allow` header) |
| 409 | `SOLD_OUT`, `NOT_PUBLISHED`, `NOT_SOLD_OUT`, `INVALID_STATE`, `ALREADY_CANCELLED`, `EMAIL_TAKEN`, `BOOKING_EXPIRED`, `EVENT_STARTED`, `ALREADY_ON_WAITLIST`, `OFFER_EXPIRED` | The request is fine, but not allowed right now |
| 413 | `PAYLOAD_TOO_LARGE` | The body is over 100,000 bytes |
| 415 | `UNSUPPORTED_MEDIA_TYPE` | Send JSON with `Content-Type: application/json` |
| 503 | `BUSY` | The database stayed locked for too long. Try again. |

## The examples

### 1. Check the server is alive

Nothing to send. This is the simplest call there is.

```
curl "http://localhost:3000/health"
```

Expected: **200 OK**

```json
{
  "status": "ok"
}
```

### 2. Sign up as an organizer (S01)

The answer holds your account and a **token**: a signed pass that proves who you are. Your password is never sent back and is stored only as a hash.

**Save the token.** Copy the long text after `"token":` (without the quotes) and run `set ORG=` followed by that text. Later examples use `%ORG%`.

```
curl -X POST "http://localhost:3000/api/auth/signup" -H "Content-Type: application/json" -d @docs/api-examples/new-organizer.json
```

Expected: **201 Created**

```json
{
  "user": {
    "id": "U-000001",
    "name": "Olu Organizer",
    "email": "olu@example.com",
    "role": "organizer"
  },
  "token": "<token>"
}
```

### 3. Sign up as an attendee

Same call, role `attendee`. Save this token too: `set ATT=` followed by the token.

```
curl -X POST "http://localhost:3000/api/auth/signup" -H "Content-Type: application/json" -d @docs/api-examples/new-attendee.json
```

Expected: **201 Created**

```json
{
  "user": {
    "id": "U-000002",
    "name": "Ada Attendee",
    "email": "ada@example.com",
    "role": "attendee"
  },
  "token": "<token>"
}
```

### 4. Create an event with no login (refused)

No token means the server does not know who you are: **401**.

```
curl -X POST "http://localhost:3000/api/events" -H "Content-Type: application/json" -d @docs/api-examples/new-event.json
```

Expected: **401 Unauthorized**

```json
{
  "error": {
    "code": "UNAUTHENTICATED",
    "message": "Please log in first."
  }
}
```

### 5. Create an event as the attendee (refused)

The server knows who you are, but attendees may not create events: **403**.

```
curl -X POST "http://localhost:3000/api/events" -H "Content-Type: application/json" -H "Authorization: Bearer %ATT%" -d @docs/api-examples/new-event.json
```

Expected: **403 Forbidden**

```json
{
  "error": {
    "code": "FORBIDDEN",
    "message": "Only organizer accounts can do this."
  }
}
```

### 6. Create an event as the organizer (S02)

The server picks the id (`EV-000001`) and the owner is YOU. A new event is a `draft`, so nobody can book it yet.

```
curl -X POST "http://localhost:3000/api/events" -H "Content-Type: application/json" -H "Authorization: Bearer %ORG%" -d @docs/api-examples/new-event.json
```

Expected: **201 Created**

```json
{
  "event": {
    "id": "EV-000001",
    "title": "Lagos Jazz Night",
    "city": "Lagos",
    "venue": "Terra Kulture",
    "date": "2040-12-05",
    "status": "draft",
    "tiers": []
  }
}
```

### 7. Add a ticket tier (S03)

Money is whole cents: 500000 cents = N5,000.00. The tier id `T1` is made for you.

```
curl -X POST "http://localhost:3000/api/events/EV-000001/tiers" -H "Content-Type: application/json" -H "Authorization: Bearer %ORG%" -d @docs/api-examples/new-tier.json
```

Expected: **201 Created**

```json
{
  "tier": {
    "id": "T1",
    "name": "Regular",
    "priceCents": 500000,
    "capacity": 3,
    "seatsLeft": 3
  }
}
```

### 8. Try to book a draft event (refused)

Nobody can book an event that is not published.

```
curl -X POST "http://localhost:3000/api/bookings" -H "Content-Type: application/json" -H "Authorization: Bearer %ATT%" -d @docs/api-examples/new-booking.json
```

Expected: **409 Conflict**

```json
{
  "error": {
    "code": "NOT_PUBLISHED",
    "message": "This event is not published, so it cannot be booked."
  }
}
```

### 9. Publish the event (S04)

No body needed.

```
curl -X POST "http://localhost:3000/api/events/EV-000001/publish" -H "Authorization: Bearer %ORG%"
```

Expected: **200 OK**

```json
{
  "event": {
    "id": "EV-000001",
    "title": "Lagos Jazz Night",
    "city": "Lagos",
    "venue": "Terra Kulture",
    "date": "2040-12-05",
    "status": "published",
    "tiers": [
      {
        "id": "T1",
        "name": "Regular",
        "priceCents": 500000,
        "capacity": 3,
        "seatsLeft": 3
      }
    ]
  }
}
```

### 10. Search: Lagos, cheapest first (S05)

Searching needs no login. Other options: `q`, `dateFrom`, `dateTo`, `minPriceCents`, `maxPriceCents`, `sort` (date, price, availability) and `order` (asc, desc).

```
curl "http://localhost:3000/api/events?city=Lagos&sort=price&order=asc"
```

Expected: **200 OK**

```json
{
  "events": [
    {
      "id": "EV-000001",
      "title": "Lagos Jazz Night",
      "city": "Lagos",
      "venue": "Terra Kulture",
      "date": "2040-12-05",
      "status": "published",
      "tiers": [
        {
          "id": "T1",
          "name": "Regular",
          "priceCents": 500000,
          "capacity": 3,
          "seatsLeft": 3
        }
      ]
    }
  ]
}
```

### 11. Look at one event

`seatsLeft` goes down as people book.

```
curl "http://localhost:3000/api/events/EV-000001"
```

Expected: **200 OK**

```json
{
  "event": {
    "id": "EV-000001",
    "title": "Lagos Jazz Night",
    "city": "Lagos",
    "venue": "Terra Kulture",
    "date": "2040-12-05",
    "status": "published",
    "tiers": [
      {
        "id": "T1",
        "name": "Regular",
        "priceCents": 500000,
        "capacity": 3,
        "seatsLeft": 3
      }
    ]
  }
}
```

### 12. Book 2 of the 3 seats (S06)

The booking starts `pending` and belongs to the attendee. 2 seats x 500000 = 1000000 cents. `holdExpiresAt` is when the seats stop being held (10 minutes). After that the server lets the seats go and paying is refused with `BOOKING_EXPIRED`.

```
curl -X POST "http://localhost:3000/api/bookings" -H "Content-Type: application/json" -H "Authorization: Bearer %ATT%" -d @docs/api-examples/new-booking.json
```

Expected: **201 Created**

```json
{
  "booking": {
    "ref": "BK-000001",
    "eventId": "EV-000001",
    "tierId": "T1",
    "buyerName": "Ada",
    "quantity": 2,
    "totalCents": 1000000,
    "status": "pending",
    "holdExpiresAt": "<time>",
    "refundCents": null
  }
}
```

### 13. Book 2 more when only 1 is left (refused)

All or nothing: you get `SOLD_OUT` and no seats are taken.

```
curl -X POST "http://localhost:3000/api/bookings" -H "Content-Type: application/json" -H "Authorization: Bearer %ATT%" -d @docs/api-examples/new-booking.json
```

Expected: **409 Conflict**

```json
{
  "error": {
    "code": "SOLD_OUT",
    "message": "Not enough seats in Regular: 1 left, 2 wanted."
  }
}
```

### 14. Book 11 seats (refused)

The most you can book at once is 10.

```
curl -X POST "http://localhost:3000/api/bookings" -H "Content-Type: application/json" -H "Authorization: Bearer %ATT%" -d @docs/api-examples/bad-booking.json
```

Expected: **400 Bad Request**

```json
{
  "error": {
    "code": "VALIDATION",
    "message": "Quantity must be a whole number from 1 to 10."
  }
}
```

### 15. Pay with a declined card (S07)

A pretend payment. `tok_declined` always fails. The booking stays `pending`.

```
curl -X POST "http://localhost:3000/api/bookings/BK-000001/pay" -H "Content-Type: application/json" -H "Authorization: Bearer %ATT%" -d @docs/api-examples/pay-declined.json
```

Expected: **402 Payment Required**

```json
{
  "error": {
    "code": "PAYMENT_DECLINED",
    "message": "The payment was declined. The booking is still pending."
  }
}
```

### 16. Pay with a good card

`tok_success` always works (and it is the default if you send no body).

```
curl -X POST "http://localhost:3000/api/bookings/BK-000001/pay" -H "Content-Type: application/json" -H "Authorization: Bearer %ATT%" -d @docs/api-examples/pay-success.json
```

Expected: **200 OK**

```json
{
  "booking": {
    "ref": "BK-000001",
    "eventId": "EV-000001",
    "tierId": "T1",
    "buyerName": "Ada",
    "quantity": 2,
    "totalCents": 1000000,
    "status": "paid",
    "holdExpiresAt": "<time>",
    "refundCents": null
  }
}
```

### 17. Pay again (refused)

A booking can only be paid once.

```
curl -X POST "http://localhost:3000/api/bookings/BK-000001/pay" -H "Authorization: Bearer %ATT%"
```

Expected: **409 Conflict**

```json
{
  "error": {
    "code": "INVALID_STATE",
    "message": "Cannot pay a paid booking."
  }
}
```

### 18. Book the last seat

Quantity left out would also mean 1.

```
curl -X POST "http://localhost:3000/api/bookings" -H "Content-Type: application/json" -H "Authorization: Bearer %ATT%" -d @docs/api-examples/new-booking-single.json
```

Expected: **201 Created**

```json
{
  "booking": {
    "ref": "BK-000002",
    "eventId": "EV-000001",
    "tierId": "T1",
    "buyerName": "Bayo",
    "quantity": 1,
    "totalCents": 500000,
    "status": "pending",
    "holdExpiresAt": "<time>",
    "refundCents": null
  }
}
```

### 19. Cancel an unpaid booking

The seat goes back on sale.

```
curl -X POST "http://localhost:3000/api/bookings/BK-000002/cancel" -H "Authorization: Bearer %ATT%"
```

Expected: **200 OK**

```json
{
  "booking": {
    "ref": "BK-000002",
    "eventId": "EV-000001",
    "tierId": "T1",
    "buyerName": "Bayo",
    "quantity": 1,
    "totalCents": 500000,
    "status": "cancelled",
    "holdExpiresAt": "<time>",
    "refundCents": null
  },
  "refund": {
    "percent": 0,
    "refundCents": 0,
    "paid": false
  }
}
```

### 20. Cancel it again (refused)

Already cancelled.

```
curl -X POST "http://localhost:3000/api/bookings/BK-000002/cancel" -H "Authorization: Bearer %ATT%"
```

Expected: **409 Conflict**

```json
{
  "error": {
    "code": "ALREADY_CANCELLED",
    "message": "Booking BK-000002 is already cancelled."
  }
}
```

### 21. What would I get back? (refund preview, S09)

Changes nothing. The refund depends on how long is left before the event starts: **7 days or more: 100%**, **2 days or more: 50%**, **less than 2 days: 0%** (exactly 7 or 2 days counts for the better tier). This event is years away, so you get 100%. An event that has already started answers `EVENT_STARTED`.

```
curl "http://localhost:3000/api/bookings/BK-000001/refund" -H "Authorization: Bearer %ATT%"
```

Expected: **200 OK**

```json
{
  "refund": {
    "percent": 100,
    "refundCents": 1000000,
    "paid": true
  }
}
```

### 22. Cancel a PAID booking and get the refund (S09)

The booking becomes `refunded`, the money comes back (1000000 cents) and the 2 seats go back on sale, once. Cancelling it a second time is refused with `ALREADY_CANCELLED`.

```
curl -X POST "http://localhost:3000/api/bookings/BK-000001/cancel" -H "Authorization: Bearer %ATT%"
```

Expected: **200 OK**

```json
{
  "booking": {
    "ref": "BK-000001",
    "eventId": "EV-000001",
    "tierId": "T1",
    "buyerName": "Ada",
    "quantity": 2,
    "totalCents": 1000000,
    "status": "refunded",
    "holdExpiresAt": "<time>",
    "refundCents": 1000000
  },
  "refund": {
    "percent": 100,
    "refundCents": 1000000,
    "paid": true
  }
}
```

### 23. Look at your booking

Only the person who made a booking can read it.

```
curl "http://localhost:3000/api/bookings/BK-000001" -H "Authorization: Bearer %ATT%"
```

Expected: **200 OK**

```json
{
  "booking": {
    "ref": "BK-000001",
    "eventId": "EV-000001",
    "tierId": "T1",
    "buyerName": "Ada",
    "quantity": 2,
    "totalCents": 1000000,
    "status": "refunded",
    "holdExpiresAt": "<time>",
    "refundCents": 1000000
  }
}
```

### 24. Sign up a second attendee

Save this token as `ATT2`: `set ATT2=` followed by the token.

```
curl -X POST "http://localhost:3000/api/auth/signup" -H "Content-Type: application/json" -d @docs/api-examples/new-attendee-2.json
```

Expected: **201 Created**

```json
{
  "user": {
    "id": "U-000003",
    "name": "Bayo Buyer",
    "email": "bayo@example.com",
    "role": "attendee"
  },
  "token": "<token>"
}
```

### 25. The second attendee asks for Ada's booking (refused)

Privacy (S13). The answer is `NOT_FOUND`, exactly like a booking that does not exist, so nobody can even find out which codes are real.

```
curl "http://localhost:3000/api/bookings/BK-000001" -H "Authorization: Bearer %ATT2%"
```

Expected: **404 Not Found**

```json
{
  "error": {
    "code": "NOT_FOUND",
    "message": "No booking with code BK-000001."
  }
}
```

### 26. My tickets (S13)

Only your own bookings, newest first.

```
curl "http://localhost:3000/api/me/bookings" -H "Authorization: Bearer %ATT%"
```

Expected: **200 OK**

```json
{
  "bookings": [
    {
      "ref": "BK-000002",
      "eventId": "EV-000001",
      "tierId": "T1",
      "buyerName": "Bayo",
      "quantity": 1,
      "totalCents": 500000,
      "status": "cancelled",
      "holdExpiresAt": "<time>",
      "refundCents": null
    },
    {
      "ref": "BK-000001",
      "eventId": "EV-000001",
      "tierId": "T1",
      "buyerName": "Ada",
      "quantity": 2,
      "totalCents": 1000000,
      "status": "refunded",
      "holdExpiresAt": "<time>",
      "refundCents": 1000000
    }
  ]
}
```

### 27. Join the waitlist while seats are left (refused, S11)

The waitlist is only for **sold-out** tiers. While seats are left you should simply book.

```
curl -X POST "http://localhost:3000/api/waitlist" -H "Content-Type: application/json" -H "Authorization: Bearer %ATT2%" -d @docs/api-examples/waitlist-join.json
```

Expected: **409 Conflict**

```json
{
  "error": {
    "code": "NOT_SOLD_OUT",
    "message": "Regular still has 3 seats. Book instead of waiting."
  }
}
```

### 28. Book all 3 seats, so the tier sells out

Now there is nothing left to buy.

```
curl -X POST "http://localhost:3000/api/bookings" -H "Content-Type: application/json" -H "Authorization: Bearer %ATT%" -d @docs/api-examples/new-booking-all.json
```

Expected: **201 Created**

```json
{
  "booking": {
    "ref": "BK-000003",
    "eventId": "EV-000001",
    "tierId": "T1",
    "buyerName": "Ada",
    "quantity": 3,
    "totalCents": 1500000,
    "status": "pending",
    "holdExpiresAt": "<time>",
    "refundCents": null
  }
}
```

### 29. Join the waitlist (S11)

You join the **end of the line**. `position` 1 means you are next.

```
curl -X POST "http://localhost:3000/api/waitlist" -H "Content-Type: application/json" -H "Authorization: Bearer %ATT2%" -d @docs/api-examples/waitlist-join.json
```

Expected: **201 Created**

```json
{
  "entry": {
    "id": 1,
    "eventId": "EV-000001",
    "tierId": "T1",
    "status": "waiting",
    "position": 1,
    "offerExpiresAt": null
  }
}
```

### 30. Join it a second time (refused)

One place in line per person and tier.

```
curl -X POST "http://localhost:3000/api/waitlist" -H "Content-Type: application/json" -H "Authorization: Bearer %ATT2%" -d @docs/api-examples/waitlist-join.json
```

Expected: **409 Conflict**

```json
{
  "error": {
    "code": "ALREADY_ON_WAITLIST",
    "message": "You are already on the waitlist for Regular."
  }
}
```

### 31. Cancel the booking: the seat is OFFERED (S12)

The freed seats go to the **first person in line**, never to somebody who just arrived. (The answer never says who was offered the seat.)

```
curl -X POST "http://localhost:3000/api/bookings/BK-000003/cancel" -H "Authorization: Bearer %ATT%"
```

Expected: **200 OK**

```json
{
  "booking": {
    "ref": "BK-000003",
    "eventId": "EV-000001",
    "tierId": "T1",
    "buyerName": "Ada",
    "quantity": 3,
    "totalCents": 1500000,
    "status": "cancelled",
    "holdExpiresAt": "<time>",
    "refundCents": null
  },
  "refund": {
    "percent": 0,
    "refundCents": 0,
    "paid": false
  }
}
```

### 32. See my waitlist and offers

The status changed from `waiting` to `offered`. `offerExpiresAt` is the deadline (15 minutes). The seat is **held** for you until then: nobody else can buy it. If you do nothing, the offer runs out and the seat passes to the next person.

```
curl "http://localhost:3000/api/me/waitlist" -H "Authorization: Bearer %ATT2%"
```

Expected: **200 OK**

```json
{
  "entries": [
    {
      "id": 1,
      "eventId": "EV-000001",
      "tierId": "T1",
      "status": "offered",
      "position": null,
      "offerExpiresAt": "<time>"
    }
  ]
}
```

### 33. Accept the offer (S12)

The held seat becomes a `pending` booking for you. Pay for it within its hold time. After the deadline this answers `OFFER_EXPIRED`.

```
curl -X POST "http://localhost:3000/api/waitlist/1/accept" -H "Authorization: Bearer %ATT2%"
```

Expected: **201 Created**

```json
{
  "booking": {
    "ref": "BK-000004",
    "eventId": "EV-000001",
    "tierId": "T1",
    "buyerName": "Bayo Buyer",
    "quantity": 1,
    "totalCents": 500000,
    "status": "pending",
    "holdExpiresAt": "<time>",
    "refundCents": null
  }
}
```

### 34. An attendee tries to publish the event (refused)

Wrong role: **403**. (An organizer who does not own the event gets 403 too. Someone else's draft looks like it does not exist: 404.)

```
curl -X POST "http://localhost:3000/api/events/EV-000001/publish" -H "Authorization: Bearer %ATT2%"
```

Expected: **403 Forbidden**

```json
{
  "error": {
    "code": "FORBIDDEN",
    "message": "Only organizer accounts can do this."
  }
}
```

### 35. Log in with the wrong password

The answer is the same for a wrong password and for an email nobody signed up with, so nobody can use login to find out who has an account.

```
curl -X POST "http://localhost:3000/api/auth/login" -H "Content-Type: application/json" -d @docs/api-examples/login-wrong.json
```

Expected: **401 Unauthorized**

```json
{
  "error": {
    "code": "UNAUTHENTICATED",
    "message": "Wrong email or password."
  }
}
```

### 36. Log in again

Tokens stop working after 2 hours. Log in again to get a new one. (This one is not needed for the next examples.)

```
curl -X POST "http://localhost:3000/api/auth/login" -H "Content-Type: application/json" -d @docs/api-examples/login-organizer.json
```

Expected: **200 OK**

```json
{
  "user": {
    "id": "U-000001",
    "name": "Olu Organizer",
    "email": "olu@example.com",
    "role": "organizer"
  },
  "token": "<token>"
}
```

### 37. Who am I?

Your account, never your password or its hash.

```
curl "http://localhost:3000/api/me" -H "Authorization: Bearer %ORG%"
```

Expected: **200 OK**

```json
{
  "user": {
    "id": "U-000001",
    "name": "Olu Organizer",
    "email": "olu@example.com",
    "role": "organizer"
  }
}
```

### 38. Unpublish the event

It goes back to `draft`.

```
curl -X POST "http://localhost:3000/api/events/EV-000001/unpublish" -H "Authorization: Bearer %ORG%"
```

Expected: **200 OK**

```json
{
  "event": {
    "id": "EV-000001",
    "title": "Lagos Jazz Night",
    "city": "Lagos",
    "venue": "Terra Kulture",
    "date": "2040-12-05",
    "status": "draft",
    "tiers": [
      {
        "id": "T1",
        "name": "Regular",
        "priceCents": 500000,
        "capacity": 3,
        "seatsLeft": 2
      }
    ]
  }
}
```

### 39. Search again: the draft is hidden

No matches is not an error. You get an empty list.

```
curl "http://localhost:3000/api/events?city=Lagos"
```

Expected: **200 OK**

```json
{
  "events": []
}
```

### 40. Ask for an event that does not exist

Every error has the same shape: `{ "error": { "code", "message" } }`.

```
curl "http://localhost:3000/api/events/EV-999999"
```

Expected: **404 Not Found**

```json
{
  "error": {
    "code": "NOT_FOUND",
    "message": "No event with id \"EV-999999\"."
  }
}
```

### 41. Send broken JSON

The file `bad-json.json` is cut off on purpose.

```
curl -X POST "http://localhost:3000/api/events" -H "Content-Type: application/json" -H "Authorization: Bearer %ORG%" -d @docs/api-examples/bad-json.json
```

Expected: **400 Bad Request**

```json
{
  "error": {
    "code": "BAD_REQUEST",
    "message": "The body is not valid JSON."
  }
}
```
