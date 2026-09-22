export const emptyHousingProfile = {
  city: '', neighborhood: '', propertyType: 'Todos', beds: 0, parking: 0,
  budget: '', reserve: '', cash: '', monthly: '', payment: 'Ainda estou avaliando',
  fgts: 'Ainda não sei', credit: 'Ainda não consultei', timing: 'Ainda não defini',
  work: '', transport: 'Carro', commute: '30', rent: '',
};
const normalize = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toUpperCase();
export function validateHousingProfile(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const profile = { ...emptyHousingProfile };
  Object.keys(profile).forEach(key => {
    if (typeof value[key] === 'string' || typeof value[key] === 'number') profile[key] = String(value[key]).slice(0, 300);
  });
  for (const key of ['budget', 'reserve', 'cash', 'monthly', 'rent', 'beds', 'parking']) {
    if (profile[key] !== '' && (!Number.isFinite(Number(profile[key])) || Number(profile[key]) < 0)) return null;
  }
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
    if (Number(profile.beds) > 0 && !(Number(p.beds) >= Number(profile.beds))) return false;
    if (Number(profile.parking) > 0 && !(Number(p.parking) >= Number(profile.parking))) return false;
    // Só filtramos o orçamento quando a pessoa informou uma reserva. Ela é
    // uma premissa, nunca confirmação de que cobre todas as despesas.
    if (Number(profile.budget) > 0 && profile.reserve !== '') {
      if (!Number.isFinite(Number(p.minBid)) || !(Number(p.minBid) > 0)) return false;
      if (Number(p.minBid) + Number(profile.reserve) > Number(profile.budget)) return false;
    }
    return true;
  });
}
