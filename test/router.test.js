import test from 'node:test';
import assert from 'node:assert/strict';

import { Router } from '../src/http/router.js';

test('matches a simple GET route', () => {
  const router = new Router();
  const handler = () => 'Hello';

  router.get('/health', handler);

  const result = router.match('GET', '/health');

  assert.equal(result.handler, handler);
  assert.deepEqual(result.params, {});
});

test('matches a dynamic route parameter', () => {
  const router = new Router();
  const handler = () => 'Event';

  router.get('/events/:eventId', handler);

  const result = router.match('GET', '/events/event-123');

  assert.equal(result.handler, handler);
  assert.deepEqual(result.params, {
    eventId: 'event-123',
  });
});

test('supports multiple dynamic parameters', () => {
  const router = new Router();

  router.get('/events/:eventId/tiers/:tierId', () => {});

  const result = router.match(
    'GET',
    '/events/event-1/tiers/tier-2'
  );

  assert.deepEqual(result.params, {
    eventId: 'event-1',
    tierId: 'tier-2',
  });
});

test('matches HTTP methods without case sensitivity', () => {
  const router = new Router();
  const handler = () => {};

  router.post('/bookings', handler);

  assert.equal(router.match('post', '/bookings').handler, handler);
});

test('does not match an incorrect HTTP method', () => {
  const router = new Router();

  router.get('/health', () => {});

  assert.equal(router.match('POST', '/health'), undefined);
});

test('does not match an incorrect path', () => {
  const router = new Router();

  router.get('/health', () => {});

  assert.equal(router.match('GET', '/events'), undefined);
});

test('rejects invalid route definitions', () => {
  const router = new Router();

  assert.throws(
    () => router.get('health', () => {}),
    /must start with/
  );

  assert.throws(
    () => router.get('/health', 'not a function'),
    /must be a function/
  );
});