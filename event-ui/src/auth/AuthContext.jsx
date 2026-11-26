import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import * as api from '../api/api.js';
import { clearSession, loadSession, saveSession, SESSION_EXPIRED } from '../api/session.js';

const AuthContext = createContext(null);

// One place knows who is logged in. Every component asks here, none keep their own copy.
export function AuthProvider({ children }) {
  const saved = loadSession();
  const [user, setUser] = useState(saved?.user ?? null);
  // "checking" while we ask the server whether the saved token still works.
  const [checking, setChecking] = useState(Boolean(saved));
  const [expired, setExpired] = useState(false);

  useEffect(() => {
    if (!saved) return;
    let cancelled = false;
    api
      .me()
      .then((fresh) => {
        if (!cancelled) setUser(fresh);
      })
      .catch((err) => {
        // Only a "no" from the server logs us out. A network blip keeps the saved user.
        if (!cancelled && err.status === 401) setUser(null);
      })
      .finally(() => {
        if (!cancelled) setChecking(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once, on load
  }, []);

  useEffect(() => {
    function onExpired() {
      setUser(null);
      setExpired(true);
    }
    window.addEventListener(SESSION_EXPIRED, onExpired);
    return () => window.removeEventListener(SESSION_EXPIRED, onExpired);
  }, []);

  const start = useCallback((result) => {
    saveSession({ token: result.token, user: result.user });
    setUser(result.user);
    setExpired(false);
    return result.user;
  }, []);

  const login = useCallback(async (credentials) => start(await api.login(credentials)), [start]);
  const signup = useCallback(async (details) => start(await api.signup(details)), [start]);
  const logout = useCallback(() => {
    clearSession();
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ user, checking, expired, login, signup, logout }),
    [user, checking, expired, login, signup, logout],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside <AuthProvider>');
  return value;
}

// Where each role lands after logging in.
export function homeFor(user) {
  if (user.role === 'organizer') return '/organizer';
  if (user.role === 'staff') return '/staff';
  return '/';
}
