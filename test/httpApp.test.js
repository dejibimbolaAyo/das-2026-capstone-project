import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createAppServer } from '../src/http/app.js';

describe('HTTP app', () => {
  const server = createAppServer();
  let baseUrl;

  before(async () => {
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  });

  after(async () => {
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  });

  it('answers a real GET /health request with JSON', async () => {
    const response = await fetch(`${baseUrl}/health`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { status: 'ok' });
  });

  it('uses the shared JSON error shape for an unknown API route', async () => {
    const response = await fetch(`${baseUrl}/api/missing`);
    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), {
      error: { code: 'NOT_FOUND', message: 'API route not found' },
    });
  });

  it('rejects malformed JSON without exposing a stack trace', async () => {
    const response = await fetch(`${baseUrl}/health`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{',
    });
    const payload = await response.json();
    assert.equal(response.status, 400);
    assert.deepEqual(Object.keys(payload), ['error']);
    assert.deepEqual(Object.keys(payload.error), ['code', 'message']);
    assert.equal(payload.error.code, 'INVALID_JSON');
    assert.equal('stack' in payload, false);
  });

  it('serves the public index', async () => {
    const response = await fetch(`${baseUrl}/`);
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type'), /^text\/html/);
    assert.match(await response.text(), /Event Ticketing/);
  });

  it('does not serve files outside public', async () => {
    const response = await fetch(`${baseUrl}/%2e%2e%2fREADME.md`);
    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), {
      error: { code: 'NOT_FOUND', message: 'File not found' },
    });
  });
});
