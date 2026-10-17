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
