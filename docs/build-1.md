# Build 1: Domain core in the terminal

*Week 4 of the course. You start from an empty folder.*

**You deliver:** events, ticket tiers, bookings with a capacity rule, a first-in-first-out waitlist, and fast lookup of a booking by its reference code. It runs in the terminal. No server, no database.

**You practise:** functions and objects, `Map`, a queue built as a linked list, Big O, errors, Git.

**Done when**
- `npm run demo` prints the whole story: an event sells out, a booking is refused, people join the waitlist, a booking is cancelled, and the next person in line is named.
- `npm run benchmark` shows a `Map` lookup far faster than `Array.find`, and you can explain why in Big O terms.
- Your first pull request is merged.

## User stories in this build

No stories are finished in this build. It builds the rules that S02, S03 and S06 will rely on. The backlog and the criteria are written in Build 2.

## AI prompt

Give your AI tool these files first: README.md and docs/build-1.md.

Then paste the prompt below. When it answers, do not trust it yet: read the code, run the checks in "Done when", and write what was wrong in `docs/ai-log.md`.

```text
We are starting the Event Ticketing capstone in plain JavaScript (ES modules,
Node 22.13 or newer, no outside packages). It runs in the terminal only: no
server, no database. Read README.md and docs/build-1.md before you write
anything.

Create these files, and set "type": "module" in package.json.

1. src/domain/errors.js: a DomainError class that extends Error and carries a
   machine-readable code (for example VALIDATION, NOT_FOUND, SOLD_OUT).

2. src/domain/ids.js: newId() and newReference(). Use node:crypto, never
   Math.random. A reference is a short, readable booking code that is safe to
   read aloud.

3. src/domain/waitlistQueue.js: a first-in-first-out Queue class built as a
   linked list, with private fields. enqueue, dequeue, peek and size must all
   be fast (O(1)). Do not use array.shift().

4. src/domain/inventory.js: createStore(), createEvent, addTier, bookTickets,
   cancelBooking, findBookingByReference and joinWaitlist.
   - A booking is for 1 to 10 tickets from one tier.
   - If there are not enough seats, throw SOLD_OUT and change nothing.
   - Cancelling releases the seats. Cancelling twice is an error.
   - Find a booking by its reference in O(1) with a Map.

5. scripts/demo.js: tells the whole story. An event sells out, a booking is
   refused, two people join the waitlist, a booking is cancelled, and the next
   person in line is named.

6. scripts/benchmark-lookup.js: compares Map.get with Array.find over many
   bookings and prints both timings. Add "demo" and "benchmark" scripts to
   package.json.

Rules: money is whole cents (never decimals); validate every input and throw a
DomainError with a code; a failed booking must not change anything. When you
are done, list every file you created and any rule from this prompt that you
were unsure about.
```

## Definition of done

The Definition of done in [user-stories.md](user-stories.md) applies to every story in this build.

[All milestones](milestones.md) · [Build 2](build-2.md)
