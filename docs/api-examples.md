# Build 4 – API Examples

This document shows how to use the Event Ticketing API.

The API uses JSON for request and response bodies. Protected routes require the `x-user-id` request header.

## 1. Create an event

**POST** `/api/events`

```bash
curl -X POST http://localhost:3000/api/events \
  -H "Content-Type: application/json" \
  -H "x-user-id: user-001" \
  -d '{
    "title": "Tech Conference 2026",
    "city": "Abuja",
    "venue": "Abuja Conference Centre",
    "startsAt": "2026-12-15T10:00:00.000Z"
  }'
```

## 2. Add a ticket tier

**POST** `/api/events/:id/tiers`

Replace `:id` with the event ID returned when creating the event.

```bash
curl -X POST http://localhost:3000/api/events/EVENT_ID/tiers \
  -H "Content-Type: application/json" \
  -H "x-user-id: user-001" \
  -d '{
    "name": "Regular",
    "priceCents": 500000,
    "capacity": 100
  }'
```

## 3. Publish the event

**POST** `/api/events/:id/publish`

```bash
curl -X POST http://localhost:3000/api/events/EVENT_ID/publish \
  -H "x-user-id: user-001"
```

## 4. Search published events

**GET** `/api/events`

```bash
curl "http://localhost:3000/api/events?city=Abuja&sortBy=date"
```

Available filters include:

- `query` – Search event title or venue.
- `city` – Filter by city.
- `from` – Start date.
- `to` – End date.
- `maxPriceCents` – Maximum ticket price in cents.
- `onlyAvailable` – Set to `true` to hide sold-out events.
- `sortBy` – Sort by `date`, `price`, or `availability`.

## 5. Book tickets

**POST** `/api/bookings`

```bash
curl -X POST http://localhost:3000/api/bookings \
  -H "Content-Type: application/json" \
  -H "x-user-id: user-002" \
  -d '{
    "tierId": "TIER_ID",
    "quantity": 2
  }'
```

## 6. Pay for a booking

**POST** `/api/bookings/:reference/pay`

Replace `:reference` with the booking reference returned when booking tickets.

Successful payment:

```bash
curl -X POST http://localhost:3000/api/bookings/BOOKING_REFERENCE/pay \
  -H "Content-Type: application/json" \
  -H "x-user-id: user-002" \
  -d '{}'
```

Simulate a declined payment:

```bash
curl -X POST http://localhost:3000/api/bookings/BOOKING_REFERENCE/pay \
  -H "Content-Type: application/json" \
  -H "x-user-id: user-002" \
  -d '{
    "decline": true
  }'
```

A declined payment leaves the booking pending so the user can retry.

## 7. Cancel an unpaid booking

**POST** `/api/bookings/:reference/cancel`

```bash
curl -X POST http://localhost:3000/api/bookings/BOOKING_REFERENCE/cancel \
  -H "x-user-id: user-002"
```

Cancellation releases the reserved tickets.

## 8. Unpublish an event

**POST** `/api/events/:id/unpublish`

Replace `:id` with the event ID.

```bash
curl -X POST http://localhost:3000/api/events/EVENT_ID/unpublish \
  -H "x-user-id: user-001"