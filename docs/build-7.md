# Build 7: Login, roles and a connected app

*Week 10 of the course. Starts from the finished state of Build 6.*

**You deliver:** signup and login with safely stored passwords and signed tokens, three roles, checks that people only see their own data, and the website talking to the real API. New pages: login, my tickets, organizer dashboard.

**You practise:** `fetch`, loading and error states, authentication versus authorization, password hashing, tokens.

**Done when**
- You can sign up as an organizer, publish an event, then sign up as an attendee, book and pay, all in the browser.
- One attendee cannot read another attendee's booking, and one organizer cannot edit another organizer's event.
- `npm test` includes login, bad-token and wrong-role tests.

## User stories in this build

S02 to S04 get organizer screens, with the criteria from Build 2.

### S01: As a visitor, I want to sign up and log in, so that my bookings are private

- **Given** a new email and a password of at least 8 characters
  **When** a visitor signs up
  **Then** an attendee account is created, the password is stored only as a hash, and a signed token is returned.
- **Given** an email that is already registered
  **When** someone signs up with it
  **Then** the request is rejected with `EMAIL_TAKEN`.
- **Given** correct credentials
  **When** the user logs in
  **Then** a signed token is returned.
- **Given** a wrong password or an unknown email
  **When** someone logs in
  **Then** the request is rejected with `INVALID_CREDENTIALS`, and the message is the same for both cases.
- **Given** a missing, edited or expired token
  **When** any protected request is made
  **Then** it is rejected with `UNAUTHENTICATED`.

### S13: As an attendee, I want to see only my own bookings, so that my data is private

- **Given** attendee A has a booking
  **When** attendee B asks for it
  **Then** the request is rejected with `FORBIDDEN`.
- **Given** an attendee
  **When** they ask for the list of bookings
  **Then** only their own bookings are returned.
- **Given** organizer A's event
  **When** organizer B tries to edit it
  **Then** the request is rejected with `FORBIDDEN`.
- **Given** an attendee account
  **When** it tries to create an event
  **Then** the request is rejected with `FORBIDDEN`.

### S02: As an organizer, I want to create an event with title, city, venue and date, so that people can find it

Criteria: see [Build 2](build-2.md). They must now also pass on the screen.

### S03: As an organizer, I want to add ticket tiers with a price and capacity, so that I can sell different kinds of ticket

Criteria: see [Build 2](build-2.md). They must now also pass on the screen.

### S04: As an organizer, I want to publish and unpublish an event, so that I control when it goes public

Criteria: see [Build 2](build-2.md). They must now also pass on the screen.

## AI prompt

Give your AI tool these files first: README.md, docs/user-stories.md, docs/build-7.md, docs/api-examples.md and everything in src/ and public/.

Then paste the prompt below. When it answers, do not trust it yet: read the code, run the checks in "Done when", and write what was wrong in `docs/ai-log.md`.

```text
We are building Build 7 of the Event Ticketing capstone, in plain JavaScript
(ES modules, Node 22.13 or newer, no outside packages). Read README.md,
docs/user-stories.md, docs/build-7.md, docs/api-examples.md and everything in
src/ and public/ before you write anything.

1. src/lib/password.js: hash and verify passwords with scrypt from node:crypto,
   with a random salt per password and a constant-time comparison.

2. src/lib/token.js: sign and verify HS256 tokens with node:crypto. Tokens
   expire. Reject any token whose header says alg is anything but HS256. The
   secret comes from an environment variable.

3. src/services/authService.js and src/routes/auth.js: POST /api/auth/signup
   (email, password of at least 8 characters, role of attendee, organizer or
   staff), POST /api/auth/login and GET /api/auth/me. The wrong password and an
   unknown email give the same INVALID_CREDENTIALS error. A repeated email
   gives EMAIL_TAKEN.

4. src/http/guards.js: requireUser and requireRole. Replace the x-user-id
   header everywhere with the bearer token. Ownership checks:
   - an attendee can only read or cancel their own bookings (another person's
     booking gives NOT_FOUND)
   - an organizer can only change their own events (otherwise FORBIDDEN)

5. Frontend: replace the mock api.js with one that uses fetch and sends
   Authorization: Bearer <token>. Add public/js/session.js, login.html,
   tickets.html (my tickets) and organizer.html (create events and tiers,
   publish). Show loading and error states.

6. Tests: signup, login, bad token, expired token, wrong role, and one
   attendee reading another's booking.

Rules: never store, log or return a password; the role is checked on the
server, never only in the page. When you are done, list every file you changed
and any rule from this prompt that you were unsure about.
```

## Definition of done

The Definition of done in [user-stories.md](user-stories.md) applies to every story in this build.

[All milestones](milestones.md) · [Build 6](build-6.md) · [Build 8](build-8.md)
