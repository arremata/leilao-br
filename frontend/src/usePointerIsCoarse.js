import { useSyncExternalStore } from 'react';

const QUERY = '(pointer: coarse)';

function subscribe(callback) {
  if (typeof window === 'undefined' || !window.matchMedia) return () => {};
  const mql = window.matchMedia(QUERY);
  mql.addEventListener('change', callback);
  return () => mql.removeEventListener('change', callback);
}

function getSnapshot() {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia(QUERY).matches;
}

/**
 * True quando o ponteiro principal é o dedo.
 *
 * Serve para decidir se abrir um imóvel em guia nova. Pergunta pelo ponteiro em
 * vez de inferir por largura: uma janela estreita no computador continua sendo
 * um computador, e um tablet largo continua sendo toque.
 */
export function usePointerIsCoarse() {
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}
