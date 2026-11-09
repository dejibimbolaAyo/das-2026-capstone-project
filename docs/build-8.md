# Build 8: Refunds, waitlist, expiry, real test suite

*Week 11 of the course. Starts from the finished state of Build 7.*

**You deliver:** a refund policy based on time to the event, cancelling and refunding paid bookings, a waitlist with timed offers, unpaid bookings that expire and release their seats, and a test suite that proves each rule. You finish with a debugging exercise.

**You practise:** unit and integration tests, boundary cases, a controllable clock, scheduled jobs, debugging method.

**Done when**
- Tests cover every refund boundary, cancelling twice, waitlist order, an offer expiring and passing to the next person, and an unpaid hold expiring.
- The website shows the refund amount before you confirm a cancel, offers "Join waitlist" on sold-out tiers, and shows offers with a countdown.
- Your debugging exercise write-up is complete.

## User stories in this build

### S09: As an attendee, I want to cancel a booking and get a refund by the policy, so that I am not stuck if plans change

- **Given** a paid booking and an event 10 days away
  **When** the attendee cancels
  **Then** 100% is refunded and the seats are released once.
- **Given** an event 3 days away **Then** 50% is refunded.
- **Given** an event 1 day away **Then** nothing is refunded, but the seats are still released.
- **Given** a booking that is already cancelled or refunded
  **When** the attendee cancels again
  **Then** the request is rejected and the seats are not released a second time.

### S10: As an attendee, I want to have unpaid bookings expire, so that seats are not locked forever

- **Given** a pending booking older than the hold time
  **When** the expiry job runs
  **Then** the booking becomes cancelled and its seats are released once.
- **Given** an expired booking
  **When** the attendee tries to pay
  **Then** the request is rejected with `BOOKING_EXPIRED`.
- **Given** a paid booking
  **When** the expiry job runs
  **Then** nothing changes.

### S11: As an attendee, I want to join a waitlist for a sold-out tier, so that I can still get a seat if one frees up

- **Given** a sold-out tier
  **When** an attendee joins the waitlist
  **Then** they are added at the end of the line.
- **Given** a tier that still has seats
  **When** an attendee tries to join the waitlist
  **Then** the request is rejected with `NOT_SOLD_OUT`.
- **Given** an attendee already on the waitlist
  **When** they join again
  **Then** the request is rejected with `ALREADY_ON_WAITLIST`.

### S12: As an attendee, I want to be offered a freed seat, in order, for a limited time, so that the process is fair

- **Given** three people on the waitlist in order A, B, C
  **When** a seat is freed
  **Then** A (not B or C) is offered it, and the seat is held for A.
- **Given** A does not accept in time
  **When** the offer expires
  **Then** the seat passes to B.
- **Given** an expired offer
  **When** A tries to accept it
  **Then** the request is rejected with `OFFER_EXPIRED`.

## AI prompt

Give your AI tool these files first: README.md, docs/user-stories.md, docs/build-8.md, docs/debugging-exercise.md (when your instructor gives it to you) and everything in src/ and test/.

Then paste the prompt below. When it answers, do not trust it yet: read the code, run the checks in "Done when", and write what was wrong in `docs/ai-log.md`.

```text
We are building Build 8 of the Event Ticketing capstone, in plain JavaScript
(ES modules, Node 22.13 or newer, no outside packages). Read README.md,
docs/user-stories.md, docs/build-8.md and everything in src/ and test/ before
you write anything.

1. src/lib/clock.js: a clock that the code asks for the time, so tests can
   control "now".

2. src/domain/refundPolicy.js, a pure function calculateRefund({ amountCents,
   startsAt, now }): 7 days or more before the start is 100%, 2 days or more
   is 50%, under 2 days is 0%. An exact boundary belongs to the better tier.
   An event that has started throws EVENT_STARTED. Use Math.floor on cents.

3. Cancelling a paid booking: use the state machine, call the mock gateway's
   refund, and release the seats exactly once. Cancelling twice must not
   release the seats twice. Do it with a compare-and-set on the booking status.

4. src/services/seatService.js and waitlistService.js: when seats are freed,
   offer them to the first person on the waitlist, hold the seats for that
   person for the offer time, and pass them to the next person if the offer
   expires. POST /api/waitlist to join (NOT_SOLD_OUT if seats remain,
   ALREADY_ON_WAITLIST for a repeat), and an accept route (OFFER_EXPIRED
   after the deadline).

5. src/jobs/maintenance.js: cancel pending bookings older than the hold time
   and release their seats, then offer the freed seats to the waitlist. Tests
   call the job directly. The server runs it with setInterval.

6. UI: cancelling shows the refund amount before you confirm; sold-out tiers
   offer "Join waitlist"; an offer shows a countdown and an Accept button.

7. Tests for every rule: each refund boundary (exactly 7 days, 6 days 23
   hours, exactly 2 days, 1 day 23 hours), cancelling twice, waitlist order,
   an offer expiring and passing on, and an unpaid hold expiring.

Rules: money is whole cents; seats are never released twice; a waitlist offer
really holds the seats. When you are done, list every file you changed and any
rule from this prompt that you were unsure about.
```

## Definition of done

The Definition of done in [user-stories.md](user-stories.md) applies to every story in this build.

[All milestones](milestones.md) · [Build 7](build-7.md) · [Build 9](build-9.md)
