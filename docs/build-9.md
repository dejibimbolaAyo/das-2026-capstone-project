# Build 9: QR check-in, CI, security, demo-ready

*Week 12 of the course. Starts from the finished state of Build 8.*

**You deliver:** a signed QR code for every paid booking, staff check-in, rejection of forged and repeated scans, security headers and rate limiting, automated tests on every push, and a project ready to demo.

**You practise:** signing and verification, continuous integration, web security basics, handling secrets.

**Done when**
- The full path works in the browser: organizer publishes, attendee books, pays and sees a QR code, staff scans it, and a second scan is rejected.
- `npm test` passes, including forged-code, duplicate-scan and simultaneous-scan tests.
- A push to GitHub runs the tests automatically and they pass.
- You have one "the AI got this wrong" story ready for the demo.

## User stories in this build

### S14: As a staff, I want to scan a ticket's QR code at the door, so that I can admit the right people

- **Given** a paid booking
  **When** staff scan its QR code
  **Then** the booking is checked in and the time is recorded.
- **Given** a QR code for a different event
  **When** staff scan it at this event
  **Then** it is rejected.
- **Given** an attendee account
  **When** it tries to scan a ticket
  **Then** the request is rejected with `FORBIDDEN`.

### S15: As a staff, I want to have forged and repeated scans rejected, so that nobody gets in twice or with a fake

- **Given** a QR code that was edited or made up **Then** it is rejected as invalid.
- **Given** a valid code that has already been scanned **Then** it is rejected as a duplicate and shows when it was first used.
- **Given** a booking that was refunded or cancelled **Then** its code is rejected.
- **Given** two staff scan the same code at the same moment
  **When** both requests arrive together
  **Then** exactly one is admitted.

### S16: As a team, I want to run automated tests on every push, so that we notice breakage early

Build 9 adds the automated workflow. The criteria are in the second bullet below.

- **Given** the project
  **When** someone runs `npm test`
  **Then** every test runs and the command fails if any test fails. (Build 2)
- **Given** a push to GitHub
  **When** the workflow runs
  **Then** `npm test` runs automatically, and a failing test shows as a failed check. (Build 9)

## AI prompt

Give your AI tool these files first: README.md, docs/user-stories.md, docs/build-9.md and everything in src/, public/ and test/.

Then paste the prompt below. When it answers, do not trust it yet: read the code, run the checks in "Done when", and write what was wrong in `docs/ai-log.md`.

```text
We are building Build 9 of the Event Ticketing capstone, in plain JavaScript
(ES modules, Node 22.13 or newer, no outside packages). Read README.md,
docs/user-stories.md, docs/build-9.md and everything in src/, public/ and
test/ before you write anything.

1. src/lib/ticketToken.js: sign and verify a ticket token with HMAC-SHA256 from
   node:crypto and compare in constant time. The payload holds only the
   booking reference and an issued-at time, never a name or an email. Use a
   different secret from the login tokens, from an environment variable, with
   no default value in production code.

2. A QR code for every paid booking on tickets.html. The encoder is the
   vendored public/js/qr.js; treat it as a black box and only call it.

3. src/services/checkinService.js, POST /api/checkin and public/checkin.html
   (paste or scan a code), for staff only.
   - A code that was edited or made up is INVALID.
   - A booking that is cancelled or refunded is rejected.
   - A code already used is rejected as a duplicate and shows when it was
     first used.
   - Two staff scanning the same code at the same moment: exactly one is
     admitted. Do it in a single atomic UPDATE, not a read then a write.

4. src/http/securityHeaders.js (Content-Security-Policy with no inline
   scripts, X-Content-Type-Options, Referrer-Policy) and src/lib/rateLimit.js
   (limit login and check-in attempts per IP).

5. .github/workflows/ci.yml: on every push and pull request, set up Node 22,
   run npm test.

6. docs/security-checklist.md, a short checklist of what we protect and how,
   and a .env.example with the secrets the app needs (no real values).

7. Tests: a forged token, a duplicate scan, a cancelled booking's code, a
   wrong role, and two simultaneous scans.

Rules: no secret in Git; no personal data in the QR code. When you are done,
list every file you changed and any rule from this prompt that you were
unsure about.
```

## Definition of done

The Definition of done in [user-stories.md](user-stories.md) applies to every story in this build.

[All milestones](milestones.md) · [Build 8](build-8.md)
