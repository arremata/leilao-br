import assert from 'node:assert/strict';
import test from 'node:test';
import { listingBadges, occupancyStatus, paymentFacts } from './listingFacts.js';

test('occupancy uses the API value and falls back to the Caixa text', () => {
  assert.equal(occupancyStatus({ occupancy: 'vacant' }), 'vacant');
  assert.equal(occupancyStatus({ editalData: { occupancy: 'Desocupado' } }), 'vacant');
  assert.equal(occupancyStatus({ editalData: { occupancy: 'Ocupado' } }), 'occupied');
  assert.equal(occupancyStatus({ editalData: { occupancy: 'Não informado' } }), 'unknown');
  assert.equal(occupancyStatus({}), 'unknown');
});

test('payment facts follow the list the Caixa publishes', () => {
  assert.deepEqual(paymentFacts({ acceptsFgts: true, acceptsFinancing: false }), { fgts: true, financing: false });
  assert.deepEqual(
    paymentFacts({ editalData: { paymentMethods: 'Recursos próprios. Permite utilização de FGTS. Consulte condições e enquadramento' } }),
    { fgts: true, financing: false },
  );
  assert.deepEqual(
    paymentFacts({ editalData: { paymentMethods: 'Exclusivamente à vista (somente recursos próprios)' } }),
    { fgts: false, financing: false },
  );
  assert.deepEqual(paymentFacts({}), { fgts: null, financing: null });
});

test('badges always state occupancy and FGTS, and only add financing when it helps', () => {
  const labels = (p) => listingBadges(p).map(b => b.label);

  assert.deepEqual(
    labels({ occupancy: 'vacant', acceptsFgts: true, acceptsFinancing: true }),
    ['Desocupado', 'Aceita FGTS', 'Aceita financiamento'],
  );
  assert.deepEqual(
    labels({ occupancy: 'occupied', acceptsFgts: true, acceptsFinancing: false }),
    ['Ocupado', 'Aceita FGTS'],
  );
  assert.deepEqual(
    labels({ occupancy: 'occupied', acceptsFgts: false, acceptsFinancing: false }),
    ['Ocupado', 'Não aceita FGTS', 'Só à vista'],
  );
  assert.deepEqual(labels({}), ['Ocupação não informada', 'FGTS não informado']);
});
