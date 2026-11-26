// Build 9: passwords, tokens, signup, login and roles.
// One test or more for every acceptance criterion of S01 and S13.

import { after, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createTicketingServer } from '../src/server.js';
import { createMemoryRepository } from '../src/repositories/memory.js';
import { createSqliteRepository } from '../src/repositories/sqlite.js';
import { hashPassword, verifyPassword } from '../src/lib/password.js';
import { signToken, verifyToken } from '../src/lib/token.js';

const SECRET = 'test-secret-test-secret';

describe('password hashing', () => {
  it('verifies the right password and refuses a wrong one', async () => {
    const hash = await hashPassword('correct horse');
    assert.equal(await verifyPassword('correct horse', hash), true);
    assert.equal(await verifyPassword('wrong horse', hash), false);
  });

  it('never stores the password, and salts every hash', async () => {
    const [a, b] = await Promise.all([hashPassword('same password'), hashPassword('same password')]);
    assert.ok(!a.includes('same password'));
    assert.notEqual(a, b);
  });

  it('refuses a stored value that is not a scrypt hash', async () => {
    assert.equal(await verifyPassword('x', 'plain text'), false);
    assert.equal(await verifyPassword('x', undefined), false);
  });
});

describe('tokens', () => {
  it('round-trips the claims', () => {
    const claims = verifyToken(signToken({ sub: 'u1', role: 'attendee' }, SECRET), SECRET);
    assert.equal(claims.sub, 'u1');
    assert.equal(claims.role, 'attendee');
  });

  it('rejects a token signed with another secret', () => {
    assert.equal(verifyToken(signToken({ sub: 'u1' }, 'another-secret-another'), SECRET), null);
  });

  it('rejects an edited payload (a user making themselves an organizer)', () => {
    const [header, , signature] = signToken({ sub: 'u1', role: 'attendee' }, SECRET).split('.');
    const forged = Buffer.from(JSON.stringify({ sub: 'u1', role: 'organizer', exp: 9999999999 })).toString('base64url');
    assert.equal(verifyToken(`${header}.${forged}.${signature}`, SECRET), null);
  });

  it('rejects a token whose algorithm is "none"', () => {
    const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(JSON.stringify({ sub: 'u1', role: 'organizer', exp: 9999999999 })).toString('base64url');
    assert.equal(verifyToken(`${header}.${payload}.`, SECRET), null);
  });

  it('rejects an expired token, using a clock the test controls', () => {
    const token = signToken({ sub: 'u1' }, SECRET, { expiresInSeconds: 60, now: () => 0 });
    assert.ok(verifyToken(token, SECRET, { now: () => 59_000 }));
    assert.equal(verifyToken(token, SECRET, { now: () => 61_000 }), null);
  });

  it('rejects text that is not a token at all', () => {
    for (const junk of ['', 'abc', 'a.b', 'a.b.c', undefined]) assert.equal(verifyToken(junk, SECRET), null);
  });
});

