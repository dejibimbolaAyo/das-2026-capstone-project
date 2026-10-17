# Refunds, waitlist, expiry (Build 8)

## The refund policy
The server decides the amount. It lives in one pure function, `calculateRefund` in `src/domain/refundPolicy.js`, so it is easy to test.

| When the person cancels a PAID booking | Refund |
|---|---|
| 7 days or more before the event starts | 100% |
| 2 days or more, but less than 7 | 50% |
| Less than 2 days before the start | 0% (the seats still go back on sale) |
| The event has already started | refused: `EVENT_STARTED` (409) |

- An **unpaid** booking can be cancelled any time before the event. Nothing was paid, so nothing is refunded.
- Money is whole cents. 50% of an odd number is rounded **down** to a whole cent (the shop never pays out more than the policy says).
- Shortcut: an event only has a date, so it "starts" at 00:00 UTC on that date.
- `GET /api/bookings/:ref/refund` shows what the person would get (the website uses it for the "are you sure?" panel). `POST /api/bookings/:ref/cancel` does it and returns `{ booking, refund }`.

## Expiry: the 10 minute hold is now real
- Before Build 8 only the website counted down. Now the server enforces it.
- An unpaid booking has `holdExpiresAt`. After that time the booking becomes `expired` and its seats go back on sale.
- Paying a late booking is refused with `BOOKING_EXPIRED` (409), even if nobody has swept yet.
- Two things release late bookings: a **lazy sweep** (every booking/waitlist action first sweeps) and a **timer job** (`src/jobs/maintenance.js`, every 15 seconds in `start.js`). Both call the same `sweep`, which is safe to run twice.

## Waitlist
1. A person joins the waitlist of a **sold-out** tier (`POST /api/waitlist`). Not sold out: `NOT_SOLD_OUT`. Joining twice: `ALREADY_ON_WAITLIST`. Attendees only.
2. When seats free up (cancel, refund, or expiry) the first people in line get an **offer**. The seat is held for them for **15 minutes**.
3. `POST /api/waitlist/:id/accept` turns the offer into a pending booking (then they pay within the normal 10 minutes).
4. No answer in time: the offer becomes `expired` and the seat goes to the next person. `POST /api/waitlist/:id/leave` turns an offer down or leaves the line.
- Entry states: `waiting`, `offered`, `accepted`, `expired`, `left`.
- A waitlist entry is for **1 seat** (shortcut).

## The seat rule (the invariant)
`tiers.sold` counts every seat that is spoken for: pending bookings + paid bookings + seats held by open offers. It never goes above capacity and never below zero. `test/waitlist.test.js` runs thousands of random actions with a fixed seed and checks this after every step.

## Two people at once
Every status change is a **compare-and-set**: `UPDATE ... WHERE status = 'pending'`. If two things race (the person cancels while the timer expires the booking), only one wins; the other sees "nothing changed" and stops. Seats are therefore released exactly once.

## Testing time
`src/lib/clock.js` has a real clock and a fake clock (`createFakeClock`, with `advance`). Tests move the fake clock instead of waiting 10 minutes.

## Known shortcuts
- Event start = 00:00 UTC on its date. Real events have start times and time zones.
- 1 seat per waitlist entry.
- The refund is recorded first, then the pretend payment gateway is told (`refundMock`). A real gateway can fail in between; a real system would keep a "refund pending" state and retry.
- A booking that ran out of time uses the existing `expired` state (not `cancelled`).
- The in-memory store is now SQLite `:memory:`, so tests use the same code as the real database.
- No emails: a person only learns about an offer when they open My tickets (the page checks every 20 seconds).
