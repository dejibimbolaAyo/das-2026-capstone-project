// Build 4/7: API-level tests.
//
// These start the REAL server (buildServer) on a free port and talk to it over
// HTTP, so they cover routing, status codes, JSON parsing and the error shape
// as well as the rules. Each test gets a fresh, empty server.
//
// Build 7 replaces the x-user-id header with real signup/login and a bearer
// token, so every write now proves who the caller is.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildServer } from '../src/server.js';
import { createSqliteRepository } from '../src/repositories/sqlite.js';

async function withServer(run) {
  const server = buildServer({ repository: createSqliteRepository({ path: ':memory:' }) });
  await new Promise((resolve) => server.listen(0, resolve));
  const { port } = server.address();
  try {
    await run(`http://127.0.0.1:${port}`);
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

// A signed-up caller: { user, token }. Every test makes its own users, so no
// test depends on another one's rows.
async function signUp(base, { email, password = 'password123', role = 'attendee' } = {}) {
  const res = await api(base, 'POST', '/api/auth/signup', { body: { email, password, role } });
  assert.equal(res.status, 201, res.text);
  return res.json;
}

async function organizer(base, email = 'ada@example.com') {
  return signUp(base, { email, role: 'organizer' });
}

async function attendee(base, email = 'grace@example.com') {
  return signUp(base, { email, role: 'attendee' });
}

async function createEvent(base, auth, overrides = {}) {
  return api(base, 'POST', '/api/events', {
    token: auth.token,
    body: { title: 'Jazz Night', city: 'Lagos', venue: 'The Shrine', startsAt: '2026-03-01T19:00:00Z', ...overrides },
  });
}

async function addTier(base, auth, eventId, overrides = {}) {
  return api(base, 'POST', `/api/events/${eventId}/tiers`, {
    token: auth.token,
    body: { name: 'General', priceCents: 5000, capacity: 100, ...overrides },
  });
}

async function setUpPublishedEvent(base, auth, tierOverrides = {}) {
  const created = await createEvent(base, auth);
  assert.equal(created.status, 201, created.text);
  const tier = await addTier(base, auth, created.json.id, tierOverrides);
  assert.equal(tier.status, 200, tier.text);
  const published = await api(base, 'POST', `/api/events/${created.json.id}/publish`, { token: auth.token });
  assert.equal(published.status, 200, published.text);
  return { event: published.json, tier: tier.json };
}

test('the whole happy path works end to end over HTTP', async () => {
  await withServer(async (base) => {
    const ada = await organizer(base);
    const grace = await attendee(base);

    const created = await createEvent(base, ada);
    assert.equal(created.status, 201);
    assert.equal(created.json.status, 'draft');
    assert.equal(created.json.organizerId, ada.user.id);
    assert.ok(created.json.id);

    const tier = await addTier(base, ada, created.json.id, { name: 'General', priceCents: 5000, capacity: 100 });
    assert.equal(tier.status, 200);
    assert.equal(tier.json.priceCents, 5000);

    const published = await api(base, 'POST', `/api/events/${created.json.id}/publish`, { token: ada.token });
    assert.equal(published.status, 200);
    assert.equal(published.json.status, 'published');

    const list = await api(base, 'GET', '/api/events');
    assert.equal(list.status, 200);
    assert.equal(list.json.length, 1);
    assert.equal(list.json[0].totalSeatsLeft, 100);

    const booking = await api(base, 'POST', '/api/bookings', {
      token: grace.token,
      body: { tierId: tier.json.id, quantity: 2 },
    });
    assert.equal(booking.status, 201, booking.text);
    assert.equal(booking.json.userId, grace.user.id);
    assert.equal(booking.json.amountCents, 10000);

    const paid = await api(base, 'POST', `/api/bookings/${booking.json.reference}/pay`, {
      token: grace.token,
      body: { card: 'ok' },
    });
    assert.equal(paid.status, 200);
    assert.equal(paid.json.status, 'paid');
    assert.ok(paid.json.paymentId);
  });
});

test('a draft event is not listed, publishing needs a tier', async () => {
  await withServer(async (base) => {
    const ada = await organizer(base);
    const created = await createEvent(base, ada);

    const list = await api(base, 'GET', '/api/events');
    assert.deepEqual(list.json, []);

    const published = await api(base, 'POST', `/api/events/${created.json.id}/publish`, { token: ada.token });
    assert.equal(published.status, 409);
    assert.equal(published.json.error.code, 'INVALID_STATE');
  });
});

test('creating an event needs a title and a valid date', async () => {
  await withServer(async (base) => {
    const ada = await organizer(base);
    const noTitle = await createEvent(base, ada, { title: '' });
    assert.equal(noTitle.status, 400);
    assert.equal(noTitle.json.error.code, 'VALIDATION');

    const badDate = await createEvent(base, ada, { startsAt: 'not-a-date' });
    assert.equal(badDate.status, 400);
    assert.equal(badDate.json.error.code, 'VALIDATION');
  });
});

test('an event that does not exist is a 404 in the shared error shape', async () => {
  await withServer(async (base) => {
    const ada = await organizer(base);
    const res = await addTier(base, ada, 'does-not-exist');
    assert.equal(res.status, 404);
    assert.equal(res.json.error.code, 'NOT_FOUND');
  });
});

test('quantity limits are enforced with a 400', async () => {
  await withServer(async (base) => {
    const ada = await organizer(base);
    const grace = await attendee(base);
    const { tier } = await setUpPublishedEvent(base, ada);

    const zero = await api(base, 'POST', '/api/bookings', { token: grace.token, body: { tierId: tier.id, quantity: 0 } });
    assert.equal(zero.status, 400);
    assert.equal(zero.json.error.code, 'VALIDATION');

    const tooMany = await api(base, 'POST', '/api/bookings', { token: grace.token, body: { tierId: tier.id, quantity: 11 } });
    assert.equal(tooMany.status, 400);
  });
});

test('a full tier returns 409 SOLD_OUT and never oversells', async () => {
  await withServer(async (base) => {
    const ada = await organizer(base);
    const grace = await attendee(base);
    const { tier } = await setUpPublishedEvent(base, ada, { capacity: 1 });

    const first = await api(base, 'POST', '/api/bookings', { token: grace.token, body: { tierId: tier.id, quantity: 1 } });
    assert.equal(first.status, 201);

    const second = await api(base, 'POST', '/api/bookings', { token: grace.token, body: { tierId: tier.id, quantity: 1 } });
    assert.equal(second.status, 409);
    assert.equal(second.json.error.code, 'SOLD_OUT');

    const list = await api(base, 'GET', '/api/events');
    assert.equal(list.json[0].totalSeatsLeft, 0);
  });
});

test('a declined card leaves the booking pending and can be retried', async () => {
  await withServer(async (base) => {
    const ada = await organizer(base);
    const grace = await attendee(base);
    const { tier } = await setUpPublishedEvent(base, ada);
    const booking = await api(base, 'POST', '/api/bookings', { token: grace.token, body: { tierId: tier.id, quantity: 1 } });

    const declined = await api(base, 'POST', `/api/bookings/${booking.json.reference}/pay`, {
      token: grace.token,
      body: { card: 'declined' },
    });
    assert.equal(declined.status, 402);
    assert.equal(declined.json.error.code, 'PAYMENT_DECLINED');

    const retried = await api(base, 'POST', `/api/bookings/${booking.json.reference}/pay`, {
      token: grace.token,
      body: { card: 'ok' },
    });
    assert.equal(retried.status, 200);
    assert.equal(retried.json.status, 'paid');
  });
});

test('a booking is only charged once', async () => {
  await withServer(async (base) => {
    const ada = await organizer(base);
    const grace = await attendee(base);
    const { tier } = await setUpPublishedEvent(base, ada);
    const booking = await api(base, 'POST', '/api/bookings', { token: grace.token, body: { tierId: tier.id, quantity: 1 } });
    await api(base, 'POST', `/api/bookings/${booking.json.reference}/pay`, { token: grace.token, body: { card: 'ok' } });

    const again = await api(base, 'POST', `/api/bookings/${booking.json.reference}/pay`, { token: grace.token, body: { card: 'ok' } });
    assert.equal(again.status, 409);
    assert.equal(again.json.error.code, 'INVALID_TRANSITION');
  });
});

test('only the person who booked may pay or cancel it', async () => {
  await withServer(async (base) => {
    const ada = await organizer(base);
    const grace = await attendee(base);
    const mallory = await attendee(base, 'mallory@example.com');
    const { tier } = await setUpPublishedEvent(base, ada);
    const booking = await api(base, 'POST', '/api/bookings', { token: grace.token, body: { tierId: tier.id, quantity: 1 } });

    const wrongPayer = await api(base, 'POST', `/api/bookings/${booking.json.reference}/pay`, { token: mallory.token, body: { card: 'ok' } });
    assert.equal(wrongPayer.status, 403);
    assert.equal(wrongPayer.json.error.code, 'FORBIDDEN');

    const wrongCanceller = await api(base, 'POST', `/api/bookings/${booking.json.reference}/cancel`, { token: mallory.token });
    assert.equal(wrongCanceller.status, 403);
  });
});

test('cancelling an unpaid booking returns its seats', async () => {
  await withServer(async (base) => {
    const ada = await organizer(base);
    const grace = await attendee(base);
    const { tier } = await setUpPublishedEvent(base, ada, { capacity: 2 });
    const booking = await api(base, 'POST', '/api/bookings', { token: grace.token, body: { tierId: tier.id, quantity: 2 } });

    let list = await api(base, 'GET', '/api/events');
    assert.equal(list.json[0].totalSeatsLeft, 0);

    const cancelled = await api(base, 'POST', `/api/bookings/${booking.json.reference}/cancel`, { token: grace.token });
    assert.equal(cancelled.status, 200);
    assert.equal(cancelled.json.status, 'cancelled');

    list = await api(base, 'GET', '/api/events');
    assert.equal(list.json[0].totalSeatsLeft, 2);
  });
});

test('a paid booking cannot be cancelled in Build 7', async () => {
  await withServer(async (base) => {
    const ada = await organizer(base);
    const grace = await attendee(base);
    const { tier } = await setUpPublishedEvent(base, ada);
    const booking = await api(base, 'POST', '/api/bookings', { token: grace.token, body: { tierId: tier.id, quantity: 1 } });
    await api(base, 'POST', `/api/bookings/${booking.json.reference}/pay`, { token: grace.token, body: { card: 'ok' } });

    const cancelled = await api(base, 'POST', `/api/bookings/${booking.json.reference}/cancel`, { token: grace.token });
    assert.equal(cancelled.status, 409);
    assert.equal(cancelled.json.error.code, 'INVALID_TRANSITION');
  });
});

test('a write without a token is UNAUTHENTICATED', async () => {
  await withServer(async (base) => {
    const res = await api(base, 'POST', '/api/events', {
      body: { title: 'Jazz Night', city: 'Lagos', startsAt: '2026-03-01T19:00:00Z' },
    });
    assert.equal(res.status, 401);
    assert.equal(res.json.error.code, 'UNAUTHENTICATED');
  });
});

test('search filters and sorts over the query string', async () => {
  await withServer(async (base) => {
    const ada = await organizer(base);

    const jazz = await createEvent(base, ada, { title: 'Jazz Night', city: 'Lagos', startsAt: '2026-03-10T19:00:00Z' });
    await addTier(base, ada, jazz.json.id, { priceCents: 2000, capacity: 5 });
    await api(base, 'POST', `/api/events/${jazz.json.id}/publish`, { token: ada.token });

    const rock = await createEvent(base, ada, { title: 'Rock Night', city: 'Abuja', startsAt: '2026-02-10T19:00:00Z' });
    await addTier(base, ada, rock.json.id, { priceCents: 9000, capacity: 50 });
    await api(base, 'POST', `/api/events/${rock.json.id}/publish`, { token: ada.token });

    const byPrice = await api(base, 'GET', '/api/events?sortBy=price');
    assert.deepEqual(byPrice.json.map((e) => e.title), ['Jazz Night', 'Rock Night']);

    const byDate = await api(base, 'GET', '/api/events?sortBy=date');
    assert.deepEqual(byDate.json.map((e) => e.title), ['Rock Night', 'Jazz Night']);

    const inLagos = await api(base, 'GET', '/api/events?city=Lagos');
    assert.deepEqual(inLagos.json.map((e) => e.title), ['Jazz Night']);

    const cheap = await api(base, 'GET', '/api/events?maxPriceCents=5000');
    assert.deepEqual(cheap.json.map((e) => e.title), ['Jazz Night']);

    const search = await api(base, 'GET', '/api/events?q=rock');
    assert.deepEqual(search.json.map((e) => e.title), ['Rock Night']);
  });
});

test('bad JSON and missing routes keep the shared error shape', async () => {
  await withServer(async (base) => {
    const ada = await organizer(base);
    const badJson = await fetch(base + '/api/events', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${ada.token}` },
      body: '{ not json',
    });
    assert.equal(badJson.status, 400);
    const badJsonBody = await badJson.json();
    assert.equal(badJsonBody.error.code, 'VALIDATION');

    const missing = await api(base, 'GET', '/api/nope');
    assert.equal(missing.status, 404);
    assert.equal(missing.json.error.code, 'NOT_FOUND');
  });
});
