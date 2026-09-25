import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  aboveOneMillionBudget,
  emptyHousingProfile,
  filterHousingProperties,
  hasHousingBudget,
  housingBudgetLabel,
  housingCitySuggestions,
  validateHousingProfile,
} from './housingProfile.js';
import { readHousingProfile, saveHousingProfile } from './housingStorage.js';

const properties = [
  { id: 1, type: 'Apartamento', city: 'LONDRINA', neighborhood: 'CENTRO', minBid: 200000, beds: 2, parking: 1 },
  { id: 2, type: 'Casa', city: 'CURITIBA', neighborhood: 'CENTRO', minBid: 200000, beds: null, parking: null },
  { id: 3, type: 'Terreno', city: 'LONDRINA', minBid: 100000 },
  { id: 4, type: 'Casa', city: 'LONDRINA', neighborhood: 'CENTRO', minBid: null, beds: 2 },
  { id: 5, type: 'Apartamento', city: 'SAO PAULO', minBid: 1250000, beds: 3 },
];
const profile = patch => ({ ...emptyHousingProfile, ...patch });
test('normalizes location and excludes land from the housing search', () => {
  assert.deepEqual(filterHousingProperties(properties, profile({ city: ' londrina ', neighborhood: 'céntro' })).map(p => p.id), [1, 4]);
});
test('filters the selected property type', () => {
  assert.deepEqual(filterHousingProperties(properties, profile({ propertyType: 'Casa' })).map(p => p.id), [2, 4]);
});
test('budget choices cap the initial property price and reject unknown prices', () => {
  assert.deepEqual(filterHousingProperties(properties, profile({ budget: 199999 })), []);
  assert.deepEqual(filterHousingProperties(properties, profile({ budget: 200000 })).map(p => p.id), [1, 2]);
});
test('blank budget keeps properties with an unknown price in discovery', () => {
  assert.deepEqual(filterHousingProperties(properties, profile({ budget: '' })).map(p => p.id), [1, 2, 4, 5]);
});
test('above one million is a real price range', () => {
  assert.deepEqual(filterHousingProperties(properties, profile({ budget: aboveOneMillionBudget })).map(p => p.id), [5]);
  assert.equal(hasHousingBudget(aboveOneMillionBudget), true);
  assert.equal(hasHousingBudget(''), false);
});
test('rejects malformed profiles and unsafe numeric values', () => {
  for (const value of [[], null, { budget: -1 }, { budget: 'Infinity' }]) assert.equal(validateHousingProfile(value), null);
  assert.equal(validateHousingProfile({ city: 'Curitiba', secret: 'not kept' }).secret, undefined);
  assert.equal(validateHousingProfile({ city: 'Curitiba', reserve: 20000, beds: 2 }).reserve, undefined);
  assert.equal(validateHousingProfile({ city: 'x'.repeat(500) }).city.length, 300);
});
test('budget labels use the visible onboarding choices', () => {
  assert.equal(housingBudgetLabel('250000'), 'Até R$ 250 mil');
  assert.equal(housingBudgetLabel(aboveOneMillionBudget), 'Acima de R$ 1 milhão');
  assert.equal(housingBudgetLabel(''), 'Qualquer faixa');
});
test('city autocomplete ignores accents, removes duplicates and prioritizes prefixes', () => {
  const cities = ['São Paulo', 'SÃO PAULO', 'Santos', 'Curitiba', 'Londrina', '', null];
  assert.deepEqual(housingCitySuggestions(cities, 'sao'), ['São Paulo']);
  assert.deepEqual(housingCitySuggestions(cities, 'on'), ['Londrina']);
  assert.deepEqual(housingCitySuggestions(cities, '', 2), ['Curitiba', 'Londrina']);
  assert.deepEqual(housingCitySuggestions(null, 'cur'), []);
});
test('browser adapter removes retired fields while migrating a stored profile', () => {
  let stored;
  const storage = { getItem: () => stored, setItem: (_key, value) => { stored = value; } };
  stored = JSON.stringify({ version: 1, profile: { city: 'Londrina', budget: 250000, reserve: 20000, work: 'Centro' } });
  assert.equal(readHousingProfile(storage).city, 'Londrina');
  assert.equal(JSON.parse(stored).version, 2);
  assert.equal(JSON.parse(stored).profile.reserve, undefined);
  saveHousingProfile(profile({ city: 'Londrina', budget: 250000 }), storage);
  assert.equal(readHousingProfile(storage).budget, '250000');
  stored = '{broken';
  assert.equal(readHousingProfile(storage), null);
  stored = JSON.stringify({ version: 99, profile: profile() });
  assert.equal(readHousingProfile(storage), null);
});
test('persistence failure propagates instead of claiming the profile was saved', () => {
  const storage = { setItem: () => { throw new Error('Storage disabled'); } };
  assert.throws(() => saveHousingProfile(profile(), storage), /Storage disabled/);
});
