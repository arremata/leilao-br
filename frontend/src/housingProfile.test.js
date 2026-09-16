import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyHousingProfile, filterHousingProperties, validateHousingProfile } from './housingProfile.js';
import { readHousingProfile, saveHousingProfile } from './housingStorage.js';

const properties = [
  { id: 1, type: 'Apartamento', city: 'LONDRINA', neighborhood: 'CENTRO', minBid: 200000, beds: 2, parking: 1 },
  { id: 2, type: 'Casa', city: 'CURITIBA', neighborhood: 'CENTRO', minBid: 200000, beds: null, parking: null },
  { id: 3, type: 'Terreno', city: 'LONDRINA', minBid: 100000 },
  { id: 4, type: 'Casa', city: 'LONDRINA', neighborhood: 'CENTRO', minBid: null, beds: 2 },
];
const profile = patch => ({ ...emptyHousingProfile, ...patch });
test('normalizes location and excludes land from the housing search', () => {
  assert.deepEqual(filterHousingProperties(properties, profile({ city: ' londrina ', neighborhood: 'céntro' })).map(p => p.id), [1, 4]);
});
test('requires known bedroom and parking counts when marked essential', () => {
  assert.deepEqual(filterHousingProperties(properties, profile({ beds: 2, parking: 1 })).map(p => p.id), [1]);
});
test('budget includes the reserve and never treats unknown price as zero', () => {
  assert.deepEqual(filterHousingProperties(properties, profile({ budget: 220000, reserve: 30000 })), []);
  assert.deepEqual(filterHousingProperties(properties, profile({ budget: 230000, reserve: 30000 })).map(p => p.id), [1, 2]);
});
test('blank reserve prevents an unsupported all-in budget classification', () => {
  assert.deepEqual(filterHousingProperties(properties, profile({ budget: 100000, reserve: '' })).map(p => p.id), [1, 2, 4]);
});
test('explicit zero reserve is distinct from unknown reserve', () => {
  assert.deepEqual(filterHousingProperties(properties, profile({ budget: 200000, reserve: 0 })).map(p => p.id), [1, 2]);
});
test('routine and financing preferences do not silently filter by unavailable data', () => {
  assert.deepEqual(filterHousingProperties(properties, profile({ payment: 'Com financiamento', work: 'Centro', commute: '15' })).map(p => p.id), [1, 2, 4]);
});
test('rejects malformed profiles and unsafe numeric values', () => {
  for (const value of [[], null, { budget: -1 }, { reserve: 'abc' }, { monthly: 'Infinity' }]) assert.equal(validateHousingProfile(value), null);
  assert.equal(validateHousingProfile({ city: 'Curitiba', secret: 'not kept' }).secret, undefined);
  assert.equal(validateHousingProfile({ city: 'x'.repeat(500) }).city.length, 300);
});
test('browser adapter round-trips a versioned profile and ignores corrupt storage', () => {
  let stored;
  const storage = { getItem: () => stored, setItem: (_key, value) => { stored = value; } };
  saveHousingProfile(profile({ city: 'Londrina', budget: 250000, reserve: 20000 }), storage);
  assert.equal(readHousingProfile(storage).city, 'Londrina');
  stored = '{broken';
  assert.equal(readHousingProfile(storage), null);
  stored = JSON.stringify({ version: 99, profile: profile() });
  assert.equal(readHousingProfile(storage), null);
});
test('persistence failure propagates instead of claiming the profile was saved', () => {
  const storage = { setItem: () => { throw new Error('Storage disabled'); } };
  assert.throws(() => saveHousingProfile(profile(), storage), /Storage disabled/);
});
