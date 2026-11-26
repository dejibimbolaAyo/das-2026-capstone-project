// The API seam, now talking to the real server. Same function names, same
// return shapes, same error shape as the mock. Nothing outside this file changes.

const USER_ID = 'student-1';      // until login arrives, the caller says who they are
const HOLD_SECONDS = 10 * 60;     // the server does not send holdUntil yet, so we work it out

async function request(path, { method = 'GET', body } = {}) {
  let response;
  try {
    response = await fetch(path, {
      method,
      headers: {
        'x-user-id': USER_ID,
        ...(body ? { 'content-type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw Object.assign(new Error('Cannot reach the server. Is it running?'), { status: 0, code: 'NETWORK' });
  }

  let data = null;
  try {
    data = await response.json();
  } catch {
    // an empty or non-JSON body: handled below
  }

  if (!response.ok) {
    const { code = 'ERROR', message = 'Something went wrong' } = data?.error ?? {};
    throw Object.assign(new Error(message), { status: response.status, code });
  }
  return data;
}

function withHold(booking) {
  const created = new Date(booking.createdAt ?? Date.now()).getTime();
  return { ...booking, holdUntil: booking.holdUntil ?? new Date(created + HOLD_SECONDS * 1000).toISOString() };
}

// GET /api/events -> { events: [...] }
export function listEvents({ q = '', city = '', maxPriceCents, onlyAvailable = false, sort = 'date' } = {}) {
  const params = new URLSearchParams();
  if (q.trim()) params.set('q', q.trim());
  if (city) params.set('city', city);
  if (Number.isFinite(maxPriceCents)) params.set('maxPriceCents', String(maxPriceCents));
  if (onlyAvailable) params.set('onlyAvailable', 'true');
  params.set('sort', sort);
  return request(`/api/events?${params}`);
}

// GET /api/events/:id -> the event with its tiers
export function getEvent(id) {
  return request(`/api/events/${encodeURIComponent(id)}`);
}

// POST /api/bookings -> a pending booking
export async function createBooking({ tierId, quantity }) {
  return withHold(await request('/api/bookings', { method: 'POST', body: { tierId, quantity } }));
}

// POST /api/bookings/:reference/pay. tok_success pays, tok_declined is declined.
export async function pay(reference, paymentToken) {
  return withHold(await request(`/api/bookings/${encodeURIComponent(reference)}/pay`, { method: 'POST', body: { paymentToken } }));
}
