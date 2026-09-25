import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import Feed, { CatalogSidebarFilters } from './Feed';
import CityAutocomplete from './CityAutocomplete';
import {
  emptyHousingProfile,
  filterHousingProperties,
  housingBudgetLabel,
  housingBudgetOptions,
  housingFiltersFromSearchParams,
} from '../housingProfile';

const housingParamKeys = {
  city: 'cidade',
  neighborhood: 'bairro',
  propertyType: 'tipo',
  budget: 'orcamento',
};

function FilterChip({ children, onRemove }) {
  return <button className="housing-filter-chip" type="button" onClick={onRemove} title={`Remover filtro: ${children}`}>
    <span>{children}</span><b aria-hidden="true">×</b>
  </button>;
}

function HousingCatalogFilters({ cities, filters, onChange }) {
  return <div className="housing-catalog-filters">
    <CityAutocomplete key={filters.city} cities={cities} value={filters.city} onChange={value => onChange('city', value)} />

    <label className="housing-field">
      <span>Bairro <small>opcional</small></span>
      <input
        name="neighborhood"
        type="text"
        maxLength={300}
        placeholder="Todos os bairros"
        value={filters.neighborhood}
        onChange={event => onChange('neighborhood', event.target.value)}
      />
    </label>

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

    <label className="housing-field">
      <span>Valor inicial máximo</span>
      <select value={filters.budget} onChange={event => onChange('budget', event.target.value)}>
        <option value="">Sem limite</option>
        {housingBudgetOptions.filter(option => option.value).map(option => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
    </label>
  </div>;
}

export default function HousingFeed({ cities, ...feedProps }) {
  const [params, setParams] = useSearchParams();
  const [open, setOpen] = useState(() => window.innerWidth > 1100);
  const current = housingFiltersFromSearchParams(params);
  const visibleProperties = filterHousingProperties(feedProps.properties, current);
  const activeHousingFilterCount =
    (current.city ? 1 : 0)
    + (current.neighborhood ? 1 : 0)
    + (current.propertyType !== 'Todos' ? 1 : 0)
    + (Number(current.budget) > 0 ? 1 : 0);

  function setHousingFilter(key, value) {
    const paramKey = housingParamKeys[key];
    const defaultValue = emptyHousingProfile[key];
    setParams(previous => {
      const next = new URLSearchParams(previous);
      if (value === '' || value === defaultValue) next.delete(paramKey);
      else next.set(paramKey, value);
      if (key === 'city' && !value) next.delete(housingParamKeys.neighborhood);
      next.delete('busca');
      next.delete('pagina');
      return next;
    }, { replace: key === 'neighborhood' });
  }

  function clearHousingFilters() {
    setParams(previous => {
      const next = new URLSearchParams(previous);
      Object.values(housingParamKeys).forEach(key => next.delete(key));
      next.delete('busca');
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
          additionalFilters={<HousingCatalogFilters cities={cities} filters={current} onChange={setHousingFilter} />}
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
