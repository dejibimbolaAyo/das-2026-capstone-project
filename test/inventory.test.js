import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  createStore,
  createEvent,
  addTier,
  publishEvent,
  unpublishEvent,
  bookTickets,
  cancelBooking,
  joinWaitlist,
  offerNextOnWaitlist,
  findBookingByReference,
  seatsLeft,
  listEventSummaries,
} from '../src/domain/inventory.js';
import { DomainError } from '../src/domain/errors.js';

const throwsCode = (fn, code) =>
  assert.throws(fn, (error) => error instanceof DomainError && error.code === code);

describe('inventory', () => {
  let store;
  let event;
  let tier;

  beforeEach(() => {
    store = createStore();
    event = createEvent(store, {
      title: 'Test Event',
      city: 'Lagos',
      startsAt: '2026-12-05T17:00:00Z',
      organizerId: 'org-1',
    });
    tier = addTier(store, event.id, { name: 'General', priceCents: 2500, capacity: 3 });
  });

  describe('creating events and tiers', () => {
        // S02: Create Event
    it('creates a new event as a draft and keeps it out of the public list', () => {
      const newEvent = createEvent(store, {
        title: 'Lagos Music Festival',
        city: 'Lagos',
        venue: 'Tafawa Balewa Square',
        startsAt: '2026-12-10T17:00:00Z',
        organizerId: 'org-2',
      });

      assert.ok(newEvent.id);
      assert.equal(newEvent.status, 'draft');
      assert.equal(newEvent.title, 'Lagos Music Festival');

      const publicEvents = listEventSummaries(store);
      assert.ok(!publicEvents.some((item) => item.id === newEvent.id));
    });

    it('rejects a missing city and does not save the invalid event', () => {
      const eventsBefore = store.events.size;

      throwsCode(
        () => createEvent(store, {
          title: 'Invalid Event',
          city: ' ',
          startsAt: '2026-12-10',
          organizerId: 'org-2',
        }),
        'VALIDATION'
      );

      assert.equal(store.events.size, eventsBefore);
    });

    // S03: Add Ticket Tiers
    it('adds a ticket tier with the correct price, capacity and zero tickets sold', () => {
      const newTier = addTier(store, event.id, {
        name: 'VIP',
        priceCents: 500000,
        capacity: 100,
      });

      assert.equal(newTier.priceCents, 500000);
      assert.equal(newTier.capacity, 100);
      assert.equal(newTier.sold, 0);
      assert.equal(seatsLeft(newTier), 100);
    });

    it('rejects adding a ticket tier to an unknown event', () => {
      throwsCode(
        () => addTier(store, 'missing-event-id', {
          name: 'General',
          priceCents: 500000,
          capacity: 100,
        }),
        'NOT_FOUND'
      );
    });
    it('publishes an event and makes it visible in the public list', () => {
  const published = publishEvent(store, event.id);

  assert.equal(published.status, 'published');

  const publicEvents = listEventSummaries(store);
  assert.ok(publicEvents.some((item) => item.id === event.id));
  });

it('unpublishes an event and removes it from the public list', () => {
  publishEvent(store, event.id);

  const unpublished = unpublishEvent(store, event.id);

  assert.equal(unpublished.status, 'draft');

  const publicEvents = listEventSummaries(store);
  assert.ok(!publicEvents.some((item) => item.id === event.id));
  });

it('rejects publishing an event without ticket tiers', () => {
  const empty = createEvent(store, {
    title: 'Empty Event',
    city: 'Abuja',
    startsAt: '2026-12-06',
  });

  throwsCode(() => publishEvent(store, empty.id), 'INVALID_STATE');
  assert.equal(empty.status, 'draft');
  });

    it('rejects a missing title, a bad date and bad numbers', () => {
      throwsCode(() => createEvent(store, { title: ' ', city: 'x', startsAt: '2026-12-05' }), 'VALIDATION');
      throwsCode(() => createEvent(store, { title: 'x', city: 'x', startsAt: 'nope' }), 'VALIDATION');
      throwsCode(() => addTier(store, event.id, { name: 'x', priceCents: 19.99, capacity: 5 }), 'VALIDATION');
      throwsCode(() => addTier(store, event.id, { name: 'x', priceCents: 100, capacity: 0 }), 'VALIDATION');
      throwsCode(() => createEvent(store, {title: 'Invalid Date Event',city: 'Lagos',startsAt: '2026-02-30' }),'VALIDATION');
    });
  });

  describe('booking', () => {
    it('reduces the seats left and prices in whole cents', () => {
      publishEvent(store, event.id);
      const booking = bookTickets(store, tier.id, 'ada', 2);
      assert.equal(booking.amountCents, 5000);
      assert.equal(booking.status, 'pending');
      assert.equal(seatsLeft(tier), 1);
    });

    it('rejects a booking bigger than the seats left, and changes nothing', () => {
      bookTickets(store, tier.id, 'ada', 2);
      throwsCode(() => bookTickets(store, tier.id, 'bayo', 2), 'SOLD_OUT');
      assert.equal(seatsLeft(tier), 1);
    });

    it('lets the last ticket be booked, then reports sold out', () => {
      bookTickets(store, tier.id, 'ada', 3);
      assert.equal(seatsLeft(tier), 0);
      throwsCode(() => bookTickets(store, tier.id, 'bayo', 1), 'SOLD_OUT');
    });

    it('validates the quantity', () => {
      for (const bad of [0, -1, 1.5, 11, '2', undefined]) {
        throwsCode(() => bookTickets(store, tier.id, 'ada', bad), 'VALIDATION');
      }
    });

    it('finds a booking by its reference code', () => {
      const booking = bookTickets(store, tier.id, 'ada', 1);
      assert.match(booking.reference, /^[A-Z2-9]{8}$/);
      assert.equal(findBookingByReference(store, booking.reference), booking);
      assert.equal(findBookingByReference(store, 'NOPE0000'), undefined);
    });
  });

  describe('cancelling', () => {
    it('gives the seats back', () => {
      const booking = bookTickets(store, tier.id, 'ada', 2);
      cancelBooking(store, booking.reference);
      assert.equal(seatsLeft(tier), 3);
      assert.equal(booking.status, 'cancelled');
    });

    it('cannot be done twice (seats are released once)', () => {
      const booking = bookTickets(store, tier.id, 'ada', 2);
      cancelBooking(store, booking.reference);
      throwsCode(() => cancelBooking(store, booking.reference), 'INVALID_STATE');
      assert.equal(seatsLeft(tier), 3);
    });
  });

  describe('waitlist', () => {
    it('only opens when the tier cannot satisfy the request', () => {
      throwsCode(() => joinWaitlist(store, tier.id, 'ada', 1), 'NOT_SOLD_OUT');
      bookTickets(store, tier.id, 'bayo', 3);
      assert.deepEqual(joinWaitlist(store, tier.id, 'ada', 1), { position: 1 });
      assert.deepEqual(joinWaitlist(store, tier.id, 'chidi', 1), { position: 2 });
    });

    it('offers seats first come, first served', () => {
      const booking = bookTickets(store, tier.id, 'bayo', 3);
      joinWaitlist(store, tier.id, 'ada', 1);
      joinWaitlist(store, tier.id, 'chidi', 1);
      assert.equal(offerNextOnWaitlist(store, tier.id), undefined, 'no seats yet');
      cancelBooking(store, booking.reference);
      assert.equal(offerNextOnWaitlist(store, tier.id).userId, 'ada');
      assert.equal(offerNextOnWaitlist(store, tier.id).userId, 'chidi');
    });
  });
});
