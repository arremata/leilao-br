import test from 'node:test';
import assert from 'node:assert/strict';
import { exactCity, matchingCities, uniqueCities } from './cityAutocomplete.js';

test('city autocomplete removes duplicate spellings and prioritizes prefix matches', () => {
  const cities = ['CURITIBA', 'São José dos Pinhais', 'curitiba', 'Pinhais', 'Campina Grande do Sul'];

  assert.deepEqual(uniqueCities(cities), [
    'Campina Grande do Sul', 'CURITIBA', 'Pinhais', 'São José dos Pinhais',
  ]);
  assert.deepEqual(matchingCities(cities, 'pinh'), ['Pinhais', 'São José dos Pinhais']);
});

test('city autocomplete accepts accents and limits the initial menu', () => {
  const cities = ['Maringá', 'Curitiba', 'Londrina'];

  assert.equal(exactCity(cities, 'maringa'), 'Maringá');
  assert.deepEqual(matchingCities(cities, '', 2), ['Curitiba', 'Londrina']);
});
