import assert from 'node:assert/strict';
import test from 'node:test';
import {
  catalogDeadline,
  currentPriceDate,
  sfiAuctionPricing,
} from './auctionPricing.js';

test('uses the second-round price and date when the second round is current', () => {
  const pricing = sfiAuctionPricing({
    praca: '2ª praça',
    minBid: 230_100.35,
    firstAuctionPrice: 344_000,
    secondAuctionPrice: 230_100.35,
    firstAuctionAt: '2026-09-28T10:00:00-03:00',
    secondAuctionAt: '2026-10-02T10:00:00-03:00',
  });

  assert.deepEqual(pricing.current, {
    round: 2,
    price: 230_100.35,
    date: '2026-10-02T10:00:00-03:00',
  });
  assert.deepEqual(pricing.previous, {
    round: 1,
    price: 344_000,
    date: '2026-09-28T10:00:00-03:00',
  });
  assert.equal(pricing.upcoming, null);
});

test('keeps the second round as the next event while the first is current', () => {
  const pricing = sfiAuctionPricing({
    praca: '1ª praça',
    minBid: 344_000,
    firstAuctionPrice: 344_000,
    secondAuctionPrice: 230_100.35,
    firstAuctionAt: '2026-09-28T10:00:00-03:00',
    secondAuctionAt: '2026-10-02T10:00:00-03:00',
  });

  assert.equal(pricing.current.round, 1);
  assert.equal(pricing.current.price, 344_000);
  assert.equal(pricing.previous, null);
  assert.equal(pricing.upcoming.price, 230_100.35);
});

test('falls back to the API current minimum if the second-round detail is missing', () => {
  const pricing = sfiAuctionPricing({
    praca: '2ª praça',
    minBid: 230_100.35,
    firstAuctionPrice: 344_000,
    secondAuctionAt: '2026-10-02T10:00:00-03:00',
  });

  assert.equal(pricing.current.price, 230_100.35);
  assert.equal(pricing.current.date, '2026-10-02T10:00:00-03:00');
});

test('an explicit missing catalog deadline cannot revive a stale analysis date', () => {
  assert.equal(catalogDeadline(
    { endsAt: null },
    { endsAt: '2026-09-02T10:00:00-03:00' },
  ), null);
  assert.equal(catalogDeadline(
    {},
    { endsAt: '2026-10-03T18:00:00-03:00' },
  ), '2026-10-03T18:00:00-03:00');
});

test('direct-sale price never displays a historical auction date', () => {
  assert.equal(currentPriceDate({
    modalidade: 'Venda Direta Online',
    firstAuctionAt: '2026-09-02T10:00:00-03:00',
  }), null);
  assert.equal(currentPriceDate({
    modalidade: 'Licitação Aberta',
    firstAuctionAt: '2026-10-05T10:00:00-03:00',
  }), '2026-10-05T10:00:00-03:00');
});
