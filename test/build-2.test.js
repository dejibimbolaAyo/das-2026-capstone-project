import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createStore, createEvent, addTier, publishEvent, unpublishEvent,
  listEventSummaries, bookTickets, seatsLeft,
} from '../src/domain/inventory.js';
import { DomainError } from '../src/domain/errors.js';
import { mergeSort } from '../src/domain/sorting.js';
import { filterEvents, sortEvents, searchEvents } from '../src/domain/eventSearch.js';

function errorCode(fn, code) {
  assert.throws(fn, error => error instanceof DomainError && error.code === code);
}

function fixture() {
  const store = createStore();
  const draft = createEvent(store, {
    title: 'Lagos Tech Meetup', city: 'Lagos', venue: 'Civic Hall',
    startsAt: '2026-12-05T17:00:00Z', organizerId: 'org-1',
  });
  const general = addTier(store, draft.id, { name: 'General', priceCents: 500000, capacity: 3 });
  const abuja = createEvent(store, {
    title: 'Abuja Jazz Night', city: 'Abuja', venue: 'Jazz House',
    startsAt: '2026-12-05T19:00:00Z', organizerId: 'org-2',
  });
  addTier(store, abuja.id, { name: 'Standard', priceCents: 250000, capacity: 5 });
  publishEvent(store, draft.id);
  publishEvent(store, abuja.id);
  return { store, draft, general, abuja };
}

test('S02: valid event is saved as a draft with a new id and hidden publicly', () => {
  const store = createStore();
  const event = createEvent(store, { title: 'Test', city: 'Jos', venue: 'Hall',
    startsAt: '2026-12-01', organizerId: 'org' });
  assert.ok(event.id);
  assert.equal(event.status, 'draft');
  assert.equal(store.events.get(event.id), event);
  assert.deepEqual(listEventSummaries(store), []);
  assert.equal(listEventSummaries(store, { publishedOnly: false }).length, 1);
});

test('S02: missing title or city and impossible dates fail without saving anything', () => {
  const store = createStore();
  for (const input of [
    { title: '', city: 'Jos', startsAt: '2026-12-01' },
    { title: 'Valid', city: ' ', startsAt: '2026-12-01' },
    { title: 'Valid', city: 'Jos', startsAt: '2026-02-30' },
    { title: 'Valid', city: 'Jos', startsAt: 'not-a-date' },
  ]) {
    errorCode(() => createEvent(store, { ...input, organizerId: 'org' }), 'VALIDATION');
    assert.equal(store.events.size, 0);
  }
});

test('S03: tier records price, capacity, zero sold and full availability', () => {
  const store = createStore();
  const event = createEvent(store, { title: 'Test', city: 'Jos', startsAt: '2026-12-01', organizerId: 'org' });
  const tier = addTier(store, event.id, { name: 'General', priceCents: 500000, capacity: 100 });
  assert.equal(tier.sold, 0);
  assert.equal(seatsLeft(tier), 100);
  assert.equal(tier.priceCents, 500000);
});

test('S03: fractional price and capacity below one fail with VALIDATION', () => {
  const store = createStore();
  const event = createEvent(store, { title: 'Test', city: 'Jos', startsAt: '2026-12-01', organizerId: 'org' });
  errorCode(() => addTier(store, event.id, { name: 'A', priceCents: 1.5, capacity: 10 }), 'VALIDATION');
  errorCode(() => addTier(store, event.id, { name: 'A', priceCents: 100, capacity: 0 }), 'VALIDATION');
  assert.equal(store.tiers.size, 0);
});

test('S03: adding a tier to a missing event returns NOT_FOUND', () => {
  const store = createStore();
  errorCode(() => addTier(store, 'missing', { name: 'A', priceCents: 100, capacity: 1 }), 'NOT_FOUND');
});

test('S04: publishing a tiered draft makes it public', () => {
  const store = createStore();
  const event = createEvent(store, { title: 'Public event', city: 'Jos', startsAt: '2026-12-01', organizerId: 'org' });
  addTier(store, event.id, { name: 'General', priceCents: 100, capacity: 10 });
  assert.equal(publishEvent(store, event.id).status, 'published');
  assert.equal(listEventSummaries(store).length, 1);
});

