import { test } from 'node:test';
import assert from 'node:assert/strict';
import { authApi, AuthError } from './auth/api.js';

function jsonResponse(status, body) {
  return {
    status,
    ok: status >= 200 && status < 300,
    json: async () => body,
  };
}

test('authenticated requests rely on the same-origin HttpOnly cookie', async (t) => {
  const previousFetch = globalThis.fetch;
  let captured;
  globalThis.fetch = async (url, options) => {
    captured = { url, options };
    return jsonResponse(200, { user: { id: 1 } });
  };
  t.after(() => { globalThis.fetch = previousFetch; });

  await authApi.me({ notifyUnauthorized: false });

  assert.equal(captured.url, '/api/me');
  assert.equal(captured.options.credentials, 'same-origin');
  assert.equal(captured.options.headers.Authorization, undefined);
});

test('an expired server session notifies the application without exposing a token', async (t) => {
  const previousFetch = globalThis.fetch;
  const previousWindow = globalThis.window;
  const events = [];
  globalThis.window = { dispatchEvent: event => events.push(event.type) };
  globalThis.fetch = async () => jsonResponse(401, { detail: 'Sessão encerrada' });
  t.after(() => {
    globalThis.fetch = previousFetch;
    globalThis.window = previousWindow;
  });

  await assert.rejects(authApi.me(), error => (
    error instanceof AuthError && error.status === 401
  ));
  assert.deepEqual(events, ['argos:session-expired']);
});
