import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/http/app.js';

const servers = [];

async function request(server, method, requestPath, body) {
  if (!server.listening) {
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  }
  const address = server.address();
  const response = await fetch(`http://127.0.0.1:${address.port}${requestPath}`, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body,
  });
  return {
    status: response.status,
    body: await response.json(),
  };
}

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) =>
    new Promise((resolve) => server.close(resolve))));
});

describe('HTTP app', () => {
  it('serves a real /health response', async () => {
    const server = createApp();
    servers.push(server);
    const response = await request(server, 'GET', '/health');
    assert.equal(response.status, 200);
    assert.deepEqual(response.body, { status: 'ok' });
  });

  it('returns JSON 404 for unknown API routes', async () => {
    const server = createApp();
    servers.push(server);
    const response = await request(server, 'GET', '/api/missing');
    assert.equal(response.status, 404);
    assert.deepEqual(response.body, {
      error: { code: 'NOT_FOUND', message: 'API route not found' },
    });
  });

  it('returns a consistent JSON 400 for bad JSON', async () => {
    const server = createApp();
    servers.push(server);
    const response = await request(server, 'POST', '/api/test', '{bad');
    assert.equal(response.status, 400);
    assert.deepEqual(response.body, {
      error: { code: 'BAD_JSON', message: 'Request body contains invalid JSON' },
    });
  });
});
