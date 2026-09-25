import assert from 'node:assert/strict';
import test from 'node:test';
import { imageSourceForAttempt } from './imageFallback.js';

test('retries an unavailable image once before showing its visual placeholder', () => {
  const src = 'https://example.com/fachada.jpg?size=large#photo';

  assert.equal(imageSourceForAttempt(src, 0), src);
  assert.equal(
    imageSourceForAttempt(src, 1),
    'https://example.com/fachada.jpg?size=large&argos_retry=1#photo',
  );
  assert.equal(imageSourceForAttempt(src, 2), '');
});
