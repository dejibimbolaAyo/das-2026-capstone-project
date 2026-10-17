import { test } from 'node:test';
import assert from 'node:assert/strict';
import { request as httpRequest, createServer } from 'node:http';
import { buildServer } from '../src/server.js';
import { createMemoryRepository } from '../src/repositories/memory.js';
import { createApp } from '../src/http/app.js';
import { createRouter } from '../src/http/router.js';
import { loadConfig } from '../src/config.js';
import { DomainError } from '../src/domain/errors.js';

// These tests only care about HTTP behaviour, so give the server a throwaway
// in-memory repository instead of the on-disk SQLite one.
const buildTestServer = () => buildServer({ repository: createMemoryRepository() });

// A raw request so the tests control the exact path (fetch would normalise "..").
function rawRequest(base, path, { method = 'GET', body, headers = {} } = {}) {
  const url = new URL(base);
  return new Promise((resolve, reject) => {
    const req = httpRequest(
      { hostname: url.hostname, port: url.port, path, method, headers },
      (res) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          let json;
          try { json = JSON.parse(text); } catch { /* not json */ }
          resolve({ status: res.statusCode, headers: res.headers, text, json });
        });
      },
    );
    req.on('error', reject);
    if (body !== undefined) req.write(body);
    req.end();
  });
}

async function withServer(server, run) {
  await new Promise((resolve) => server.listen(0, resolve));
  const { port } = server.address();
  try {
    await run(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

// A throwaway server so we can exercise routes the real app does not have yet.
function testServer(configure) {
  const router = createRouter();
  configure(router);
  const app = createApp({ router, publicDir: loadConfig().publicDir });
  return createServer((req, res) => app(req, res));
}

test('GET /health returns {"status":"ok"} over real HTTP', async () => {
  await withServer(buildTestServer(), async (base) => {
    const res = await rawRequest(base, '/health');
    assert.equal(res.status, 200);
    assert.match(res.headers['content-type'], /application\/json/);
    assert.deepEqual(res.json, { status: 'ok' });
  });
});

test('an unknown /api path returns a JSON 404 in the shared error shape', async () => {
  await withServer(buildTestServer(), async (base) => {
    const res = await rawRequest(base, '/api/does-not-exist');
    assert.equal(res.status, 404);
    assert.equal(res.json.error.code, 'NOT_FOUND');
    assert.equal(typeof res.json.error.message, 'string');
  });
});

test('bad JSON returns a JSON 400', async () => {
  const server = testServer((router) => router.post('/api/echo', ({ body }) => ({ got: body })));
  await withServer(server, async (base) => {
    const res = await rawRequest(base, '/api/echo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{ not json',
    });
    assert.equal(res.status, 400);
    assert.equal(res.json.error.code, 'VALIDATION');
  });
});

test('valid JSON reaches the handler and comes back as JSON', async () => {
  const server = testServer((router) => router.post('/api/echo', ({ body }) => ({ got: body })));
  await withServer(server, async (base) => {
    const res = await rawRequest(base, '/api/echo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hello: 'world' }),
    });
    assert.equal(res.status, 200);
    assert.deepEqual(res.json, { got: { hello: 'world' } });
  });
});

test('a DomainError becomes its status code, never a stack trace', async () => {
  const server = testServer((router) => {
    router.post('/api/book', () => { throw new DomainError('SOLD_OUT', 'General is sold out'); });
  });
  await withServer(server, async (base) => {
    const res = await rawRequest(base, '/api/book', { method: 'POST', body: '{}' });
    assert.equal(res.status, 409);
    assert.deepEqual(res.json, { error: { code: 'SOLD_OUT', message: 'General is sold out' } });
    assert.equal(res.text.includes('at '), false, 'response must not contain a stack trace');
  });
});

test('an unexpected error becomes a generic 500 with no details', async () => {
  const server = testServer((router) => {
    router.get('/api/boom', () => { throw new Error('secret internal detail'); });
  });
  await withServer(server, async (base) => {
    const res = await rawRequest(base, '/api/boom');
    assert.equal(res.status, 500);
    assert.deepEqual(res.json, { error: { code: 'INTERNAL', message: 'Something went wrong' } });
    assert.equal(res.text.includes('secret internal detail'), false);
  });
});

test('serves a static file from public/', async () => {
  await withServer(buildTestServer(), async (base) => {
    const res = await rawRequest(base, '/css/styles.css');
    assert.equal(res.status, 200);
    assert.match(res.headers['content-type'], /text\/css/);
    assert.ok(res.text.length > 0);
  });
});

test('the root path serves public/index.html', async () => {
  await withServer(buildTestServer(), async (base) => {
    const res = await rawRequest(base, '/');
    assert.equal(res.status, 200);
    assert.match(res.headers['content-type'], /text\/html/);
    assert.match(res.text, /Event Ticketing/);
  });
});

test('a path may not escape public/', async () => {
  await withServer(buildTestServer(), async (base) => {
    // %2f is an encoded slash the URL parser leaves alone, so ".." survives to
    // reach the guard in serveStatic and must be refused.
    const res = await rawRequest(base, '/..%2fpackage.json');
    assert.equal(res.status, 403);
    assert.equal(res.json.error.code, 'FORBIDDEN');
  });
});

test('a plain ../ traversal is neutralised by the URL parser (never serves the file)', async () => {
  await withServer(buildTestServer(), async (base) => {
    const res = await rawRequest(base, '/../package.json');
    assert.notEqual(res.status, 200);
    assert.equal(res.text.includes('"name": "ticketing-capstone"'), false);
  });
});

test('a missing static file returns a JSON 404', async () => {
  await withServer(buildTestServer(), async (base) => {
    const res = await rawRequest(base, '/no-such-file.txt');
    assert.equal(res.status, 404);
    assert.equal(res.json.error.code, 'NOT_FOUND');
  });
});
