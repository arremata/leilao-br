// Filtros pelo que a Caixa informa na ficha: quem mora lá, FGTS e financiamento.
//
// Ficam na URL como os outros filtros da lista (voltar de um imóvel devolve a
// mesma busca). Só entram imóveis em que a Caixa afirma a condição: "não
// informado" nunca passa por "desocupado" nem por "aceita FGTS".

import { occupancyStatus, paymentFacts } from './listingFacts.js';

export const listingFilterParamKeys = {
  occupancy: 'ocupacao',
  fgts: 'fgts',
  financing: 'financiamento',
};

export const emptyListingFilters = { occupancy: 'any', fgts: false, financing: false };

const OCCUPANCY_PARAM = { vacant: 'desocupado', occupied: 'ocupado' };
const OCCUPANCY_FROM_PARAM = { desocupado: 'vacant', ocupado: 'occupied' };

export const occupancyFilterLabels = { vacant: 'Desocupado', occupied: 'Ocupado' };

export function listingFiltersFromSearchParams(searchParams) {
  return {
    occupancy: OCCUPANCY_FROM_PARAM[searchParams.get(listingFilterParamKeys.occupancy)] || 'any',
    fgts: searchParams.get(listingFilterParamKeys.fgts) === 'sim',
    financing: searchParams.get(listingFilterParamKeys.financing) === 'sim',
  };
}

/** Endereço com um filtro trocado; mudar a busca volta para a primeira página. */
export function listingSearchParamsWithFilter(searchParams, key, value) {
  const next = new URLSearchParams(searchParams);
  const paramKey = listingFilterParamKeys[key];
  const asParam = key === 'occupancy' ? OCCUPANCY_PARAM[value] : (value ? 'sim' : '');
  if (asParam) next.set(paramKey, asParam);
  else next.delete(paramKey);
  next.delete('busca');
  next.delete('q');
  next.delete('pagina');
  return next;
}

export function activeListingFilterCount(filters) {
  return (filters.occupancy !== 'any' ? 1 : 0) + (filters.fgts ? 1 : 0) + (filters.financing ? 1 : 0);
}

function matches(property, filters) {
  if (filters.occupancy !== 'any' && occupancyStatus(property) !== filters.occupancy) return false;
  if (filters.fgts || filters.financing) {
    const facts = paymentFacts(property);
    if (filters.fgts && facts.fgts !== true) return false;
    if (filters.financing && facts.financing !== true) return false;
  }
  return true;
}

export function filterByListingFacts(properties, filters) {
  if (!activeListingFilterCount(filters)) return properties;
  return properties.filter(property => matches(property, filters));
}
