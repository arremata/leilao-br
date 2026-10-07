import assert from 'node:assert/strict';
import test from 'node:test';
import { auctionSchedule } from './auctionRounds.js';
import { listingTitle, listingLocation, listingPrice, listingStreet, roundDifference, listingMoney } from './listingPresentation.js';

const property = {
  type: 'Apartamento', area: 46.97, title: 'Apartamento, RUA ANTONIO KUSS', address: 'RUA ANTONIO KUSS, 260',
  modalidade: 'Leilão SFI', firstAuctionPrice: 230000, secondAuctionPrice: 138000,
  firstAuctionAt: '2026-10-08T10:00:00-03:00', secondAuctionAt: '2026-10-15T10:00:00-03:00', minBid: 230000,
};

test('listing location shows neighborhood, city and state without the street address', () => {
  assert.equal(listingLocation({ ...property, city: ' SÃO JOSÉ DOS PINHAIS ', uf: 'pr', neighborhood: ' QUEIMADA ' }), 'Queimada · São José dos Pinhais · PR');
  assert.equal(listingLocation({ ...property, city: 'CURITIBA', uf: 'PR', neighborhood: ' ' }), 'Curitiba · PR');
  assert.equal(listingLocation(property), 'Cidade não informada');
});

test('listing title never falls back to an address-bearing source title', () => {
  assert.equal(listingTitle(property), 'Apartamento de 46,97 m²');
  assert.equal(listingTitle({ ...property, area: 0 }), 'Apartamento');
  assert.equal(listingTitle({ address: property.address, title: property.title }), 'Imóvel');
});

test('main price follows the current round, without advertising a future round as current', () => {
  assert.equal(listingPrice(property, auctionSchedule(property, Date.parse('2026-10-06'))), 230000);
  assert.equal(listingPrice(property, auctionSchedule(property, Date.parse('2026-10-10'))), 138000);
});

test('difference compares second round to first rather than appraisal or market', () => {
  const schedule = auctionSchedule({ ...property, appraisal: 400000, market: 500000 });
  assert.deepEqual(roundDifference(schedule), { amount: -92000, tone: 'less', percentage: '−40%' });
  assert.equal(roundDifference({ ...schedule, rounds: [{ price: 100000 }, { price: 150000 }] }).percentage, '+50%');
  assert.equal(roundDifference({ ...schedule, rounds: [{ price: 100000 }, { price: 150000 }] }).tone, 'more');
  assert.equal(roundDifference({ ...schedule, rounds: [{ price: 100000 }, { price: 100000 }] }).tone, 'equal');
});

test('unpublished prices do not produce fabricated zero prices or discounts', () => {
  assert.equal(roundDifference({ kind: 'rounds', rounds: [{ price: 230000 }, { price: null }] }), null);
  assert.equal(roundDifference({ kind: 'none' }), null);
  assert.equal(listingMoney(null), 'A publicar');
  assert.equal(listingMoney(0), 'A publicar');
});

test('street keeps abbreviations and numbers as published', () => {
  assert.equal(listingStreet('RUA ANTONIO KUSS, N. 260, Apto 304, BL N'), 'Rua Antonio Kuss, N. 260, Apto 304, BL N');
  assert.equal(listingStreet('AVENIDA DAS TORRES DE SÃO JOSÉ, SN'), 'Avenida das Torres de São José, SN');
  assert.equal(listingStreet(''), '');
});

test('location does not repeat a state already appended to the city', () => {
  assert.equal(listingLocation({ neighborhood: 'QUEIMADA', city: 'SAO JOSE DOS PINHAIS, PR', uf: 'PR' }), 'Queimada · Sao Jose dos Pinhais · PR');
});
