import * as api from '../api.js';
import { el, clear, formatMoney, formatDate, formatCountdown } from '../ui.js';

const page = document.querySelector('#page');
const eventId = new URLSearchParams(location.search).get('id');
let countdownTimer = null;

function showError(message) {
  clear(page);
  page.append(
    el('p', { role: 'alert', class: 'error', text: message }),
    el('p', {}, [el('a', { href: '/', text: 'Back to all events' })]),
  );
}

async function showEvent(notice) {
  clearInterval(countdownTimer);
  clear(page);
  page.append(el('p', { role: 'status', class: 'status', text: 'Loading…' }));
  let event;
  try {
    event = await api.getEvent(eventId);
  } catch (error) {
    showError(error.code === 'NOT_FOUND' ? 'We could not find that event.' : `Could not load the event: ${error.message}`);
    return;
  }
  document.title = `${event.title} | Event Ticketing`;
  clear(page);
  page.append(
    el('h1', { text: event.title }),
    el('p', { class: 'meta', text: `${event.city} · ${event.venue}` }),
    el('p', { class: 'meta', text: formatDate(event.startsAt) }),
    el('p', { role: 'alert', class: 'error', id: 'notice', text: notice ?? '' }),
    el('h2', { text: 'Tickets' }),
    el('ul', { class: 'tier-list' }, event.tiers.map((tier) => tierRow(event, tier))),
    el('section', { id: 'checkout', 'aria-live': 'polite' }),
  );
}

function tierRow(event, tier) {
  const soldOut = tier.seatsLeft === 0;
  const max = Math.min(10, tier.seatsLeft);
  const inputId = `qty-${tier.id}`;
  const message = el('p', { role: 'alert', class: 'error', text: '' });

  const input = el('input', { id: inputId, name: 'quantity', type: 'number', min: 1, max, value: 1, disabled: soldOut });
  const button = el('button', { type: 'submit', class: 'primary', disabled: soldOut, text: soldOut ? 'Sold out' : 'Book' });

  const form = el('form', { class: 'tier-form' }, [
    el('label', { for: inputId, text: 'Quantity' }),
    input,
    button,
  ]);

  form.addEventListener('submit', async (submitEvent) => {
    submitEvent.preventDefault();
    const quantity = Number(input.value);
    // Never trust the picker's max: people can type past it.
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > max) {
      message.textContent = `Choose between 1 and ${max} tickets.`;
      return;
    }
    message.textContent = '';
    button.disabled = true;
    try {
      const booking = await api.createBooking({ tierId: tier.id, quantity });
      showCheckout(event, tier, booking);
    } catch (error) {
      if (error.code === 'SOLD_OUT') {
        // The page was out of date. Reload so it shows the real numbers.
        showEvent(`${error.message}. The page has been refreshed.`);
      } else {
        message.textContent = error.message;
        button.disabled = false;
      }
    }
  });

  return el('li', { class: 'tier' }, [
    el('div', { class: 'tier-info' }, [
      el('h3', { text: tier.name }),
      el('p', { class: 'price', text: formatMoney(tier.priceCents) }),
      soldOut
        ? el('p', { class: 'badge badge-soldout', text: 'Sold out' })
        : el('p', { class: 'meta', text: `${tier.seatsLeft} seats left` }),
    ]),
    form,
    message,
  ]);
}

function showCheckout(event, tier, booking) {
  const checkout = document.querySelector('#checkout');
  clear(checkout);

  const timer = el('p', { class: 'countdown', role: 'timer', text: '' });
  const errorBox = el('p', { role: 'alert', class: 'error', text: '' });
  const select = el('select', { id: 'card', name: 'card' }, [
    el('option', { value: 'tok_success', text: 'Test card that works' }),
    el('option', { value: 'tok_declined', text: 'Test card that is declined' }),
  ]);
  const payButton = el('button', { type: 'submit', class: 'primary', text: `Pay ${formatMoney(booking.amountCents)}` });

  const form = el('form', { class: 'pay-form' }, [
    el('label', { for: 'card', text: 'Payment method (test only, no real cards)' }),
    select,
    payButton,
  ]);

  // Count down to a fixed time, so a sleeping tab still shows the right number.
  const holdUntil = new Date(booking.holdUntil).getTime();
  let expired = false;
  function tick() {
    const seconds = Math.ceil((holdUntil - Date.now()) / 1000);
    if (seconds <= 0) {
      expired = true;
      clearInterval(countdownTimer);
      timer.textContent = 'Your hold has ended.';
      payButton.disabled = true;
      errorBox.textContent = 'The seats are no longer held. Please start again.';
      checkout.append(el('p', {}, [el('a', { href: `/event?id=${encodeURIComponent(event.id)}`, text: 'Start again' })]));
      return;
    }
    timer.textContent = `Seats held for ${formatCountdown(seconds)}`;
  }
  tick();
  countdownTimer = setInterval(tick, 1000);

  form.addEventListener('submit', async (submitEvent) => {
    submitEvent.preventDefault();
    if (expired) return;
    errorBox.textContent = '';
    payButton.disabled = true;
    try {
      const paid = await api.pay(booking.reference, select.value);
      clearInterval(countdownTimer);
      showConfirmation(event, tier, paid);
    } catch (error) {
      errorBox.textContent =
        error.code === 'PAYMENT_DECLINED' ? 'Your card was declined. You can try again.' : `Payment failed: ${error.message}`;
      payButton.disabled = false; // the booking stays pending, so the user can retry
    }
  });

  checkout.append(
    el('h2', { text: 'Checkout' }),
    el('p', { text: `${booking.quantity} × ${tier.name} for ${event.title}` }),
    el('p', { class: 'price', text: `Total ${formatMoney(booking.amountCents)}` }),
    el('p', { class: 'meta', text: `Booking reference ${booking.reference}` }),
    timer,
    form,
    errorBox,
  );
  checkout.scrollIntoView({ behavior: 'smooth' });
}

function showConfirmation(event, tier, booking) {
  clear(page);
  page.append(
    el('h1', { text: 'You are booked' }),
    el('p', { text: `${booking.quantity} × ${tier.name} for ${event.title}` }),
    el('p', { class: 'price', text: `Paid ${formatMoney(booking.amountCents)}` }),
    el('p', { text: `Reference: ${booking.reference}` }),
    el('p', {}, [el('a', { href: '/', text: 'Back to all events' })]),
  );
}

if (!eventId) {
  showError('No event was chosen.');
} else {
  showEvent();
}
