// Build 6/7: the event page - one event, its tiers, a quantity picker, checkout
// with a countdown, and a mock card payment.
//
// The seats are held for HOLD_SECONDS once a booking is created. When the
// countdown reaches zero the Pay button is disabled (real expiry is Build 8).
// A declined card shows an error and leaves the Pay button enabled to retry.
//
// From Build 7 booking and paying need a signed-in user: the button becomes a
// "log in" link when nobody is signed in, and an expired token is answered with
// the same link instead of a dead end.

import {
  el, clear, formatMoney, formatDateTime, formatCountdown, clampQuantity,
  MAX_TICKETS_PER_BOOKING,
} from '../ui.js';
import { getEvent, createBooking, pay, ApiError } from '../api.js';
import { isLoggedIn, loginUrl } from '../session.js';
import { mountNav } from '../nav.js';

const HOLD_SECONDS = 10 * 60;

const titleEl = document.getElementById('event-title');
const metaEl = document.getElementById('event-meta');
const tiersEl = document.getElementById('tiers');
const checkoutEl = document.getElementById('checkout');

const eventId = new URLSearchParams(window.location.search).get('id');

let booking = null; // the pending booking, if any
let countdownTimer = null;
let secondsLeft = 0;

function showMessage(node, text, kind = 'info') {
  node.textContent = text;
  node.className = `message message-${kind}`;
  node.hidden = false;
}

function hideMessage(node) {
  node.hidden = true;
  node.textContent = '';
}

// The same as showMessage, but with a link at the end - used when the fix is to
// log in rather than to try again.
function showMessageWithLink(node, text, href, linkText, kind = 'error') {
  node.textContent = '';
  node.className = `message message-${kind}`;
  node.hidden = false;
  node.appendChild(document.createTextNode(text));
  node.appendChild(el('a', { href, text: linkText }));
}

// Where to come back to after logging in from this page.
function backToThisPage() {
  return `/event.html?id=${encodeURIComponent(eventId ?? '')}`;
}

// --- rendering ---------------------------------------------------------------

function renderTiers(event) {
  clear(tiersEl);

  for (const tier of event.tiers) {
    const soldOut = tier.seatsLeft <= 0;
    const quantityId = `qty-${tier.id}`;
    const statusId = `left-${tier.id}`;
    const message = el('p', { class: 'message', hidden: true, role: 'alert' });

    const controls = soldOut
      ? [
        el('span', { class: 'badge badge-soldout', text: 'Sold out' }),
        el('button', { type: 'button', disabled: true, text: 'Sold out' }),
      ]
      : [
        el('label', { for: quantityId, text: 'Quantity' }),
        el('input', {
          id: quantityId,
          type: 'number',
          min: '1',
          max: String(Math.min(MAX_TICKETS_PER_BOOKING, tier.seatsLeft)),
          value: '1',
          inputmode: 'numeric',
          'aria-describedby': statusId,
        }),
        isLoggedIn()
          ? el('button', {
            type: 'button',
            text: 'Book',
            on: { click: () => bookTier(event, tier, quantityId, message) },
          })
          : el('a', {
            class: 'button-link',
            href: loginUrl(backToThisPage()),
            text: 'Log in to book',
          }),
      ];

    tiersEl.appendChild(el('article', { class: `card tier${soldOut ? ' tier-soldout' : ''}` },
      el('div', { class: 'tier-head' },
        el('h3', { text: tier.name }),
        el('span', { class: 'price', text: formatMoney(tier.priceCents) }),
      ),
      el('p', { id: statusId, class: 'meta', text: soldOut ? 'No seats left' : `${tier.seatsLeft} of ${tier.capacity} seats left` }),
      el('div', { class: 'tier-actions' }, controls),
      message,
    ));
  }
}

async function bookTier(event, tier, quantityId, message) {
  hideMessage(message);

  const input = document.getElementById(quantityId);
  const quantity = clampQuantity(input.value, tier.seatsLeft);
  input.value = String(quantity);

  if (quantity < 1) {
    showMessage(message, 'That tier is sold out.', 'error');
    return;
  }

  try {
    booking = await createBooking({ tierId: tier.id, quantity });
  } catch (error) {
    if (error instanceof ApiError && error.code === 'UNAUTHENTICATED') {
      // The token was missing, edited or expired (api.js has already dropped it).
      showMessageWithLink(message, 'Please log in to book: ', loginUrl(backToThisPage()), 'log in', 'error');
      return;
    }
    if (error instanceof ApiError && error.code === 'SOLD_OUT') {
      showMessage(message, error.message, 'error');
      await load(); // refresh seats; the tier may now be sold out
      return;
    }
    showMessage(message, error instanceof ApiError ? error.message : 'Could not book those seats.', 'error');
    return;
  }

  await load();        // show the reduced seats-left counts
  renderCheckout(tier);
  startCountdown();
}

