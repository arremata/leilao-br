import assert from 'node:assert/strict';
import test from 'node:test';
import { CAIXA_SBPE, installments, maxFinanced, simulateFinancing } from './financing.js';

const close = (actual, expected, tolerance = 0.01) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} ≈ ${expected}`);

test('SAC: amortização fixa, primeira parcela maior que a última', () => {
  // R$ 120.000 em 120 meses a 12% a.a. nominal = 1% a.m.
  const plan = installments({ principal: 120_000, months: 120, annualRate: 0.12, system: 'SAC' });
  close(plan.first, 1_000 + 1_200);
  close(plan.last, 1_000 + 10);
  close(plan.totalInterest, 120_000 * 0.01 * 121 / 2);
});

test('PRICE: parcela fixa pela fórmula da tabela Price', () => {
  const plan = installments({ principal: 100_000, months: 360, annualRate: 0.12, system: 'PRICE' });
  close(plan.first, 1_028.61);
  assert.equal(plan.first, plan.last);
});

test('a Caixa financia sobre o menor entre o lance e a avaliação', () => {
  assert.equal(maxFinanced({ price: 200_000, appraisal: 300_000, system: 'SAC' }), 160_000);
  assert.equal(maxFinanced({ price: 300_000, appraisal: 200_000, system: 'SAC' }), 160_000);
  assert.equal(maxFinanced({ price: 200_000, appraisal: 300_000, system: 'PRICE' }), 140_000);
});

test('entrada nunca fica abaixo do mínimo da cota', () => {
  const sim = simulateFinancing({ price: 200_000, appraisal: 300_000, downPayment: 10_000, months: 420, annualRate: CAIXA_SBPE.annualRate });
  assert.equal(sim.minDown, 40_000);
  assert.equal(sim.down, 40_000);
  assert.equal(sim.principal, 160_000);
});

test('dinheiro no dia: entrada menos FGTS mais custos da compra', () => {
  const sim = simulateFinancing({
    price: 200_000, appraisal: 300_000, costs: 25_000, downPayment: 50_000, fgts: 30_000,
    months: 420, annualRate: CAIXA_SBPE.annualRate,
  });
  assert.equal(sim.fgtsUsed, 30_000);
  assert.equal(sim.cashAtPurchase, 50_000 - 30_000 + 25_000);
});

test('renda mínima é a parcela com tarifa dividida por 30%', () => {
  const sim = simulateFinancing({ price: 200_000, appraisal: 300_000, months: 420, annualRate: 0.12, income: 5_000 });
  close(sim.minIncome, sim.firstWithFee / 0.3);
  assert.equal(sim.incomeFits, sim.firstWithFee <= 1_500);
});

test('FGTS não passa do valor da entrada', () => {
  const sim = simulateFinancing({ price: 100_000, appraisal: 100_000, fgts: 500_000, months: 420, annualRate: 0.12 });
  assert.equal(sim.fgtsUsed, sim.down);
});
