import assert from 'node:assert/strict';
import test from 'node:test';
import { imageSourceForAttempt, propertyImageUrl } from './imageFallback.js';

test('serves Caixa catalog photos through the bounded same-origin route', () => {
  assert.equal(
    propertyImageUrl('https://venda-imoveis.caixa.gov.br/fotos/F144442043173221.jpg'),
    '/api/photos/caixa/F144442043173221.jpg',
  );
  assert.equal(
    propertyImageUrl('https://example.com/fotos/fachada.jpg'),
    'https://example.com/fotos/fachada.jpg',
  );
  assert.equal(propertyImageUrl('/photos/local.jpg'), '/photos/local.jpg');
});

test('retries an unavailable image once before showing its visual placeholder', () => {
  const src = 'https://venda-imoveis.caixa.gov.br/fotos/fachada.jpg?size=large#photo';

  assert.equal(imageSourceForAttempt(src, 0), '/api/photos/caixa/fachada.jpg?size=large#photo');
  assert.equal(
    imageSourceForAttempt(src, 1),
    '/api/photos/caixa/fachada.jpg?size=large&argos_retry=1#photo',
  );
  assert.equal(imageSourceForAttempt(src, 2), '');
});
