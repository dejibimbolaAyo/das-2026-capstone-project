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

## Where the acceptance criteria are

Each story's Given/When/Then criteria are in the file of the Build that first delivers it.

| Story | Criteria in |
|---|---|
| S01 | [Build 7](build-7.md) |
| S02 | [Build 2](build-2.md) |
| S03 | [Build 2](build-2.md) |
| S04 | [Build 2](build-2.md) |
| S05 | [Build 2](build-2.md) |
| S06 | [Build 2](build-2.md) |
| S07 | [Build 4](build-4.md) |
| S08 | [Build 5](build-5.md) |
| S09 | [Build 8](build-8.md) |
| S10 | [Build 8](build-8.md) |
| S11 | [Build 8](build-8.md) |
| S12 | [Build 8](build-8.md) |
| S13 | [Build 7](build-7.md) |
| S14 | [Build 9](build-9.md) |
| S15 | [Build 9](build-9.md) |
| S16 | [Build 2](build-2.md) |

## Definition of done (every story)

1. The rule works and has at least one test, including an edge case.
2. It is reachable the way a user would reach it (API, and screen where it applies).
3. The AI log has an entry for anything the AI got wrong.
4. It is merged through a pull request.
