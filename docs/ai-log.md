# AI Log

## Build 1
- I asked: for the Build 1 domain core (events, bookings, waitlist, Map lookup).
- What came back: 7 files, with a linked-list queue and a Map for bookings.
- - What was wrong: Nothing was wrong with the code. It ran with no errors. npm was blocked by PowerShell on my PC, which was a Windows setting.
- What I changed: I switched the terminal to Command Prompt (or allowed scripts) and ran it again. Demo and benchmark both worked.
Map goes straight to the answer, but Array.find checks every booking, so Map is faster when there are many bookings.”
## Build 2
- I asked: for Build 2 (search, filter, merge sort, tests, acceptance criteria).
- What came back: search.js, sort.js, 50 tests, and a criteria document.
- What was wrong: the Build 1 code did not match the teacher's rules in docs/user-stories.md. It used kobo instead of cents, had no limit of 10 tickets, used the wrong error names, and made bookings "confirmed" instead of "pending". I found this by reading the user stories.
- What I changed: the AI fixed all four. I checked the fixes by running npm test (50 passed).
- Stable sort: if two events tie, the one that was first stays first.
- Search and sort make a copy. The original list stays the same.
## Build 3
- I asked: for Build 3 (state machine, layered design, server skeleton).
- What came back: a booking state machine, routes/services/rules/data layers, a server with /health, and two diagrams.
- What was wrong: the AI's own tests found 3 problems. createEvent crashed with a TypeError when given nothing. A booking could be cancelled through the wrong event. The first safety check for the static server did not cover Windows backslash paths.
- The AI also put a folder named src/data, and the course .gitignore ignores any folder called data, so Git did not see it. I found it in git status and fixed it with !src/data/ in .gitignore.
- What I changed: the AI fixed all of these and added tests for each. I checked by running npm test (139 passed) and by opening /health in the browser.
## Build 4: REST API (in memory)

**What I asked the AI:**
Build a working REST API for the event ticketing project. It should let me create events and tiers, publish and unpublish, search and sort, book tickets, pay with a mock payment, and cancel an unpaid booking. Errors must always come back in the same shape, and `docs/api-examples.md` must work with curl.

**What the AI produced:**
- The API under `/api`, split into routes (HTTP only), services (what a person does) and rules (the business decisions).
- One table that turns every error code into an HTTP status (for example `SOLD_OUT` is 409, `PAYMENT_DECLINED` is 402).
- A mock payment: `tok_success` works and `tok_declined` is refused.
- `docs/api-examples.md` with 22 curl examples and their real answers.
- 49 new tests, so the project now has 188.

**What I checked myself:**
- I ran `npm test` and got pass 188, fail 0.
- I started the server and ran the curl commands one by one: create event, add tier, publish, book 2 of 3 seats (pending, 1,000,000 cents), pay (paid), then book 2 more and got `SOLD_OUT`. All answers matched the examples page.
- I ran `npm run demo:api` and read the printed story.

**What the AI got wrong (and how it was fixed):**
1. One of its own tests expected the wrong answer. It said a wrong method on `/api/bookings` should be 404, but the correct answer is 405 (method not allowed). The test was fixed, not the code.
2. Sending an empty body to `POST /api/bookings` gave 404 "not found" instead of a clear 400 validation error. The AI added a check that the event id and tier id must be text.
3. The architecture test did not allow routes to call services. The AI updated the rule (routes may use services, never the rules directly) and added a test proving a route that imports a rule is caught.
4. When I first tried curl, it failed with "Failed to connect". That was my mistake, not the code: the server was not running. It needs `npm start` in one terminal and curl in another.

**What I learned:**
- An API is a way for other programs to talk to my server, using addresses (like `/api/events`) and methods (GET to look, POST to send).
- Status codes tell the caller what happened: 201 created, 400 bad input, 404 not found, 409 not allowed right now.
- A route should only read the request and send the answer. The decisions belong in the rules.
- Everything is kept in memory, so restarting the server clears the data. Build 5 fixes that with SQLite.

**Known shortcuts for later:**
- A draft event can still be looked up by its id. Build 7 (login) will restrict that.
- Paid bookings cannot be cancelled yet. Refunds come in Build 8.
## Build 5: SQLite and the overselling fix

What I asked the AI: store the data in SQLite, reproduce the last-ticket problem, and fix it so 50 people trying for the last ticket gives exactly one winner.
What it produced: a SQLite store, one atomic “take the seat only if there is room” step inside a transaction, a CHECK constraint as a safety net, a script that shows the bug and the fix, and 79 new tests.
What I checked myself: npm test (267 pass), npm run demo:oversell, the curl examples, and a restart (data was still there).
What the AI got wrong: (1) my first idea for the test would never have failed, because Node’s SQLite is synchronous and one process can’t race itself. The AI changed it to use separate database connections and a test with an old copy of the event. (2) The first version of “save event” could overwrite bookings made a moment earlier with an old copy. A test caught it, and the AI fixed it so only bookings can change sold. (3) A mutation check showed the “pay” step in the store was not tested on its own, so a test was added.
What I learned: a check and a write must be one step. A database can refuse bad data itself (constraints). A test must be able to fail, or it proves nothing.
## Build 6: Frontend on mock data

**What I asked the AI:** Build a website where people can browse, filter and sort events, view an event, choose tickets, check out with a countdown, and pay with a mock card. It uses fake data only, keeps all data access in one file, and follows accessibility basics and ES modules.

