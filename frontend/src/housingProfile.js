export const emptyHousingProfile = {
  city: '', neighborhood: '', propertyType: 'Todos', budget: '',
};

export const housingFilterParamKeys = {
  city: 'cidade',
  neighborhood: 'bairro',
  propertyType: 'tipo',
  budget: 'orcamento',
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
  if (value === aboveOneMillionBudget) return 'Acima de R$ 1 milhão';
  const amount = Number(value);
  return amount > 0 && Number.isFinite(amount)
    ? `Até R$ ${amount.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}`
    : 'Sem limite';
}

export function hasHousingBudget(value) {
  return value === aboveOneMillionBudget || Number(value) > 0;
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

export function housingSearchParamsWithFilter(searchParams, key, value) {
  const next = new URLSearchParams(searchParams);
  const paramKey = housingFilterParamKeys[key];
  const defaultValue = emptyHousingProfile[key];
  if (value === '' || value === defaultValue) next.delete(paramKey);
  else next.set(paramKey, value);
  if (key === 'city') next.delete(housingFilterParamKeys.neighborhood);
  next.delete('busca');
  next.delete('q');
  next.delete('pagina');
  return next;
}

export function filterHousingProperties(properties, profile) {
  if (!profile) return properties;
  return properties.filter(p => {
    if (!['CASA', 'APARTAMENTO'].includes(normalize(p.type))) return false;
    if (profile.city && normalize(p.city) !== normalize(profile.city)) return false;
    if (profile.neighborhood && normalize(p.neighborhood) !== normalize(profile.neighborhood)) return false;
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
