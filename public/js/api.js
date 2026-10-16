// ============================================================================
// THE ONE DATA FILE.
// Every page of the website gets its data from THIS file and nowhere else.
// In Build 6 this file held fake data. In Build 7 the same function names now talk to the
// REAL server with fetch("/api/..."). The pages did not have to change to get real data.
//
// What lives here:
//   - every call to the server (fetch)
//   - the login "session": who is logged in and their token (kept in sessionStorage,
//     so it is gone when the browser tab is closed)
//   - turning a card number into a payment "token" (the server never sees card numbers)
//
// Errors: every failed call throws ApiError with .code and .status, the same shape the
// server sends: { "error": { "code", "message" } }. If the server cannot be reached at all,
// the code is "NETWORK".
// ============================================================================

export const MAX_PER_BOOKING = 10; // same limit as the server
export const DECLINED_TEST_CARD = "4000000000000002";
export const SUCCESS_TEST_CARD = "4242424242424242";

export class ApiError extends Error {
  constructor(code, message, status = 0) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
  }
}

// ----------------------------------------------------------------- settings
// Tests change these. The website itself never does: it uses the same address it was loaded from.
let baseUrl = "";
let storage = null;
const memory = new Map(); // used when the browser gives us no sessionStorage

try {
  storage = globalThis.sessionStorage ?? null;
} catch {
  storage = null; // some privacy modes throw just for looking at it
}

export function configureApi(change = {}) {
  if ("baseUrl" in change) baseUrl = change.baseUrl;
  if ("storage" in change) storage = change.storage;
}

// ------------------------------------------------------------------ session
const SESSION_KEY = "stub.session";
const listeners = new Set();

function readSession() {
  let raw = null;
  try {
    raw = storage ? storage.getItem(SESSION_KEY) : (memory.get(SESSION_KEY) ?? null);
  } catch {
    raw = memory.get(SESSION_KEY) ?? null;
  }
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return typeof parsed?.token === "string" && parsed.user ? parsed : null;
  } catch {
    return null;
  }
}

function writeSession(session) {
  const text = session ? JSON.stringify(session) : null;
  try {
    if (storage) {
      if (text) storage.setItem(SESSION_KEY, text);
      else storage.removeItem(SESSION_KEY);
    } else if (text) memory.set(SESSION_KEY, text);
    else memory.delete(SESSION_KEY);
  } catch {
    if (text) memory.set(SESSION_KEY, text);
    else memory.delete(SESSION_KEY);
  }
  for (const listener of listeners) listener(session?.user ?? null);
}

// Who is logged in right now? { id, name, email, role } or null.
export function currentUser() {
  return readSession()?.user ?? null;
}

// Call fn(user) whenever someone logs in or out. Returns a function that stops listening.
export function onSessionChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function logout() {
  writeSession(null);
}

// -------------------------------------------------------------- the one fetch
async function request(method, path, { body, query } = {}) {
  const session = readSession();
  const headers = { Accept: "application/json" };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (session) headers.Authorization = `Bearer ${session.token}`;

  let url = baseUrl + path;
  if (query) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) if (value !== undefined && value !== null) params.set(key, String(value));
    if ([...params].length > 0) url += "?" + params;
  }

  let response;
  try {
    response = await fetch(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  } catch {
    throw new ApiError("NETWORK", "Cannot reach the server. Check your connection and try again.");
  }

  let data = null;
  try {
    data = await response.json();
  } catch {
    /* the server sent something that is not JSON */
  }

  if (!response.ok) {
    const problem = data?.error;
    // Our login stopped working (expired, or the server restarted): forget it, so the pages show "Log in".
    if (response.status === 401 && session && !path.startsWith("/api/auth/")) writeSession(null);
    throw new ApiError(problem?.code ?? "SERVER", problem?.message ?? "The server sent an answer we did not understand.", response.status);
  }
  if (data === null) throw new ApiError("SERVER", "The server sent an answer we did not understand.", response.status);
  return data;
}

// --------------------------------------------------------------------- login
// POST /api/auth/signup   role is "attendee" or "organizer"
export async function signup({ name, email, password, role }) {
  const { user, token } = await request("POST", "/api/auth/signup", { body: { name, email, password, role } });
  writeSession({ user, token });
  return user;
}

// POST /api/auth/login
export async function login({ email, password }) {
  const { user, token } = await request("POST", "/api/auth/login", { body: { email, password } });
  writeSession({ user, token });
  return user;
}

// -------------------------------------------------------------------- events
// GET /api/events   (query: q, city, dateFrom, dateTo, minPriceCents, maxPriceCents, sort, order)
export function listEvents(query = {}) {
  return request("GET", "/api/events", { query });
}

// GET /api/events/:eventId
export function getEvent(eventId) {
  return request("GET", `/api/events/${encodeURIComponent(eventId)}`);
}

// GET /api/me/events   (organizers: my events, drafts too)
export function listMyEvents() {
  return request("GET", "/api/me/events");
}

// POST /api/events   (organizers)
export function createEvent({ title, city, venue, date }) {
  return request("POST", "/api/events", { body: { title, city, venue, date } });
}

// POST /api/events/:eventId/tiers   (the owner)
export function addTier(eventId, { name, priceCents, capacity }) {
  return request("POST", `/api/events/${encodeURIComponent(eventId)}/tiers`, { body: { name, priceCents, capacity } });
}

// POST /api/events/:eventId/publish and /unpublish   (the owner)
export function publishEvent(eventId) {
  return request("POST", `/api/events/${encodeURIComponent(eventId)}/publish`);
}
export function unpublishEvent(eventId) {
  return request("POST", `/api/events/${encodeURIComponent(eventId)}/unpublish`);
}

// ------------------------------------------------------------------ bookings
// POST /api/bookings   (attendees)
export function createBooking({ eventId, tierId, buyerName, quantity }) {
  return request("POST", "/api/bookings", { body: { eventId, tierId, buyerName, quantity } });
}

// GET /api/bookings/:ref   (only your own)
export function getBooking(ref) {
  return request("GET", `/api/bookings/${encodeURIComponent(ref)}`);
}

// GET /api/me/bookings   (my tickets, newest first)
export function listMyBookings() {
  return request("GET", "/api/me/bookings");
}

// The website never sends card numbers to the server. It turns the card into a "token" first.
// (A real payment company does this step in the browser. Our mock does it here.)
// Test cards: 4242 4242 4242 4242 works. 4000 0000 0000 0002 is declined.
function cardToToken(cardNumber) {
  return String(cardNumber).replace(/\D/g, "") === DECLINED_TEST_CARD ? "tok_declined" : "tok_success";
}

// POST /api/bookings/:ref/pay   (the server only ever receives { paymentToken })
export function payBooking(ref, { cardNumber }) {
  return request("POST", `/api/bookings/${encodeURIComponent(ref)}/pay`, { body: { paymentToken: cardToToken(cardNumber) } });
}

// POST /api/bookings/:ref/cancel   (unpaid bookings only)
export function cancelBooking(ref) {
  return request("POST", `/api/bookings/${encodeURIComponent(ref)}/cancel`);
}
