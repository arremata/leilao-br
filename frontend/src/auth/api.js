/**
 * Auth-scoped API helpers. Every request goes through `/api/...`; the session JWT is
 * attached via Authorization when present. localStorage keys:
 *   argos_token — the JWT returned by /auth/google
 *   argos_user  — cached profile for fast first paint; /me is the source of truth
 */

const TOKEN_KEY = 'argos_token';
const USER_KEY = 'argos_user';

export function getToken() {
  try { return localStorage.getItem(TOKEN_KEY) || null; } catch { return null; }
}

export function getCachedUser() {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

export function saveSession({ token, user }) {
  try {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  } catch { /* storage full — keep session in memory */ }
}

export function clearSession() {
  try {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    localStorage.removeItem('arremate_watched');
    localStorage.removeItem('arremate_history');
  } catch { /* ignore */ }
}

export class AuthError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

async function request(path, { method = 'GET', body, auth = true } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (auth) {
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }
  const res = await fetch(`/api${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (res.status === 401) {
    window.dispatchEvent(new Event('argos:session-expired'));
    throw new AuthError(await _detail(res) || 'Sua sessão expirou. Entre de novo.', 401);
  }
  if (!res.ok) throw new Error(await _detail(res) || `Erro ${res.status}`);
  return res.json();
}

async function _detail(res) {
  try {
    const data = await res.json();
    return typeof data?.detail === 'string' ? data.detail : null;
  } catch { return null; }
}

export const authApi = {
  loginWithGoogle: (credential) =>
    request('/auth/google', { method: 'POST', body: { credential }, auth: false }),
  me: () => request('/me'),
  sync: ({ watched, history }) =>
    request('/me/sync', { method: 'POST', body: { watched, history } }),
  setSaved: (propertyId, saved) =>
    request(`/me/saved/${propertyId}`, { method: 'PUT', body: { saved } }),
  recordViewed: (propertyId, snapshot) =>
    request('/me/viewed', { method: 'POST', body: { property_id: propertyId, snapshot } }),
};
