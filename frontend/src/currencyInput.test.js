import test from 'node:test';
import assert from 'node:assert/strict';
import { currencyInputValue, formatBRLCurrencyInput } from './currencyInput.js';

test('currency input stores integer reais and formats them for Brazil', () => {
  assert.equal(currencyInputValue('R$ 250.000'), '250000');
  assert.equal(formatBRLCurrencyInput('250000'), 'R$ 250.000');
  assert.equal(formatBRLCurrencyInput('1000000'), 'R$ 1.000.000');
});

test('currency input accepts pasted cents, leading zeros and an empty value', () => {
  assert.equal(currencyInputValue('R$ 250.000,00'), '250000');
  assert.equal(currencyInputValue('000125000'), '125000');
  assert.equal(currencyInputValue(''), '');
  assert.equal(formatBRLCurrencyInput('0'), '');
});
