/**
 * Progress in the "O que fazer agora" guide of a property: a map of completed
 * step ids (`{ read_rules: true }`).
 *
 * With a Google session the account is the source of truth (PUT/GET
 * /me/progress/{id}). Without one — branch previews — the progress stays in
 * this browser under the key used before accounts existed, which is also
 * imported into the account the first time the property is opened logged in.
 */

// Same shape the backend accepts; the ids live in content/nextStepsContent.js.
export const STEP_ID_PATTERN = /^[a-z][a-z0-9_]{0,39}$/;
export const MAX_COMPLETED_STEPS = 40;
const LOAD_RETRY_DELAYS_MS = [2000, 5000, 15000];

export const localStepsKey = propertyId => `arremate_property_steps_${propertyId}`;

export function completedStepIds(done) {
  return Object.keys(done || {})
    .filter(id => done[id] === true && STEP_ID_PATTERN.test(id))
    .sort()
    .slice(0, MAX_COMPLETED_STEPS);
}

export function stepsFromCompleted(completed) {
  const done = {};
  if (!Array.isArray(completed)) return done;
  completed.forEach(id => {
    if (typeof id === 'string' && STEP_ID_PATTERN.test(id)) done[id] = true;
  });
  return done;
}

export function withStep(done, id, value) {
  const next = { ...done };
  if (value) next[id] = true;
  else delete next[id];
  return next;
}

export function sameSteps(a, b) {
  const left = completedStepIds(a);
  const right = completedStepIds(b);
  return left.length === right.length && left.every((id, index) => id === right[index]);
}

export function readStoredSteps(storage, propertyId) {
  if (!storage || !propertyId) return {};
  try {
    const parsed = JSON.parse(storage.getItem(localStepsKey(propertyId)) || 'null');
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return stepsFromCompleted(Object.keys(parsed).filter(id => parsed[id] === true));
  } catch {
    return {};
  }
}

export function writeStoredSteps(storage, propertyId, done) {
  if (!storage || !propertyId) return;
  try {
    storage.setItem(localStepsKey(propertyId), JSON.stringify(done));
  } catch { /* o guia continua utilizável nesta visita */ }
}

export function removeStoredSteps(storage, propertyId) {
  if (!storage || !propertyId) return;
  try {
    storage.removeItem(localStepsKey(propertyId));
  } catch { /* nada a limpar */ }
}

/**
 * Keeps one property's progress in sync with the account.
 *
 * - Loads the account copy, unions it with any progress this browser kept
 *   before, and replays toggles made while the load was still running.
 * - Sends the full list on every change, one request at a time; while one is
 *   in flight only the latest state waits, so the server ends on what the
 *   person sees.
 */
export function createStepProgressSync({
  propertyId,
  api,
  storage,
  initial = {},
  onChange = () => {},
  isAuthError = () => false,
  retryDelays = LOAD_RETRY_DELAYS_MS,
  warn = (...args) => console.warn(...args),
}) {
  let done = initial;
  let loaded = false;
  let stopped = false;
  let retryTimer = null;
  let queued = null;
  let inFlight = false;
  let clearLocalAfterSave = false;
  const pendingChanges = new Map();

  const emit = (next) => {
    done = next;
    if (!stopped) onChange(next);
  };

  function flush() {
    if (inFlight || !queued) return;
    const completed = queued;
    queued = null;
    inFlight = true;
    api.setStepProgress(propertyId, completed)
      .then(() => {
        if (clearLocalAfterSave) {
          clearLocalAfterSave = false;
          removeStoredSteps(storage, propertyId);
        }
      })
      .catch((error) => {
        if (!isAuthError(error)) warn('Não foi possível salvar o progresso do imóvel:', error);
      })
      .finally(() => {
        inFlight = false;
        flush();
      });
  }

  function save(next) {
    queued = completedStepIds(next);
    flush();
  }

  function load(attempt) {
    return api.getStepProgress(propertyId)
      .then((data) => {
        if (stopped) return;
        const account = stepsFromCompleted(data?.completed);
        const local = readStoredSteps(storage, propertyId);
        let next = { ...local, ...account };
        pendingChanges.forEach((value, id) => { next = withStep(next, id, value); });
        pendingChanges.clear();
        loaded = true;
        emit(next);
        const hasLocal = Object.keys(local).length > 0;
        if (sameSteps(next, account)) {
          if (hasLocal) removeStoredSteps(storage, propertyId);
        } else {
          clearLocalAfterSave = hasLocal;
          save(next);
        }
      })
      .catch((error) => {
        if (stopped || isAuthError(error)) return;
        warn('Não foi possível carregar o progresso do imóvel:', error);
        if (attempt < retryDelays.length) {
          retryTimer = setTimeout(() => { load(attempt + 1); }, retryDelays[attempt]);
        }
      });
  }

  return {
    get done() { return done; },
    start: () => load(0),
    set(id, value) {
      const nextValue = value ?? !done[id];
      if (Boolean(done[id]) === nextValue) return;
      emit(withStep(done, id, nextValue));
      if (loaded) save(done);
      else pendingChanges.set(id, nextValue);
    },
    stop() {
      stopped = true;
      clearTimeout(retryTimer);
    },
  };
}
