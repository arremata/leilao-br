import test from 'node:test';
import assert from 'node:assert/strict';
import { housingPreferencesFlow, shouldShowHousingOnboarding, shouldUseAccountScreen } from './housingEntry.js';

const emptyEntry = {
  account: null,
  profile: null,
  appliedProfile: null,
  searchParamCount: 0,
};

test('branch previews open the public catalog without account onboarding', () => {
  assert.equal(shouldShowHousingOnboarding({ ...emptyEntry, isPreview: true }), false);
  assert.equal(shouldUseAccountScreen({ pathname: '/', isPreview: true, account: null, hasSearch: false }), false);
});

test('production keeps onboarding for a new visitor', () => {
  assert.equal(shouldShowHousingOnboarding({ ...emptyEntry, isPreview: false }), true);
  assert.equal(shouldUseAccountScreen({ pathname: '/', isPreview: false, account: null, hasSearch: false }), true);
});

test('public searches and configured visitors open the catalog', () => {
  assert.equal(shouldShowHousingOnboarding({ ...emptyEntry, isPreview: false, searchParamCount: 1 }), false);
  assert.equal(shouldShowHousingOnboarding({ ...emptyEntry, isPreview: false, account: { id: 1 }, profile: { city: 'Londrina' } }), false);
  assert.equal(shouldUseAccountScreen({ pathname: '/entrar', isPreview: true, account: null, hasSearch: false }), true);
});

test('account keeps the app navigation while preference editing stays focused', () => {
  assert.equal(shouldUseAccountScreen({ pathname: '/perfil', isPreview: false, account: { id: 1 }, hasSearch: false }), false);
  assert.equal(shouldUseAccountScreen({ pathname: '/perfil', isPreview: false, account: null, hasSearch: false }), true);
  assert.equal(shouldUseAccountScreen({ pathname: '/preferencias', isPreview: false, account: { id: 1 }, hasSearch: false }), true);
});

test('initial preferences continue to the catalog while later edits return to account', () => {
  assert.deepEqual(housingPreferencesFlow('?origem=cadastro'), {
    successDestination: '/',
    finalLabel: 'Ver imóveis',
    cancelDestination: '/?busca=todos',
    cancelLabel: 'Agora não',
  });
  assert.equal(housingPreferencesFlow('').successDestination, '/perfil');
  assert.equal(housingPreferencesFlow('').finalLabel, 'Salvar preferências');
});
