// Build 7: "my tickets".
//
// The list comes from GET /api/bookings/me, which the server answers with only
// the caller's own bookings. A pending booking can be paid or cancelled here;
// both calls carry the bearer token, so the server can check the owner.

import { el, clear, formatMoney, formatDateTime } from '../ui.js';
import { myBookings, pay, cancelBooking, ApiError } from '../api.js';
import { isLoggedIn, loginUrl } from '../session.js';
import { mountNav } from '../nav.js';

const statusEl = document.getElementById('tickets-status');
const listEl = document.getElementById('bookings');

function setStatus(message, kind = 'info') {
  statusEl.textContent = message;
  statusEl.className = `status status-${kind}`;
}

function statusBadge(status) {
  const faded = status === 'cancelled' || status === 'refunded';
  return el('span', { class: faded ? 'badge badge-soldout' : 'badge', text: status });
}

function bookingCard(booking) {
  const message = el('p', { class: 'status', 'aria-live': 'polite' });

  const actions = [];
  if (booking.status === 'pending') {
    actions.push(el('button', {
      type: 'button',
      text: 'Pay now',
      on: { click: (event) => payNow(booking, event.target, message) },
    }));
    actions.push(el('button', {
      type: 'button',
      class: 'button-secondary',
      text: 'Cancel',
      on: { click: (event) => cancel(booking, event.target, message) },
    }));
  }

  return el('article', { class: 'card event-card' },
    el('div', { class: 'row' },
      el('h3', { text: booking.eventTitle ?? 'Event' }),
      statusBadge(booking.status),
    ),
    el('p', { class: 'meta', text: `${booking.eventCity ?? ''}${booking.eventVenue ? ` - ${booking.eventVenue}` : ''}` }),
    booking.eventStartsAt ? el('p', { class: 'meta', text: formatDateTime(booking.eventStartsAt) }) : null,
    el('p', { class: 'meta', text: `Reference ${booking.reference}` }),
    el('p', { class: 'row' },
      el('span', { class: 'price', text: formatMoney(booking.amountCents) }),
      el('span', { class: 'meta', text: `${booking.tierName ?? 'Ticket'} x ${booking.quantity}` }),
    ),
    actions.length ? el('div', { class: 'tier-actions' }, actions) : null,
    message,
  );
}

async function payNow(booking, button, message) {
  button.disabled = true;
  message.textContent = '';
  try {
    await pay({ reference: booking.reference, card: 'ok' });
    setStatus('Paid. Your reference is still the same.', 'success');
    await load();
  } catch (error) {
    message.textContent = error instanceof ApiError ? error.message : 'Payment failed.';
    message.className = 'status status-error';
    button.disabled = false;
  }
}

async function cancel(booking, button, message) {
  button.disabled = true;
  message.textContent = '';
  try {
    await cancelBooking({ reference: booking.reference });
    setStatus('Booking cancelled and the seats released.', 'success');
    await load();
  } catch (error) {
    message.textContent = error instanceof ApiError ? error.message : 'Could not cancel.';
    message.className = 'status status-error';
    button.disabled = false;
  }
}

async function load() {
  clear(listEl);

  if (!isLoggedIn()) {
    setStatus('Please log in to see your tickets.', 'info');
    listEl.appendChild(el('article', { class: 'card' },
      el('p', {}, el('a', { href: loginUrl('/tickets.html'), text: 'Log in' }), ' to see your bookings.'),
    ));
    return;
  }

  setStatus('Loading...', 'info');
  let bookings;
  try {
    bookings = await myBookings();
  } catch (error) {
    if (error instanceof ApiError && error.code === 'UNAUTHENTICATED') {
      setStatus('Your session has expired. Please log in again.', 'error');
      return;
    }
    setStatus(error instanceof ApiError ? `Could not load your tickets (${error.code}): ${error.message}` : 'Could not load your tickets.', 'error');
    return;
  }

  if (bookings.length === 0) {
    setStatus('You have no bookings yet.', 'info');
    listEl.appendChild(el('article', { class: 'card' },
      el('p', {}, el('a', { href: '/', text: 'Browse events' }), ' and book your first ticket.'),
    ));
    return;
  }

  setStatus(`${bookings.length} booking${bookings.length === 1 ? '' : 's'}`, 'info');
  for (const booking of bookings) listEl.appendChild(bookingCard(booking));
}

mountNav();
load();
