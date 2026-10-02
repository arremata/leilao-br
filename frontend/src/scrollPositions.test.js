import test from 'node:test';
import assert from 'node:assert/strict';
import { readScrollPositions, writeScrollPositions } from './scrollPositions.js';

function memoryStorage() {
  const data = new Map();
  return { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => data.set(k, String(v)) };
}

test('positions survive a reload of the same tab', () => {
  const storage = memoryStorage();
  writeScrollPositions({ abc: 1840 }, storage);
  assert.deepEqual(readScrollPositions(storage), { abc: 1840 });
});

test('only the most recent entries are kept', () => {
  const storage = memoryStorage();
  const positions = {};
  for (let i = 0; i < 60; i += 1) positions[`k${i}`] = i;
  writeScrollPositions(positions, storage);
  const stored = readScrollPositions(storage);
  assert.equal(Object.keys(stored).length, 50);
  assert.equal(stored.k59, 59);
  assert.equal(stored.k0, undefined);
});

test('broken or blocked storage never breaks navigation', () => {
  assert.deepEqual(readScrollPositions({ getItem: () => '{oops' }), {});
  assert.deepEqual(readScrollPositions({ getItem: () => { throw new Error('blocked'); } }), {});
  assert.deepEqual(readScrollPositions(undefined), {});
  assert.doesNotThrow(() => writeScrollPositions({ a: 1 }, { setItem: () => { throw new Error('full'); } }));
});
