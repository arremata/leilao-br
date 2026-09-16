import { validateHousingProfile } from './housingProfile.js';

// Adapter boundary for future authenticated persistence. This is browser
// storage, never an authentication token or an authorization check.
export const housingProfileKey = 'argos_housing_profile_v1';
export function readHousingProfile(storage = window.localStorage) {
  try {
    const value = JSON.parse(storage.getItem(housingProfileKey));
    return value?.version === 1 ? validateHousingProfile(value.profile) : null;
  } catch { return null; }
}
export function saveHousingProfile(profile, storage = window.localStorage) {
  const valid = validateHousingProfile(profile);
  if (!valid) throw new Error('Perfil inválido.');
  storage.setItem(housingProfileKey, JSON.stringify({ version: 1, profile: valid }));
  return valid;
}
