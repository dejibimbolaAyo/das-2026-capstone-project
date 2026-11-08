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
          it('handles an empty event list', () => {
        assert.deepEqual(filterEvents([]), []);
      });

      it('does not modify the original list when filtering', () => {
        const original = [...summaries];

        filterEvents(summaries, { city: 'Lagos' });

        assert.deepEqual(summaries, original);
      });
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
          it('includes events at 5 PM on the date-only upper boundary', () => {
        const eveningEvent = {
          id: 'evening-1',
          title: 'Evening Concert',
          city: 'Lagos',
          venue: 'City Hall',
          startsAt: '2026-12-05T17:00:00.000Z',
          minPriceCents: 5000,
          seatsLeft: 20,
        };

        const result = filterEvents(
          [...summaries, eveningEvent],
          { to: '2026-12-05' }
        );

        assert.ok(titles(result).includes('Evening Concert'));
      });

    it('can hide sold-out events', () => {
      assert.ok(!titles(filterEvents(summaries, { onlyAvailable: true })).includes('Sold Out Gig'));
    });

    it('rejects nonsense input', () => {
      assert.throws(() => filterEvents(summaries, { from: 'yesterday-ish' }), DomainError);
      assert.throws(() => filterEvents(summaries, { maxPriceCents: -5 }), DomainError);
    });
    it('rejects impossible calendar dates', () => {
  assert.throws(
    () => filterEvents(summaries, { from: '2026-02-30' }),
    (error) => error instanceof DomainError && error.code === 'VALIDATION',);
  });
  });

  describe('sorting', () => {
    it('by date (default), earliest first', () => {
      assert.deepEqual(titles(sortEvents(summaries)), [
  'Food Fair',
  'Tech Summit',
  'Jazz Night',
  'Sold Out Gig',
      ]);
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
  it('sorts events on the same day alphabetically by title', () => {
  const sameDay = [
    {
      id: '3',
      title: 'Zulu Event',
      startsAt: '2026-12-05T09:00:00.000Z',
    },
    {
      id: '2',
      title: 'Alpha Event',
      startsAt: '2026-12-05T20:00:00.000Z',
    },
    {
      id: '1',
      title: 'Middle Event',
      startsAt: '2026-12-05T12:00:00.000Z',
    },
  ];

  assert.deepEqual(
    titles(sortEvents(sameDay)),
    ['Alpha Event', 'Middle Event', 'Zulu Event'],
  );
});
});
