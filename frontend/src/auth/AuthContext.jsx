import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { authApi, AuthError } from './api';
import { AuthContext } from './context';

const isPreview = import.meta.env.VITE_DEPLOY_ENV === 'preview';
const SYNC_RETRY_DELAYS_MS = [2000, 5000, 15000];

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [authReady, setAuthReady] = useState(isPreview);
  const [synced, setSynced] = useState(false);
  const [sessionExpired, setSessionExpired] = useState(false);
  const [syncAttempt, setSyncAttempt] = useState(0);
  const syncStartedFor = useRef(null);
  const isAuthed = Boolean(authReady && user);
  // Profile edits replace `user`; only a different account restarts the sync.
  const userId = user?.id ?? null;

  const clearLocalSession = useCallback(() => {
    syncStartedFor.current = null;
    setUser(null);
    setSynced(false);
    setSyncAttempt(0);
  }, []);

  useEffect(() => {
    let cancelled = false;
    try {
      ['argos_token', 'argos_user', 'argos_local_account_v1', 'argos_local_session_v1']
        .forEach(key => localStorage.removeItem(key));
    } catch { /* legacy browser data must not block the secure session check */ }
    // Branch previews are intentionally public and cannot create a Google
    // session, so probing /me would only produce an expected 401 in the console.
    if (isPreview) return undefined;
    authApi.me({ notifyUnauthorized: false })
      .then((data) => {
        if (!cancelled) setUser(data.user);
      })
      .catch((err) => {
        if (!cancelled && !(err instanceof AuthError)) {
          console.warn('Não foi possível verificar a sessão:', err);
        }
      })
      .finally(() => {
        if (!cancelled) setAuthReady(true);
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const onExpired = () => {
      clearLocalSession();
      setAuthReady(true);
      setSessionExpired(true);
    };
    window.addEventListener('argos:session-expired', onExpired);
    return () => window.removeEventListener('argos:session-expired', onExpired);
  }, [clearLocalSession]);

  const loginWithGoogle = useCallback(async (credential) => {
    const data = await authApi.loginWithGoogle(credential);
    syncStartedFor.current = null;
    setSessionExpired(false);
    setSynced(false);
    setSyncAttempt(0);
    setUser(data.user);
    setAuthReady(true);
    return data.user;
  }, []);

  const logout = useCallback(async () => {
    await authApi.logout();
    clearLocalSession();
    setSessionExpired(false);
  }, [clearLocalSession]);

  const updateHousingProfile = useCallback(async (profile) => {
    const data = await authApi.updateHousingProfile(profile);
    setUser(data.user);
    return data.user;
  }, []);

  // Load the account's saved/viewed lists once the server validates the
  // HttpOnly session. Lists kept by this browser before accounts existed are
  // imported first, once; a failed import stays local and never blocks the
  // account lists. Later changes are written directly through authenticated
  // same-origin requests.
  useEffect(() => {
    if (!isAuthed || synced) return undefined;
    const sessionOwner = userId;
    if (syncStartedFor.current === sessionOwner) return undefined;
    syncStartedFor.current = sessionOwner;
    let cancelled = false;
    let retryTimer = null;
    const watched = _readIds('arremate_watched');
    const history = _readHistory('arremate_history');
    const importLocal = watched.length || history.length
      ? authApi.sync({ watched, history })
        .then(() => {
          try {
            localStorage.removeItem('arremate_watched');
            localStorage.removeItem('arremate_history');
          } catch { /* ignore */ }
        })
        .catch((err) => {
          if (err instanceof AuthError) throw err;
          console.warn('Não foi possível importar as listas deste navegador:', err);
        })
      : Promise.resolve();
    importLocal
      .then(() => authApi.me())
      .then((data) => {
        if (cancelled) return;
        setUser(data.user);
        setSynced(true);
        window.dispatchEvent(new CustomEvent('argos:synced', { detail: data }));
      })
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof AuthError) {
          window.dispatchEvent(new Event('argos:session-expired'));
          return;
        }
        console.warn('Não foi possível carregar seus salvos e vistos:', err);
        if (syncAttempt < SYNC_RETRY_DELAYS_MS.length) {
          retryTimer = setTimeout(() => {
            syncStartedFor.current = null;
            setSyncAttempt(attempt => attempt + 1);
          }, SYNC_RETRY_DELAYS_MS[syncAttempt]);
        } else {
          syncStartedFor.current = null;
        }
      });
    return () => {
      cancelled = true;
      clearTimeout(retryTimer);
    };
  }, [isAuthed, synced, userId, syncAttempt]);

  const value = useMemo(() => ({
    user,
    authReady,
    isAuthed,
    synced,
    sessionExpired,
    loginWithGoogle,
    updateHousingProfile,
    logout,
    setSessionExpired,
  }), [
    user, authReady, isAuthed, synced, sessionExpired,
    loginWithGoogle, updateHousingProfile, logout,
  ]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

function _readIds(key) {
  try {
    const raw = JSON.parse(localStorage.getItem(key) || '[]');
    return Array.isArray(raw) ? raw.map(Number).filter(Number.isFinite) : [];
  } catch { return []; }
}

function _readHistory(key) {
  try {
    const raw = JSON.parse(localStorage.getItem(key) || '[]');
    if (!Array.isArray(raw)) return [];
    return raw
      .filter(entry => entry && Number.isFinite(Number(entry.id)))
      .map(entry => ({ id: Number(entry.id), snapshot: entry }));
  } catch { return []; }
}
