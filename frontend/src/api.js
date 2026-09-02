import axios from 'axios';

/**
 * Single source of truth for the backend address, and for attaching the
 * signed-in user's credentials to every request.
 *
 * In production (Vercel) the address is supplied by the VITE_API_URL
 * environment variable, which points at the deployed backend. On a developer
 * machine no variable is set, so it falls back to the local FastAPI server
 * started with `python -m app.main`.
 */
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

export const TOKEN_STORAGE_KEY = 'drug-repurposing-token';

/**
 * The token is kept in localStorage rather than in React state alone, so a
 * refresh or a second tab does not silently log the user out.
 *
 * The honest trade-off, worth being able to state in a viva: localStorage is
 * readable by any JavaScript running on the page, so it is exposed to XSS in a
 * way an HttpOnly cookie is not. It is used here because the frontend and
 * backend are on different domains (Vercel and Render), where a cookie would
 * depend on third-party cookie support that browsers are actively removing.
 * The mitigations are an expiring token and no third-party scripts on the page.
 */
export function readStoredToken() {
  try {
    return localStorage.getItem(TOKEN_STORAGE_KEY);
  } catch {
    return null; // Some privacy modes refuse localStorage outright.
  }
}

export function storeToken(token) {
  try {
    if (token) localStorage.setItem(TOKEN_STORAGE_KEY, token);
    else localStorage.removeItem(TOKEN_STORAGE_KEY);
  } catch {
    // Failing to persist a session is not worth breaking the page over; the
    // user simply stays signed in for this tab only.
  }
}

/**
 * A request with no timeout hangs forever. That matters more than usual here:
 * the backend runs on a free tier that sleeps when idle, and a serverless
 * database that suspends its compute, so "slow" is a normal state rather than
 * an exceptional one. Without a ceiling, a button can spin indefinitely with
 * nothing to tell the user whether to wait or retry.
 *
 * 45 seconds is chosen to sit just above the worst legitimate case — a cold
 * start on both tiers at once — so a real wait completes and a genuine failure
 * still surfaces.
 */
export const REQUEST_TIMEOUT_MS = 45000;

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: REQUEST_TIMEOUT_MS,
  timeoutErrorMessage:
    'The server took too long to respond. It may be waking from sleep — please try again.',
});

/**
 * Attach the bearer token to outgoing requests.
 *
 * Reading it here, per request, rather than baking it into the axios instance
 * once at creation means a login or a logout takes effect immediately, without
 * anything else having to remember to reconfigure the client.
 */
api.interceptors.request.use((config) => {
  const token = readStoredToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

/** Fired when the server rejects a token we were holding. */
export const UNAUTHORIZED_EVENT = 'drug-repurposing:unauthorized';

/**
 * A token the server rejects is worthless - expired, or belonging to an
 * account that no longer exists. Rather than let the user click around in a
 * broken half-signed-in state, discard it and announce it so the interface can
 * return to the signed-out view.
 *
 * Login and registration are deliberately excluded: a 401 from those means
 * "wrong password", which the form itself reports and which must not trigger a
 * global sign-out.
 */
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error?.response?.status;
    const url = error?.config?.url || '';
    const isCredentialCheck =
      url.includes('/api/auth/login') || url.includes('/api/auth/register');

    if (status === 401 && !isCredentialCheck && readStoredToken()) {
      storeToken(null);
      window.dispatchEvent(new CustomEvent(UNAUTHORIZED_EVENT));
    }
    return Promise.reject(error);
  },
);

export default api;
