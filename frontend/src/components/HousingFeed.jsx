import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import Feed, { CatalogSidebarFilters } from './Feed';
import { HousingFields } from './HousingQuestionnaire';
import {
  emptyHousingProfile,
  filterHousingProperties,
  housingBudgetLabel,
  validateHousingProfile,
} from '../housingProfile';

function FilterChip({ children, onRemove }) {
  return <button className="housing-filter-chip" type="button" onClick={onRemove} title={`Remover filtro: ${children}`}>
    <span>{children}</span><b aria-hidden="true">×</b>
  </button>;
}

export default function HousingFeed({ profile, onSave, cities, appliedProfile, onApply, ...feedProps }) {
  const [params, setParams] = useSearchParams();
  const exploringWithoutProfile = params.get('busca') === 'todos';
  const savedOrAppliedProfile = appliedProfile || profile || emptyHousingProfile;
  const linkedCity = params.get('cidade');
  const linkedPropertyType = params.get('tipo');
  const profileWithLinkFilters = appliedProfile ? savedOrAppliedProfile : {
    ...savedOrAppliedProfile,
    ...(linkedCity && linkedCity !== 'Todas' ? { city: linkedCity } : {}),
    ...(['Casa', 'Apartamento'].includes(linkedPropertyType) ? { propertyType: linkedPropertyType } : {}),
  };
  const current = exploringWithoutProfile ? emptyHousingProfile : profileWithLinkFilters;
  const [draft, setDraft] = useState(() => ({ ...emptyHousingProfile, ...profileWithLinkFilters }));
  const [open, setOpen] = useState(() => window.innerWidth > 1100);
  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState(false);
  const [step, setStep] = useState(0);
  const selectedState = params.get('estado');
  const stateFilteredProperties = selectedState && selectedState !== 'Todos'
    ? feedProps.properties.filter(property => property.uf === selectedState)
    : feedProps.properties;
  const visibleProperties = filterHousingProperties(stateFilteredProperties, current);
  const hasFilters = Boolean(
    current.city
    || current.neighborhood
    || (current.propertyType && current.propertyType !== 'Todos')
    || Number(current.budget) > 0,
  );
  const update = (key, value) => setDraft(previous => ({ ...previous, [key]: value }));

  function clearExploreAllOverride() {
    setParams(currentParams => {
      const nextParams = new URLSearchParams(currentParams);
      nextParams.delete('busca');
      nextParams.delete('cidade');
      nextParams.delete('tipo');
      return nextParams;
    });
  }

  function activate(next, message) {
    const valid = validateHousingProfile(next);
    if (!valid) return;
    setDraft(valid);
    onApply(valid);
    clearExploreAllOverride();
    setNotice(message);
  }

  async function apply(save) {
    const valid = validateHousingProfile(draft);
    if (!valid) {
      setNotice('Não foi possível aplicar essas escolhas.');
      return;
    }
    setSaving(true);
    try {
      if (save) await onSave(valid);
      activate(valid, save ? 'Perfil de moradia salvo.' : 'Filtros aplicados.');
      if (window.innerWidth <= 1100) setOpen(false);
    } catch {
      setNotice('Não foi possível salvar. Tente novamente.');
    } finally {
      setSaving(false);
    }
  }

  function removeFilter(key) {
    const next = { ...current, [key]: emptyHousingProfile[key] };
    if (key === 'city') next.neighborhood = '';
    activate(next, 'Filtro removido.');
  }

  function clearFilters() {
    activate({ ...emptyHousingProfile }, 'Todos os filtros pessoais foram removidos.');
  }

  function restoreProfile() {
    const restored = { ...emptyHousingProfile, ...profile };
    setDraft(restored);
    onApply(null);
    clearExploreAllOverride();
    setNotice('Perfil salvo restaurado.');
  }

  return <div className="housing-dashboard">
    <section className="housing-dashboard-heading">
      <div><span className="housing-eyebrow">COMPRAR PARA MORAR</span><h1>Todos os imóveis</h1><p>Suas preferências começam aplicadas. Remova ou ajuste qualquer filtro quando quiser.</p></div>
      <button className="btn ghost" onClick={() => setOpen(!open)} aria-expanded={open} aria-controls="housing-search">☷ {open ? 'Ocultar' : 'Ajustar'} filtros</button>
    </section>
    <div className="housing-dashboard-layout">
      {open && <aside className="housing-search" id="housing-search" aria-label="Filtros da busca">
        <h2>Filtros</h2>
        <p className="housing-help">Tudo o que muda esta busca fica reunido aqui.</p>
        <CatalogSidebarFilters properties={feedProps.properties} hideHousingDuplicates />
        <div className="housing-search-divider" />
        <h3 className="housing-search-subtitle">Suas preferências</h3>
        <div className="housing-mini-tabs" role="tablist" aria-label="Preferências">
          {['Região', 'Imóvel', 'Orçamento'].map((label, index) => <button key={label} role="tab" aria-selected={step === index} onClick={() => setStep(index)}>{label}</button>)}
        </div>
        <HousingFields step={step} profile={draft} onChange={update} cities={cities} />
        <button className="btn primary" disabled={saving} onClick={() => apply(false)}>Aplicar filtros</button>
        <button className="btn ghost" disabled={saving} onClick={() => apply(true)}>{saving ? 'Salvando…' : 'Salvar no meu perfil'}</button>
        {profile && <button className="housing-text-button" onClick={restoreProfile}>Restaurar perfil salvo</button>}
        <Link className="housing-text-button" to="/perfil">Refazer escolhas iniciais →</Link>
      </aside>}
      <section className="housing-feed-main">
        {notice && <p role="status" className="housing-notice">{notice}</p>}
        <div className="housing-summary" aria-label="Filtros pessoais aplicados">
          {current.city && <FilterChip onRemove={() => removeFilter('city')}>{current.city}</FilterChip>}
          {current.neighborhood && <FilterChip onRemove={() => removeFilter('neighborhood')}>{current.neighborhood}</FilterChip>}
          {current.propertyType && current.propertyType !== 'Todos' && <FilterChip onRemove={() => removeFilter('propertyType')}>{current.propertyType}</FilterChip>}
          {Number(current.budget) > 0 && <FilterChip onRemove={() => removeFilter('budget')}>{housingBudgetLabel(current.budget)}</FilterChip>}
          {!hasFilters && <span className="housing-summary-empty">Sem filtros pessoais</span>}
          {hasFilters && <button className="housing-clear-filters" type="button" onClick={clearFilters}>Limpar todos</button>}
          {exploringWithoutProfile && profile && <button className="housing-clear-filters" type="button" onClick={restoreProfile}>Usar meu perfil</button>}
        </div>
        {Number(current.budget) > 0 && <div className="housing-budget-note"><b>Faixa aplicada ao valor inicial do imóvel.</b><p>Taxas, ocupação, reforma e condições de pagamento continuam detalhadas em cada imóvel.</p></div>}
        <Feed {...feedProps} properties={visibleProperties} embedded />
        {!feedProps.loading && !visibleProperties.length && <div className="housing-no-results"><p>Nenhum imóvel corresponde a esses filtros no catálogo disponível.</p><button className="btn primary" onClick={clearFilters}>Limpar filtros</button></div>}
      </section>
    </div>
  </div>;
}
