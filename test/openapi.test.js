import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { openApiDocument } from '../src/http/openapi.js';
import { Router } from '../src/http/router.js';
import { registerApiRoutes } from '../src/http/routes.js';

describe('OpenAPI document', () => {
  const router = registerApiRoutes(new Router(), { eventService: {}, bookingService: {} });
  router.get('/health', () => {});

  const operations = Object.entries(openApiDocument.paths).flatMap(([path, methods]) =>
    Object.keys(methods).map((method) => ({ method: method.toUpperCase(), path })),
  );

  it('documents only routes that exist', () => {
    for (const { method, path } of operations) {
      const concrete = path.replace(/\{[^}]+\}/g, 'example');
      assert.ok(router.match(method, concrete), `${method} ${path} is documented but has no route`);
    }
  });

  it('documents every API route', () => {
    const expected = [
      'GET /health',
      'POST /api/events',
      'GET /api/events',
      'GET /api/events/{id}',
      'POST /api/events/{id}/tiers',
      'POST /api/events/{id}/publish',
      'POST /api/events/{id}/unpublish',
      'POST /api/bookings',
      'GET /api/bookings/{reference}',
      'POST /api/bookings/{reference}/pay',
      'POST /api/bookings/{reference}/cancel',
    ];
    assert.deepEqual(operations.map(({ method, path }) => `${method} ${path}`).sort(), expected.sort());
  });

  it('points every $ref at a defined component', () => {
    const refs = JSON.stringify(openApiDocument).match(/#\/components\/[a-z]+\/\w+/gi) ?? [];
    for (const target of refs) {
      const [, , group, name] = target.split('/');
      assert.ok(openApiDocument.components[group]?.[name], `${target} is not defined`);
    }
  });
});
