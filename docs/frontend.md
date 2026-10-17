# The website (built in Build 6, connected to the real API in Build 7)

Open `http://localhost:3000` after `npm start`. The website lives in `public/`.
For practice data and demo logins run `npm run seed` once first (password for all demo accounts: `demo-password-1`; `demo-organizer@example.com`, `demo-attendee@example.com`).

## What you can do
| Story | Screen | What to try |
|---|---|---|
| S05 browse, filter, sort | `#/` | Search, pick a city, dates, highest price, sort. The address bar updates, so Back and sharing work. |
| S06 view event, choose tickets | `#/event/EV-000004` | Pick a ticket type and quantity (1 to 10). A sold-out type is greyed, struck through, labelled "Sold out" and cannot be chosen. |
| S07 check out and pay | `#/checkout/BK-000001` | A countdown shows how long your seats are held. Pay with a mock card. |
| Sign up, log in | `#/signup`, `#/login` | Choose attendee or organizer. After login you return to where you were (`?next=`, checked so it can only be a page of this site). |
| My tickets | `#/tickets` | Attendees: your bookings, with Pay and Cancel. |
| My events | `#/organizer` | Organizers: create an event, add ticket types, publish or unpublish. |
| Confirmation | `#/done/BK-000001` | Your booking reference. |

Test cards: `4242 4242 4242 4242` works. `4000 0000 0000 0002` is declined: you see an error, nothing is lost, the seats stay held and you can try again.

The hold countdown is the server's `holdExpiresAt` (10 minutes after booking). In Build 7 the page only **shows** it and releases the seats when it runs out; Build 8 makes the server enforce it.

## The files
```
public/
  index.html          the one page (header, main, footer, screen-reader announcer)
  css/app.css         the look: ticket cards with a perforated stub
  js/
    main.js           router: reads the # address, shows a page, moves focus to its heading
    api.js            THE ONE DATA FILE: real fetch() calls to /api, login token, error mapping
    dom.js            h("tag", props, children): builds elements, never from raw HTML text
    money.js          cents -> "₦8,000", "8,000" -> cents, dates
    countdown.js      seconds left, mm:ss, which moments a screen reader announces
    card.js           card form checks (Luhn, expiry, code)
    views/browse.js event.js checkout.js done.js message.js auth.js tickets.js organizer.js     one file per screen
```

## Rule: all data access in one file
Pages never call `fetch`, never read storage and never hold event data. They import functions from `api.js` and nothing else:
`listEvents`, `getEvent`, `createBooking`, `getBooking`, `payBooking`, `cancelBooking`, plus `signup`, `login`, `logout`, `currentUser`, `myBookings`, `myEvents`, `createEvent`, `addTier`, `publishEvent`, `unpublishEvent`.
`test/frontend-rules.test.js` fails if any other file breaks this.
In Build 7 only the inside of `api.js` changed (fake data out, `fetch("/api/...")` in), as planned. Pages did not change their calls.

## Real API, tested
`test/frontend-api.test.js` starts the real server and drives the real `api.js` against it (signup, login, booking, wrong card, expired token, someone else's booking).
`api.js` keeps the login token in `sessionStorage` (gone when the tab closes), with a memory fallback if storage is blocked. If the server says 401 the token is dropped and the person is sent to the login page. See `docs/auth.md` for the trade-offs.

## Accessibility basics used
- Every field has a visible `<label>`. Radio choices sit in a `<fieldset>` with a `<legend>`.
- "Skip to the page content" link, landmarks (header, nav, main, footer), `lang="en"`.
- On every page change focus moves to the page heading and the title changes.
- Errors use `role="alert"` and are written in words (not colour only). Sold out is a word and a strike-through, not only grey.
- The countdown is visible all the time but a screen reader only hears 5 min, 1 min, 30 s, 10 s and time up.
- Visible keyboard focus, text contrast above 4.5:1, works at phone width, respects "reduce motion".

## Safety
Text from data is always put on the page as plain text (never `innerHTML`). The card number never leaves the browser form: `api.js` turns it into a token (`tok_success` / `tok_declined`), exactly as the real server expects. The server also sends a Content-Security-Policy and other safety headers.

## Added in Build 8
- **My tickets**: "Cancel" asks the server what you would get back (`getRefundPreview`), shows it, and only cancels after "Yes". A "Waitlist and offers" section shows your place in line, offers with a live clock, and Accept / No thanks. It refreshes every 20 seconds.
- **Event page**: sold-out ticket types get "Join the waitlist" (logged-in attendees) or a login link.
- **Checkout**: the server now enforces the 10 minute hold, so the page only shows the "time is up" message; it no longer cancels by itself.
- `public/js/refund.js` holds the plain-words helpers (pure, tested in Node).
