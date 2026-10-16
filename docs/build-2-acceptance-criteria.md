# Build 2: Acceptance Criteria

These are the user stories I am finishing in Build 2 (the rules, in the terminal).
S06 already has its criteria in `docs/user-stories.md`, so it is not repeated here.
Each criterion below has a matching test in the `test/` folder. Run them with `npm test`.

## S02: Create an event

- **Given** a title, city, venue and a real date like `2026-12-05`
  **When** the organizer creates an event
  **Then** the event is created as a draft.
- **Given** a missing title, city or venue
  **When** the organizer creates an event
  **Then** it is rejected with `VALIDATION`.
- **Given** a date that is not a real calendar date, like `2026-02-30`
  **Then** it is rejected with `VALIDATION`.

## S03: Add ticket tiers

- **Given** an event
  **When** the organizer adds a tier with a price in whole cents and a capacity of 1 or more
  **Then** the tier is added with all its seats free.
- **Given** a price that is negative or not a whole number, or a capacity below 1 or not a whole number
  **Then** it is rejected with `VALIDATION`.
- **Given** a tier id that already exists on the event
  **Then** it is rejected with `VALIDATION`.

## S04: Publish and unpublish

- **Given** a draft event with at least one tier
  **When** the organizer publishes it
  **Then** its status is `published`.
- **Given** an event with no tiers
  **When** the organizer publishes it
  **Then** it is rejected with `VALIDATION` and stays a draft.
- **Given** a published event
  **When** the organizer unpublishes it
  **Then** it goes back to a draft and no longer appears in search.

## S05: Search, filter and sort

- **Given** a list of events, some published and some drafts
  **When** an attendee searches with no filters
  **Then** only the published events come back.
- **Given** the words `night`
  **When** an attendee searches
  **Then** events with `night` in the title, city or venue come back, in any capital letters.
- **Given** a city, a date range, or a price range
  **When** an attendee filters
  **Then** only matching events come back. Both ends of a range are included. The price is the cheapest tier.
- **Given** any search or sort
  **Then** the original list is never changed.
- **Given** a sort by date, price or availability, in either direction
  **Then** the events come back in that order. Events that tie keep their original order.
- **Given** a bad filter (a date that is not real, a negative price, a start after an end) or a bad sort key
  **Then** it is rejected with `VALIDATION`.

## S16: Automated tests

- **Given** the project
  **When** I run `npm test`
  **Then** every test runs and passes.

## Decisions I made that the story did not say

- An event with no tiers cannot be published, because it has nothing to sell.
- Only a published event can be booked. Booking a draft gives `NOT_PUBLISHED`.
- Events are sorted by price using the cheapest tier.
