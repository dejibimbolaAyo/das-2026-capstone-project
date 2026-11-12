import * as api from '../api.js';
import { el, clear, formatMoney, formatDate } from '../ui.js';

const form = document.querySelector('#filters');
const list = document.querySelector('#events');
const status = document.querySelector('#status');
const citySelect = document.querySelector('#city');

function readFilters() {
  const data = new FormData(form);
  const maxNaira = data.get('maxPrice');
  return {
    q: data.get('q'),
    city: data.get('city'),
    sort: data.get('sort'),
    // The screen takes naira; the API takes whole cents. Convert once, here.
    maxPriceCents: maxNaira === '' ? undefined : Math.round(Number(maxNaira) * 100),
  };
}

function card(event) {
  const prices = event.tiers.map((t) => t.priceCents);
  const left = event.tiers.reduce((sum, t) => sum + t.seatsLeft, 0);
  return el('li', { class: 'card' }, [
    el('h2', {}, [el('a', { href: `/event?id=${encodeURIComponent(event.id)}`, text: event.title })]),
    el('p', { class: 'meta', text: `${event.city} · ${event.venue}` }),
    el('p', { class: 'meta', text: formatDate(event.startsAt) }),
    el('p', { class: 'price', text: `From ${formatMoney(Math.min(...prices))}` }),
    left === 0
      ? el('p', { class: 'badge badge-soldout', text: 'Sold out' })
      : el('p', { class: 'meta', text: `${left} seats left` }),
  ]);
}

async function load() {
  status.textContent = 'Loading events…';
  clear(list);
  try {
    const { events } = await api.listEvents(readFilters());
    if (events.length === 0) {
      status.textContent = 'No events match. Try changing the filters.';
      return;
    }
    status.textContent = `${events.length} event(s) found`;
    list.append(...events.map(card));
  } catch (error) {
    status.textContent = `Could not load events: ${error.message}`;
  }
}

async function fillCities() {
  const { events } = await api.listEvents();
  const cities = [...new Set(events.map((e) => e.city))].sort();
  citySelect.append(...cities.map((city) => el('option', { value: city, text: city })));
}

form.addEventListener('submit', (event) => {
  event.preventDefault();
  load();
});
for (const id of ['city', 'sort']) {
  document.querySelector(`#${id}`).addEventListener('change', load);
}

await fillCities();
load();
