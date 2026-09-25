export const emptyHousingProfile = {
  city: '', neighborhood: '', propertyType: 'Todos', budget: '',
};

export const housingBudgetOptions = [
  { value: '150000', label: 'Até R$ 150 mil' },
  { value: '250000', label: 'Até R$ 250 mil' },
  { value: '400000', label: 'Até R$ 400 mil' },
  { value: '600000', label: 'Até R$ 600 mil' },
  { value: '1000000', label: 'Até R$ 1 milhão' },
  { value: '', label: 'Ainda não sei' },
];

export function housingBudgetLabel(value) {
  return housingBudgetOptions.find(option => option.value === String(value ?? ''))?.label
    || `Até R$ ${Number(value).toLocaleString('pt-BR')}`;
}

const normalize = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toUpperCase();
export function validateHousingProfile(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const profile = { ...emptyHousingProfile };
  Object.keys(profile).forEach(key => {
    if (typeof value[key] === 'string' || typeof value[key] === 'number') profile[key] = String(value[key]).slice(0, 300);
  });
  for (const key of ['budget']) {
    if (profile[key] !== '' && (!Number.isFinite(Number(profile[key])) || Number(profile[key]) < 0)) return null;
  }
  if (!['Todos', 'Casa', 'Apartamento'].includes(profile.propertyType)) profile.propertyType = 'Todos';
  return profile;
}

export function housingProfileFromUser(user) {
  const stored = user?.housing_profile;
  if (!stored || typeof stored !== 'object' || Array.isArray(stored)) return null;
  return validateHousingProfile({
    city: stored.city,
    propertyType: stored.property_type,
    budget: stored.budget ?? '',
  });
}

export function housingProfileForApi(value) {
  const profile = validateHousingProfile(value);
  if (!profile) throw new Error('Perfil inválido.');
  return {
    city: profile.city,
    property_type: profile.propertyType,
    budget: profile.budget || null,
  };
}

export function housingFiltersFromSearchParams(searchParams) {
  const requestedPropertyType = searchParams.get('tipo');
  return {
    city: searchParams.get('cidade') || '',
    neighborhood: searchParams.get('bairro') || '',
    propertyType: ['Casa', 'Apartamento'].includes(requestedPropertyType) ? requestedPropertyType : 'Todos',
    budget: searchParams.get('orcamento') || '',
  };
}

export function filterHousingProperties(properties, profile) {
  if (!profile) return properties;
  return properties.filter(p => {
    if (!['CASA', 'APARTAMENTO'].includes(normalize(p.type))) return false;
    if (profile.city && normalize(p.city) !== normalize(profile.city)) return false;
    if (profile.neighborhood && !normalize(p.neighborhood).includes(normalize(profile.neighborhood))) return false;
    if (profile.propertyType !== 'Todos' && normalize(p.type) !== normalize(profile.propertyType)) return false;
    if (Number(profile.budget) > 0) {
      if (!Number.isFinite(Number(p.minBid)) || !(Number(p.minBid) > 0)) return false;
      if (Number(p.minBid) > Number(profile.budget)) return false;
    }
    return true;
  });
}