test('S04: publishing an event without tiers fails with INVALID_STATE and leaves it draft', () => {
  const store = createStore();
  const event = createEvent(store, { title: 'No tiers', city: 'Jos', startsAt: '2026-12-01', organizerId: 'org' });
  errorCode(() => publishEvent(store, event.id), 'INVALID_STATE');
  assert.equal(event.status, 'draft');
  assert.deepEqual(listEventSummaries(store), []);
});

test('S04: missing event cannot be published or unpublished', () => {
  const store = createStore();
  errorCode(() => publishEvent(store, 'missing'), 'NOT_FOUND');
  errorCode(() => unpublishEvent(store, 'missing'), 'NOT_FOUND');
});

test('S04: unpublishing hides the event while preserving its tier', () => {
  const { store, draft } = fixture();
  const before = listEventSummaries(store).length;
  unpublishEvent(store, draft.id);
  assert.equal(draft.status, 'draft');
  assert.equal(listEventSummaries(store).length, before - 1);
  assert.equal(listEventSummaries(store, { publishedOnly: false }).length, 2);
  assert.equal(draft.tierIds.length, 1);
});

test('S04: only a published event can be unpublished', () => {
  const store = createStore();
  const event = createEvent(store, { title: 'Draft', city: 'Jos', startsAt: '2026-12-01', organizerId: 'org' });
  errorCode(() => unpublishEvent(store, event.id), 'INVALID_STATE');
});

test('S05: case-insensitive query matches title or venue', () => {
  const { store } = fixture();
  const events = listEventSummaries(store);
  assert.deepEqual(filterEvents(events, { q: 'JAZZ' }).map(e => e.title), ['Abuja Jazz Night']);
  assert.deepEqual(filterEvents(events, { q: 'CIVIC' }).map(e => e.title), ['Lagos Tech Meetup']);
});

test('S05: city matching is exact and case-insensitive', () => {
  const { store } = fixture();
  assert.deepEqual(filterEvents(listEventSummaries(store), { city: 'lagos' }).map(e => e.city), ['Lagos']);
  assert.deepEqual(filterEvents(listEventSummaries(store), { city: 'lag' }), []);
});

test('S05: maximum price uses cheapest tier, excludes no-tier events, and sorts cheapest first', () => {
  const { store } = fixture();
  const noTier = createEvent(store, { title: 'Free maybe', city: 'Jos', startsAt: '2026-12-06', organizerId: 'org' });
  publishEvent; // Deliberately not published; test summaries may include all statuses below.
  const all = listEventSummaries(store, { publishedOnly: false });
  const filtered = filterEvents(all, { maxPriceCents: 300000 });
  assert.deepEqual(sortEvents(filtered, 'price').map(e => e.title), ['Abuja Jazz Night']);
  assert.ok(!filtered.some(e => e.id === noTier.id));
});

test('S05: date sorting is earliest first and same-day events are ordered by title', () => {
  const events = [
    { id: 'z', title: 'Zed', startsAt: '2026-12-05T10:00:00Z', tiers: [] },
    { id: 'b', title: 'Bravo', startsAt: '2026-12-05T10:00:00Z', tiers: [] },
    { id: 'a', title: 'Earlier', startsAt: '2026-12-04T10:00:00Z', tiers: [] },
  ];
  assert.deepEqual(sortEvents(events, 'date').map(e => e.title), ['Earlier', 'Bravo', 'Zed']);
});

test('S05: date-only upper bound includes an event later that day', () => {
  const { store } = fixture();
  assert.deepEqual(filterEvents(listEventSummaries(store), { to: '2026-12-05' }).length, 2);
});

test('S05: from/to filters are inclusive and combine with query/city', () => {
  const { store } = fixture();
  assert.equal(searchEvents(listEventSummaries(store), { from: '2026-12-05', to: '2026-12-05', city: 'lagos', q: 'meetup' }, 'date').length, 1);
});

