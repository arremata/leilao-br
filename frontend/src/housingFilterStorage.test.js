import test from 'node:test';
import assert from 'node:assert/strict';
import {
  catalogBudgetKey,
  readCatalogBudget,
  saveCatalogBudget,
} from './housingFilterStorage.js';

function memoryStorage() {
  const values = new Map();
  return {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: key => values.delete(key),
  };
}

test('catalog budget is normalized and remembered in this browser', () => {
  const storage = memoryStorage();

  assert.equal(readCatalogBudget(storage), '');
  assert.equal(saveCatalogBudget('R$ 275.000', storage), '275000');
  assert.equal(storage.getItem(catalogBudgetKey), '275000');
  assert.equal(readCatalogBudget(storage), '275000');
});

test('clearing the catalog budget removes the remembered value', () => {
  const storage = memoryStorage();
  saveCatalogBudget('275000', storage);

  assert.equal(saveCatalogBudget('', storage), '');
  assert.equal(storage.getItem(catalogBudgetKey), null);
});

test('storage restrictions do not prevent using the active budget filter', () => {
  const blocked = {
    getItem: () => { throw new Error('blocked'); },
    setItem: () => { throw new Error('blocked'); },
  };

  assert.equal(readCatalogBudget(blocked), '');
  assert.equal(saveCatalogBudget('180000', blocked), '180000');
});
