import assert from 'node:assert/strict';
import test from 'node:test';
import { budgetPlan, maxBidForBudget, totalForBid } from './bidBudget.js';

// Curitiba: ITBI 2,7%, comissão 5%, cartório 0,8%; desocupação 5 mil + reforma 10 mil.
const model = { rates: [0.027, 0.05, 0.008], fixed: 15_000 };

test('total follows the same per-line rounding as the cost table', () => {
  assert.equal(totalForBid(model, 100_000), 100_000 + 2_700 + 5_000 + 800 + 15_000);
});

test('the maximum bid never pushes the total above the budget', () => {
  for (const budget of [150_000, 200_000.5, 333_333, 1_000_001]) {
    const bid = maxBidForBudget(model, budget);
    assert.ok(totalForBid(model, bid) <= budget, `budget ${budget}`);
    assert.ok(totalForBid(model, bid + 1) > budget, `budget ${budget} leaves room`);
  }
});

test('a budget that cannot cover fixed costs allows no bid', () => {
  assert.equal(maxBidForBudget(model, 10_000), 0);
});

test('plan shows the room to bid above the initial value', () => {
  const plan = budgetPlan({ model, budget: 160_000, minBid: 124_509.18, bid: 124_509.18 });

  assert.equal(plan.hasBudget, true);
  assert.equal(plan.fits, true);
  assert.equal(plan.maxBid, maxBidForBudget(model, 160_000));
  assert.equal(plan.headroom, plan.maxBid - 124_509.18);
  assert.equal(plan.leftover, 160_000 - plan.total);
  assert.equal(plan.shortfall, 0);
});

test('plan says how much is missing when the initial value does not fit', () => {
  const plan = budgetPlan({ model, budget: 120_000, minBid: 124_509.18 });

  assert.equal(plan.fits, false);
  assert.equal(plan.headroom, 0);
  assert.equal(plan.shortfall, plan.minTotal - 120_000);
});

test('without a budget, still shows the total at the initial value', () => {
  const plan = budgetPlan({ model, budget: null, minBid: 100_000 });

  assert.equal(plan.hasBudget, false);
  assert.equal(plan.minTotal, 123_500);
  assert.equal(plan.costs, 23_500);
});
