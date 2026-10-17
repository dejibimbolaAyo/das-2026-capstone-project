// Build 7: the organizer dashboard (S02, S03, S04 on the screen).
//
// Create an event (draft), add ticket tiers, then publish or unpublish. The
// list is GET /api/events/mine, which the server answers with only this
// organizer's events. The server also refuses to change an event that belongs
// to someone else, so this page cannot be tricked by editing the DOM.

import { el, clear, formatMoney, formatDateTime } from '../ui.js';
import {
  myEvents, createEvent, addTier, publishEvent, unpublishEvent, ApiError,
} from '../api.js';
import { isLoggedIn, getUser, loginUrl } from '../session.js';
import { mountNav } from '../nav.js';

const createForm = document.getElementById('create-form');
const createStatus = document.getElementById('create-status');
const statusEl = document.getElementById('events-status');
const listEl = document.getElementById('events');

function setStatus(node, message, kind = 'info') {
  node.textContent = message;
  node.className = `status status-${kind}`;
}

function messageFrom(error, fallback) {
  return error instanceof ApiError ? error.message : fallback;
}

// --- the create form ---

createForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = createForm.querySelector('button[type="submit"]');
  button.disabled = true;
  setStatus(createStatus, 'Creating...', 'info');

  const startsAt = document.getElementById('event-date').value;
  try {
    await createEvent({
      title: document.getElementById('event-title').value,
      city: document.getElementById('event-city').value,
      venue: document.getElementById('event-venue').value,
      // datetime-local gives a local wall-clock string; the API wants an ISO instant.
      startsAt: startsAt === '' ? '' : new Date(startsAt).toISOString(),
    });
    createForm.reset();
    setStatus(createStatus, 'Draft created. Add a tier, then publish it.', 'success');
    await load();
  } catch (error) {
    setStatus(createStatus, messageFrom(error, 'Could not create the event.'));
  } finally {
    button.disabled = false;
  }
});

// --- one event card ---

function tierRow(tier) {
  const seatsLeft = Math.max(0, tier.capacity - tier.sold);
  return el('li', { class: 'tier-line' },
    el('span', { class: 'tier-name', text: tier.name }),
    el('span', { class: 'price', text: formatMoney(tier.priceCents) }),
    el('span', { class: 'meta', text: `${tier.sold}/${tier.capacity} sold (${seatsLeft} left)` }),
  );
}

function addTierForm(event, message) {
  const nameId = `tier-name-${event.id}`;
  const priceId = `tier-price-${event.id}`;
  const capacityId = `tier-capacity-${event.id}`;

  const button = el('button', { type: 'button', text: 'Add tier' });
  button.addEventListener('click', async () => {
    button.disabled = true;
    message.textContent = '';
    try {
      await addTier(event.id, {
        name: document.getElementById(nameId).value,
        // The form takes naira; the API wants whole cents.
        priceCents: Math.round(Number(document.getElementById(priceId).value || '0') * 100),
        capacity: Number(document.getElementById(capacityId).value),
      });
      await load();
    } catch (error) {
      message.textContent = messageFrom(error, 'Could not add the tier.');
      message.className = 'status status-error';
      button.disabled = false;
    }
  });

  return el('div', { class: 'tier-actions tier-add' },
    el('div', { class: 'field' },
      el('label', { for: nameId, text: 'Tier name' }),
      el('input', { id: nameId, type: 'text', placeholder: 'General' }),
    ),
    el('div', { class: 'field' },
      el('label', { for: priceId, text: 'Price (₦)' }),
      el('input', { id: priceId, type: 'number', min: '0', step: '1', value: '0' }),
    ),
    el('div', { class: 'field' },
      el('label', { for: capacityId, text: 'Capacity' }),
      el('input', { id: capacityId, type: 'number', min: '1', step: '1', value: '50' }),
    ),
    button,
  );
}

function eventCard(event) {
  const message = el('p', { class: 'status', 'aria-live': 'polite' });
  const published = event.status === 'published';

  const toggle = el('button', {
    type: 'button',
    text: published ? 'Unpublish' : 'Publish',
    on: {
      click: async (clickEvent) => {
        const button = clickEvent.target;
        button.disabled = true;
        message.textContent = '';
        try {
          if (published) await unpublishEvent(event.id);
          else await publishEvent(event.id);
          await load();
        } catch (error) {
          message.textContent = messageFrom(error, 'Could not change the event.');
          message.className = 'status status-error';
          button.disabled = false;
        }
      },
    },
  });

  return el('article', { class: 'card event-card' },
    el('div', { class: 'row' },
      el('h3', { text: event.title }),
      el('span', { class: published ? 'badge' : 'badge badge-draft', text: event.status }),
    ),
    el('p', { class: 'meta', text: `${event.city}${event.venue ? ` - ${event.venue}` : ''} - ${formatDateTime(event.startsAt)}` }),
    el('p', { class: 'meta', text: `${event.tiers.length} tier${event.tiers.length === 1 ? '' : 's'}` }),
    event.tiers.length
      ? el('ul', { class: 'tier-list' }, event.tiers.map(tierRow))
      : el('p', { class: 'meta', text: 'No tiers yet. Add one before publishing.' }),
    addTierForm(event, message),
    el('div', { class: 'tier-actions' }, toggle),
    message,
  );
}

// --- the list ---

async function load() {
  clear(listEl);

  if (!isLoggedIn()) {
    setStatus(statusEl, 'Please log in as an organizer.');
    listEl.appendChild(el('article', { class: 'card' },
      el('p', {}, el('a', { href: loginUrl('/organizer.html'), text: 'Log in' }), ' as an organizer to manage events.'),
    ));
    return;
  }

  if (getUser()?.role !== 'organizer') {
    setStatus(statusEl, 'This account is not an organizer.', 'error');
    return;
  }

  setStatus(statusEl, 'Loading...', 'info');
  let events;
  try {
    events = await myEvents();
  } catch (error) {
    setStatus(statusEl, messageFrom(error, 'Could not load your events.'));
    return;
  }

  if (events.length === 0) {
    setStatus(statusEl, 'You have no events yet. Create one above.');
    return;
  }

  setStatus(statusEl, `${events.length} event${events.length === 1 ? '' : 's'}`);
  for (const event of events) listEl.appendChild(eventCard(event));
}

mountNav();

if (isLoggedIn() && getUser()?.role !== 'organizer') {
  setStatus(createStatus, 'This account is not an organizer, so it cannot create events.', 'error');
  createForm.querySelectorAll('input, select, button').forEach((control) => { control.disabled = true; });
} else if (!isLoggedIn()) {
  setStatus(createStatus, 'Log in as an organizer to create events.', 'info');
  createForm.querySelectorAll('input, select, button').forEach((control) => { control.disabled = true; });
}

// load() paints its own "please log in" card into the list.
load();
