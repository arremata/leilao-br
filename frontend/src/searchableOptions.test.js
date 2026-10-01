import test from 'node:test';
import assert from 'node:assert/strict';
import {
  exactSearchOption,
  matchingSearchOptions,
  uniqueSearchOptions,
} from './searchableOptions.js';

test('searchable options remove duplicate spellings and prioritize prefix matches', () => {
  const options = ['CURITIBA', 'São José dos Pinhais', 'curitiba', 'Pinhais', 'Campina Grande do Sul'];

  assert.deepEqual(uniqueSearchOptions(options), [
    'Campina Grande do Sul', 'CURITIBA', 'Pinhais', 'São José dos Pinhais',
  ]);
  assert.deepEqual(matchingSearchOptions(options, 'pinh'), ['Pinhais', 'São José dos Pinhais']);
});

test('searchable options accept accents and limit the menu only when asked', () => {
  const options = ['Maringá', 'Curitiba', 'Londrina'];

  assert.equal(exactSearchOption(options, 'maringa'), 'Maringá');
  assert.deepEqual(matchingSearchOptions(options, '', 2), ['Curitiba', 'Londrina']);
});

test('searchable options list every city when the query is empty', () => {
  const options = Array.from({ length: 30 }, (_, index) => `Cidade ${String(index).padStart(2, '0')}`);

  assert.equal(matchingSearchOptions(options, '').length, 30);
});
