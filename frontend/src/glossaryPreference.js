import { useSyncExternalStore } from 'react';

// Liga e desliga os balões do dicionário. Quem já conhece os termos desliga
// no menu; a escolha fica neste aparelho. Sem `localStorage` (aba privada,
// dados bloqueados), vale só enquanto a página estiver aberta.
const STORAGE_KEY = 'argos_glossary';
const listeners = new Set();
let memory = null;

function read() {
  if (memory !== null) return memory;
  try {
    memory = window.localStorage.getItem(STORAGE_KEY) !== 'off';
  } catch {
    memory = true;
  }
  return memory;
}

export function setGlossaryEnabled(enabled) {
  memory = Boolean(enabled);
  try {
    if (memory) window.localStorage.removeItem(STORAGE_KEY);
    else window.localStorage.setItem(STORAGE_KEY, 'off');
  } catch {
    // Sem armazenamento: a escolha vale até fechar a página.
  }
  listeners.forEach(listener => listener());
}

function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** true quando os balões do dicionário estão ligados (o padrão). */
export function useGlossaryEnabled() {
  return useSyncExternalStore(subscribe, read, () => true);
}
