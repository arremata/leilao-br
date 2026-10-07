import test from 'node:test';
import assert from 'node:assert/strict';
import { appraisalGap, propertySummaryModel, roundDateLabel, summaryMoney } from './propertySummaryModel.js';

const first = { modalidade: 'Leilão SFI', praca: '1ª praça', minBid: 230000, firstAuctionPrice: 230000, secondAuctionPrice: 138000, firstAuctionAt: '2026-10-08', secondAuctionAt: '2026-10-15', appraisal: 230000 };
const schedule = { rounds: [{ round: 1, state: 'current' }, { round: 2, state: 'upcoming' }] };
test('summary keeps round dates and prices together and compares second to first', () => {
  const m = propertySummaryModel(first, schedule, false);
  assert.equal(m.rounds[0].date, first.firstAuctionAt);
  assert.equal(m.rounds[1].price, 138000);
  assert.equal(m.difference, -92000);
  assert.equal(m.appraisalMatch.round, 1);
});
test('second current keeps its own price and identifies ended first', () => {
  const m = propertySummaryModel({ ...first, praca: '2ª praça', minBid: 138000 }, { rounds: [{ round: 1, state: 'ended' }, { round: 2, state: 'current' }] }, false);
  assert.equal(m.rounds[0].price, 138000);
  assert.equal(m.rounds[0].date, first.secondAuctionAt);
  assert.match(m.rounds[1].label, /encerrada/);
  assert.equal(m.difference, -92000);
});
test('missing second price never creates a fake discount', () => {
  const m = propertySummaryModel({ ...first, secondAuctionPrice: null }, schedule, false);
  assert.equal(m.difference, null);
  assert.equal(m.rounds[1].price, null);
});
test('more expensive second round is an increase', () => {
  assert.equal(propertySummaryModel({ ...first, secondAuctionPrice: 250000 }, schedule, false).difference, 20000);
});
test('direct sale and open tender have only one price', () => {
  for (const [modalidade, direct] of [['Venda direta', true], ['Licitação aberta', false]]) {
    const m = propertySummaryModel({ ...first, modalidade }, {}, direct);
    assert.equal(m.rounds.length, 1);
    assert.equal(m.difference, null);
  }
});
test('both ended rounds never advertise a current round', () => {
  const m = propertySummaryModel(first, { rounds: [{ round: 1, state: 'ended' }, { round: 2, state: 'ended' }] }, false);
  assert.ok(m.rounds.every(round => round.label.includes('encerrada')));
});

test('rounds carry their state and the gap to the appraisal', () => {
  const m = propertySummaryModel(first, schedule, false);
  assert.equal(m.current.round, 1);
  assert.equal(m.rounds[0].appraisalGap.tone, 'equal');
  assert.deepEqual([m.rounds[1].state, m.rounds[1].appraisalGap.tone, m.rounds[1].appraisalGap.percent], ['upcoming', 'less', '40']);
  assert.equal(propertySummaryModel({ ...first, appraisal: null }, schedule, false).rounds[1].appraisalGap, null);
});
test('ended auction has no current round to highlight', () => {
  const m = propertySummaryModel(first, { rounds: [{ round: 1, state: 'ended' }, { round: 2, state: 'ended' }] }, false);
  assert.equal(m.current, null);
});
test('money hides only zero cents and dates use Brasília time', () => {
  assert.equal(summaryMoney(230000), 'R$ 230.000');
  assert.equal(summaryMoney(138000.5), 'R$ 138.000,50');
  assert.equal(summaryMoney(0), 'A publicar');
  assert.equal(roundDateLabel('2026-10-08T13:00:00Z'), '08 out. · 10:00');
  assert.equal(appraisalGap(250000, 230000).tone, 'more');
});
