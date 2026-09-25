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
    return apiErrorMessage(await res.json());
  } catch { return null; }
}

export function apiErrorMessage(data) {
  if (typeof data?.detail === 'string') return data.detail;
  if (!Array.isArray(data?.detail)) return null;
  const invalidFields = new Set(data.detail.flatMap(item => (
    Array.isArray(item?.loc) ? item.loc.slice(-1) : []
  )));
  if (invalidFields.has('city')) return 'Informe uma cidade válida para continuar.';
  if (invalidFields.has('budget')) return 'Escolha uma faixa de preço para concluir seu perfil.';
  if (invalidFields.has('property_type') || invalidFields.has('propertyType')) {
    return 'Escolha um tipo de imóvel válido para continuar.';
  }
  return 'Revise os dados informados e tente novamente.';
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
