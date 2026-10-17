// Build 7, S01 and S13: signup, login, tokens, roles and private data.
//
// These talk to the real server over HTTP. They also reach into the repository
// once, to prove the password really is stored as a hash and never comes back
// on any response.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildServer } from '../src/server.js';
import { createMemoryRepository } from '../src/repositories/memory.js';
import { loadConfig } from '../src/config.js';
import { signToken } from '../src/lib/token.js';
import { hashPassword, verifyPassword } from '../src/lib/password.js';

const SECRET = 'test-secret-not-used-anywhere-else';

// A server with a KNOWN token secret, so a test can forge an expired or
// wrongly-signed token and prove the server refuses it.
async function withServer(run) {
  const repository = createMemoryRepository();
  const config = { ...loadConfig(), tokenSecret: SECRET };
  const server = buildServer({ repository, config });
  await new Promise((resolve) => server.listen(0, resolve));
  const { port } = server.address();
  try {
    await run({ base: `http://127.0.0.1:${port}`, repository });
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

async function api(base, method, path, { body, token } = {}) {
  const headers = {};
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (token !== undefined) headers.authorization = `Bearer ${token}`;

  const res = await fetch(base + path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { /* not json */ }
  return { status: res.status, json, text };
}

function signup(base, { email, password = 'password123', role }) {
  return api(base, 'POST', '/api/auth/signup', { body: { email, password, role } });
}

// Publish an event owned by `auth` and return its first tier, so a booking
// test has something real to book.
async function publishedEvent(base, auth) {
  const event = (await api(base, 'POST', '/api/events', {
    token: auth.token,
    body: { title: 'Ada Night', city: 'Lagos', venue: 'The Shrine', startsAt: '2026-03-01T19:00:00Z' },
  })).json;
  const tier = (await api(base, 'POST', `/api/events/${event.id}/tiers`, {
    token: auth.token,
    body: { name: 'General', priceCents: 1000, capacity: 10 },
  })).json;
  await api(base, 'POST', `/api/events/${event.id}/publish`, { token: auth.token });
  return { event, tier };
}

test('password hashing uses a random salt per password and verifies', async () => {
  const first = await hashPassword('password123');
  const second = await hashPassword('password123');
  assert.notEqual(first, second, 'the same password must not give the same hash');
  assert.match(first, /^scrypt\$[0-9a-f]+\$[0-9a-f]+$/);
  assert.equal(await verifyPassword('password123', first), true);
  assert.equal(await verifyPassword('password124', first), false);
  assert.equal(await verifyPassword('password123', 'not-a-hash'), false);
});

test('S01 signup creates an attendee, stores only a hash, and returns a token', async () => {
  await withServer(async ({ base, repository }) => {
    const res = await signup(base, { email: 'Grace@Example.com' });

    assert.equal(res.status, 201, res.text);
    assert.equal(res.json.user.role, 'attendee');
    assert.equal(res.json.user.email, 'grace@example.com', 'the email is normalised');
    assert.equal(res.json.user.passwordHash, undefined, 'a hash must never be returned');
    assert.ok(res.json.token, 'a token is returned');
    assert.equal(res.text.includes('password123'), false, 'the raw password must never come back');

    const stored = await repository.findUserByEmail('grace@example.com');
    assert.notEqual(stored.passwordHash, 'password123');
    assert.match(stored.passwordHash, /^scrypt\$/);

    const me = await api(base, 'GET', '/api/auth/me', { token: res.json.token });
    assert.equal(me.status, 200);
    assert.deepEqual(me.json, res.json.user);
  });
});

test('signup accepts the organizer and staff roles', async () => {
  await withServer(async ({ base }) => {
    const ada = await signup(base, { email: 'ada@example.com', role: 'organizer' });
    assert.equal(ada.status, 201, ada.text);
    assert.equal(ada.json.user.role, 'organizer');

    const staff = await signup(base, { email: 'sade@example.com', role: 'staff' });
    assert.equal(staff.json.user.role, 'staff');
  });
});

test('S01 a repeated email is EMAIL_TAKEN', async () => {
  await withServer(async ({ base }) => {
    await signup(base, { email: 'ada@example.com' });
    const again = await signup(base, { email: 'ada@example.com' });
    assert.equal(again.status, 409);
    assert.equal(again.json.error.code, 'EMAIL_TAKEN');
  });
});

test('S01 a short password is refused', async () => {
  await withServer(async ({ base }) => {
    const res = await signup(base, { email: 'ada@example.com', password: 'short' });
    assert.equal(res.status, 400);
    assert.equal(res.json.error.code, 'VALIDATION');
  });
});

test('S01 a wrong password and an unknown email give the same INVALID_CREDENTIALS', async () => {
  await withServer(async ({ base }) => {
    await signup(base, { email: 'ada@example.com' });

    const wrongPassword = await api(base, 'POST', '/api/auth/login', { body: { email: 'ada@example.com', password: 'not-the-one' } });
    const unknownEmail = await api(base, 'POST', '/api/auth/login', { body: { email: 'nobody@example.com', password: 'password123' } });

    assert.equal(wrongPassword.status, 401);
    assert.equal(unknownEmail.status, 401);
    assert.equal(wrongPassword.json.error.code, 'INVALID_CREDENTIALS');
    assert.equal(unknownEmail.json.error.code, 'INVALID_CREDENTIALS');
    assert.equal(wrongPassword.json.error.message, unknownEmail.json.error.message,
      'the two failures must be indistinguishable');
  });
});

test('S01 a good login returns a token that /api/auth/me accepts', async () => {
  await withServer(async ({ base }) => {
    await signup(base, { email: 'ada@example.com', role: 'organizer' });
    const login = await api(base, 'POST', '/api/auth/login', { body: { email: 'ada@example.com', password: 'password123' } });
    assert.equal(login.status, 200);
    assert.equal(login.json.user.role, 'organizer');

    const me = await api(base, 'GET', '/api/auth/me', { token: login.json.token });
    assert.equal(me.status, 200);
    assert.equal(me.json.email, 'ada@example.com');
  });
});

test('S01 a missing, edited or forged token is UNAUTHENTICATED', async () => {
  await withServer(async ({ base }) => {
    const token = (await signup(base, { email: 'ada@example.com' })).json.token;
    const [header, payload, signature] = token.split('.');

    const noToken = await api(base, 'GET', '/api/auth/me');
    assert.equal(noToken.status, 401);
    assert.equal(noToken.json.error.code, 'UNAUTHENTICATED');

    const garbage = await api(base, 'GET', '/api/auth/me', { token: 'not.a.token' });
    assert.equal(garbage.status, 401);

    const evilPayload = Buffer.from(JSON.stringify({ sub: 'someone-else', role: 'organizer' })).toString('base64url');
    const tampered = await api(base, 'GET', '/api/auth/me', { token: `${header}.${evilPayload}.${signature}` });
    assert.equal(tampered.status, 401);

    // The classic forgery: say the algorithm is "none" and drop the signature.
    const noneHeader = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
    const algNone = await api(base, 'GET', '/api/auth/me', { token: `${noneHeader}.${header.split('.')[0]}.` });
    assert.equal(algNone.status, 401);
    assert.equal(algNone.json.error.code, 'UNAUTHENTICATED');

    // Signed with the WRONG secret.
    const forged = await api(base, 'GET', '/api/auth/me', { token: signToken({ sub: 'someone' }, { secret: 'a-different-secret' }) });
    assert.equal(forged.status, 401);
  });
});

test('S01 an expired token is refused', async () => {
  await withServer(async ({ base }) => {
    const user = (await signup(base, { email: 'ada@example.com' })).json.user;
    const expired = signToken({ sub: user.id, email: user.email, role: user.role }, { secret: SECRET, lifetimeSeconds: -60 });

    const res = await api(base, 'GET', '/api/auth/me', { token: expired });
    assert.equal(res.status, 401);
    assert.equal(res.json.error.code, 'UNAUTHENTICATED');
  });
});

test('S13 an attendee cannot create an event (wrong role)', async () => {
  await withServer(async ({ base }) => {
    const grace = (await signup(base, { email: 'grace@example.com' })).json;

    const res = await api(base, 'POST', '/api/events', {
      token: grace.token,
      body: { title: 'Nope', city: 'Lagos', startsAt: '2026-03-01T19:00:00Z' },
    });
    assert.equal(res.status, 403);
    assert.equal(res.json.error.code, 'FORBIDDEN');
  });
});

test("S13 one organizer cannot change another organizer's event", async () => {
  await withServer(async ({ base }) => {
    const ada = (await signup(base, { email: 'ada@example.com', role: 'organizer' })).json;
    const bayo = (await signup(base, { email: 'bayo@example.com', role: 'organizer' })).json;

    const event = (await api(base, 'POST', '/api/events', {
      token: ada.token,
      body: { title: 'Ada Night', city: 'Lagos', startsAt: '2026-03-01T19:00:00Z' },
    })).json;

    const tier = await api(base, 'POST', `/api/events/${event.id}/tiers`, {
      token: bayo.token,
      body: { name: 'General', priceCents: 1000, capacity: 10 },
    });
    assert.equal(tier.status, 403);
    assert.equal(tier.json.error.code, 'FORBIDDEN');

    const published = await api(base, 'POST', `/api/events/${event.id}/publish`, { token: bayo.token });
    assert.equal(published.status, 403);
  });
});

test("S13 one attendee cannot read another attendee's booking, and 'my tickets' is private", async () => {
  await withServer(async ({ base }) => {
    const ada = (await signup(base, { email: 'ada@example.com', role: 'organizer' })).json;
    const grace = (await signup(base, { email: 'grace@example.com' })).json;
    const mallory = (await signup(base, { email: 'mallory@example.com' })).json;
    const { tier } = await publishedEvent(base, ada);

    const graceBooking = (await api(base, 'POST', '/api/bookings', { token: grace.token, body: { tierId: tier.id, quantity: 1 } })).json;
    const malloryBooking = (await api(base, 'POST', '/api/bookings', { token: mallory.token, body: { tierId: tier.id, quantity: 1 } })).json;

    // Reading the reference directly.
    const stolen = await api(base, 'GET', `/api/bookings/${graceBooking.reference}`, { token: mallory.token });
    assert.equal(stolen.status, 403);
    assert.equal(stolen.json.error.code, 'FORBIDDEN');

    const mine = await api(base, 'GET', '/api/bookings/me', { token: grace.token });
    assert.equal(mine.status, 200);
    assert.deepEqual(mine.json.map((b) => b.reference), [graceBooking.reference]);
    // "My tickets" shows which event and tier each booking is for.
    assert.equal(mine.json[0].eventTitle, 'Ada Night');
    assert.equal(mine.json[0].tierName, 'General');

    const theirs = await api(base, 'GET', '/api/bookings/me', { token: mallory.token });
    assert.deepEqual(theirs.json.map((b) => b.reference), [malloryBooking.reference]);
  });
});
