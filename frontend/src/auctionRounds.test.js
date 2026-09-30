import assert from 'node:assert/strict';
import test from 'node:test';
import { auctionSchedule } from './auctionRounds.js';

// Imóvel 774 do catálogo (Alameda Bom Pastor, São José dos Pinhais).
const sfi = {
  modalidade: 'Leilão SFI',
  praca: '2ª praça',
  minBid: 206_996.67,
  firstAuctionPrice: 237_000,
  secondAuctionPrice: 206_996.67,
  firstAuctionAt: '2026-09-28T10:00:00-03:00',
  secondAuctionAt: '2026-10-02T10:00:00-03:00',
  endsAt: '2026-10-02T10:00:00-03:00',
};
const at = (iso) => new Date(iso).getTime();

test('before the first round, the first round is current and the second is announced', () => {
  const schedule = auctionSchedule({ ...sfi, praca: '1ª praça' }, at('2026-09-27T12:00:00-03:00'));

  assert.equal(schedule.kind, 'rounds');
  assert.deepEqual(schedule.rounds.map(r => r.state), ['current', 'upcoming']);
  assert.equal(schedule.headline.label, '1ª rodada termina em');
  assert.equal(schedule.headline.until, at(sfi.firstAuctionAt));
  assert.match(schedule.headline.note, /^Se não vender, 2ª rodada em 2 de out/);
});

test('after the first round, says which round ended and counts down to the second', () => {
  const schedule = auctionSchedule(sfi, at('2026-09-30T15:00:00-03:00'));

  assert.deepEqual(schedule.rounds.map(r => r.state), ['ended', 'current']);
  assert.equal(schedule.current.round, 2);
  assert.equal(schedule.current.price, 206_996.67);
  assert.equal(schedule.rounds[0].price, 237_000);
  assert.equal(schedule.headline.label, '2ª rodada termina em');
  assert.equal(schedule.headline.until, at(sfi.secondAuctionAt));
  assert.match(schedule.headline.note, /^1ª rodada encerrada em 28 de set/);
  assert.equal(schedule.ended, false);
});

test('uses the viewer clock even when the API still reports the first round', () => {
  const schedule = auctionSchedule({ ...sfi, praca: '1ª praça' }, at('2026-09-29T09:00:00-03:00'));

  assert.equal(schedule.current.round, 2);
  assert.equal(schedule.headline.label, '2ª rodada termina em');
});

test('after both rounds, names both instead of a bare "Encerrado"', () => {
  const schedule = auctionSchedule(sfi, at('2026-10-03T09:00:00-03:00'));

  assert.equal(schedule.ended, true);
  assert.deepEqual(schedule.rounds.map(r => r.state), ['ended', 'ended']);
  assert.equal(schedule.headline.label, 'Leilão encerrado');
  assert.equal(schedule.headline.short, '2ª rodada encerrada');
  assert.match(schedule.headline.note, /1ª rodada em 28 de set.* e 2ª rodada em 2 de out.* já aconteceram/);
});

test('a first round without a published second round is reported as such', () => {
  const schedule = auctionSchedule(
    { ...sfi, praca: '1ª praça', secondAuctionAt: null, secondAuctionPrice: null },
    at('2026-09-29T09:00:00-03:00'),
  );

  assert.equal(schedule.ended, true);
  assert.equal(schedule.headline.label, '1ª rodada encerrada');
  assert.match(schedule.headline.note, /2ª rodada ainda não foi publicada/);
});

test('open tenders say plainly that there is a single round', () => {
  const tender = { modalidade: 'Licitação Aberta', endsAt: '2026-10-05T10:00:00-03:00' };

  const open = auctionSchedule(tender, at('2026-10-01T10:00:00-03:00'));
  assert.equal(open.kind, 'single');
  assert.equal(open.isOpenTender, true);
  assert.equal(open.headline.label, 'Rodada única termina em');
  assert.equal(open.headline.short, 'Rodada única');
  assert.match(open.headline.note, /não existe 2ª rodada/);

  const closed = auctionSchedule(tender, at('2026-10-06T10:00:00-03:00'));
  assert.equal(closed.headline.label, 'Rodada única encerrada');
  assert.match(closed.headline.note, /^Encerrou em 5 de out/);
});

test('direct sales have no countdown', () => {
  const schedule = auctionSchedule({ modalidade: 'Venda Direta Online' });

  assert.equal(schedule.kind, 'none');
  assert.equal(schedule.headline.until, null);
});
