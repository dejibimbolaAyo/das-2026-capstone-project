import test from 'node:test';
import assert from 'node:assert/strict';
import { filterEvents, searchEvents, sortEvents } from '../src/domain/eventSearch.js';
import { DomainError } from '../src/domain/errors.js';

const summaries = [
  {
    id: 'event-a', title: 'Lagos Music Night', city: 'Lagos', venue: 'Island Hall',
    startsAt: '2026-12-10T18:00:00.000Z', minPriceCents: 5000, seatsLeft: 15,
  },
  {
    id: 'event-b', title: 'Abuja Jazz Night', city: 'Abuja', venue: 'City Stage',
    startsAt: '2026-12-08T19:00:00.000Z', minPriceCents: 3000, seatsLeft: 8,
  },
  {
    id: 'event-c', title: 'Lagos Tech Meetup', city: 'Lagos', venue: 'Yaba Hub',
    startsAt: '2026-12-05T17:00:00.000Z', minPriceCents: 5000, seatsLeft: 0,
  },
  {
    id: 'event-d', title: 'Lagos Art Fair', city: 'Lagos', venue: 'Main Gallery',
    startsAt: '2026-12-12T10:00:00.000Z', minPriceCents: null, seatsLeft: 0,
  },
];

test('filterEvents matches title and venue text without caring about case', () => {
  assert.deepEqual(filterEvents(summaries, { q: 'JAZZ' }).map((event) => event.id), ['event-b']);
  assert.deepEqual(filterEvents(summaries, { q: 'HALL' }).map((event) => event.id), ['event-a']);
});

test('city filtering is exact and ignores letter case', () => {
  assert.deepEqual(filterEvents(summaries, { city: 'lagos' }).map((event) => event.id), [
    'event-a', 'event-c', 'event-d',
  ]);
  assert.deepEqual(filterEvents(summaries, { city: 'Lago' }), []);
});

test('maximum price filters by cheapest tier and excludes events with no tiers', () => {
  assert.deepEqual(
    searchEvents(summaries, { maxPriceCents: 4000 }, 'price').map((event) => event.id),
    ['event-b'],
  );
  assert.deepEqual(sortEvents(summaries, 'price').map((event) => event.id), [
    'event-b', 'event-a', 'event-c', 'event-d',
  ]);
});

test('date sorting orders days first, then titles and ids', () => {
  const sameDay = [
    { ...summaries[0], id: 'z-id', title: 'Same title', startsAt: '2026-12-05T23:00:00.000Z' },
    { ...summaries[1], id: 'a-id', title: 'Same title', startsAt: '2026-12-05T01:00:00.000Z' },
    { ...summaries[2], id: 'later-day', title: 'Earlier title', startsAt: '2026-12-06T00:00:00.000Z' },
  ];

  assert.deepEqual(sortEvents(sameDay, 'date').map((event) => event.id), [
    'a-id', 'z-id', 'later-day',
  ]);
});

test('date-only end filters include events through the end of that day', () => {
  assert.deepEqual(
    filterEvents(summaries, { to: '2026-12-05' }).map((event) => event.id),
    ['event-c'],
  );
  assert.deepEqual(
    filterEvents(summaries, { from: '2026-12-05', to: '2026-12-05' }).map((event) => event.id),
    ['event-c'],
  );
});

test('timestamp date bounds include events exactly at the boundary', () => {
  assert.deepEqual(
    filterEvents(summaries, {
      from: '2026-12-08T19:00:00.000Z',
      to: '2026-12-08T19:00:00.000Z',
    }).map((event) => event.id),
    ['event-b'],
  );
});

test('availability sorting puts the most seats left first and can filter sold-out events', () => {
  assert.deepEqual(sortEvents(summaries, 'availability').map((event) => event.id), [
    'event-a', 'event-b', 'event-d', 'event-c',
  ]);
  assert.deepEqual(filterEvents(summaries, { onlyAvailable: true }).map((event) => event.id), [
    'event-a', 'event-b',
  ]);
});

test('empty input returns a new empty list', () => {
  const empty = [];
  const filtered = filterEvents(empty);
  const sorted = sortEvents(empty, 'date');
  assert.deepEqual(filtered, []);
  assert.deepEqual(sorted, []);
  assert.notStrictEqual(filtered, empty);
  assert.notStrictEqual(sorted, empty);
});

test('filtering, sorting and searching do not change the original list', () => {
  const original = summaries.slice();
  const snapshot = structuredClone(summaries);
  const filtered = filterEvents(summaries, { city: 'Lagos' });
  const sorted = sortEvents(summaries, 'date');
  const searched = searchEvents(summaries, { maxPriceCents: 5000 }, 'price');

  for (const result of [filtered, sorted, searched]) {
    assert.notStrictEqual(result, summaries);
  }
  assert.deepEqual(summaries, snapshot);
  assert.deepEqual(summaries, original);
});

test('invalid dates, fractional prices and unknown sort options use VALIDATION errors', () => {
  for (const badDate of ['not-a-date', '2026-02-30', '2026-02-30T12:00:00Z']) {
    assert.throws(
      () => filterEvents(summaries, { from: badDate }),
      (error) => error instanceof DomainError && error.code === 'VALIDATION',
    );
  }
  assert.throws(
    () => searchEvents(summaries, { maxPriceCents: 12.5 }, 'price'),
    (error) => error instanceof DomainError && error.code === 'VALIDATION',
  );
  assert.throws(
    () => searchEvents(summaries, {}, 'unknown'),
    (error) => error instanceof DomainError && error.code === 'VALIDATION',
  );
});
