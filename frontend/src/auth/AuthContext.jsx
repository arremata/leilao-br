import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { authApi, AuthError } from './api';
import { AuthContext } from './context';

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [synced, setSynced] = useState(false);
  const [sessionExpired, setSessionExpired] = useState(false);
  const syncStartedFor = useRef(null);
  const isAuthed = Boolean(authReady && user);

  const clearLocalSession = useCallback(() => {
    syncStartedFor.current = null;
    setUser(null);
    setSynced(false);
  }, []);

  useEffect(() => {
    let cancelled = false;
    try {
      ['argos_token', 'argos_user', 'argos_local_account_v1', 'argos_local_session_v1']
        .forEach(key => localStorage.removeItem(key));
    } catch { /* legacy browser data must not block the secure session check */ }
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

  // Merge browser-only saved/viewed data once after the server validates the
  // HttpOnly session. Later changes are written directly through authenticated
  // same-origin requests.
  useEffect(() => {
    if (!isAuthed || synced) return;
    const sessionOwner = user.id;
    if (syncStartedFor.current === sessionOwner) return;
    syncStartedFor.current = sessionOwner;
    let cancelled = false;
    const watched = _readIds('arremate_watched');
    const history = _readHistory('arremate_history');
    authApi.sync({ watched, history })
      .then(() => authApi.me())
      .then((data) => {
        if (cancelled) return;
        setUser(data.user);
        setSynced(true);
        try {
          localStorage.removeItem('arremate_watched');
          localStorage.removeItem('arremate_history');
        } catch { /* ignore */ }
        window.dispatchEvent(new CustomEvent('argos:synced', { detail: data }));
      })
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof AuthError) {
          window.dispatchEvent(new Event('argos:session-expired'));
        } else {
          syncStartedFor.current = null;
        }
      });
    return () => { cancelled = true; };
  }, [isAuthed, synced, user]);

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
