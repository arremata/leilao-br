import test from 'node:test';
import assert from 'node:assert/strict';
import {
  catalogSaleDetailVisibility,
  filterBySaleKind,
  interleaveBySaleKind,
  saleKindFromParam,
  saleKindToParam,
} from './catalogFilters.js';

const auction = (id) => ({ id, modalidade: 'Leilão SFI' });
const direct = (id) => ({ id, modalidade: 'Venda Direta Online' });

test('shows only meaningful auction detail filters', () => {
  assert.deepEqual(
    catalogSaleDetailVisibility('auction', ['Todos', '1ª rodada'], ['Todos', 'Leilão SFI', 'Licitação Aberta']),
    { showPraca: true, showModalidade: true, showGroup: true },
  );

  assert.deepEqual(
    catalogSaleDetailVisibility('auction', ['Todos'], ['Todos', 'Leilão SFI']),
    { showPraca: false, showModalidade: false, showGroup: false },
  );
});

test('keeps auction details available while both sale types are listed', () => {
  assert.deepEqual(
    catalogSaleDetailVisibility('all', ['Todos', '1ª rodada'], ['Todos', 'Leilão SFI', 'Venda Direta Online']),
    { showPraca: true, showModalidade: true, showGroup: true },
  );
});

test('hides auction-only details during direct purchase', () => {
  assert.deepEqual(
    catalogSaleDetailVisibility('direct', ['Todos', '1ª rodada'], ['Todos', 'Venda direta', 'Venda online']),
    { showPraca: false, showModalidade: false, showGroup: false },
  );
});

test('opens with both sale types and keeps old links working', () => {
  assert.equal(saleKindFromParam(null), 'all');
  assert.equal(saleKindFromParam('todos'), 'all');
  assert.equal(saleKindFromParam('qualquer-coisa'), 'all');
  assert.equal(saleKindFromParam('leiloes'), 'auction');
  assert.equal(saleKindFromParam('direta'), 'direct');
  for (const kind of ['all', 'auction', 'direct']) {
    assert.equal(saleKindFromParam(saleKindToParam(kind)), kind);
  }
});

test('filters by sale type only when one is chosen', () => {
  const catalog = [auction('a1'), direct('d1'), auction('a2')];
  assert.deepEqual(filterBySaleKind(catalog, 'all').map(p => p.id), ['a1', 'd1', 'a2']);
  assert.deepEqual(filterBySaleKind(catalog, 'auction').map(p => p.id), ['a1', 'a2']);
  assert.deepEqual(filterBySaleKind(catalog, 'direct').map(p => p.id), ['d1']);
});

test('interleaves both sale types from the top, preserving each order', () => {
  // Leilões com data vêm todos antes na relevância; sem intercalar, a compra
  // direta ficaria escondida depois de várias páginas.
  const sorted = [auction('a1'), auction('a2'), auction('a3'), direct('d1'), direct('d2')];
  assert.deepEqual(
    interleaveBySaleKind(sorted).map(p => p.id),
    ['a1', 'd1', 'a2', 'd2', 'a3'],
  );
  assert.deepEqual(interleaveBySaleKind([direct('d1'), direct('d2')]).map(p => p.id), ['d1', 'd2']);
  assert.deepEqual(interleaveBySaleKind([]), []);
});
