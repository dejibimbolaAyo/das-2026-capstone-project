import test from 'node:test';
import assert from 'node:assert/strict';
import { searchEvents, sortEvents } from '../src/domain/eventSearch.js';

const tiers = new Map([
  ['tier-a', { id: 'tier-a', eventId: 'event-a', priceCents: 5000, capacity: 20, sold: 5 }],
  ['tier-b', { id: 'tier-b', eventId: 'event-b', priceCents: 3000, capacity: 10, sold: 2 }],
  ['tier-c', { id: 'tier-c', eventId: 'event-c', priceCents: 3000, capacity: 10, sold: 2 }],
  ['tier-d', { id: 'tier-d', eventId: 'event-d', priceCents: 9000, capacity: 5, sold: 5 }],
]);

const events = [
  {
    id: 'event-a', title: 'Lagos Music Night', city: 'Lagos', venue: 'Island Hall',
    startsAt: '2026-12-10T18:00:00.000Z', tierIds: ['tier-a'],
  },
  {
    id: 'event-b', title: 'Abuja Comedy Show', city: 'Abuja', venue: 'City Stage',
    startsAt: '2026-12-08T19:00:00.000Z', tierIds: ['tier-b'],
  },
  {
    id: 'event-c', title: 'Lagos Tech Meetup', city: 'Lagos', venue: 'Yaba Hub',
    startsAt: '2026-12-08T12:00:00.000Z', tierIds: ['tier-c'],
  },
  {
    id: 'event-d', title: 'Lagos Art Fair', city: 'Lagos', venue: 'Main Gallery',
    startsAt: '2026-12-12T10:00:00.000Z', tierIds: ['tier-d'],
  },
];

test('search combines text, city, inclusive date and price filters', () => {
  const results = searchEvents(events, tiers, {
    text: 'LAGOS',
    city: 'lagos',
    startDate: '2026-12-08',
    endDate: '2026-12-10',
    minPriceCents: 4000,
    maxPriceCents: 6000,
  });

  assert.deepEqual(results.map((event) => event.id), ['event-a']);
});

test('search returns a new list and leaves the original unchanged', () => {
  const original = events.slice();
  const results = searchEvents(events, tiers, { city: 'Lagos' });

  assert.notStrictEqual(results, events);
  assert.deepEqual(events, original);
});

test('merge sort orders events by date, price, and availability', () => {
  assert.deepEqual(
    sortEvents(events, tiers, { by: 'date' }).map((event) => event.id),
    ['event-c', 'event-b', 'event-a', 'event-d'],
  );
  assert.deepEqual(
    sortEvents(events, tiers, { by: 'price' }).map((event) => event.id),
    ['event-b', 'event-c', 'event-a', 'event-d'],
  );
  assert.deepEqual(
    sortEvents(events, tiers, { by: 'availability', direction: 'desc' }).map((event) => event.id),
    ['event-a', 'event-b', 'event-c', 'event-d'],
  );
});

test('sort returns a new list and leaves the original unchanged', () => {
  const original = events.slice();
  const sorted = sortEvents(events, tiers, { by: 'date' });

  assert.notStrictEqual(sorted, events);
  assert.deepEqual(events, original);
});

test('equal sort values keep their original order', () => {
  const tied = [events[1], events[2]];
  const sorted = sortEvents(tied, tiers, { by: 'price' });

  assert.deepEqual(sorted.map((event) => event.id), ['event-b', 'event-c']);
});

test('events without tiers sort as no price and zero availability', () => {
  const noTiers = [
    { id: 'first', title: 'First', city: 'Lagos', startsAt: '2026-12-10T00:00:00Z', tierIds: [] },
    { id: 'second', title: 'Second', city: 'Lagos', startsAt: '2026-12-10T00:00:00Z' },
  ];

  assert.deepEqual(sortEvents(noTiers, tiers, { by: 'price' }).map((event) => event.id), ['first', 'second']);
  assert.deepEqual(sortEvents(noTiers, tiers, { by: 'availability' }).map((event) => event.id), ['first', 'second']);
});
