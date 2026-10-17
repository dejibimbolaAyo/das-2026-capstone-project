// Build 7: where the signed-in user lives in the browser.
//
// The token is kept in localStorage so a refresh does not log the user out.
// This is the ONLY module that touches storage: api.js asks it for the token,
// the pages ask it who is logged in, and logging out is one call.
//
// Nothing here is a security control. A user can edit localStorage as much as
// they like; the server checks the token's signature and the role on every
// request, so a faked "organizer" in the browser buys nothing.

const KEY = 'ticketing.session';

// Node (and a browser in private mode) may not have localStorage. Falling back
// to memory keeps the tests and the first paint working; a refresh just logs out.
let memorySession = null;

function store() {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

function read() {
  const storage = store();
  if (!storage) return memorySession;
  try {
    const raw = storage.getItem(KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function write(session) {
  memorySession = session;
  const storage = store();
  if (!storage) return;
  try {
    if (session) storage.setItem(KEY, JSON.stringify(session));
    else storage.removeItem(KEY);
  } catch {
    // A full or blocked storage must not break the page.
  }
}

export function getSession() {
  return read();
}

export function getToken() {
  return read()?.token ?? null;
}

export function getUser() {
  return read()?.user ?? null;
}

export function isLoggedIn() {
  return getToken() !== null;
}

export function hasRole(role) {
  return read()?.user?.role === role;
}

export function setSession({ token, user }) {
  write({ token, user });
}

export function clearSession() {
  write(null);
}

// A page that needs a login sends the visitor to the login page and back.
export function loginUrl(next) {
  const target = next ?? (typeof location === 'undefined' ? '/' : location.pathname + location.search);
  return `/login.html?next=${encodeURIComponent(target)}`;
}
