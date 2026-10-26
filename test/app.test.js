import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../src/http/app.js';

async function withServer(run) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'ticketing-public-'));
  await writeFile(path.join(directory, 'index.html'), '<h1>hello</h1>');
  const server = createApp({ publicDir: directory });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    await run(server.address().port, directory);
  } finally {
    await new Promise(resolve => server.close(resolve));
    await rm(directory, { recursive: true, force: true });
  }
}

test('GET /health returns JSON status ok over real HTTP', async () => {
  await withServer(async port => {
    const response = await fetch(`http://127.0.0.1:${port}/health`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { status: 'ok' });
  });
});

test('unknown API routes return a consistent JSON 404', async () => {
  await withServer(async port => {
    const response = await fetch(`http://127.0.0.1:${port}/api/nope`);
    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), { error: { code: 'NOT_FOUND', message: 'API route not found' } });
  });
});

test('invalid JSON request body returns a JSON 400', async () => {
  await withServer(async port => {
    const response = await fetch(`http://127.0.0.1:${port}/api/example`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{bad json',
    });
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { error: { code: 'BAD_JSON', message: 'Request body must contain valid JSON' } });
  });
});

test('static server serves files under public directory', async () => {
  await withServer(async port => {
    const response = await fetch(`http://127.0.0.1:${port}/`);
    assert.equal(response.status, 200);
    assert.match(await response.text(), /hello/);
  });
});

test('static server refuses traversal outside public directory', async () => {
  await withServer(async port => {
    const response = await fetch(`http://127.0.0.1:${port}/..%2Fsecret.txt`);
    assert.equal(response.status, 404);
  });
});