test('S05: bad dates, fractional max price and unknown sort return VALIDATION', () => {
  const events = [{ id: 'a', title: 'A', city: 'Jos', startsAt: '2026-12-01T00:00:00Z', tiers: [] }];
  errorCode(() => filterEvents(events, { from: '2026-02-30' }), 'VALIDATION');
  errorCode(() => filterEvents(events, { to: 'yesterday' }), 'VALIDATION');
  errorCode(() => filterEvents(events, { from: '2026-02-30T12:00:00Z' }), 'VALIDATION');
  errorCode(() => filterEvents(events, { maxPriceCents: 1.2 }), 'VALIDATION');
  errorCode(() => filterEvents(events, { maxPriceCents: -1 }), 'VALIDATION');
  errorCode(() => sortEvents(events, 'random'), 'VALIDATION');
});

test('S05: availability filter and sorting put most seats first', () => {
  const events = [
    { id: '1', title: 'A', startsAt: '2026-12-01', tiers: [{ capacity: 5, sold: 5 }] },
    { id: '2', title: 'B', startsAt: '2026-12-02', tiers: [{ capacity: 8, sold: 1 }] },
    { id: '3', title: 'C', startsAt: '2026-12-03', tiers: [{ seatsLeft: 2 }] },
  ];
  assert.deepEqual(filterEvents(events, { onlyAvailable: true }).map(e => e.id), ['2', '3']);
  assert.deepEqual(sortEvents(events, 'availability').map(e => e.id), ['2', '3', '1']);
});

test('S05: sort and filter return new arrays and never mutate the source list', () => {
  const { store } = fixture();
  const events = listEventSummaries(store);
  const before = structuredClone(events);
  const sorted = sortEvents(events, 'price');
  const filtered = filterEvents(events, { city: 'lagos' });
  assert.notEqual(sorted, events);
  assert.notEqual(filtered, events);
  assert.deepEqual(events, before);
});

test('S05: merge sort is stable, returns a new array and handles empty input', () => {
  const items = [{ key: 2, n: 'a' }, { key: 1, n: 'b' }, { key: 2, n: 'c' }];
  const sorted = mergeSort(items, (a, b) => a.key - b.key);
  assert.deepEqual(sorted.map(x => x.n), ['b', 'a', 'c']);
  assert.notEqual(sorted, items);
  assert.deepEqual(items.map(x => x.n), ['a', 'b', 'c']);
  assert.deepEqual(mergeSort([], () => 0), []);
});

test('S06: booking 2 tickets creates pending booking and leaves one seat', () => {
  const { store, general } = fixture();
  const booking = bookTickets(store, general.id, 'attendee', 2);
  assert.equal(booking.status, 'pending');
  assert.equal(booking.quantity, 2);
  assert.equal(booking.amountCents, 1000000);
  assert.equal(seatsLeft(general), 1);
});

test('S06: oversold booking returns SOLD_OUT and changes nothing', () => {
  const { store, general } = fixture();
  bookTickets(store, general.id, 'attendee', 2);
  const soldBefore = general.sold;
  const bookingsBefore = store.bookings.size;
  errorCode(() => bookTickets(store, general.id, 'attendee-2', 2), 'SOLD_OUT');
  assert.equal(general.sold, soldBefore);
  assert.equal(store.bookings.size, bookingsBefore);
});

test('S06: invalid booking quantities return VALIDATION and change nothing', () => {
  const { store, general } = fixture();
  for (const quantity of [0, -1, 1.5, 11]) {
    errorCode(() => bookTickets(store, general.id, 'attendee', quantity), 'VALIDATION');
  }
  assert.equal(general.sold, 0);
  assert.equal(store.bookings.size, 0);
});

test('S05: price sort puts the cheapest event first and events without prices last', () => {
  const events = [
    { id: '3', title: 'No tier', startsAt: '2026-12-01', tiers: [] },
    { id: '2', title: 'Mid', startsAt: '2026-12-01', tiers: [{ priceCents: 200 }] },
    { id: '1', title: 'Cheap', startsAt: '2026-12-01', tiers: [{ priceCents: 100 }] },
  ];
  assert.deepEqual(sortEvents(events, 'price').map(event => event.title), ['Cheap', 'Mid', 'No tier']);
});

test('S05: empty lists remain empty across filtering, sorting and searching', () => {
  assert.deepEqual(filterEvents([], {}), []);
  assert.deepEqual(sortEvents([], 'date'), []);
  assert.deepEqual(searchEvents([], {}, 'availability'), []);
});
