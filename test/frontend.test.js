// Build 6/7: tests for the browser code that decides what the screens show.
//
// The pages themselves need a DOM, but the rules behind them are plain ES
// modules, so node:test imports them straight from public/js/. From Build 7
// public/js/api.js is a thin `fetch` wrapper, so these tests stub
// globalThis.fetch and check the request it would have sent and the way it
// turns a reply (or a failure) back into data or an ApiError.

import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { formatMoney, clampQuantity, formatCountdown } from '../public/js/ui.js';
import {
  listEvents,
  getEvent,
  login,
  signup,
  myBookings,
  logout,
  ApiError,
} from '../public/js/api.js';
import {
  getSession,
  getUser,
  setSession,
  clearSession,
  isLoggedIn,
  loginUrl,
} from '../public/js/session.js';

const SESSION = { user: { id: 'u1', email: 'ada@example.com', role: 'organizer' }, token: 'tok-9' };

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

beforeEach(() => clearSession());

// Restore the real fetch so a later test (or a test file that shares this
// process) is not left talking to a stub.
const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });

// --- the pure UI rules (Build 6, still true) ---

test('formatMoney shows whole cents as naira', () => {
  assert.equal(formatMoney(250000), '₦2,500');
  assert.equal(formatMoney(5000), '₦50');
  assert.equal(formatMoney(0), '₦0');
  assert.equal(formatMoney(12345), '₦123.45');
});

test('clampQuantity never exceeds 10 or the seats left, and never drops below 1', () => {
  assert.equal(clampQuantity(50, 100), 10);
  assert.equal(clampQuantity(50, 3), 3);
  assert.equal(clampQuantity(0, 5), 1);
  assert.equal(clampQuantity('not a number', 5), 1);
  assert.equal(clampQuantity(4, 4), 4);
  assert.equal(clampQuantity(2, 0), 0, 'a sold-out tier clamps to zero');
});

test('formatCountdown renders mm:ss', () => {
  assert.equal(formatCountdown(600), '10:00');
  assert.equal(formatCountdown(59), '00:59');
  assert.equal(formatCountdown(-5), '00:00');
});

// --- session.js ---

test('session.js stores the token and user, and logout clears them', () => {
  assert.equal(isLoggedIn(), false);
  assert.equal(getUser(), null);

  setSession(SESSION);
  assert.equal(isLoggedIn(), true);
  assert.equal(getUser().email, 'ada@example.com');
  assert.equal(getSession().token, 'tok-9');

  logout();
  assert.equal(isLoggedIn(), false);
  assert.equal(getSession(), null);
});

test('loginUrl points at the login page and remembers where to come back', () => {
  assert.equal(loginUrl('/tickets.html'), '/login.html?next=%2Ftickets.html');
});

// --- api.js: the request it makes ---

test('a protected call sends Authorization: Bearer <token>', async () => {
  setSession(SESSION);
  let seen;
  globalThis.fetch = async (url, options) => {
    seen = { url, options };
    return json([]);
  };

  await myBookings();

  assert.equal(seen.url, '/api/bookings/me');
  assert.equal(seen.options.headers.Authorization, 'Bearer tok-9');
});

test('a public call is made without a session and sends no Authorization header', async () => {
  let seen;
  globalThis.fetch = async (url, options) => {
    seen = { url, options };
    return json({ id: 'evt-1', tiers: [] });
  };

  const event = await getEvent('evt-1');

  assert.equal(event.id, 'evt-1');
  assert.equal('Authorization' in seen.options.headers, false);
});

test('filters become a query string, and the server is asked for the rest', async () => {
  let url;
  globalThis.fetch = async (requestUrl) => {
    url = requestUrl;
    return json([{ id: 'evt-1' }]);
  };

  const events = await listEvents({
    q: 'jazz',
    city: 'Lagos',
    maxPriceCents: 5000,
    onlyAvailable: true,
    sortBy: 'price',
  });

  assert.deepEqual(events, [{ id: 'evt-1' }]);
  assert.equal(url, '/api/events?q=jazz&city=Lagos&maxPriceCents=5000&onlyAvailable=true&sortBy=price');
});

// --- api.js: what it does with the answer ---

test('an API error becomes an ApiError with the code and status', async () => {
  setSession(SESSION);
  globalThis.fetch = async () => json({ error: { code: 'FORBIDDEN', message: 'Nope' } }, 403);

  await assert.rejects(myBookings(), (error) => {
    assert.ok(error instanceof ApiError);
    assert.equal(error.code, 'FORBIDDEN');
    assert.equal(error.message, 'Nope');
    assert.equal(error.status, 403);
    return true;
  });
});

test('an UNAUTHENTICATED reply drops the stored session', async () => {
  setSession(SESSION);
  globalThis.fetch = async () => json({ error: { code: 'UNAUTHENTICATED', message: 'nope' } }, 401);

  await assert.rejects(myBookings(), (error) => error.code === 'UNAUTHENTICATED');
  assert.equal(isLoggedIn(), false, 'a stale token is not kept');
});

test('a protected call with no session fails before it reaches the network', async () => {
  let called = false;
  globalThis.fetch = async () => { called = true; return json([]); };

  await assert.rejects(myBookings(), (error) => {
    assert.equal(error.code, 'UNAUTHENTICATED');
    return true;
  });
  assert.equal(called, false);
});

test('a dead server becomes a NETWORK error, not a crash', async () => {
  globalThis.fetch = async () => { throw new TypeError('fetch failed'); };

  await assert.rejects(listEvents(), (error) => {
    assert.equal(error.code, 'NETWORK');
    return true;
  });
});

// --- api.js: login and signup store the session ---

test('login stores the session the server returns', async () => {
  globalThis.fetch = async (url) => json(url === '/api/auth/login' ? SESSION : null);

  const result = await login({ email: 'ada@example.com', password: 'password123' });

  assert.equal(result.token, 'tok-9');
  assert.equal(getUser().email, 'ada@example.com');
  assert.equal(isLoggedIn(), true);
});

test('signup sends the chosen role and surfaces EMAIL_TAKEN', async () => {
  let body;
  globalThis.fetch = async (url, options) => {
    body = JSON.parse(options.body);
    return json({ error: { code: 'EMAIL_TAKEN', message: 'taken' } }, 409);
  };

  await assert.rejects(
    signup({ email: 'ada@example.com', password: 'password123', role: 'organizer' }),
    (error) => {
      assert.equal(error.code, 'EMAIL_TAKEN');
      return true;
    },
  );

  assert.deepEqual(body, { email: 'ada@example.com', password: 'password123', role: 'organizer' });
  assert.equal(isLoggedIn(), false, 'a failed signup stores nothing');
});
