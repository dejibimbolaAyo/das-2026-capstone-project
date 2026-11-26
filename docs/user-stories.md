# Product Backlog: User Stories

Each Build is one sprint. The "Build" column says which build finishes the story end to end (rules, API and screen where it applies). Several stories are touched in more than one build.

## Roles

| Role | Does |
|---|---|
| Organizer | Creates, edits and publishes events and ticket tiers |
| Attendee | Browses, books, pays, cancels, joins waitlists |
| Staff | Checks people in at the door |

## Backlog

| ID | As a... | I want to... | So that... | Priority | Build |
|---|---|---|---|---|---|
| S01 | visitor | sign up and log in | my bookings are private | Must | 7 |
| S02 | organizer | create an event with title, city, venue and date | people can find it | Must | 2 (rules), 4 (API), 7 (screen) |
| S03 | organizer | add ticket tiers with a price and capacity | I can sell different kinds of ticket | Must | 2, 4, 7 |
| S04 | organizer | publish and unpublish an event | I control when it goes public | Must | 2, 4, 7 |
| S05 | attendee | search, filter and sort published events | I can find one I like | Must | 2, 4, 6 |
| S06 | attendee | book a number of tickets from a tier | I get a place | Must | 2, 4, 6 |
| S07 | attendee | pay for a booking (mock payment) | the booking is confirmed | Must | 4, 6 |
| S08 | attendee | be certain the last ticket is sold to only one person | nobody turns up to a full event | Must | 5 |
| S09 | attendee | cancel a booking and get a refund by the policy | I am not stuck if plans change | Must | 8 |
| S10 | attendee | have unpaid bookings expire | seats are not locked forever | Must | 8 |
| S11 | attendee | join a waitlist for a sold-out tier | I can still get a seat if one frees up | Should | 8 |
| S12 | attendee | be offered a freed seat, in order, for a limited time | the process is fair | Should | 8 |
| S13 | attendee | see only my own bookings | my data is private | Must | 7 |
| S14 | staff | scan a ticket's QR code at the door | I can admit the right people | Must | 9 |
| S15 | staff | have forged and repeated scans rejected | nobody gets in twice or with a fake | Must | 9 |
| S16 | team | run automated tests on every push | we notice breakage early | Should | 2 to 9 |

**Stretch:** organizer sales dashboard, per-seat tickets, promo codes, waitlist notifications, partial refunds, organizer cancels the whole event.

## Acceptance criteria for the stories that matter most

### S05: Search, filter and sort events (Build 2)

- **Given** a list of events
  **When** a visitor searches for text
  **Then** events whose title, city or venue contains that text (ignoring letter case) are returned.
- **Given** city, start-date, end-date and price filters
  **When** a visitor uses any combination of them
  **Then** only matching events are returned; dates include the whole day when entered as `YYYY-MM-DD`, and a price range matches an event if any tier is in that range.
- **Given** events with ticket tiers
  **When** a visitor sorts by date, price or availability
  **Then** results are sorted by start time, cheapest tier price or total seats left, respectively; equal values stay in their original order.
- **Given** any search or sort
  **When** it finishes
  **Then** it returns a new list and leaves the original event list unchanged.
- **Given** an event without ticket tiers
  **When** events are sorted by price or availability
  **Then** it is treated as having no price and zero seats left.

### S16: Automated tests (Build 2)

- **Given** the project has no outside packages
  **When** a developer runs `npm test`
  **Then** Node's built-in test runner executes the automated tests and exits successfully when they pass.
- **Given** a search or sorting rule
  **When** its tests run
  **Then** the expected results, unchanged input list and stable ordering are checked.

### S06: Book tickets

- **Given** a published event with 3 seats left in General
  **When** an attendee books 2
  **Then** a pending booking is created for 2 seats, priced in whole cents, and 1 seat is left.
- **Given** 1 seat left
  **When** an attendee books 2
  **Then** the booking is rejected with `SOLD_OUT` and nothing changes.
- **Given** any tier
  **When** the quantity is 0, negative, fractional or more than 10
  **Then** the request is rejected with `VALIDATION`.

### S08: Last ticket (finished in Build 5)

- **Given** exactly 1 seat left
  **When** 50 attendees try to book it at the same moment
  **Then** exactly 1 booking succeeds, 49 get `SOLD_OUT`, and seats sold never exceeds capacity.

### S09: Cancel and refund

- **Given** a paid booking and an event 10 days away
  **When** the attendee cancels
  **Then** 100% is refunded and the seats are released once.
- **Given** an event 3 days away **Then** 50% is refunded.
- **Given** an event 1 day away **Then** nothing is refunded, but the seats are still released.
- **Given** a booking that is already cancelled or refunded
  **When** the attendee cancels again
  **Then** the request is rejected and the seats are not released a second time.

### S12: Waitlist offers

- **Given** three people on the waitlist in order A, B, C
  **When** a seat is freed
  **Then** A (not B or C) is offered it, and the seat is held for A.
- **Given** A does not accept in time
  **When** the offer expires
  **Then** the seat passes to B.

### S15: Check-in

- **Given** a QR code that was edited or made up **Then** it is rejected as invalid.
- **Given** a valid code that has already been scanned **Then** it is rejected as a duplicate and shows when it was first used.
- **Given** a booking that was refunded or cancelled **Then** its code is rejected.

## Definition of done (every story)

1. The rule works and has at least one test, including an edge case.
2. It is reachable the way a user would reach it (API, and screen where it applies).
3. The AI log has an entry for anything the AI got wrong.
4. It is merged through a pull request.
