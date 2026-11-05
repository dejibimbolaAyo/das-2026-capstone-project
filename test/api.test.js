
import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/http/app.js';
import { createMemoryRepository } from '../src/repositories/memory.js';

async function withServer(run, { paymentGateway } = {}) {
  const repository = createMemoryRepository();
  const server = createApp({ repository, paymentGateway });

  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));

  try {
    await run(`http://127.0.0.1:${server.address().port}`);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
}

const headers = {
  'content-type': 'application/json',
  'x-user-id': 'user-001',
};

async function createPublishedEvent(baseUrl) {
  const eventResponse = await fetch(`${baseUrl}/api/events`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      title: 'Tech Conference',
      city: 'Abuja',
      venue: 'Conference Centre',
      startsAt: '2027-05-15T10:00:00.000Z',
    }),
  });

  assert.equal(eventResponse.status, 201);
  const event = await eventResponse.json();

  const tierResponse = await fetch(`${baseUrl}/api/events/${event.id}/tiers`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      name: 'Regular',
      priceCents: 500000,
      capacity: 10,
    }),
  });

  assert.equal(tierResponse.status, 201);
  const tier = await tierResponse.json();

  const publishResponse = await fetch(
    `${baseUrl}/api/events/${event.id}/publish`,
    { method: 'POST', headers },
  );

  assert.equal(publishResponse.status, 200);

  return { event, tier };
}

test('protected routes reject requests without x-user-id', async () => {
  await withServer(async baseUrl => {
    const response = await fetch(`${baseUrl}/api/events`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        title: 'Tech Conference',
        city: 'Abuja',
        venue: 'Conference Centre',
        startsAt: '2027-05-15T10:00:00.000Z',
      }),
    });

    assert.equal(response.status, 401);

    const error = await response.json();
    assert.equal(error.error.code, 'UNAUTHORIZED');
  });
});

test('POST /api/events creates an event', async () => {
  await withServer(async baseUrl => {
    const response = await fetch(`${baseUrl}/api/events`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        title: 'Tech Conference',
        city: 'Abuja',
        venue: 'Conference Centre',
        startsAt: '2027-05-15T10:00:00.000Z',
      }),
    });

    assert.equal(response.status, 201);
    const event = await response.json();
    assert.equal(event.title, 'Tech Conference');
    assert.equal(event.organizerId, 'user-001');
  });
});

test('events can be created, given a tier and published', async () => {
  await withServer(async baseUrl => {
    const { event, tier } = await createPublishedEvent(baseUrl);

    assert.ok(event.id);
    assert.equal(tier.name, 'Regular');

    const response = await fetch(`${baseUrl}/api/events`);
    assert.equal(response.status, 200);

    const events = await response.json();
    assert.equal(events.length, 1);
    assert.equal(events[0].title, 'Tech Conference');
  });
});

test('POST /api/bookings creates a pending booking', async () => {
  await withServer(async baseUrl => {
    const { tier } = await createPublishedEvent(baseUrl);

    const response = await fetch(`${baseUrl}/api/bookings`, {
      method: 'POST',
      headers: { ...headers, 'x-user-id': 'user-002' },
      body: JSON.stringify({
        tierId: tier.id,
        quantity: 2,
      }),
    });

    assert.equal(response.status, 201);
    const booking = await response.json();

    assert.equal(booking.status, 'pending');
    assert.equal(booking.quantity, 2);
    assert.equal(booking.userId, 'user-002');
    assert.ok(booking.reference);
  });
});

test('successful payment changes a pending booking to paid', async () => {
  await withServer(async baseUrl => {
    const { tier } = await createPublishedEvent(baseUrl);

    const bookingResponse = await fetch(`${baseUrl}/api/bookings`, {
      method: 'POST',
      headers: { ...headers, 'x-user-id': 'user-002' },
      body: JSON.stringify({ tierId: tier.id, quantity: 1 }),
    });

    const booking = await bookingResponse.json();

    const paymentResponse = await fetch(
      `${baseUrl}/api/bookings/${booking.reference}/pay`,
      {
        method: 'POST',
        headers: { ...headers, 'x-user-id': 'user-002' },
        body: JSON.stringify({}),
      },
    );

    assert.equal(paymentResponse.status, 200);
    const paidBooking = await paymentResponse.json();
    assert.equal(paidBooking.status, 'paid');
  });
});

