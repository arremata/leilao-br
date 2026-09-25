export const normalizeCity = value => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .trim()
  .toUpperCase();

export function uniqueCities(cities) {
  const byNormalizedName = new Map();
  cities.filter(Boolean).forEach(city => {
    const normalized = normalizeCity(city);
    if (normalized && !byNormalizedName.has(normalized)) byNormalizedName.set(normalized, String(city));
  });
  return [...byNormalizedName.values()].sort((left, right) => left.localeCompare(right, 'pt-BR'));
}

export function matchingCities(cities, query, limit = 8) {
  const normalizedQuery = normalizeCity(query);
  const options = uniqueCities(cities);
  if (!normalizedQuery) return options.slice(0, limit);

  return options
    .filter(city => normalizeCity(city).includes(normalizedQuery))
    .sort((left, right) => {
      const leftStarts = normalizeCity(left).startsWith(normalizedQuery);
      const rightStarts = normalizeCity(right).startsWith(normalizedQuery);
      if (leftStarts !== rightStarts) return leftStarts ? -1 : 1;
      return left.localeCompare(right, 'pt-BR');
    })
    .slice(0, limit);
}

export function exactCity(cities, query) {
  const normalizedQuery = normalizeCity(query);
  if (!normalizedQuery) return '';
  return uniqueCities(cities).find(city => normalizeCity(city) === normalizedQuery) || '';
}
