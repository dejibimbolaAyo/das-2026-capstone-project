import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRouter } from '../src/http/router.js';

test('matches a plain path', () => {
  const router = createRouter();
  const handler = () => 'ok';
  router.get('/health', handler);

  const match = router.match('GET', '/health');
  assert.equal(match.handler, handler);
  assert.deepEqual(match.params, {});
});

test('extracts :params from the path', () => {
  const router = createRouter();
  const handler = () => 'event';
  router.get('/api/events/:id', handler);

  const match = router.match('GET', '/api/events/abc-123');
  assert.equal(match.handler, handler);
  assert.deepEqual(match.params, { id: 'abc-123' });
});

test('extracts several :params', () => {
  const router = createRouter();
  router.get('/api/events/:eventId/tiers/:tierId', () => 'tier');

  const match = router.match('GET', '/api/events/e1/tiers/t2');
  assert.deepEqual(match.params, { eventId: 'e1', tierId: 't2' });
});

test('method must match', () => {
  const router = createRouter();
  router.post('/api/events', () => 'created');

  assert.equal(router.match('GET', '/api/events'), null);
  assert.ok(router.match('POST', '/api/events'));
});

test('a wrong static segment or length does not match', () => {
  const router = createRouter();
  router.get('/api/events/:id', () => 'event');

  assert.equal(router.match('GET', '/api/tickets/1'), null);
  assert.equal(router.match('GET', '/api/events'), null);
  assert.equal(router.match('GET', '/api/events/1/extra'), null);
});

test('ignores a trailing slash and query-free duplicate slashes', () => {
  const router = createRouter();
  router.get('/health', () => 'ok');

  assert.ok(router.match('GET', '/health/'));
});

test('the first matching route wins', () => {
  const router = createRouter();
  const first = () => 'first';
  const second = () => 'second';
  router.get('/api/events/latest', first);
  router.get('/api/events/:id', second);

  assert.equal(router.match('GET', '/api/events/latest').handler, first);
  assert.equal(router.match('GET', '/api/events/999').handler, second);
});

test('no routes means no match', () => {
  const router = createRouter();
  assert.equal(router.match('GET', '/anything'), null);
});