**What the AI produced:** A `public/` folder with a router (`main.js`), one data file (`api.js`) that holds the fake events and bookings in the same shape as my Build 4/5 API, four screens (browse, event, checkout, confirmation), helper files for money, countdown and card checks, CSS, 48 new tests, and a walkthrough in a real browser.

**What I checked myself:** I ran `npm test` (316 tests pass) and opened http://localhost:3000. I browsed and filtered events, and tried a sold-out ticket type (it cannot be chosen). I paid with 4242 4242 4242 4242 (works), then with 4000 0000 0000 0002 (shows an error and lets me retry). I used /?hold=20 to watch the countdown run out.

**What the AI got wrong:**
- The event list said "From ₦5,000" for an event whose cheapest ticket type was sold out. It now shows the cheapest type that can still be bought.
- Comments in the code mentioned `innerHTML`, a web address and a card number, and my own safety tests flagged them. The comments were reworded.
- The mock booking has an extra field, `holdExpiresAt`, that the real API does not have yet (planned for Build 8). A test records this on purpose.
- The first version had no favicon, so the browser showed a 404 error in the console.

**What I learned:** Keeping all data access in one file means Build 7 only has to change `api.js`. User text must never go into `innerHTML`. A countdown should not be read out every second by a screen reader.
## Build 7: Login, roles and a connected app

**What I asked the AI:** Add signup and login with safely stored passwords and signed tokens, three roles (attendee, organizer, staff), checks so people only see their own data, and connect the website to the real API, with new pages for login, my tickets and an organizer dashboard.

**What the AI produced:** scrypt password hashing and hand-written signed tokens (`src/auth.js`, `src/tokens.js`), an access layer (`src/services/access.js`) used by the event and booking services, a version 2 database upgrade (users, owners, hold time) that keeps old data, new `/api/auth` and `/api/me` routes, a real-`fetch` `api.js` (the mock is gone), three new pages, a seed script, `docs/auth.md`, and about 100 new tests (login, bad token, wrong role, other people's bookings and events).

**What I checked myself:** I ran `npm test`, ran `npm run seed`, signed up as an organizer, created and published an event, signed up as an attendee in another browser, booked and paid with 4242 4242 4242 4242, tried 4000 0000 0000 0002, and tried to open another person's booking and another organizer's event.

**What the AI got wrong / what I changed:**
- An unused import in a service broke every service file at once; it was removed and the tests then passed.
- My own safety tests flagged comments in the new code and they were reworded.
- Many Build 1 to 6 tests broke because every action now needs a login. They were updated to log in first instead of switching the checks off.
- The first "alg: none" test passed for the wrong reason (the signature check caught it, not the algorithm check). I added a test with a correct signature so the algorithm check is proved on its own.
- The 10-minute seat hold is only shown by the website in this build. The server does not enforce it yet; that is Build 8.
- Known gaps I wrote down: no login rate limit, no server-side logout, no password reset.

**What I learned:** authentication (who are you) and authorization (what may you do) are different jobs and belong in different files; never trust a role or an id from the browser; answer "not found" instead of "forbidden" so private things are not even confirmed to exist; a mutation test (break the rule on purpose, see the test fail) shows whether a test really protects anything.
## Build 8: Refunds, waitlist, expiry, real test suite

**What I asked the AI:** Add refunds by time before the event (100% / 50% / 0%), a waitlist for sold-out ticket types with 15-minute offers, real server-side expiry of the 10-minute hold, and a proper test suite that does not wait for real time, using the Build 8 brief.

**What the AI produced:** a controllable clock (`src/lib/clock.js`), a pure refund policy (`src/domain/refundPolicy.js`), a seat service with one `sweep()` that expires late bookings and offers and passes freed seats down the waitlist, a waitlist service, a maintenance timer job, database version 3 (upgrades version 2 files and keeps the data), new API routes (refund preview, cancel with refund, waitlist join/list/accept/leave), website changes (refund "are you sure?" panel, waitlist buttons, offers with a live clock, server-enforced checkout expiry), `docs/refunds-and-waitlist.md`, and about 150 new tests (537 in total).

**What I checked myself:** I ran `npm test`, `npm run seed`, `npm start`; booked and paid with 4242 4242 4242 4242, joined a waitlist from a second account, cancelled and saw the refund message, saw the offer arrive with its clock, accepted it and reached checkout.

**What the AI got wrong / what I changed:**
- Its first browser check found the "whole card is a link" style on the event cards sat on top of the Cancel button on My tickets, so the button could not be clicked. It was fixed in the CSS.
- The My tickets page showed the word "null" when there was no waitlist, because an empty value was passed to the page builder. Empty values are now filtered out.
- A first browser test passed by accident because the words "back" appeared in the loading text. The test now waits for the real refund sentence.
- The checkout page used to cancel late bookings itself; that was a stand-in for the server. It was removed now that the server enforces the hold.
- Many older tests assumed the real clock. They were moved to a fake clock instead of loosening their checks.

**Rules I was unsure about (assumptions to confirm with the instructor):** an event "starts" at 00:00 UTC on its date; the boundary (exactly 7 or 2 days) counts as the better tier; a booking that ran out of time is `expired` (not `cancelled`); offers last 15 minutes; a waitlist entry is for 1 seat.

**Not done yet:** the debugging exercise write-up (`docs/debugging-exercise.md`); I have not received that exercise.

**What I learned:** time is a dependency, so pass in a clock you can control; make "release the seats" one function that is safe to run twice; use compare-and-set (`UPDATE ... WHERE status = 'pending'`) so two things racing cannot both win; a random-actions test with a fixed seed can check an invariant (seats never lost or double counted) better than hand-picked cases.