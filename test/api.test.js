// API-level tests: start the real server on a free port and talk to it with fetch.
// One test (or more) for every acceptance criterion of S02 to S07.
// Build 5: the whole suite runs twice, once per repository, so SQLite must
// behave exactly like the in-memory version.

import { after, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createTicketingServer } from '../src/server.js';
import { createMockPaymentGateway } from '../src/lib/mockPaymentGateway.js';
import { createMemoryRepository } from '../src/repositories/memory.js';
import { createSqliteRepository } from '../src/repositories/sqlite.js';

const ORGANIZER = 'org-1';
const ADA = 'ada';
const BAYO = 'bayo';

const REPOSITORIES = { memory: createMemoryRepository, sqlite: createSqliteRepository };

for (const [name, makeRepository] of Object.entries(REPOSITORIES)) {
  describe(`REST API (${name} repository)`, () => {
    let server;
    let baseUrl;
    let gateway;

    // A fresh server for every test, so no test depends on another.
    beforeEach(async () => {
      if (server) await new Promise((resolve) => server.close(resolve));
      gateway = createMockPaymentGateway();
      server = createTicketingServer({ repository: makeRepository(), paymentGateway: gateway });
      await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', resolve);
      });
      baseUrl = `http://127.0.0.1:${server.address().port}`;
    });

    after(async () => {
      if (server) await new Promise((resolve) => server.close(resolve));
    });

    async function call(method, path, { user, body } = {}) {
      const headers = {};
      if (user) headers['x-user-id'] = user;
      if (body !== undefined) headers['content-type'] = 'application/json';
      const response = await fetch(`${baseUrl}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      return { status: response.status, body: await response.json() };
    }

    const assertError = (result, status, code) => {
      assert.equal(result.status, status);
      // Every error has exactly the same shape.
      assert.deepEqual(Object.keys(result.body), ['error']);
      assert.deepEqual(Object.keys(result.body.error), ['code', 'message']);
      assert.equal(result.body.error.code, code);
    };

    async function createEvent(overrides = {}) {
      const result = await call('POST', '/api/events', {
        user: ORGANIZER,
        body: { title: 'Lagos Tech Meetup', city: 'Lagos', venue: 'Landmark Centre', startsAt: '2026-12-05T17:00:00Z', ...overrides },
      });
      assert.equal(result.status, 201);
      return result.body;
    }

    async function addTier(eventId, tier = {}) {
      const result = await call('POST', `/api/events/${eventId}/tiers`, {
        user: ORGANIZER,
        body: { name: 'General', priceCents: 500000, capacity: 100, ...tier },
      });
      assert.equal(result.status, 201);
      return result.body;
    }

    async function publishedEventWithTier(tier, event) {
      const created = await createEvent(event);
      const added = await addTier(created.id, tier);
      assert.equal((await call('POST', `/api/events/${created.id}/publish`, { user: ORGANIZER })).status, 200);
      return { event: created, tier: added };
    }

    async function book(user, tierId, quantity) {
      return call('POST', '/api/bookings', { user, body: { tierId, quantity } });
    }

    const pay = (user, reference, paymentToken = 'tok_success') =>
      call('POST', `/api/bookings/${reference}/pay`, { user, body: { paymentToken } });

    describe('S02 create an event', () => {
      it('saves a draft with a new id that is not on the public list', async () => {
        const event = await createEvent();
        assert.equal(event.status, 'draft');
        assert.match(event.id, /^[0-9a-f-]{36}$/);
        assert.equal(event.organizerId, ORGANIZER);
        const list = await call('GET', '/api/events');
        assert.deepEqual(list.body.events, []);
      });

      for (const [label, body] of [
        ['a missing title', { title: '' }],
        ['a missing city', { city: undefined }],
        ['a date that is not a real date', { startsAt: 'not-a-date' }],
      ]) {
        it(`rejects ${label} with VALIDATION and saves nothing`, async () => {
          const result = await call('POST', '/api/events', {
            user: ORGANIZER,
            body: { title: 'T', city: 'Lagos', startsAt: '2026-12-05', ...body },
          });
          assertError(result, 400, 'VALIDATION');
          // Prove nothing was saved: a valid event can be created and is the only one.
          const event = await createEvent();
          await addTier(event.id);
          await call('POST', `/api/events/${event.id}/publish`, { user: ORGANIZER });
          assert.equal((await call('GET', '/api/events')).body.events.length, 1);
        });
      }

      it('requires the x-user-id header', async () => {
        const result = await call('POST', '/api/events', { body: { title: 'T', city: 'Lagos', startsAt: '2026-12-05' } });
        assertError(result, 401, 'UNAUTHENTICATED');
      });

      it('rejects a body that is not a JSON object', async () => {
        assertError(await call('POST', '/api/events', { user: ORGANIZER, body: [1, 2] }), 400, 'VALIDATION');
        assertError(await call('POST', '/api/events', { user: ORGANIZER }), 400, 'VALIDATION');
      });
    });

    describe('S03 add ticket tiers', () => {
      it('saves a tier with 0 sold and every seat left', async () => {
        const event = await createEvent();
        const tier = await addTier(event.id, { name: 'General', priceCents: 500000, capacity: 100 });
        assert.equal(tier.sold, 0);
        assert.equal(tier.seatsLeft, 100);
        assert.equal(tier.priceCents, 500000);
      });

      it('rejects a price that is not a whole number, or a capacity below 1', async () => {
        const event = await createEvent();
        for (const body of [
          { name: 'VIP', priceCents: 199.99, capacity: 5 },
          { name: 'VIP', priceCents: '500', capacity: 5 },
          { name: 'VIP', priceCents: 500, capacity: 0 },
        ]) {
          assertError(await call('POST', `/api/events/${event.id}/tiers`, { user: ORGANIZER, body }), 400, 'VALIDATION');
        }
      });

      it('rejects an event id that does not exist with NOT_FOUND', async () => {
        const result = await call('POST', '/api/events/no-such-event/tiers', {
          user: ORGANIZER,
          body: { name: 'General', priceCents: 100, capacity: 1 },
        });
        assertError(result, 404, 'NOT_FOUND');
      });

      it('only lets the organizer of the event add tiers', async () => {
        const event = await createEvent();
        const result = await call('POST', `/api/events/${event.id}/tiers`, {
          user: ADA,
          body: { name: 'General', priceCents: 100, capacity: 1 },
        });
        assertError(result, 403, 'FORBIDDEN');
      });
    });

    describe('S04 publish and unpublish', () => {
      it('publishing puts the event on the public list, unpublishing takes it off', async () => {
        const { event } = await publishedEventWithTier();
        assert.deepEqual((await call('GET', '/api/events')).body.events.map((e) => e.id), [event.id]);

        const result = await call('POST', `/api/events/${event.id}/unpublish`, { user: ORGANIZER });
        assert.equal(result.body.status, 'draft');
        assert.deepEqual((await call('GET', '/api/events')).body.events, []);
      });

      it('cannot publish an event with no tiers', async () => {
        const event = await createEvent();
        assertError(await call('POST', `/api/events/${event.id}/publish`, { user: ORGANIZER }), 409, 'INVALID_STATE');
      });

      it('only the organizer can publish', async () => {
        const event = await createEvent();
        await addTier(event.id);
        assertError(await call('POST', `/api/events/${event.id}/publish`, { user: ADA }), 403, 'FORBIDDEN');
      });

      it('hides a draft from everyone except its organizer', async () => {
        const event = await createEvent();
        assertError(await call('GET', `/api/events/${event.id}`, { user: ADA }), 404, 'NOT_FOUND');
        assert.equal((await call('GET', `/api/events/${event.id}`, { user: ORGANIZER })).status, 200);
      });
    });

    describe('S05 search, filter and sort', () => {
      beforeEach(async () => {
        await publishedEventWithTier({ priceCents: 300000 }, { title: 'Lagos Tech Meetup', city: 'Lagos', startsAt: '2026-12-05T17:00:00Z' });
        await publishedEventWithTier({ priceCents: 100000 }, { title: 'Abuja Jazz Night', city: 'Abuja', startsAt: '2026-12-05T19:00:00Z' });
        await publishedEventWithTier({ priceCents: 900000 }, { title: 'Lagos Art Fair', city: 'Lagos', startsAt: '2026-12-05T17:00:00Z' });
      });

      const titles = (result) => result.body.events.map((event) => event.title);

      it('searches by text, ignoring case', async () => {
        assert.deepEqual(titles(await call('GET', '/api/events?q=JAZZ')), ['Abuja Jazz Night']);
      });

      it('filters by city, ignoring case', async () => {
        assert.deepEqual(titles(await call('GET', '/api/events?city=lagos&sort=date')), ['Lagos Art Fair', 'Lagos Tech Meetup']);
      });

      it('filters by maximum price and sorts cheapest first', async () => {
        assert.deepEqual(titles(await call('GET', '/api/events?maxPriceCents=500000&sort=price')), [
          'Abuja Jazz Night',
          'Lagos Tech Meetup',
        ]);
      });

      it('sorts by date, with same-time events in title order', async () => {
        assert.deepEqual(titles(await call('GET', '/api/events?sort=date')), [
          'Lagos Art Fair',
          'Lagos Tech Meetup',
          'Abuja Jazz Night',
        ]);
      });

      it('includes the whole day when filtering up to a date', async () => {
        assert.equal(titles(await call('GET', '/api/events?to=2026-12-05')).length, 3);
        assert.equal(titles(await call('GET', '/api/events?to=2026-12-04')).length, 0);
      });

      for (const query of ['from=yesterday', 'maxPriceCents=12.5', 'maxPriceCents=abc', 'sort=random']) {
        it(`rejects ${query} with VALIDATION`, async () => {
          assertError(await call('GET', `/api/events?${query}`), 400, 'VALIDATION');
        });
      }
    });

    describe('S06 book tickets', () => {
      it('creates a pending booking priced in whole cents and reduces the seats left', async () => {
        const { event, tier } = await publishedEventWithTier({ priceCents: 2500, capacity: 3 });
        const result = await book(ADA, tier.id, 2);
        assert.equal(result.status, 201);
        assert.equal(result.body.status, 'pending');
        assert.equal(result.body.quantity, 2);
        assert.equal(result.body.amountCents, 5000);
        assert.match(result.body.reference, /^[A-Z2-9]{8}$/);
        assert.equal('userId' in result.body, false);

        const view = await call('GET', `/api/events/${event.id}`);
        assert.equal(view.body.tiers[0].seatsLeft, 1);
      });

      it('rejects booking more seats than are left with SOLD_OUT and changes nothing', async () => {
        const { event, tier } = await publishedEventWithTier({ capacity: 3 });
        await book(ADA, tier.id, 2);
        assertError(await book(BAYO, tier.id, 2), 409, 'SOLD_OUT');
        assert.equal((await call('GET', `/api/events/${event.id}`)).body.tiers[0].seatsLeft, 1);
      });

      for (const quantity of [0, -1, 1.5, 11, '2']) {
        it(`rejects quantity ${JSON.stringify(quantity)} with VALIDATION`, async () => {
          const { tier } = await publishedEventWithTier();
          assertError(await book(ADA, tier.id, quantity), 400, 'VALIDATION');
        });
      }

      it('rejects an unknown tier with NOT_FOUND and a draft event with INVALID_STATE', async () => {
        assertError(await book(ADA, 'no-such-tier', 1), 404, 'NOT_FOUND');
        const draft = await createEvent();
        const tier = await addTier(draft.id);
        assertError(await book(ADA, tier.id, 1), 409, 'INVALID_STATE');
      });
    });

    describe('S07 pay for a booking (mock payment)', () => {
      async function pendingBooking() {
        const { tier } = await publishedEventWithTier({ priceCents: 2500, capacity: 5 });
        return (await book(ADA, tier.id, 2)).body;
      }

      it('a valid mock card makes the booking paid and shows the reference', async () => {
        const booking = await pendingBooking();
        const result = await pay(ADA, booking.reference);
        assert.equal(result.status, 200);
        assert.equal(result.body.status, 'paid');
        assert.equal(result.body.reference, booking.reference);
        assert.equal(gateway.chargeCount, 1);
      });

      it('a declined card returns PAYMENT_DECLINED, the booking stays pending, and a retry works', async () => {
        const booking = await pendingBooking();
        assertError(await pay(ADA, booking.reference, 'tok_declined'), 402, 'PAYMENT_DECLINED');
        assert.equal((await call('GET', `/api/bookings/${booking.reference}`, { user: ADA })).body.status, 'pending');
        assert.equal(gateway.chargeCount, 0);
        assert.equal((await pay(ADA, booking.reference)).body.status, 'paid');
      });

      it('paying a cancelled booking is rejected with INVALID_TRANSITION', async () => {
        const booking = await pendingBooking();
        assert.equal((await call('POST', `/api/bookings/${booking.reference}/cancel`, { user: ADA })).status, 200);
        assertError(await pay(ADA, booking.reference), 409, 'INVALID_TRANSITION');
        assert.equal(gateway.chargeCount, 0);
      });

      it('paying twice is rejected and the card is charged only once', async () => {
        const booking = await pendingBooking();
        await pay(ADA, booking.reference);
        assertError(await pay(ADA, booking.reference), 409, 'INVALID_TRANSITION');
        assert.equal(gateway.chargeCount, 1);
      });

      it('two pay requests at the same moment still charge only once', async () => {
        const slowGateway = createMockPaymentGateway({ delayMs: 20 });
        await new Promise((resolve) => server.close(resolve));
        server = createTicketingServer({ repository: makeRepository(), paymentGateway: slowGateway });
        await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
        baseUrl = `http://127.0.0.1:${server.address().port}`;

        const booking = await pendingBooking();
        const results = await Promise.all([pay(ADA, booking.reference), pay(ADA, booking.reference)]);
        assert.ok(results.every((result) => result.status === 200 || result.status === 409));
        assert.equal(slowGateway.chargeCount, 1);
      });

      it('only the person who made the booking can pay for it', async () => {
        const booking = await pendingBooking();
        assertError(await pay(BAYO, booking.reference), 403, 'FORBIDDEN');
        assertError(await pay(undefined, booking.reference), 401, 'UNAUTHENTICATED');
      });

      it('requires a payment token and an existing booking', async () => {
        const booking = await pendingBooking();
        assertError(await call('POST', `/api/bookings/${booking.reference}/pay`, { user: ADA, body: {} }), 400, 'VALIDATION');
        assertError(await pay(ADA, 'NOPE2345'), 404, 'NOT_FOUND');
      });
    });

    describe('cancel an unpaid booking', () => {
      it('cancels a pending booking and frees its seats', async () => {
        const { event, tier } = await publishedEventWithTier({ capacity: 3 });
        const booking = (await book(ADA, tier.id, 3)).body;
        const result = await call('POST', `/api/bookings/${booking.reference}/cancel`, { user: ADA });
        assert.equal(result.body.status, 'cancelled');
        assert.equal((await call('GET', `/api/events/${event.id}`)).body.tiers[0].seatsLeft, 3);
      });

      it('refuses to cancel a paid booking for now, and a booking twice', async () => {
        const { tier } = await publishedEventWithTier({ capacity: 3 });
        const paid = (await book(ADA, tier.id, 1)).body;
        await pay(ADA, paid.reference);
        assertError(await call('POST', `/api/bookings/${paid.reference}/cancel`, { user: ADA }), 409, 'INVALID_STATE');

        const pending = (await book(ADA, tier.id, 1)).body;
        await call('POST', `/api/bookings/${pending.reference}/cancel`, { user: ADA });
        assertError(await call('POST', `/api/bookings/${pending.reference}/cancel`, { user: ADA }), 409, 'INVALID_TRANSITION');
      });

      it("refuses to cancel someone else's booking", async () => {
        const { tier } = await publishedEventWithTier();
        const booking = (await book(ADA, tier.id, 1)).body;
        assertError(await call('POST', `/api/bookings/${booking.reference}/cancel`, { user: BAYO }), 403, 'FORBIDDEN');
      });
    });
  });
}