test('an already-paid booking cannot be paid for again', async () => {
  await withServer(async baseUrl => {
    const { tier } = await createPublishedEvent(baseUrl);

    const bookingResponse = await fetch(`${baseUrl}/api/bookings`, {
      method: 'POST',
      headers: { ...headers, 'x-user-id': 'user-002' },
      body: JSON.stringify({ tierId: tier.id, quantity: 1 }),
    });

    const booking = await bookingResponse.json();

    const paymentUrl =
      `${baseUrl}/api/bookings/${booking.reference}/pay`;

    const firstPayment = await fetch(paymentUrl, {
      method: 'POST',
      headers: { ...headers, 'x-user-id': 'user-002' },
      body: JSON.stringify({}),
    });

    assert.equal(firstPayment.status, 200);

    const secondPayment = await fetch(paymentUrl, {
      method: 'POST',
      headers: { ...headers, 'x-user-id': 'user-002' },
      body: JSON.stringify({}),
    });

    assert.equal(secondPayment.status, 409);

    const error = await secondPayment.json();
    assert.equal(error.error.code, 'INVALID_TRANSITION');
  });
});

test('a user cannot pay for another user’s booking', async () => {
  await withServer(async baseUrl => {
    const { tier } = await createPublishedEvent(baseUrl);

    // User 002 creates a booking
    const bookingResponse = await fetch(`${baseUrl}/api/bookings`, {
      method: 'POST',
      headers: { ...headers, 'x-user-id': 'user-002' },
      body: JSON.stringify({ tierId: tier.id, quantity: 1 }),
    });

    const booking = await bookingResponse.json();

    // User 003 tries to pay for User 002's booking
    const paymentResponse = await fetch(
      `${baseUrl}/api/bookings/${booking.reference}/pay`,
      {
        method: 'POST',
        headers: { ...headers, 'x-user-id': 'user-003' },
        body: JSON.stringify({}),
      },
    );

    assert.equal(paymentResponse.status, 403);

    const error = await paymentResponse.json();
    assert.equal(error.error.code, 'FORBIDDEN');
  });
});

test('declined payment leaves the booking pending', async () => {
  await withServer(async baseUrl => {
    const { tier } = await createPublishedEvent(baseUrl);

    const bookingResponse = await fetch(`${baseUrl}/api/bookings`, {
      method: 'POST',
      headers: { ...headers, 'x-user-id': 'user-002' },
      body: JSON.stringify({ tierId: tier.id, quantity: 1 }),
    });

    const booking = await bookingResponse.json();

    const paymentResponse = await fetch(
      `${baseUrl}/api/bookings/${booking.reference}/pay`,
      {
        method: 'POST',
        headers: { ...headers, 'x-user-id': 'user-002' },
        body: JSON.stringify({ decline: true }),
      },
    );

    assert.equal(paymentResponse.status, 402);
    const error = await paymentResponse.json();
    assert.equal(error.error.code, 'PAYMENT_DECLINED');

    const retryResponse = await fetch(
      `${baseUrl}/api/bookings/${booking.reference}/pay`,
      {
        method: 'POST',
        headers: { ...headers, 'x-user-id': 'user-002' },
        body: JSON.stringify({}),
      },
    );

    assert.equal(retryResponse.status, 200);
    assert.equal((await retryResponse.json()).status, 'paid');
  });
});

test('a booking can be cancelled before payment', async () => {
  await withServer(async baseUrl => {
    const { tier } = await createPublishedEvent(baseUrl);

    const bookingResponse = await fetch(`${baseUrl}/api/bookings`, {
      method: 'POST',
      headers: { ...headers, 'x-user-id': 'user-002' },
      body: JSON.stringify({ tierId: tier.id, quantity: 1 }),
    });

    const booking = await bookingResponse.json();

    const cancelResponse = await fetch(
      `${baseUrl}/api/bookings/${booking.reference}/cancel`,
      {
        method: 'POST',
        headers: { ...headers, 'x-user-id': 'user-002' },
      },
    );

    assert.equal(cancelResponse.status, 200);
    assert.equal((await cancelResponse.json()).status, 'cancelled');
  });
});

