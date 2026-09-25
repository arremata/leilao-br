import { currencyInputValue } from './currencyInput.js';

export const catalogBudgetKey = 'argos_catalog_budget_v1';

export function readCatalogBudget(storage = window.localStorage) {
  try {
    return currencyInputValue(storage.getItem(catalogBudgetKey));
  } catch {
    return '';
  }
}

export function saveCatalogBudget(value, storage = window.localStorage) {
  const normalized = currencyInputValue(value);
  try {
    if (normalized) storage.setItem(catalogBudgetKey, normalized);
    else storage.removeItem(catalogBudgetKey);
  } catch {
    // The active URL filter remains usable when browser storage is unavailable.
  }
  return normalized;
}
