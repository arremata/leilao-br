/**
 * Auth-scoped API helpers. The server owns the session in an HttpOnly cookie;
 * JavaScript never reads, stores or forwards the credential itself.
 */

export class AuthError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

async function request(path, {
  method = 'GET', body, session = true, notifyUnauthorized = true,
} = {}) {
  const res = await fetch(`/api${path}`, {
    method,
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (res.status === 401) {
    if (session && notifyUnauthorized) {
      window.dispatchEvent(new Event('argos:session-expired'));
    }
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
    request('/auth/google', { method: 'POST', body: { credential }, session: false }),
  logout: () => request('/auth/logout', { method: 'POST' }),
  me: ({ notifyUnauthorized = true } = {}) =>
    request('/me', { notifyUnauthorized }),
  sync: ({ watched, history }) =>
    request('/me/sync', { method: 'POST', body: { watched, history } }),
  updateHousingProfile: (profile) =>
    request('/me/housing-profile', { method: 'PUT', body: profile }),
  setSaved: (propertyId, saved) =>
    request(`/me/saved/${propertyId}`, { method: 'PUT', body: { saved } }),
  recordViewed: (propertyId, snapshot) =>
    request('/me/viewed', { method: 'POST', body: { property_id: propertyId, snapshot } }),
};
