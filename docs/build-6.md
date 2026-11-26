# Build 6: Frontend on mock data

*Week 9 of the course. Starts from the finished state of Build 5.*

**You deliver:** a website to browse, filter and sort events, view an event, choose tickets, check out with a countdown, and pay with a mock card. It runs on fake data for now.

**You practise:** the DOM, forms, ES modules in the browser, accessibility basics, keeping all data access in one file.

**Done when**
- You can browse, filter, book and "pay" in the browser.
- A sold-out tier is clearly marked and cannot be booked.
- A declined card shows an error and lets you try again.

## User stories in this build

These stories get screens. The criteria stay the same, and this build adds the screen checks below.

### S05: As an attendee, I want to search, filter and sort published events, so that I can find one I like

Criteria: see [Build 2](build-2.md). They must now also pass on the screen.

### S06: As an attendee, I want to book a number of tickets from a tier, so that I get a place

Criteria: see [Build 2](build-2.md). They must now also pass on the screen.

### S07: As an attendee, I want to pay for a booking (mock payment), so that the booking is confirmed

Criteria: see [Build 4](build-4.md). They must now also pass on the screen.

### Screen checks (Build 6)

- **Given** a sold-out tier **When** the attendee views the event **Then** the tier is marked "Sold out" and cannot be booked.
- **Given** a declined mock card **When** the attendee pays **Then** an error is shown and the attendee can try again.
- **Given** a booking in checkout **Then** a countdown shows how long the seats are held.

## AI prompt

Give your AI tool these files first: README.md, docs/user-stories.md, docs/build-6.md and docs/api-examples.md.

Then paste the prompt below. When it answers, do not trust it yet: read the code, run the checks in "Done when", and write what was wrong in `docs/ai-log.md`.

```text
We are building Build 6 of the Event Ticketing capstone: the website, in plain
HTML, CSS and JavaScript (ES modules in the browser, no framework, no build
step). Read README.md, docs/user-stories.md, docs/build-6.md and
docs/api-examples.md before you write anything.

1. public/index.html: browse events, with search, a city filter, a maximum
   price and a sort menu. public/event.html: one event, its tiers, a quantity
   picker, and checkout.

2. public/js/ui.js with a small el(tag, props, children) helper that builds
   DOM nodes. Use textContent and never innerHTML for any data.

3. public/js/mockData.js and public/js/api.js. api.js exports the functions
   the pages call (listEvents, getEvent, createBooking, pay) and returns
   promises with the same shape as the real API in docs/api-examples.md. For
   now they read from mockData.js. Pages must never call fetch directly.

4. public/js/pages/home.js and event.js, and public/css/styles.css.

Rules:
- Prices are whole cents. Format them in one function: 250000 shows as ₦2,500.
- A quantity cannot go above 10 or above the seats left.
- A sold-out tier is clearly marked and its button is disabled.
- Checkout shows a countdown for how long the seats are held.
- A declined mock card shows an error and lets the user try again.
- Every form control has a label; use a button for actions and a link for
  navigation.

When you are done, list every file you changed and any rule from this prompt
that you were unsure about.
```

## Definition of done

The Definition of done in [user-stories.md](user-stories.md) applies to every story in this build.

[All milestones](milestones.md) · [Build 5](build-5.md) · [Build 7](build-7.md)
