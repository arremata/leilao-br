import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const serviceWorker = readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8');

test('service worker leaves cross-origin property images to the browser', () => {
  assert.match(serviceWorker, /if \(url\.origin !== self\.location\.origin\) return;/);
});