function renderCheckout(tier) {
  clear(checkoutEl);
  checkoutEl.hidden = false;

  const countdownEl = el('strong', { id: 'countdown', 'aria-live': 'polite', text: formatCountdown(secondsLeft) });
  const payMessage = el('p', { class: 'message', hidden: true, role: 'alert' });
  const cardSelect = el('select', { id: 'card' },
    el('option', { value: 'ok', text: '4242 4242 4242 4242 (approved)' }),
    el('option', { value: 'declined', text: '4000 0000 0000 0002 (declined)' }),
  );
  const payButton = el('button', {
    type: 'button',
    text: `Pay ${formatMoney(booking.amountCents)}`,
    on: { click: () => payBooking(payButton, cardSelect, payMessage) },
  });

  checkoutEl.appendChild(el('h2', { text: 'Checkout' }));
  checkoutEl.appendChild(el('p', { class: 'meta' },
    `Seats held: ${booking.quantity} x ${tier.name}. Reference `,
    el('code', { text: booking.reference }),
  ));
  checkoutEl.appendChild(el('p', { class: 'hold' }, 'Seats held for ', countdownEl, ' - pay before the timer runs out.'));
  checkoutEl.appendChild(el('div', { class: 'field' },
    el('label', { for: 'card', text: 'Card' }),
    cardSelect,
  ));
  checkoutEl.appendChild(el('p', { class: 'row' }, payButton));
  checkoutEl.appendChild(payMessage);
  checkoutEl.appendChild(el('p', { class: 'meta' },
    el('a', { href: '/', text: 'Back to all events' }),
  ));
}

async function payBooking(payButton, cardSelect, payMessage) {
  hideMessage(payMessage);
  payButton.disabled = true;
  payButton.textContent = 'Paying...';

  try {
    const paid = await pay({ reference: booking.reference, card: cardSelect.value });
    stopCountdown();
    clear(checkoutEl);
    checkoutEl.appendChild(el('h2', { text: 'You are booked' }));
    checkoutEl.appendChild(el('p', { class: 'message message-success', role: 'status' },
      `Paid. Your reference is ${paid.reference}. Show it at the door.`,
    ));
    checkoutEl.appendChild(el('p', { class: 'meta' }, el('a', { href: '/', text: 'Browse more events' })));
  } catch (error) {
    if (error instanceof ApiError && error.code === 'UNAUTHENTICATED') {
      showMessageWithLink(payMessage, 'Your session has expired. Please ', loginUrl(backToThisPage()), 'log in again', 'error');
      stopCountdown();
      return; // no point re-enabling a pay button nobody may use
    }
    if (error instanceof ApiError && error.code === 'PAYMENT_DECLINED') {
      showMessage(payMessage, `${error.message} Try again, or pick another card.`, 'error');
    } else {
      showMessage(payMessage, error instanceof ApiError ? error.message : 'Payment failed.', 'error');
    }
    // Re-enable so the attendee can try again.
    payButton.disabled = false;
    payButton.textContent = `Pay ${formatMoney(booking.amountCents)}`;
  }
}

// --- countdown ---------------------------------------------------------------

function startCountdown() {
  stopCountdown();
  secondsLeft = HOLD_SECONDS;
  updateCountdown();
  countdownTimer = setInterval(() => {
    secondsLeft -= 1;
    if (secondsLeft <= 0) {
      secondsLeft = 0;
      stopCountdown();
    }
    updateCountdown();
  }, 1000);
}

function updateCountdown() {
  const node = document.getElementById('countdown');
  if (node) node.textContent = formatCountdown(secondsLeft);

  const payButton = checkoutEl.querySelector('button');
  if (secondsLeft <= 0 && payButton) {
    payButton.disabled = true;
    payButton.textContent = 'Seat hold expired';
  }
}

function stopCountdown() {
  if (countdownTimer) clearInterval(countdownTimer);
  countdownTimer = null;
}

// --- load --------------------------------------------------------------------

async function load() {
  if (!eventId) {
    titleEl.textContent = 'Event not found';
    metaEl.textContent = 'No event id was given.';
    return;
  }

  let event;
  try {
    event = await getEvent(eventId);
  } catch (error) {
    titleEl.textContent = error instanceof ApiError && error.code === 'NOT_FOUND' ? 'Event not found' : 'Something went wrong';
    metaEl.textContent = error instanceof ApiError ? error.message : '';
    return;
  }

  document.title = `${event.title} - Event Ticketing`;
  titleEl.textContent = event.title;
  metaEl.textContent = `${event.city} - ${event.venue} - ${formatDateTime(event.startsAt)}`;
  renderTiers(event);
}

mountNav();
load();
