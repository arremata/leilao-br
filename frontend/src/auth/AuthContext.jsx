import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  authApi, getCachedUser, getToken, getValidToken, saveSession, clearSession, AuthError,
} from './api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => getCachedUser());
  const [synced, setSynced] = useState(false);
  const [sessionExpired, setSessionExpired] = useState(false);
  const syncStartedFor = useRef(null);

  const token = getValidToken();
  const isAuthed = Boolean(token && user);

  const logout = useCallback(() => {
    syncStartedFor.current = null;
    clearSession();
    setUser(null);
    setSynced(false);
  }, []);

  useEffect(() => {
    const onExpired = () => {
      clearSession();
      setUser(null);
      setSynced(false);
      setSessionExpired(true);
    };
    window.addEventListener('argos:session-expired', onExpired);
    return () => window.removeEventListener('argos:session-expired', onExpired);
  }, []);

  const loginWithGoogle = useCallback(async (credential) => {
    const data = await authApi.loginWithGoogle(credential);
    saveSession(data);
    setSessionExpired(false);
    setUser(data.user);
    return data.user;
  }, []);

  // One-time sync of localStorage watchlist/history into the account, then
  // continuity: every later toggle/view writes server-side.
  useEffect(() => {
    if (!isAuthed || synced) return;
    const t = getToken();
    if (syncStartedFor.current === t) return;
    syncStartedFor.current = t;
    let cancelled = false;
    const watched = _readIds('arremate_watched');
    const history = _readHistory('arremate_history');
    authApi.sync({ watched, history })
      .then(() => authApi.me())
      .then((data) => {
        if (cancelled) return;
        saveSession({ token: getToken(), user: data.user });
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
        }
        // Transient failure: stay localStorage-backed until next action retries.
      });
    return () => { cancelled = true; };
  }, [isAuthed, synced]);

  const value = useMemo(() => ({
    user,
    isAuthed,
    synced,
    sessionExpired,
    loginWithGoogle,
    logout,
    setSessionExpired,
  }), [user, isAuthed, synced, sessionExpired, loginWithGoogle, logout]);

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

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
