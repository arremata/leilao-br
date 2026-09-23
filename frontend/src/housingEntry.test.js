import test from 'node:test';
import assert from 'node:assert/strict';
import { shouldShowHousingOnboarding, shouldUseAccountScreen } from './housingEntry.js';

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
