import { test } from 'node:test';
import assert from 'node:assert/strict';
import { apiErrorMessage } from './auth/api.js';

test('keeps explicit API errors and explains profile validation fields', () => {
  assert.equal(apiErrorMessage({ detail: 'Cidade obrigatória' }), 'Cidade obrigatória');
  assert.equal(apiErrorMessage({ detail: [
    { loc: ['body', 'budget'], msg: 'Input should be a valid string' },
  ] }), 'Escolha uma faixa de preço para concluir seu perfil.');
  assert.equal(apiErrorMessage({ detail: [
    { loc: ['body', 'property_type'], msg: 'Field required' },
  ] }), 'Escolha um tipo de imóvel válido para continuar.');
});
