# Build 2: Event search, sorting, backlog, first tests

*Week 5 of the course. Starts from the finished state of Build 1.*

**You deliver:** search and filter events by text, city, date range and price; sort by date, price or availability using a merge sort you write yourself; the backlog written as user stories; your first automated tests.

**You practise:** sorting algorithms, stability, Big O, Agile and Scrum, writing user stories with acceptance criteria.

**Done when**
- Search, filter and sort work and never change the original list.
- Every user story you are building has acceptance criteria.
- `npm test` runs and passes.

## User stories in this build

### S02: As an organizer, I want to create an event with title, city, venue and date, so that people can find it

- **Given** an organizer
  **When** they create an event with a title, city, venue and a valid date
  **Then** the event is saved as a draft with a new id, and it is not on the public list.
- **Given** a missing title or city, or a date that is not a real date
  **When** the organizer creates the event
  **Then** the request is rejected with `VALIDATION` and nothing is saved.

### S03: As an organizer, I want to add ticket tiers with a price and capacity, so that I can sell different kinds of ticket

- **Given** a draft event
  **When** the organizer adds a tier "General" at 500000 kobo with capacity 100
  **Then** the tier is saved with 0 sold and 100 seats left.
- **Given** any event
  **When** the price is not a whole number, or the capacity is less than 1
  **Then** the request is rejected with `VALIDATION`.
- **Given** an event id that does not exist
  **When** the organizer adds a tier
  **Then** the request is rejected with `NOT_FOUND`.

### S04: As an organizer, I want to publish and unpublish an event, so that I control when it goes public

*Written by you, in pairs, during the Build 2 class. Add your three criteria here before you paste the AI prompt below.*

### S05: As an attendee, I want to search, filter and sort published events, so that I can find one I like

- **Given** events titled "Lagos Tech Meetup" and "Abuja Jazz Night"
  **When** the attendee searches for "JAZZ"
  **Then** only Abuja Jazz Night is returned.
- **Given** events in Lagos and Abuja
  **When** the attendee filters by city "lagos"
  **Then** only the Lagos events are returned, whatever the capital letters.
- **Given** events with different prices
  **When** the attendee sets a maximum price and sorts by price
  **Then** only events whose cheapest tier is within the maximum are returned, cheapest first, and events with no tiers are left out.
- **Given** two events on the same day
  **When** the attendee sorts by date
  **Then** the earlier one comes first, and the two events on the same day stay in title order.
- **Given** an event at 5 PM on 5 December
  **When** the attendee filters up to the date 2026-12-05
  **Then** that event is included.
- **Given** a bad date, a price that is not a whole number, or an unknown sort option
  **When** the attendee searches
  **Then** the request is rejected with `VALIDATION`.
- **Given** any list of events
  **When** it is searched, filtered or sorted
  **Then** the original list is unchanged.

### S06: As an attendee, I want to book a number of tickets from a tier, so that I get a place

- **Given** a published event with 3 seats left in General
  **When** an attendee books 2
  **Then** a pending booking is created for 2 seats, priced in whole cents, and 1 seat is left.
- **Given** 1 seat left
  **When** an attendee books 2
  **Then** the booking is rejected with `SOLD_OUT` and nothing changes.
- **Given** any tier
  **When** the quantity is 0, negative, fractional or more than 10
  **Then** the request is rejected with `VALIDATION`.

### S16: As a team, I want to run automated tests on every push, so that we notice breakage early

- **Given** the project
  **When** someone runs `npm test`
  **Then** every test runs and the command fails if any test fails. (Build 2)
- **Given** a push to GitHub
  **When** the workflow runs
  **Then** `npm test` runs automatically, and a failing test shows as a failed check. (Build 9)

## AI prompt

Give your AI tool these files first: README.md, docs/user-stories.md, docs/build-2.md and src/domain/.

Then paste the prompt below. When it answers, do not trust it yet: read the code, run the checks in "Done when", and write what was wrong in `docs/ai-log.md`.

```text
We are building Build 2 of the Event Ticketing capstone, in plain JavaScript
(ES modules, Node 22.13 or newer, no outside packages). Read README.md,
docs/user-stories.md, docs/build-2.md and everything in src/domain/ before you write
anything.

Add the following. Do not change what already works.

1. src/domain/sorting.js: mergeSort(items, compare). Write the merge sort
   yourself. Do NOT call Array.prototype.sort. It must be stable (equal items
   keep their original order), it must return a NEW array, and it must never
   modify the one it was given.

2. In inventory.js: publishEvent(store, eventId) and
   listEventSummaries(store, { publishedOnly = true }). Publishing an event
   with no ticket tiers is an INVALID_STATE error. Drafts are hidden from the
   public list.

3. src/domain/eventSearch.js, pure functions only (events in, new list out):
   - filterEvents(summaries, { q, city, from, to, maxPriceCents, onlyAvailable })
     q matches title or venue, ignoring case. city matches exactly, ignoring
     case. from and to are inclusive, and a date-only 'to' includes that whole
     day. maxPriceCents compares with the cheapest tier. Events with no tiers
     are left out of price filters. A bad date or a price that is not a whole
     number is a VALIDATION error.
   - sortEvents(summaries, sortBy) where sortBy is 'date' (earliest first),
     'price' (cheapest first, no price last) or 'availability' (most seats
     left first). Always break ties by title, then id. Use your mergeSort.
     An unknown sortBy is a VALIDATION error.
   - searchEvents(summaries, criteria, sortBy) = filter, then sort.

4. Tests using node:test and node:assert/strict, in test/. One test for every
   acceptance criterion for S02, S03, S05 and S06 in docs/build-2.md, and
   one for each S04 criterion about publishing that our class wrote.
   Include: the original list is unchanged after sorting and filtering, the
   sort is stable, an empty list, and every error code.

5. Add an "npm test" script to package.json.

Rules: money is whole cents; dates are ISO strings; errors are DomainError with
a code; no mutation of inputs. When you are done, list every file you changed
and any rule from this prompt that you were unsure about.
```

## Definition of done

The Definition of done in [user-stories.md](user-stories.md) applies to every story in this build.

[All milestones](milestones.md) · [Build 1](build-1.md) · [Build 3](build-3.md)
