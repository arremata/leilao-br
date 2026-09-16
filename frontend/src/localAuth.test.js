import test from 'node:test';
import assert from 'node:assert/strict';
import { createLocalAccount, readLocalSession, signInLocal, signOutLocal } from './localAuth.js';

function memoryStorage() {
  const values = new Map();
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
}

test('creates a local account, restores its session and signs in again', async () => {
  const storage = memoryStorage();
  const user = await createLocalAccount({ name: 'Ana Souza', email: ' ANA@EXAMPLE.COM ', password: 'segura123', acceptedTerms: true }, storage);
  assert.deepEqual(user, { name: 'Ana Souza', email: 'ana@example.com' });
  assert.deepEqual(readLocalSession(storage), user);
  assert.doesNotMatch(storage.getItem('argos_local_account_v1'), /segura123/);
  signOutLocal(storage);
  assert.equal(readLocalSession(storage), null);
  assert.deepEqual(await signInLocal({ email: 'ana@example.com', password: 'segura123' }, storage), user);
});

test('validates required account data and rejects wrong credentials', async () => {
  const storage = memoryStorage();
  await assert.rejects(createLocalAccount({ name: 'A', email: 'invalido', password: '123', acceptedTerms: false }, storage), /nome completo/);
  await createLocalAccount({ name: 'Ana Souza', email: 'ana@example.com', password: 'segura123', acceptedTerms: true }, storage);
  await assert.rejects(signInLocal({ email: 'ana@example.com', password: 'outra123' }, storage), /incorretos/);
  await assert.rejects(createLocalAccount({ name: 'Bia Lima', email: 'bia@example.com', password: 'segura123', acceptedTerms: true }, storage), /Já existe/);
});
