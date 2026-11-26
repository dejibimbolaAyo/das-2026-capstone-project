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
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import {
  createStore,
  createEvent,
  addTier,
  publishEvent,
  bookTickets,
  listEventSummaries,
} from '../src/domain/inventory.js';
import { filterEvents, sortEvents, searchEvents } from '../src/domain/eventSearch.js';
import { DomainError } from '../src/domain/errors.js';

const titles = (events) => events.map((e) => e.title);

describe('event search', () => {
  let summaries;

  before(() => {
    const store = createStore();
    const make = (title, city, startsAt, tiers, { publish = true } = {}) => {
      const event = createEvent(store, { title, city, venue: `${city} Hall`, startsAt, organizerId: 'org' });
      const created = tiers.map((t) => addTier(store, event.id, t));
      if (publish) publishEvent(store, event.id);
      return { event, created };
    };

    make('Jazz Night', 'Lagos', '2026-12-10T19:00:00Z', [{ name: 'GA', priceCents: 3000, capacity: 50 }]);
    make('Tech Summit', 'Abuja', '2026-12-05T09:00:00Z', [
      { name: 'GA', priceCents: 10000, capacity: 100 },
      { name: 'VIP', priceCents: 25000, capacity: 10 },
    ]);
    make('Food Fair', 'Lagos', '2026-12-05T12:00:00Z', [{ name: 'Entry', priceCents: 0, capacity: 500 }]);
    const sold = make('Sold Out Gig', 'Ibadan', '2026-12-20T20:00:00Z', [
      { name: 'GA', priceCents: 5000, capacity: 2 },
    ]);
    bookTickets(store, sold.created[0].id, 'u1', 2);
    make('Secret Draft', 'Lagos', '2026-12-01T10:00:00Z', [{ name: 'GA', priceCents: 100, capacity: 5 }], {
      publish: false,
    });

    summaries = listEventSummaries(store);
  });

  it('hides drafts from the public list', () => {
    assert.equal(summaries.length, 4);
    assert.ok(!titles(summaries).includes('Secret Draft'));
  });

  it('summarises price and seats across tiers', () => {
    const summit = summaries.find((e) => e.title === 'Tech Summit');
    assert.equal(summit.minPriceCents, 10000);
    assert.equal(summit.seatsLeft, 110);
  });

  describe('filtering', () => {
    it('by city, ignoring case', () => {
      assert.deepEqual(titles(filterEvents(summaries, { city: 'lagos' })).sort(), ['Food Fair', 'Jazz Night']);
    });

    it('by text in the title or venue', () => {
      assert.deepEqual(titles(filterEvents(summaries, { q: 'summit' })), ['Tech Summit']);
      assert.deepEqual(titles(filterEvents(summaries, { q: 'ibadan hall' })), ['Sold Out Gig']);
    });

    it('by maximum price, including free events', () => {
      assert.deepEqual(titles(filterEvents(summaries, { maxPriceCents: 3000 })).sort(), ['Food Fair', 'Jazz Night']);
      assert.deepEqual(titles(filterEvents(summaries, { maxPriceCents: 0 })), ['Food Fair']);
    });

    it('by date range, where a date-only "to" includes the whole day', () => {
      const result = filterEvents(summaries, { from: '2026-12-05', to: '2026-12-05' });
      assert.deepEqual(titles(result).sort(), ['Food Fair', 'Tech Summit']);
    });

    it('can hide sold-out events', () => {
      assert.ok(!titles(filterEvents(summaries, { onlyAvailable: true })).includes('Sold Out Gig'));
    });

    it('rejects nonsense input', () => {
      assert.throws(() => filterEvents(summaries, { from: 'yesterday-ish' }), DomainError);
      assert.throws(() => filterEvents(summaries, { maxPriceCents: -5 }), DomainError);
    });
  });

  describe('sorting', () => {
    it('by date (default), earliest first', () => {
      assert.deepEqual(titles(sortEvents(summaries)), ['Tech Summit', 'Food Fair', 'Jazz Night', 'Sold Out Gig']);
    });

    it('by price, cheapest first', () => {
      assert.deepEqual(titles(sortEvents(summaries, 'price')), ['Food Fair', 'Jazz Night', 'Sold Out Gig', 'Tech Summit']);
    });

    it('by availability, most seats first', () => {
      assert.deepEqual(titles(sortEvents(summaries, 'availability')), [
        'Food Fair',
        'Tech Summit',
        'Jazz Night',
        'Sold Out Gig',
      ]);
    });

    it('does not change the input and rejects unknown sort keys', () => {
      const before = titles(summaries);
      sortEvents(summaries, 'price');
      assert.deepEqual(titles(summaries), before);
      assert.throws(() => sortEvents(summaries, 'constructor'), DomainError);
    });
  });

  it('searchEvents filters then sorts', () => {
    const result = searchEvents(summaries, { city: 'Lagos' }, 'price');
    assert.deepEqual(titles(result), ['Food Fair', 'Jazz Night']);
  });
});
