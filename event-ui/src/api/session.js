// The browser's memory of who is logged in. Only this file touches localStorage.
// Storage can be blocked (private windows, strict settings), so every call is wrapped.

const KEY = 'ticketing.session';

export function loadSession() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY));
    return saved && typeof saved.token === 'string' ? saved : null;
  } catch {
    return null;
  }
}

export function saveSession(session) {
  try {
    localStorage.setItem(KEY, JSON.stringify(session));
  } catch {
    // Not saved: the user stays logged in until the page is closed.
  }
}

export function clearSession() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // nothing to clear
  }
}

// api.js shouts this when the server says the token is no good any more.
export const SESSION_EXPIRED = 'session-expired';
