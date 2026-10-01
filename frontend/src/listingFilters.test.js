import test from 'node:test';
import assert from 'node:assert/strict';
import {
  activeListingFilterCount,
  emptyListingFilters,
  filterByListingFacts,
  listingFiltersFromSearchParams,
  listingSearchParamsWithFilter,
} from './listingFilters.js';

const properties = [
  { id: 1, occupancy: 'vacant', acceptsFgts: true, acceptsFinancing: true },
  { id: 2, occupancy: 'occupied', acceptsFgts: true, acceptsFinancing: false },
  { id: 3, occupancy: 'unknown', acceptsFgts: false, acceptsFinancing: false },
  { id: 4, occupancy: 'vacant' },
];
const ids = (list) => list.map(p => p.id);

test('no filter keeps every property', () => {
  assert.equal(filterByListingFacts(properties, emptyListingFilters), properties);
});

test('occupancy only keeps what the Caixa states', () => {
  assert.deepEqual(ids(filterByListingFacts(properties, { ...emptyListingFilters, occupancy: 'vacant' })), [1, 4]);
  assert.deepEqual(ids(filterByListingFacts(properties, { ...emptyListingFilters, occupancy: 'occupied' })), [2]);
});

test('payment filters never treat missing information as accepted', () => {
  assert.deepEqual(ids(filterByListingFacts(properties, { ...emptyListingFilters, fgts: true })), [1, 2]);
  assert.deepEqual(ids(filterByListingFacts(properties, { ...emptyListingFilters, financing: true })), [1]);
  assert.deepEqual(ids(filterByListingFacts(properties, { occupancy: 'occupied', fgts: true, financing: true })), []);
});

test('filters round-trip through the address and reset the page', () => {
  let params = new URLSearchParams('cidade=Curitiba&pagina=3');
  params = listingSearchParamsWithFilter(params, 'occupancy', 'vacant');
  params = listingSearchParamsWithFilter(params, 'fgts', true);
  assert.equal(params.toString(), 'cidade=Curitiba&ocupacao=desocupado&fgts=sim');
  const filters = listingFiltersFromSearchParams(params);
  assert.deepEqual(filters, { occupancy: 'vacant', fgts: true, financing: false });
  assert.equal(activeListingFilterCount(filters), 2);

  params = listingSearchParamsWithFilter(params, 'occupancy', 'any');
  params = listingSearchParamsWithFilter(params, 'fgts', false);
  assert.equal(params.toString(), 'cidade=Curitiba');
});

test('unknown values in the address are ignored', () => {
  assert.deepEqual(listingFiltersFromSearchParams(new URLSearchParams('ocupacao=talvez&fgts=1')), emptyListingFilters);
});
