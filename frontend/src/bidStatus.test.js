import assert from 'node:assert/strict';
import test from 'node:test';

import { formatBidCheckedAt, officialBidStatus } from './bidStatus.js';

test('exposes a verified registered bid only for Caixa properties', () => {
  const property = {
    source: 'caixa',
    editalData: {
      bid: {
        status: 'registered',
        count: 16,
        highestAmount: 234000,
        fetchedAt: '2026-09-30T02:50:00+00:00',
        sourceLabel: 'Caixa',
        sourceUrl: 'https://venda-imoveis.caixa.gov.br/detail',
      },
    },
  };

  assert.deepEqual(officialBidStatus(property), {
    status: 'registered',
    count: 16,
    highestAmount: 234000,
    fetchedAt: '2026-09-30T02:50:00+00:00',
    sourceLabel: 'Caixa',
    sourceUrl: 'https://venda-imoveis.caixa.gov.br/detail',
  });
  assert.equal(officialBidStatus({ ...property, source: 'other' }), null);
});

test('keeps a confirmed zero separate from missing bid evidence', () => {
  assert.equal(officialBidStatus({ source: 'caixa', editalData: {} }), null);
  assert.deepEqual(officialBidStatus({
    source: 'caixa',
    editalData: { bid: { status: 'none', count: 0 } },
  }), {
    status: 'none',
    count: 0,
    highestAmount: null,
    fetchedAt: null,
    sourceLabel: 'Fonte oficial',
    sourceUrl: null,
  });
});

test('formats the consultation timestamp in Sao Paulo time', () => {
  assert.match(formatBidCheckedAt('2026-09-30T15:30:00+00:00'), /30\/09\/2026/);
  assert.match(formatBidCheckedAt('2026-09-30T15:30:00+00:00'), /12:30/);
});
