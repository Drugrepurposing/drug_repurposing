import React, { useCallback, useEffect, useState } from 'react';
import api, { readStoredToken, storeToken, UNAUTHORIZED_EVENT } from '../api.js';
import { AuthContext } from './auth-context.js';

/**
 * Application-wide authentication state.
 *
 * The one design decision that matters here: a token found in localStorage is
 * NOT trusted on its own. On startup the provider calls GET /api/auth/me and
 * only considers the user signed in once the server confirms the token still
 * resolves to a live account. Trusting the stored copy would mean showing
 * someone as logged in for a week after their token expired, with every
 * request quietly failing.
 *
 * `initialising` exists so the navbar can hold its shape during that check
 * instead of flashing "Sign in" and then swapping to the user's name.
 */

function extractErrorMessage(error, fallback) {
  const detail = error?.response?.data?.detail;

  // FastAPI returns a string for our own HTTPExceptions and an array of
  // objects for Pydantic validation failures. Handle both, so a validation
  // error shows something readable rather than "[object Object]".
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail) && detail.length > 0) {
    return detail[0]?.msg || fallback;
  }
  if (error?.code === 'ERR_NETWORK') {
    return 'Could not reach the server. Check that the backend is running.';
  }
  return fallback;
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [initialising, setInitialising] = useState(() => Boolean(readStoredToken()));

  // Validate a stored token exactly once, on mount.
  useEffect(() => {
    if (!readStoredToken()) return undefined;

    let cancelled = false;
    api.get('/api/auth/me')
      .then((res) => {
        if (!cancelled) setUser(res.data);
      })
      .catch(() => {
        // The response interceptor has already cleared a rejected token.
        if (!cancelled) setUser(null);
      })
      .finally(() => {
        if (!cancelled) setInitialising(false);
      });

    return () => { cancelled = true; };
  }, []);

  // The axios interceptor announces a token the server refused; drop the user.
  useEffect(() => {
    const handleUnauthorized = () => setUser(null);
    window.addEventListener(UNAUTHORIZED_EVENT, handleUnauthorized);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, handleUnauthorized);
  }, []);

  // Keep two tabs in step: signing out in one signs out the other.
  useEffect(() => {
    const handleStorage = (event) => {
      if (event.key !== 'drug-repurposing-token') return;
      if (!event.newValue) setUser(null);
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  const applyToken = useCallback((data) => {
    storeToken(data.access_token);
    setUser(data.user);
    return data.user;
  }, []);

  const login = useCallback(async ({ email, password }) => {
    try {
      const res = await api.post('/api/auth/login', { email, password });
      return { ok: true, user: applyToken(res.data) };
    } catch (error) {
      return { ok: false, error: extractErrorMessage(error, 'Sign in failed. Please try again.') };
    }
  }, [applyToken]);

  const register = useCallback(async ({ fullName, email, password }) => {
    try {
      const res = await api.post('/api/auth/register', {
        full_name: fullName,
        email,
        password,
      });
      return { ok: true, user: applyToken(res.data) };
    } catch (error) {
      return {
        ok: false,
        error: extractErrorMessage(error, 'Could not create the account. Please try again.'),
      };
    }
  }, [applyToken]);

  const logout = useCallback(() => {
    // Nothing to call on the server: the token is stateless, so discarding it
    // client-side is the sign-out. It also expires on its own.
    storeToken(null);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{ user, isAuthenticated: Boolean(user), initialising, login, register, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}
