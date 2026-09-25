import { validateHousingProfile } from './housingProfile.js';

// Browser-only fallback for the local email/password prototype. Google-backed
// accounts persist this profile through /me/housing-profile instead.
export const housingProfileKey = 'argos_housing_profile_v1';
const housingProfileVersion = 2;
export function readHousingProfile(storage = window.localStorage) {
  try {
    const value = JSON.parse(storage.getItem(housingProfileKey));
    if (![1, housingProfileVersion].includes(value?.version)) return null;
    const profile = validateHousingProfile(value.profile);
    if (!profile) return null;
    try {
      storage.setItem(housingProfileKey, JSON.stringify({ version: housingProfileVersion, profile }));
    } catch { /* reading still works when storage cannot be rewritten */ }
    return profile;
  } catch { return null; }
}
export function saveHousingProfile(profile, storage = window.localStorage) {
  const valid = validateHousingProfile(profile);
  if (!valid) throw new Error('Perfil inválido.');
  storage.setItem(housingProfileKey, JSON.stringify({ version: housingProfileVersion, profile: valid }));
  return valid;
}
