import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore, createEvent, addTier, publishEvent, unpublishEvent, listEventSummaries } from '../src/domain/inventory.js';
import { filterEvents, sortEvents, searchEvents } from '../src/domain/eventSearch.js';
import { mergeSort } from '../src/domain/sorting.js';

function makeStoreWithEvent(title = 'Lagos Tech Meetup', city = 'Lagos', venue = 'Hall', startsAt = '2026-12-05T10:00:00.000Z', org = 'org') {
  const store = createStore();
  const ev = createEvent(store, { title, city, venue, startsAt, organizerId: org });
  addTier(store, ev.id, { name: 'General', priceCents: 500000, capacity: 100 });
  return { store, ev };
}

function setupStore() {
  const store = createStore();
  const ev1 = createEvent(store, { title: 'Lagos Tech Meetup', city: 'Lagos', venue: 'Hall A', startsAt: '2026-12-05T10:00:00.000Z', organizerId: 'o' });
  addTier(store, ev1.id, { name: 'General', priceCents: 500000, capacity: 100 });
  const ev2 = createEvent(store, { title: 'Abuja Jazz Night', city: 'Abuja', venue: 'Hall B', startsAt: '2026-12-06T19:00:00.000Z', organizerId: 'o' });
  addTier(store, ev2.id, { name: 'VIP', priceCents: 300000, capacity: 50 });
  publishEvent(store, ev1.id);
  publishEvent(store, ev2.id);
  return { store, ev1, ev2 };
}

test('S02 create event draft', () => {
  const store = createStore();
  const ev = createEvent(store, { title: 'Lagos Tech Meetup', city: 'Lagos', venue: 'Hall', startsAt: '2026-12-05T10:00:00.000Z', organizerId: 'org' });
  assert.equal(ev.status, 'draft');
  assert.ok(ev.id);
});

test('S02 validation', () => {
  const store = createStore();
  assert.throws(() => createEvent(store, { title: '', city: 'Lagos', venue: 'H', startsAt: '2026-12-05T10:00:00.000Z', organizerId: 'o' }), e => e.code === 'VALIDATION');
  assert.throws(() => createEvent(store, { title: 'T', city: '', venue: 'H', startsAt: '2026-12-05T10:00:00.000Z', organizerId: 'o' }), e => e.code === 'VALIDATION');
  assert.throws(() => createEvent(store, { title: 'T', city: 'C', venue: 'H', startsAt: 'not-a-date', organizerId: 'o' }), e => e.code === 'VALIDATION');
});

test('S03 add tier', () => {
  const { store, ev } = makeStoreWithEvent();
  const tier = store.tiers.get(ev.tierIds[0]);
  assert.equal(tier.sold, 0);
  assert.equal(tier.capacity, 100);
});

test('S03 validation/not found', () => {
  const { store, ev } = makeStoreWithEvent();
  assert.throws(() => addTier(store, ev.id, { name: 'T', priceCents: 1.5, capacity: 10 }), e => e.code === 'VALIDATION');
  assert.throws(() => addTier(store, ev.id, { name: 'T', priceCents: 100, capacity: 0 }), e => e.code === 'VALIDATION');
  assert.throws(() => addTier(store, 'nope', { name: 'T', priceCents: 100, capacity: 10 }), e => e.code === 'NOT_FOUND');
});

test('S04 publish/unpublish', () => {
  const { store, ev } = makeStoreWithEvent();
  const pub = publishEvent(store, ev.id);
  assert.equal(pub.status, 'published');
  const list = listEventSummaries(store, { publishedOnly: true });
  assert.ok(list.some(x => x.id === ev.id));
  unpublishEvent(store, ev.id);
  assert.equal(store.events.get(ev.id).status, 'draft');
});

test('S04 publish with no tier rejected', () => {
  const store = createStore();
  const ev = createEvent(store, { title: 'No Tier', city: 'Lagos', venue: 'Hall', startsAt: '2026-12-05T10:00:00.000Z', organizerId: 'o' });
  assert.throws(() => publishEvent(store, ev.id), e => e.code === 'INVALID_STATE');
});

test('S05 search by text case-insensitive', () => {
  const { store } = setupStore();
  const list = listEventSummaries(store, { publishedOnly: true });
  const res = searchEvents(list, { q: 'JAZZ' }, undefined);
  assert.equal(res.length, 1);
  assert.equal(res[0].title, 'Abuja Jazz Night');
});

test('S05 filter by city case-insensitive', () => {
  const { store } = setupStore();
  const list = listEventSummaries(store, { publishedOnly: true });
  const res = searchEvents(list, { city: 'lagos' }, undefined);
  assert.equal(res.length, 1);
  assert.equal(res[0].city, 'Lagos');
});

test('S05 sort by date earliest first', () => {
  const { store } = setupStore();
  const list = listEventSummaries(store, { publishedOnly: true });
  const sorted = sortEvents(list, 'date');
  assert.equal(sorted[0].title, 'Lagos Tech Meetup');
});

test('S05 sort by price cheapest first', () => {
  const { store } = setupStore();
  const list = listEventSummaries(store, { publishedOnly: true });
  const sorted = sortEvents(list, 'price');
  assert.equal(sorted[0].title, 'Abuja Jazz Night');
});

test('S05 unknown sort throws VALIDATION', () => {
  const { store } = setupStore();
  const list = listEventSummaries(store, { publishedOnly: true });
  assert.throws(() => sortEvents(list, 'nonsense'), e => e.code === 'VALIDATION');
});

test('S05 filter does not mutate original', () => {
  const { store } = setupStore();
  const list = listEventSummaries(store, { publishedOnly: true });
  const before = JSON.stringify(list);
  filterEvents(list, { city: 'lagos' });
  assert.equal(JSON.stringify(list), before);
});

test('mergeSort is stable and non-mutating', () => {
  const items = [{ k: 1, n: 'a' }, { k: 1, n: 'b' }, { k: 0, n: 'c' }];
  const copy = JSON.stringify(items);
  const sorted = mergeSort(items, (x, y) => x.k - y.k);
  assert.equal(JSON.stringify(items), copy);
  assert.deepEqual(sorted.map(x => x.n), ['c', 'a', 'b']);
});

test('mergeSort empty and single', () => {
  assert.deepEqual(mergeSort([], (a, b) => 0), []);
  assert.deepEqual(mergeSort([1], (a, b) => a - b), [1]);
});
