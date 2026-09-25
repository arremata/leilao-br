import test from 'node:test';
import assert from 'node:assert/strict';
import { catalogSaleDetailVisibility } from './catalogFilters.js';

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

test('hides auction-only details during direct purchase', () => {
  assert.deepEqual(
    catalogSaleDetailVisibility('direct', ['Todos', '1ª rodada'], ['Todos', 'Venda direta', 'Venda online']),
    { showPraca: false, showModalidade: false, showGroup: false },
  );
});
