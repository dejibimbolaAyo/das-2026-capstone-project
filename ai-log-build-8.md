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
