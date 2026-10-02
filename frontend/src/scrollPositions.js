// Posição de rolagem de cada entrada do histórico desta guia.
//
// Fica na sessionStorage: some ao fechar a guia, sobrevive a recarregar e não
// passa de uma guia para outra.

const STORAGE_KEY = 'argos:scroll';
const MAX_ENTRIES = 50;

export function readScrollPositions(storage = globalThis.sessionStorage) {
  try {
    const stored = JSON.parse(storage?.getItem(STORAGE_KEY) || '{}');
    return stored && typeof stored === 'object' && !Array.isArray(stored) ? stored : {};
  } catch {
    return {};
  }
}

/** Grava as posições, mantendo só as entradas mais recentes. */
export function writeScrollPositions(positions, storage = globalThis.sessionStorage) {
  const keys = Object.keys(positions);
  for (const key of keys.slice(0, Math.max(0, keys.length - MAX_ENTRIES))) delete positions[key];
  try {
    storage?.setItem(STORAGE_KEY, JSON.stringify(positions));
  } catch { /* segue só em memória */ }
}
