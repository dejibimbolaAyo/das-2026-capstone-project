import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Router } from '../src/http/router.js';

describe('router', () => {
  it('matches a method and path and extracts decoded parameters', () => {
    const router = new Router();
    const handler = () => {};
    router.get('/api/events/:eventId/tickets/:ticketId', handler);

    assert.deepEqual(router.match('GET', '/api/events/event%201/tickets/ticket-2'), {
      handler,
      params: { eventId: 'event 1', ticketId: 'ticket-2' },
    });
  });

  it('does not match a different method or path shape', () => {
    const router = new Router();
    router.get('/api/events/:eventId', () => {});

    assert.equal(router.match('POST', '/api/events/1'), null);
    assert.equal(router.match('GET', '/api/events/1/tickets'), null);
    assert.equal(router.match('GET', '/api/tickets/1'), null);
  });
});
