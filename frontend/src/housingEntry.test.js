import test from 'node:test';
import assert from 'node:assert/strict';
import {
  accountDestination,
  housingPreferencesFlow,
  postSetupDestination,
  shouldShowHousingOnboarding,
  shouldUseAccountScreen,
} from './housingEntry.js';

const emptyEntry = {
  account: null,
  profile: null,
  appliedProfile: null,
  searchParamCount: 0,
};

test('branch previews skip preference onboarding after login', () => {
  assert.equal(shouldShowHousingOnboarding({ ...emptyEntry, isPreview: true }), false);
  assert.equal(shouldUseAccountScreen({ pathname: '/', isPreview: true, account: { id: 1 }, hasSearch: false }), false);
});

test('production keeps onboarding for a new visitor', () => {
  assert.equal(shouldShowHousingOnboarding({ ...emptyEntry, isPreview: false }), true);
  assert.equal(shouldUseAccountScreen({ pathname: '/', isPreview: false, account: null, hasSearch: false }), true);
});

test('searches skip preference setup only after the account gate', () => {
  assert.equal(shouldShowHousingOnboarding({ ...emptyEntry, isPreview: false, searchParamCount: 1 }), false);
  assert.equal(shouldShowHousingOnboarding({ ...emptyEntry, isPreview: false, account: { id: 1 }, profile: { city: 'Londrina' } }), false);
  assert.equal(shouldUseAccountScreen({ pathname: '/entrar', isPreview: true, account: null, hasSearch: false }), true);
});

test('every platform route uses the account screen before login', () => {
  for (const pathname of ['/', '/imovel/923', '/salvos', '/vistos', '/perfil']) {
    assert.equal(shouldUseAccountScreen({ pathname, isPreview: true, account: null, hasSearch: true }), true);
  }
});

test('account keeps the app navigation while preference editing stays focused', () => {
  assert.equal(shouldUseAccountScreen({ pathname: '/perfil', isPreview: false, account: { id: 1 }, hasSearch: false }), false);
  assert.equal(shouldUseAccountScreen({ pathname: '/perfil', isPreview: false, account: null, hasSearch: false }), true);
  assert.equal(shouldUseAccountScreen({ pathname: '/preferencias', isPreview: false, account: { id: 1 }, hasSearch: false }), true);
});

test('initial preferences continue to the catalog while later edits return to account', () => {
  assert.deepEqual(housingPreferencesFlow('?origem=cadastro', '/imovel/923?origem=lista'), {
    successDestination: '/imovel/923?origem=lista',
    finalLabel: 'Ver imóveis',
    cancelDestination: '/?busca=todos',
    cancelLabel: 'Agora não',
  });
  assert.equal(housingPreferencesFlow('').successDestination, '/perfil');
  assert.equal(housingPreferencesFlow('').finalLabel, 'Salvar preferências');
});

test('account return destinations stay inside the app and avoid setup loops', () => {
  assert.equal(accountDestination('/imovel/923?origem=lista'), '/imovel/923?origem=lista');
  assert.equal(accountDestination('https://example.com'), '/');
  assert.equal(accountDestination('//example.com'), '/');
  assert.equal(accountDestination('/entrar'), '/');
  assert.equal(postSetupDestination('/perfil'), '/');
  assert.equal(postSetupDestination('/preferencias?x=1'), '/');
});
