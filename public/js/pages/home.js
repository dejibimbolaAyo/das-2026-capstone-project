// Build 6/7: the home page - browse, search, filter and sort published events.
//
// The filter form goes to GET /api/events, which does the matching; this file
// only turns the form into a filter object and paints the cards that come back.
// The Build 6 mock data and its copy of the filter rules are gone.

import { el, clear, formatMoney, formatDateTime } from '../ui.js';
import { listEvents, listCities, ApiError } from '../api.js';
import { mountNav } from '../nav.js';

const form = document.getElementById('filters');
const qInput = document.getElementById('q');
const citySelect = document.getElementById('city');
const maxPriceInput = document.getElementById('maxPrice');
const sortSelect = document.getElementById('sortBy');
const availableInput = document.getElementById('onlyAvailable');
const statusEl = document.getElementById('results-status');
const resultsEl = document.getElementById('results');

function readFilters() {
  const rawMax = maxPriceInput.value.trim();
  return {
    q: qInput.value.trim() || undefined,
    city: citySelect.value || undefined,
    // The input is in naira; the API wants whole cents.
    maxPriceCents: rawMax === '' ? undefined : Math.round(Number(rawMax) * 100),
    onlyAvailable: availableInput.checked,
    sortBy: sortSelect.value || undefined,
  };
}

function eventCard(summary) {
  const soldOut = (summary.totalSeatsLeft || 0) === 0;

  return el('article', { class: 'card event-card' },
    el('h3', { text: summary.title }),
    el('p', { class: 'meta', text: `${summary.city} - ${summary.venue}` }),
    el('p', { class: 'meta', text: formatDateTime(summary.startsAt) }),
    el('p', { class: 'row' },
      el('span', { class: 'price', text: summary.minPriceCents === null ? 'No tickets yet' : `from ${formatMoney(summary.minPriceCents)}` }),
      el('span', { class: soldOut ? 'badge badge-soldout' : 'badge', text: soldOut ? 'Sold out' : `${summary.totalSeatsLeft} seats left` }),
    ),
    el('a', { class: 'button-link', href: `event.html?id=${encodeURIComponent(summary.id)}`, text: soldOut ? 'View event' : 'View tickets' }),
  );
}

async function render() {
  statusEl.textContent = 'Loading...';
  clear(resultsEl);

  let events;
  try {
    events = await listEvents(readFilters());
  } catch (error) {
    if (error instanceof ApiError) statusEl.textContent = `Could not load events (${error.code}): ${error.message}`;
    else statusEl.textContent = 'Could not load events.';
    return;
  }

  if (events.length === 0) {
    statusEl.textContent = 'No events match your search.';
    return;
  }

  statusEl.textContent = `${events.length} event${events.length === 1 ? '' : 's'}`;
  for (const summary of events) resultsEl.appendChild(eventCard(summary));
}

async function init() {
  try {
    const cities = await listCities();
    for (const city of cities) citySelect.appendChild(el('option', { value: city, text: city }));
  } catch {
    // If the city list fails, the page still works with "All cities".
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    render();
  });
  // Re-run as soon as any filter or the sort menu changes.
  form.addEventListener('change', render);

  await render();
}

init();
mountNav();