test('a paid booking cannot be cancelled', async () => {
  await withServer(async baseUrl => {
    const { tier } = await createPublishedEvent(baseUrl);

    // Create a booking
    const bookingResponse = await fetch(`${baseUrl}/api/bookings`, {
      method: 'POST',
      headers: { ...headers, 'x-user-id': 'user-002' },
      body: JSON.stringify({ tierId: tier.id, quantity: 1 }),
    });

    const booking = await bookingResponse.json();

    // Pay for the booking
    const paymentResponse = await fetch(
      `${baseUrl}/api/bookings/${booking.reference}/pay`,
      {
        method: 'POST',
        headers: { ...headers, 'x-user-id': 'user-002' },
        body: JSON.stringify({}),
      },
    );

    assert.equal(paymentResponse.status, 200);
    assert.equal((await paymentResponse.json()).status, 'paid');

    // Try to cancel the paid booking
    const cancelResponse = await fetch(
      `${baseUrl}/api/bookings/${booking.reference}/cancel`,
      {
        method: 'POST',
        headers: { ...headers, 'x-user-id': 'user-002' },
      },
    );

    assert.equal(cancelResponse.status, 409);

    const error = await cancelResponse.json();
    assert.equal(error.error.code, 'INVALID_TRANSITION');
  });
});

test('unpublishing an event hides it from the public event list', async () => {
  await withServer(async baseUrl => {
    const { event } = await createPublishedEvent(baseUrl);

    const unpublishResponse = await fetch(
      `${baseUrl}/api/events/${event.id}/unpublish`,
      {
        method: 'POST',
        headers,
      },
    );

    assert.equal(unpublishResponse.status, 200);

    const unpublishedEvent = await unpublishResponse.json();
    assert.equal(unpublishedEvent.status, 'draft');

    const listResponse = await fetch(`${baseUrl}/api/events`);
    assert.equal(listResponse.status, 200);

    const events = await listResponse.json();
    assert.equal(events.length, 0);
  });
});
test('a cancelled booking cannot be paid for', async () => {
  await withServer(async baseUrl => {
    const { tier } = await createPublishedEvent(baseUrl);

    // Create a booking
    const bookingResponse = await fetch(`${baseUrl}/api/bookings`, {
      method: 'POST',
      headers: { ...headers, 'x-user-id': 'user-002' },
      body: JSON.stringify({ tierId: tier.id, quantity: 1 }),
    });

    const booking = await bookingResponse.json();

    // Cancel the booking
    const cancelResponse = await fetch(
      `${baseUrl}/api/bookings/${booking.reference}/cancel`,
      {
        method: 'POST',
        headers: { ...headers, 'x-user-id': 'user-002' },
      },
    );

    assert.equal(cancelResponse.status, 200);

    // Try to pay for the cancelled booking
    const paymentResponse = await fetch(
      `${baseUrl}/api/bookings/${booking.reference}/pay`,
      {
        method: 'POST',
        headers: { ...headers, 'x-user-id': 'user-002' },
        body: JSON.stringify({}),
      },
    );

    assert.equal(paymentResponse.status, 409);

    const error = await paymentResponse.json();
    assert.equal(error.error.code, 'INVALID_TRANSITION');
  });
});

test('an already-paid booking does not trigger a second gateway charge', async () => {
  let chargeCount = 0;

  const paymentGateway = {
    async charge() {
      chargeCount += 1;
      return { status: 'succeeded' };
    },
  };

  await withServer(async baseUrl => {
    const { tier } = await createPublishedEvent(baseUrl);

    const bookingResponse = await fetch(`${baseUrl}/api/bookings`, {
      method: 'POST',
      headers: { ...headers, 'x-user-id': 'user-002' },
      body: JSON.stringify({ tierId: tier.id, quantity: 1 }),
    });

    const booking = await bookingResponse.json();

    const paymentUrl =
      `${baseUrl}/api/bookings/${booking.reference}/pay`;

    // First payment
    const firstPayment = await fetch(paymentUrl, {
      method: 'POST',
      headers: { ...headers, 'x-user-id': 'user-002' },
      body: JSON.stringify({}),
    });

    assert.equal(firstPayment.status, 200);
    assert.equal(chargeCount, 1);

    // Second payment attempt
    const secondPayment = await fetch(paymentUrl, {
      method: 'POST',
      headers: { ...headers, 'x-user-id': 'user-002' },
      body: JSON.stringify({}),
    });

    assert.equal(secondPayment.status, 409);
    assert.equal(chargeCount, 1);
  }, { paymentGateway });
});