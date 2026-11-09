import test from 'node:test';
import assert from 'node:assert/strict';

import { createApp } from '../src/http/app.js';
import { Router } from '../src/http/router.js';

// Start the server on an available port for each test.
async function withServer(callback, router = new Router()) {
  const server = createApp({ router });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });

  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    await callback(baseUrl);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  }
}

test('GET /health returns server status', async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/health`);

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      status: 'ok',
    });
  });
});

test('unknown API routes return JSON 404', async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/unknown`);

    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), {
      error: {
        code: 'NOT_FOUND',
        message: 'API route not found',
      },
    });
  });
});

test('invalid JSON returns JSON 400', async () => {
  const router = new Router();

  router.post('/api/test', () => ({ success: true }));

  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/test`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: '{invalid json}',
    });

    assert.equal(response.status, 400);

    const result = await response.json();

    assert.equal(result.error.code, 'INVALID_JSON');
    assert.ok(result.error.message);
  }, router);
});

test('homepage is served from public directory', async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/`);

    assert.equal(response.status, 200);
    assert.match(
      await response.text(),
      /Event Ticketing App/
    );
  });
});

test('internal errors do not expose stack traces', async () => {
  const router = new Router();

  router.get('/api/fail', () => {
    throw new Error('Private internal details');
  });

  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/fail`);

    assert.equal(response.status, 500);

    const result = await response.json();

    assert.equal(result.error.code, 'INTERNAL_ERROR');
    assert.equal(
      result.error.message,
      'An unexpected error occurred'
    );

    assert.doesNotMatch(
      JSON.stringify(result),
      /Private internal details|stack/i
    );
  }, router);
});