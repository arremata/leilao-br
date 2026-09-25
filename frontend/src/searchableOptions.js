export const normalizeSearchOption = value => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .trim()
  .toUpperCase();

export function uniqueSearchOptions(values) {
  const byNormalizedName = new Map();
  values.filter(Boolean).forEach(value => {
    const normalized = normalizeSearchOption(value);
    if (normalized && !byNormalizedName.has(normalized)) {
      byNormalizedName.set(normalized, String(value).trim());
    }
  });
  return [...byNormalizedName.values()].sort((left, right) => left.localeCompare(right, 'pt-BR'));
}

export function matchingSearchOptions(values, query, limit = 8) {
  const normalizedQuery = normalizeSearchOption(query);
  const options = uniqueSearchOptions(values);
  if (!normalizedQuery) return options.slice(0, limit);

  return options
    .filter(option => normalizeSearchOption(option).includes(normalizedQuery))
    .sort((left, right) => {
      const leftStarts = normalizeSearchOption(left).startsWith(normalizedQuery);
      const rightStarts = normalizeSearchOption(right).startsWith(normalizedQuery);
      if (leftStarts !== rightStarts) return leftStarts ? -1 : 1;
      return left.localeCompare(right, 'pt-BR');
    })
    .slice(0, limit);
}

export function exactSearchOption(values, query) {
  const normalizedQuery = normalizeSearchOption(query);
  if (!normalizedQuery) return '';
  return uniqueSearchOptions(values)
    .find(option => normalizeSearchOption(option) === normalizedQuery) || '';
}
