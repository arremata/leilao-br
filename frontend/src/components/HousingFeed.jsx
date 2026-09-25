import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import Feed, { CatalogSidebarFilters } from './Feed';
import CityAutocomplete from './CityAutocomplete';
import CurrencyInput from './CurrencyInput';
import SearchableAutocomplete from './SearchableAutocomplete';
import {
  filterHousingProperties,
  housingFilterParamKeys,
  housingBudgetLabel,
  housingFiltersFromSearchParams,
  housingSearchParamsWithFilter,
} from '../housingProfile';
import { normalizeSearchOption } from '../searchableOptions';
import { readCatalogBudget, saveCatalogBudget } from '../housingFilterStorage';

function FilterChip({ children, onRemove }) {
  return <button className="housing-filter-chip" type="button" onClick={onRemove} title={`Remover filtro: ${children}`}>
    <span>{children}</span><b aria-hidden="true">×</b>
  </button>;
}

function HousingCatalogFilters({ cities, properties, filters, onChange }) {
  const neighborhoods = useMemo(() => {
    if (!filters.city) return [];
    const normalizedCity = normalizeSearchOption(filters.city);
    return properties
      .filter(property => normalizeSearchOption(property.city) === normalizedCity)
      .map(property => property.neighborhood)
      .filter(Boolean);
  }, [filters.city, properties]);

  return <div className="housing-catalog-filters">
    <CityAutocomplete cities={cities} value={filters.city} onChange={value => onChange('city', value)} />

    <SearchableAutocomplete
      label={<><span>Bairro</span> <small>opcional</small></>}
      options={neighborhoods}
      value={filters.neighborhood}
      onChange={value => onChange('neighborhood', value)}
      placeholder={filters.city ? 'Todos os bairros' : 'Escolha uma cidade primeiro'}
      clearLabel="Limpar bairro"
      emptyMessage="Nenhum bairro encontrado nesta cidade."
      disabled={!filters.city}
    />

    <div className="housing-field">
      <span>Tipo de imóvel</span>
      <div className="housing-filter-segments" role="group" aria-label="Tipo de imóvel">
        {[
          ['Todos', 'Todos'],
          ['Casa', 'Casa'],
          ['Apartamento', 'Apartamento'],
        ].map(([value, label]) => <button
          type="button"
          key={value}
          aria-pressed={filters.propertyType === value}
          onClick={() => onChange('propertyType', value)}
        >{label}</button>)}
      </div>
    </div>

    <CurrencyInput
      label="Valor inicial máximo"
      value={filters.budget}
      onChange={value => onChange('budget', value)}
    />
  </div>;
}

export default function HousingFeed({ cities, ...feedProps }) {
  const [params, setParams] = useSearchParams();
  const [open, setOpen] = useState(() => window.innerWidth > 1100);
  const [rememberedBudget, setRememberedBudget] = useState(() => readCatalogBudget());
  const initialBudgetRestored = useRef(false);
  const hasBudgetParam = params.has(housingFilterParamKeys.budget);
  const requested = housingFiltersFromSearchParams(params);
  const current = {
    ...requested,
    budget: hasBudgetParam ? requested.budget : rememberedBudget,
  };
  const visibleProperties = filterHousingProperties(feedProps.properties, current);
  const activeHousingFilterCount =
    (current.city ? 1 : 0)
    + (current.neighborhood ? 1 : 0)
    + (current.propertyType !== 'Todos' ? 1 : 0)
    + (Number(current.budget) > 0 ? 1 : 0);

  useEffect(() => {
    if (initialBudgetRestored.current) return;
    initialBudgetRestored.current = true;
    if (hasBudgetParam || !rememberedBudget) return;
    setParams(() => {
      const next = new URLSearchParams(window.location.search);
      next.set(housingFilterParamKeys.budget, rememberedBudget);
      return next;
    }, { replace: true });
  }, [hasBudgetParam, rememberedBudget, setParams]);

  function setHousingFilter(key, value) {
    const nextValue = key === 'budget' ? saveCatalogBudget(value) : value;
    if (key === 'budget') setRememberedBudget(nextValue);
    const latestParams = new URLSearchParams(window.location.search);
    setParams(
      housingSearchParamsWithFilter(latestParams, key, nextValue),
      { replace: key === 'neighborhood' || key === 'budget' },
    );
  }

  function clearRememberedBudget() {
    saveCatalogBudget('');
    setRememberedBudget('');
  }

  function clearHousingFilters() {
    clearRememberedBudget();
    setParams(previous => {
      const next = new URLSearchParams(previous);
      Object.values(housingFilterParamKeys).forEach(key => next.delete(key));
      next.delete('busca');
      next.delete('q');
      next.delete('pagina');
      return next;
    });
  }

  return <div className="housing-dashboard">
    <section className="housing-dashboard-heading">
      <div><span className="housing-eyebrow">COMPRAR PARA MORAR</span><h1>Todos os imóveis</h1><p>Use os filtros para encontrar imóveis que façam sentido para você.</p></div>
      <button className="btn ghost" onClick={() => setOpen(!open)} aria-expanded={open} aria-controls="housing-search">☷ {open ? 'Ocultar' : 'Ajustar'} filtros</button>
    </section>
    <div className="housing-dashboard-layout">
      {open && <aside className="housing-search" id="housing-search" aria-label="Filtros da busca">
        <h2>Filtros</h2>
        <p className="housing-help">Todos os ajustes desta busca ficam reunidos aqui.</p>
        <CatalogSidebarFilters
          properties={feedProps.properties}
          hideHousingDuplicates
          onClearAdditionalFilters={clearRememberedBudget}
          additionalFilters={<HousingCatalogFilters cities={cities} properties={feedProps.properties} filters={current} onChange={setHousingFilter} />}
          additionalFilterCount={activeHousingFilterCount}
          additionalClearPatch={{ cidade: 'Todas', bairro: '', tipo: 'Todos', orcamento: '' }}
        />
      </aside>}
      <section className="housing-feed-main">
        {activeHousingFilterCount > 0 && <div className="housing-summary" aria-label="Filtros de moradia aplicados">
          {current.city && <FilterChip onRemove={() => setHousingFilter('city', '')}>{current.city}</FilterChip>}
          {current.neighborhood && <FilterChip onRemove={() => setHousingFilter('neighborhood', '')}>{current.neighborhood}</FilterChip>}
          {current.propertyType !== 'Todos' && <FilterChip onRemove={() => setHousingFilter('propertyType', 'Todos')}>{current.propertyType}</FilterChip>}
          {Number(current.budget) > 0 && <FilterChip onRemove={() => setHousingFilter('budget', '')}>{housingBudgetLabel(current.budget)}</FilterChip>}
          <button className="housing-clear-filters" type="button" onClick={clearHousingFilters}>Limpar estes filtros</button>
        </div>}
        {Number(current.budget) > 0 && <div className="housing-budget-note"><b>Faixa aplicada ao valor inicial do imóvel.</b><p>Taxas, ocupação, reforma e condições de pagamento continuam detalhadas em cada imóvel.</p></div>}
        <Feed {...feedProps} properties={visibleProperties} embedded />
        {!feedProps.loading && !visibleProperties.length && <div className="housing-no-results"><p>Nenhum imóvel corresponde a esses filtros no catálogo disponível.</p><button className="btn primary" onClick={clearHousingFilters}>Limpar filtros</button></div>}
      </section>
    </div>
  </div>;
}
