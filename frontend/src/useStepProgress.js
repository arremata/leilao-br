import { useCallback, useEffect, useRef, useState } from 'react';
import { authApi, AuthError } from './auth';
import { useAuth } from './auth/useAuth';
import { createStepProgressSync, readStoredSteps, withStep, writeStoredSteps } from './stepProgress';

function browserStorage() {
  try { return window.localStorage; } catch { return null; }
}

/**
 * Progresso do "O que fazer agora" de um imóvel. Com sessão Google ele
 * pertence à conta e volta igual em qualquer aparelho; sem sessão (previews)
 * fica só neste navegador.
 */
export function useStepProgress(propertyId) {
  const { user, isAuthed } = useAuth();
  const accountId = isAuthed && propertyId ? user?.id ?? null : null;
  const [done, setDone] = useState(() => readStoredSteps(browserStorage(), propertyId));
  const syncRef = useRef(null);

  useEffect(() => {
    if (!accountId) return undefined;
    const storage = browserStorage();
    const sync = createStepProgressSync({
      propertyId,
      api: authApi,
      storage,
      initial: readStoredSteps(storage, propertyId),
      onChange: setDone,
      isAuthError: error => error instanceof AuthError,
    });
    syncRef.current = sync;
    sync.start();
    return () => {
      sync.stop();
      if (syncRef.current === sync) syncRef.current = null;
    };
  }, [accountId, propertyId]);

  const setStep = useCallback((id, value) => {
    if (syncRef.current) {
      syncRef.current.set(id, value);
      return;
    }
    setDone((current) => {
      const nextValue = value ?? !current[id];
      if (Boolean(current[id]) === nextValue) return current;
      const next = withStep(current, id, nextValue);
      writeStoredSteps(browserStorage(), propertyId, next);
      return next;
    });
  }, [propertyId]);

  const toggleStep = useCallback(id => setStep(id), [setStep]);
  const markStepDone = useCallback(id => setStep(id, true), [setStep]);

  return { done, toggleStep, markStepDone };
}
