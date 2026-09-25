export const emptyHousingProfile = {
  city: '', neighborhood: '', propertyType: 'Todos', budget: '',
};

const normalize = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toUpperCase();
export const aboveOneMillionBudget = 'above-1000000';

export const housingBudgetOptions = [
  { value: '150000', label: 'Até R$ 150 mil' },
  { value: '250000', label: 'Até R$ 250 mil' },
  { value: '400000', label: 'Até R$ 400 mil' },
  { value: '600000', label: 'Até R$ 600 mil' },
  { value: '1000000', label: 'Até R$ 1 milhão' },
  { value: aboveOneMillionBudget, label: 'Acima de R$ 1 milhão' },
];

export function housingBudgetLabel(value) {
  if (value === '' || value === null || value === undefined) return 'Qualquer faixa';
  return housingBudgetOptions.find(option => option.value === String(value))?.label
    || `Até R$ ${Number(value).toLocaleString('pt-BR')}`;
}

export function hasHousingBudget(value) {
  return value === aboveOneMillionBudget || Number(value) > 0;
}

export function housingCitySuggestions(cities, query = '', limit = 6) {
  const needle = normalize(query);
  const uniqueCities = new Map();
  for (const value of Array.isArray(cities) ? cities : []) {
    const city = String(value || '').trim();
    const key = normalize(city);
    if (key && !uniqueCities.has(key)) uniqueCities.set(key, city);
  }
  return [...uniqueCities.entries()]
    .filter(([key]) => !needle || key.includes(needle))
    .sort(([leftKey, left], [rightKey, right]) => {
      const leftStarts = needle && leftKey.startsWith(needle) ? 0 : 1;
      const rightStarts = needle && rightKey.startsWith(needle) ? 0 : 1;
      return leftStarts - rightStarts || left.localeCompare(right, 'pt-BR');
    })
    .slice(0, Math.max(0, limit))
    .map(([, city]) => city);
}

export function validateHousingProfile(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const profile = { ...emptyHousingProfile };
  Object.keys(profile).forEach(key => {
    if (typeof value[key] === 'string' || typeof value[key] === 'number') profile[key] = String(value[key]).slice(0, 300);
  });
  if (profile.budget !== '' && profile.budget !== aboveOneMillionBudget
    && (!Number.isFinite(Number(profile.budget)) || Number(profile.budget) < 0)) return null;
  if (!['Todos', 'Casa', 'Apartamento'].includes(profile.propertyType)) profile.propertyType = 'Todos';
  return profile;
}
export function filterHousingProperties(properties, profile) {
  if (!profile) return properties;
  return properties.filter(p => {
    if (!['CASA', 'APARTAMENTO'].includes(normalize(p.type))) return false;
    if (profile.city && normalize(p.city) !== normalize(profile.city)) return false;
    if (profile.neighborhood && !normalize(p.neighborhood).includes(normalize(profile.neighborhood))) return false;
    if (profile.propertyType !== 'Todos' && normalize(p.type) !== normalize(profile.propertyType)) return false;
    if (profile.budget === aboveOneMillionBudget) {
      if (!Number.isFinite(Number(p.minBid)) || Number(p.minBid) <= 1000000) return false;
    } else if (Number(profile.budget) > 0) {
      if (!Number.isFinite(Number(p.minBid)) || !(Number(p.minBid) > 0)) return false;
      if (Number(p.minBid) > Number(profile.budget)) return false;
    }
    return true;
  });
}