for (const [name, makeRepository] of Object.entries({ memory: createMemoryRepository, sqlite: createSqliteRepository })) {
  describe(`accounts and roles (${name} repository)`, () => {
    let server;
    let baseUrl;
    let nowMs;

    beforeEach(async () => {
      if (server) await new Promise((resolve) => server.close(resolve));
      nowMs = Date.now();
      server = createTicketingServer({ repository: makeRepository(), authSecret: SECRET });
      await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', resolve);
      });
      baseUrl = `http://127.0.0.1:${server.address().port}`;
    });

    after(async () => {
      if (server) await new Promise((resolve) => server.close(resolve));
    });

    async function call(method, path, { token, body } = {}) {
      const headers = {};
      if (token) headers.authorization = `Bearer ${token}`;
      if (body !== undefined) headers['content-type'] = 'application/json';
      const response = await fetch(`${baseUrl}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      return { status: response.status, body: await response.json() };
    }

    const account = (name, role, extra = {}) => ({ name, email: `${name}@example.com`, password: 'password-123', role, ...extra });
    async function signUp(name, role) {
      const result = await call('POST', '/api/auth/signup', { body: account(name, role) });
      assert.equal(result.status, 201);
      return result.body.token;
    }
    const assertError = (result, status, code) => {
      assert.equal(result.status, status);
      assert.equal(result.body.error.code, code);
    };

    async function publishedEvent(organizerToken) {
      const event = await call('POST', '/api/events', {
        token: organizerToken,
        body: { title: 'Lagos Tech Meetup', city: 'Lagos', venue: 'Landmark Centre', startsAt: '2027-02-01T17:00:00Z' },
      });
      const tier = await call('POST', `/api/events/${event.body.id}/tiers`, {
        token: organizerToken,
        body: { name: 'General', priceCents: 500000, capacity: 10 },
      });
      await call('POST', `/api/events/${event.body.id}/publish`, { token: organizerToken });
      return { eventId: event.body.id, tierId: tier.body.id };
    }

    describe('S01 sign up and log in', () => {
      it('creates an attendee account by default and returns a token and no password', async () => {
        const result = await call('POST', '/api/auth/signup', {
          body: { name: 'Ada', email: 'Ada@Example.com', password: 'password-123' },
        });
        assert.equal(result.status, 201);
        assert.equal(result.body.user.role, 'attendee');
        assert.equal(result.body.user.email, 'ada@example.com');
        assert.ok(result.body.token);
        assert.ok(!JSON.stringify(result.body).includes('password-123'));
        assert.ok(!JSON.stringify(result.body).includes('scrypt'));
      });

      it('rejects a short password, a bad email and an unknown role', async () => {
        assertError(await call('POST', '/api/auth/signup', { body: account('ada', 'attendee', { password: 'short' }) }), 400, 'VALIDATION');
        assertError(await call('POST', '/api/auth/signup', { body: account('ada', 'attendee', { email: 'not-an-email' }) }), 400, 'VALIDATION');
        assertError(await call('POST', '/api/auth/signup', { body: account('ada', 'admin') }), 400, 'VALIDATION');
      });

      it('rejects an email that is already registered, whatever its capital letters', async () => {
        await signUp('ada', 'attendee');
        const again = await call('POST', '/api/auth/signup', { body: account('ada', 'attendee', { email: 'ADA@example.com' }) });
        assertError(again, 409, 'EMAIL_TAKEN');
      });

      it('logs in with the right password and returns a token that /me accepts', async () => {
        await signUp('ada', 'attendee');
        const login = await call('POST', '/api/auth/login', { body: { email: 'ada@example.com', password: 'password-123' } });
        assert.equal(login.status, 200);
        const me = await call('GET', '/api/auth/me', { token: login.body.token });
        assert.equal(me.body.email, 'ada@example.com');
        assert.equal(me.body.role, 'attendee');
      });

      it('gives the same error and message for a wrong password and an unknown email', async () => {
        await signUp('ada', 'attendee');
        const wrong = await call('POST', '/api/auth/login', { body: { email: 'ada@example.com', password: 'nope-nope-nope' } });
        const unknown = await call('POST', '/api/auth/login', { body: { email: 'who@example.com', password: 'password-123' } });
        assertError(wrong, 401, 'INVALID_CREDENTIALS');
        assertError(unknown, 401, 'INVALID_CREDENTIALS');
        assert.equal(wrong.body.error.message, unknown.body.error.message);
      });

      it('rejects a missing, edited or expired token with UNAUTHENTICATED', async () => {
        assertError(await call('GET', '/api/auth/me'), 401, 'UNAUTHENTICATED');
        assertError(await call('GET', '/api/auth/me', { token: 'not.a.token' }), 401, 'UNAUTHENTICATED');

        const token = await signUp('ada', 'attendee');
        const [h, p, s] = token.split('.');
        const edited = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(p, 'base64url')), role: 'organizer' })).toString('base64url');
        assertError(await call('GET', '/api/auth/me', { token: `${h}.${edited}.${s}` }), 401, 'UNAUTHENTICATED');

        const expired = signToken({ sub: 'x', role: 'attendee' }, SECRET, { expiresInSeconds: 60, now: () => nowMs - 3_600_000 });
        assertError(await call('GET', '/api/auth/me', { token: expired }), 401, 'UNAUTHENTICATED');
      });
    });

    describe('roles are checked on the server', () => {
      it('an attendee cannot create an event, and an organizer cannot book', async () => {
        const attendee = await signUp('ada', 'attendee');
        const organizer = await signUp('org', 'organizer');
        const event = { title: 'X', city: 'Lagos', startsAt: '2027-02-01T17:00:00Z' };
        assertError(await call('POST', '/api/events', { token: attendee, body: event }), 403, 'FORBIDDEN');
        assertError(await call('POST', '/api/events', { token: undefined, body: event }), 401, 'UNAUTHENTICATED');

        const { tierId } = await publishedEvent(organizer);
        assertError(await call('POST', '/api/bookings', { token: organizer, body: { tierId, quantity: 1 } }), 403, 'FORBIDDEN');
      });

      it('a staff account can do neither', async () => {
        const staff = await signUp('door', 'staff');
        assertError(await call('POST', '/api/events', { token: staff, body: { title: 'X', city: 'Lagos', startsAt: '2027-02-01T17:00:00Z' } }), 403, 'FORBIDDEN');
        assertError(await call('GET', '/api/bookings', { token: staff }), 403, 'FORBIDDEN');
      });
    });

    describe('S13 only your own data', () => {
      it('one organizer cannot edit another organizer\'s event', async () => {
        const org1 = await signUp('org1', 'organizer');
        const org2 = await signUp('org2', 'organizer');
        const { eventId } = await publishedEvent(org1);
        assertError(await call('POST', `/api/events/${eventId}/unpublish`, { token: org2 }), 403, 'FORBIDDEN');
        assertError(await call('POST', `/api/events/${eventId}/tiers`, { token: org2, body: { name: 'VIP', priceCents: 1, capacity: 1 } }), 403, 'FORBIDDEN');
      });

      it('one attendee cannot read another attendee\'s booking', async () => {
        const organizer = await signUp('org', 'organizer');
        const ada = await signUp('ada', 'attendee');
        const bayo = await signUp('bayo', 'attendee');
        const { tierId } = await publishedEvent(organizer);
        const booking = await call('POST', '/api/bookings', { token: ada, body: { tierId, quantity: 2 } });
        assert.equal(booking.status, 201);
        assertError(await call('GET', `/api/bookings/${booking.body.reference}`, { token: bayo }), 403, 'FORBIDDEN');
        assert.equal((await call('GET', `/api/bookings/${booking.body.reference}`, { token: ada })).status, 200);
      });

      it('the list of bookings holds only the caller\'s own, with the event details', async () => {
        const organizer = await signUp('org', 'organizer');
        const ada = await signUp('ada', 'attendee');
        const bayo = await signUp('bayo', 'attendee');
        const { tierId } = await publishedEvent(organizer);
        await call('POST', '/api/bookings', { token: ada, body: { tierId, quantity: 1 } });
        await call('POST', '/api/bookings', { token: bayo, body: { tierId, quantity: 3 } });

        const mine = await call('GET', '/api/bookings', { token: ada });
        assert.equal(mine.body.bookings.length, 1);
        assert.equal(mine.body.bookings[0].quantity, 1);
        assert.equal(mine.body.bookings[0].event.title, 'Lagos Tech Meetup');
        assert.equal(mine.body.bookings[0].tierName, 'General');
        assert.ok(!('userId' in mine.body.bookings[0]));
      });

      it('an organizer sees their own events with drafts, and not other organizers\'', async () => {
        const org1 = await signUp('org1', 'organizer');
        const org2 = await signUp('org2', 'organizer');
        await publishedEvent(org1);
        await call('POST', '/api/events', { token: org1, body: { title: 'Draft one', city: 'Abuja', startsAt: '2027-03-01T17:00:00Z' } });
        const mine = await call('GET', '/api/my/events', { token: org1 });
        assert.deepEqual(mine.body.events.map((event) => event.status).sort(), ['draft', 'published']);
        assert.equal((await call('GET', '/api/my/events', { token: org2 })).body.events.length, 0);
      });

      it('a draft is visible to its organizer and hidden from everyone else', async () => {
        const org1 = await signUp('org1', 'organizer');
        const ada = await signUp('ada', 'attendee');
        const draft = await call('POST', '/api/events', { token: org1, body: { title: 'Draft', city: 'Abuja', startsAt: '2027-03-01T17:00:00Z' } });
        assert.equal((await call('GET', `/api/events/${draft.body.id}`, { token: org1 })).status, 200);
        assertError(await call('GET', `/api/events/${draft.body.id}`, { token: ada }), 404, 'NOT_FOUND');
        assertError(await call('GET', `/api/events/${draft.body.id}`), 404, 'NOT_FOUND');
      });
    });
  });
}
