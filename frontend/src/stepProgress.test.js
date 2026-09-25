import test from 'node:test';
import assert from 'node:assert/strict';
import {
  completedStepIds,
  createStepProgressSync,
  localStepsKey,
  readStoredSteps,
  stepsFromCompleted,
} from './stepProgress.js';

function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: key => values.delete(key),
  };
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

// A fake account API: GET answers when the test resolves it, PUTs are recorded
// and answered one by one.
function fakeApi(accountSteps = []) {
  const load = deferred();
  const puts = [];
  return {
    load,
    puts,
    getStepProgress: () => load.promise,
    setStepProgress: (propertyId, completed) => {
      const call = { propertyId, completed, ...deferred() };
      puts.push(call);
      return call.promise;
    },
    answerLoad: () => load.resolve({ completed: accountSteps }),
  };
}

const settle = () => new Promise(resolve => setTimeout(resolve, 0));

test('step ids are validated, deduplicated and sorted before leaving the browser', () => {
  assert.deepEqual(
    completedStepIds({ visit: true, read_rules: true, 'Bad-Id': true, credit: false }),
    ['read_rules', 'visit'],
  );
  assert.deepEqual(stepsFromCompleted(['visit', 42, 'NOPE']), { visit: true });
});

test('opening a property logged in shows the progress saved on the account', async () => {
  const api = fakeApi(['read_rules', 'visit']);
  const seen = [];
  const sync = createStepProgressSync({
    propertyId: 7, api, storage: memoryStorage(), onChange: next => seen.push(next),
  });
  sync.start();
  api.answerLoad();
  await settle();

  assert.deepEqual(sync.done, { read_rules: true, visit: true });
  assert.deepEqual(seen.at(-1), { read_rules: true, visit: true });
  assert.equal(api.puts.length, 0, 'nothing changed, nothing to write');
});

test('toggles made before the account copy arrives are kept and then saved', async () => {
  const api = fakeApi(['read_rules']);
  const sync = createStepProgressSync({ propertyId: 7, api, storage: memoryStorage() });
  sync.start();
  sync.set('visit');
  assert.equal(api.puts.length, 0, 'no write before knowing what the account has');

  api.answerLoad();
  await settle();

  assert.deepEqual(sync.done, { read_rules: true, visit: true });
  assert.deepEqual(api.puts.map(p => p.completed), [['read_rules', 'visit']]);
});

test('progress kept in this browser before accounts is imported once', async () => {
  const storage = memoryStorage({ [localStepsKey(7)]: JSON.stringify({ credit: true }) });
  const api = fakeApi(['read_rules']);
  const sync = createStepProgressSync({ propertyId: 7, api, storage });
  sync.start();
  api.answerLoad();
  await settle();

  assert.deepEqual(api.puts[0].completed, ['credit', 'read_rules']);
  assert.notEqual(storage.getItem(localStepsKey(7)), null, 'kept until the account has it');
  api.puts[0].resolve({});
  await settle();
  assert.equal(storage.getItem(localStepsKey(7)), null);
  assert.deepEqual(readStoredSteps(storage, 7), {});
});

test('only one save runs at a time and the last state wins', async () => {
  const api = fakeApi([]);
  const sync = createStepProgressSync({ propertyId: 7, api, storage: memoryStorage() });
  sync.start();
  api.answerLoad();
  await settle();

  sync.set('read_rules');
  sync.set('visit');
  sync.set('read_rules');
  assert.equal(api.puts.length, 1);
  assert.deepEqual(api.puts[0].completed, ['read_rules']);

  api.puts[0].resolve({});
  await settle();
  assert.equal(api.puts.length, 2);
  assert.deepEqual(api.puts[1].completed, ['visit']);
});

test('marking a step that is already done does not write again', async () => {
  const api = fakeApi(['read_rules']);
  const sync = createStepProgressSync({ propertyId: 7, api, storage: memoryStorage() });
  sync.start();
  api.answerLoad();
  await settle();

  sync.set('read_rules', true);
  assert.equal(api.puts.length, 0);
});

test('a failed save keeps the visible progress and the next change resends everything', async () => {
  const api = fakeApi([]);
  const warnings = [];
  const sync = createStepProgressSync({
    propertyId: 7, api, storage: memoryStorage(), warn: (...args) => warnings.push(args),
  });
  sync.start();
  api.answerLoad();
  await settle();

  sync.set('read_rules');
  api.puts[0].reject(new Error('offline'));
  await settle();
  assert.deepEqual(sync.done, { read_rules: true });
  assert.equal(warnings.length, 1);

  sync.set('visit');
  assert.deepEqual(api.puts[1].completed, ['read_rules', 'visit']);
});

test('a load that finishes after leaving the property is ignored', async () => {
  const api = fakeApi(['read_rules']);
  const seen = [];
  const sync = createStepProgressSync({
    propertyId: 7, api, storage: memoryStorage(), onChange: next => seen.push(next),
  });
  sync.start();
  sync.stop();
  api.answerLoad();
  await settle();

  assert.deepEqual(seen, []);
  assert.equal(api.puts.length, 0);
});

test('a failed load retries and never overwrites the account with partial progress', async () => {
  const api = fakeApi(['read_rules']);
  let calls = 0;
  api.getStepProgress = () => {
    calls += 1;
    return calls === 1 ? Promise.reject(new Error('offline')) : Promise.resolve({ completed: ['read_rules'] });
  };
  const sync = createStepProgressSync({
    propertyId: 7, api, storage: memoryStorage(), retryDelays: [0], warn: () => {},
  });
  sync.start();
  sync.set('visit');
  await settle();
  assert.equal(api.puts.length, 0);

  await new Promise(resolve => setTimeout(resolve, 5));
  await settle();
  assert.equal(calls, 2);
  assert.deepEqual(api.puts.map(p => p.completed), [['read_rules', 'visit']]);
});
