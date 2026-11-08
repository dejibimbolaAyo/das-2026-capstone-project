Build 2: Event Search, Sorting, Backlog and First Tests

Week 5 of the course. Starts from the finished state of Build 1.

Deliverables

- Search and filter events by text, city, date range and price.
- Sort events by date, price or availability using a self-written merge sort.
- Write the product backlog as user stories with acceptance criteria.
- Implement the first automated tests.

Learning Objectives

- Sorting algorithms
- Merge sort and stability
- Big O notation
- Agile and Scrum
- Writing user stories with acceptance criteria
- Automated testing with Node.js

Definition of Done

Build 2 is complete when:

- Search, filtering and sorting work correctly without changing the original list.
- Every user story being developed has clear acceptance criteria.
- "npm test" runs successfully and all tests pass.

---

User Stories and Acceptance Criteria

S02: Create an Event

User Story:

As an organizer, I want to create an event with a title, city, venue and date, so that people can find it.

Acceptance Criteria

1. Given an organizer, when they create an event with a title, city, venue and valid date, the event is saved as a draft with a new ID and does not appear on the public event list.

2. Given a missing title or city, or a date that is not a real calendar date, when the organizer creates the event, the request is rejected with "VALIDATION" and nothing is saved.

---

S03: Add Ticket Tiers

User Story:

As an organizer, I want to add ticket tiers with a price and capacity, so that I can sell different kinds of tickets.

Acceptance Criteria

1. Given a draft event, when the organizer adds a ticket tier named "General" at 500000 kobo with a capacity of 100, the tier is saved with 0 tickets sold and 100 seats left.

2. Given any event, when the ticket price is not a whole number or the capacity is less than 1, the request is rejected with "VALIDATION".

3. Given an event ID that does not exist, when the organizer attempts to add a ticket tier, the request is rejected with "NOT_FOUND".

---

S04: Publish and Unpublish an Event

User Story:

As an organizer, I want to publish and unpublish an event, so that I control when it goes public.

Acceptance Criteria

1. Given a draft event with at least one ticket tier, when the organizer publishes it, its status changes to "published" and it appears in the public event list.

2. Given a published event, when the organizer unpublishes it, its status changes to "draft" and it disappears from the public event list.

3. Given an event with no ticket tiers, when the organizer attempts to publish it, the system returns an "INVALID_STATE" error and the event remains a draft.

---

S05: Search, Filter and Sort Published Events

User Story:

As an attendee, I want to search, filter and sort published events, so that I can find one I like.

Acceptance Criteria

1. Given events titled "Lagos Tech Meetup" and "Abuja Jazz Night", when the attendee searches for "JAZZ", only Abuja Jazz Night is returned.

2. Given events in Lagos and Abuja, when the attendee filters by city "lagos", only Lagos events are returned, regardless of capitalization.

3. Given events with different prices, when the attendee sets a maximum price, only events whose cheapest ticket tier is within the maximum price are returned. Events without ticket tiers are excluded from price filtering.

4. Given two events on the same day, when the attendee sorts by date, the events on that day remain in alphabetical order by title.

5. Given an event scheduled for 5 PM on 5 December, when the attendee filters up to the date "2026-12-05", that event is included.

6. Given an invalid date, a price that is not a whole number, or an unknown sorting option, when the attendee searches, the request is rejected with "VALIDATION".

7. Given any list of events, when it is searched, filtered or sorted, the original list remains unchanged.

Sorting Rules

- Date: Earliest events first.
- Price: Cheapest ticket tier first. Events without a price appear last.
- Availability: Events with the most available seats appear first.
- Tie-breaking: Events with equal sorting values are arranged by title, then ID.
- Algorithm: Use the self-written stable merge sort implemented in "src/domain/sorting.js".

---

S06: Book Tickets

User Story:

As an attendee, I want to book a number of tickets from a ticket tier, so that I get a place at an event.

Acceptance Criteria

1. Given a published event with 3 seats left in General, when an attendee books 2 tickets, a pending booking is created for 2 seats, the price is calculated in whole cents, and 1 seat remains.

2. Given an event with 1 seat left, when an attendee attempts to book 2 tickets, the booking is rejected with "SOLD_OUT" and nothing changes.

3. Given any ticket tier, when the booking quantity is 0, negative, fractional or greater than 10, the request is rejected with "VALIDATION".

---

S16: Automated Testing

User Story:

As a development team, I want to run automated tests on every push, so that we notice breakage early.

Acceptance Criteria

1. Given the project, when someone runs "npm test", every test runs and the command exits with a failure status if any test fails. (Build 2)

2. Given a push to GitHub, when the automated workflow runs, "npm test" runs automatically and a failing test appears as a failed check. (Build 9)

---

AI Implementation Instructions

Give your AI tool these files first:

- "README.md"
- "docs/user-stories.md"
- "docs/build-2.md"
- Everything inside "src/domain/"

Then use the following prompt.

AI Prompt

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

     q matches title or venue, ignoring case.
     city matches exactly, ignoring case.
     from and to are inclusive, and a date-only 'to' includes that whole day.
     maxPriceCents compares with the cheapest tier.
     Events with no tiers are left out of price filters.
     A bad date or a price that is not a whole number is a VALIDATION error.

   - sortEvents(summaries, sortBy)

     sortBy must be 'date' (earliest first),
     'price' (cheapest first, no price last) or
     'availability' (most seats left first).

     Always break ties by title, then ID.
     Use your mergeSort.
     An unknown sortBy is a VALIDATION error.

   - searchEvents(summaries, criteria, sortBy) = filter, then sort.

4. Tests using node:test and node:assert/strict, in test/.
   Write one test for every acceptance criterion for S02, S03, S05 and S06
   in docs/build-2.md, and one test for each S04 publishing criterion
   written during the Build 2 class.

   Include:
   - The original list is unchanged after sorting and filtering.
   - The sort is stable.
   - An empty list.
   - Every error code.

5. Add an "npm test" script to package.json.

Rules:
- Money is whole cents.
- Dates are ISO strings.
- Errors are DomainError instances with a code.
- Do not mutate input data.

When you are done, list every file you changed and any rule from this prompt
that you were unsure about.

---

Final Build 2 Verification Checklist

Before submitting Build 2, verify the following:

- [ ] Event creation works and new events are saved as drafts.
- [ ] Invalid event details are rejected.
- [ ] Ticket tiers can be created with valid prices and capacities.
- [ ] Invalid ticket tiers are rejected.
- [ ] Events can be published and unpublished.
- [ ] Events without ticket tiers cannot be published.
- [ ] Event search works by title and venue.
- [ ] City filtering ignores capitalization.
- [ ] Date filtering includes the complete end date.
- [ ] Maximum-price filtering works correctly.
- [ ] Sold-out events can be excluded.
- [ ] Merge sort is stable and does not mutate the original list.
- [ ] Sorting works by date, price and availability.
- [ ] Booking and ticket quantity validation work.
- [ ] "npm test" passes all automated tests.
- [ ] "docs/ai-log.md" records implementation details and AI corrections.
- [ ] All Build 2 changes are committed and pushed to the personal GitHub repository.
- [ ] A pull request is created according to the course submission process.

---

Previous Build: Build 1 – Event Ticketing Domain Core

Next Build: Build 3 – Continue the Event Ticketing App development.


**One important note:** This document corrects the structure of your original file. It does not mean every acceptance criterion has already been tested. We will complete the missing S02 and S03 tests before declaring Build 2 finished.x