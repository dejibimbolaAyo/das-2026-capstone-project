import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Router, createRouter } from '../src/http/router.js';

describe('router', () => {
  it('matches method and path', () => {
    const router = new Router();
    router.get('/health', () => {});
    assert.ok(router.match('GET', '/health'));
    assert.equal(router.match('POST', '/health'), undefined);
  });

  it('matches parameters and decodes them', () => {
    const router = createRouter();
    const handler = () => {};
    router.get('/users/:id/bookings/:bookingId', handler);
    const matched = router.match('GET', '/users/ada%20lovelace/bookings/TICKET1');
    assert.equal(matched.params.id, 'ada lovelace');
    assert.equal(matched.params.bookingId, 'TICKET1');
    assert.equal(matched.handler, handler);
  });

  it('does not match extra path segments', () => {
    const router = new Router();
    router.get('/api/events/:eventId', () => {});
    assert.equal(router.match('GET', '/api/events/123/extra'), undefined);
  });
});
