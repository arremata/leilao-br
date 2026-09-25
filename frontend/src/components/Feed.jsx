import { useState, useMemo, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { PropertyCard, PropertyRow } from './shared';
import { catalogSaleDetailVisibility } from '../catalogFilters';
import { getEndsAtMs } from '../utils';

const normalizeLocation = (value) => String(value || '')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .trim().toUpperCase();

const formatCity = (value) => String(value || '').toLocaleLowerCase('pt-BR')
  .replace(/(^|\s)\S/g, letter => letter.toLocaleUpperCase('pt-BR'));

// Leilão e compra direta são produtos com lógicas opostas: um tem disputa e
// data, o outro é primeiro a chegar. Misturá-los confunde exatamente quem é
// leigo, então são abas e não um filtro escondido.
const isDirectSaleModality = (value) => normalizeLocation(value).includes('VENDA DIRETA');

// Os filtros moram na URL: é isso que faz voltar de um imóvel devolver a mesma
// lista. Só o que difere do padrão aparece no endereço.
const DEFAULTS = {
  aba: 'leiloes', estado: 'Todos', cidade: 'Todas', tipo: 'Todos',
  rodada: 'Todos', modalidade: 'Todos', desconto: '0',
  ordem: 'relevance', vis: 'grid', pagina: '1', encerrados: '0',
};

function readParams(searchParams) {
  const get = (key) => searchParams.get(key) ?? DEFAULTS[key];
  return {
    kind: get('aba') === 'direta' ? 'direct' : 'auction',
    filters: {
      state: get('estado'),
      city: get('cidade'),
      propertyType: get('tipo'),
      praca: get('rodada'),
      modalidade: get('modalidade'),
      discountMin: Number(get('desconto')) || 0,
      showExpired: get('encerrados') === '1',
    },
    sort: get('ordem'),
    view: get('vis') === 'lista' ? 'list' : 'grid',
    page: Math.max(1, Number(get('pagina')) || 1),
  };
}

function patchSearchParams(current, patch) {
  const next = new URLSearchParams(current);
  next.delete('q');
  Object.entries(patch).forEach(([key, value]) => {
    const asText = value == null ? '' : String(value);
    if (asText === '' || asText === DEFAULTS[key]) next.delete(key);
    else next.set(key, asText);
  });
  if (!('pagina' in patch)) next.delete('pagina');
  return next;
}

export function CatalogSidebarFilters({
  properties,
  hideHousingDuplicates = false,
  onCollapse,
  onClearAdditionalFilters,
  additionalFilters = null,
  additionalFilterCount = 0,
  additionalClearPatch = {},
}) {
  const [searchParams, setSearchParams] = useSearchParams();
  const { kind, filters } = readParams(searchParams);
  const setParams = useCallback((patch) => {
    setSearchParams(current => patchSearchParams(current, patch));
  }, [setSearchParams]);
  const setFilters = (next) => setParams({
    estado: next.state, cidade: next.city, tipo: next.propertyType,
    rodada: next.praca, modalidade: next.modalidade, desconto: String(next.discountMin),
    encerrados: next.showExpired ? '1' : '0',
  });
  const byKind = useMemo(
    () => properties.filter(property => isDirectSaleModality(property.modalidade) === (kind === 'direct')),
    [properties, kind],
  );
  const directCount = useMemo(
    () => properties.filter(property => isDirectSaleModality(property.modalidade)).length,
    [properties],
  );
  const stateOptions = useMemo(() => [
    'Todos',
    ...[...new Set(byKind.map(property => property.uf).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, 'pt-BR')),
  ], [byKind]);
  const cityOptions = useMemo(() => {
    const selectedState = normalizeLocation(filters.state);
    const availableCities = byKind
      .filter(property => filters.state === 'Todos' || normalizeLocation(property.uf) === selectedState)
      .map(property => property.city)
      .filter(Boolean);
    const uniqueByNormalizedName = new Map();
    availableCities.forEach(city => uniqueByNormalizedName.set(normalizeLocation(city), formatCity(city)));
    return ['Todas', ...[...uniqueByNormalizedName.values()].sort((a, b) => a.localeCompare(b, 'pt-BR'))];
  }, [byKind, filters.state]);
  const propertyTypeOptions = useMemo(() => [
    'Todos',
    ...[...new Set(byKind.map(property => property.type).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, 'pt-BR')),
  ], [byKind]);
  const modalityOptions = useMemo(() => [
    'Todos',
    ...[...new Set(byKind.map(property => property.modalidade).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, 'pt-BR')),
  ], [byKind]);
  const pracaOptions = useMemo(() => {
    const eligible = byKind.filter(property =>
      filters.modalidade === 'Todos' || property.modalidade === filters.modalidade);
    return [
      'Todos',
      ...[...new Set(eligible.map(property => property.praca).filter(Boolean))]
        .sort((a, b) => a.localeCompare(b, 'pt-BR')),
    ];
  }, [byKind, filters.modalidade]);
  const saleDetailVisibility = catalogSaleDetailVisibility(kind, pracaOptions, modalityOptions);
  const showDetailSection = hideHousingDuplicates
    ? saleDetailVisibility.showGroup
    : propertyTypeOptions.length > 2 || saleDetailVisibility.showGroup;
  const visibleFilterCount =
    (filters.discountMin > 0 ? 1 : 0)
    + (filters.state !== 'Todos' ? 1 : 0)
    + (filters.praca !== 'Todos' ? 1 : 0)
    + (filters.modalidade !== 'Todos' ? 1 : 0)
    + (filters.showExpired ? 1 : 0)
    + (!hideHousingDuplicates && filters.city !== 'Todas' ? 1 : 0)
    + (!hideHousingDuplicates && filters.propertyType !== 'Todos' ? 1 : 0)
    + additionalFilterCount;

  function setKind(value) {
    setParams({
      aba: value === 'direct' ? 'direta' : 'leiloes',
      modalidade: 'Todos',
      rodada: 'Todos',
    });
  }

  function clearVisibleFilters() {
    onClearAdditionalFilters?.();
    const cleared = {
      estado: 'Todos', rodada: 'Todos', modalidade: 'Todos',
      desconto: '0', encerrados: '0',
      ...additionalClearPatch,
    };
    if (!hideHousingDuplicates) Object.assign(cleared, { cidade: 'Todas', tipo: 'Todos' });
    setParams(cleared);
  }

  return <div className={`feed-rail-inner${hideHousingDuplicates ? ' feed-rail-inner--compact' : ''}`}>
    <div className="feed-rail-head">
      <span className="uppy" style={{ color: 'var(--fg-3)' }}>Tipo de venda</span>
      {onCollapse && <button
        type="button"
        className="feed-rail-collapse"
        onClick={onCollapse}
        aria-label="Esconder filtros"
        title="Esconder filtros"
      >«</button>}
    </div>

    <div className="kind-tabs kind-tabs--rail" role="tablist" aria-label="Tipo de venda">
      <button
        role="tab"
        aria-selected={kind === 'auction'}
        aria-label={hideHousingDuplicates ? 'Leilões: têm disputa e data' : undefined}
        title="Leilões têm disputa e uma data para terminar."
        className={kind === 'auction' ? 'active' : ''}
        onClick={() => setKind('auction')}
      >
        <div><strong>Leilões</strong>{!hideHousingDuplicates && <small>tem disputa e data</small>}</div>
      </button>
      <button
        role="tab"
        aria-selected={kind === 'direct'}
        aria-label={hideHousingDuplicates ? 'Compra direta: sem disputa, quem fechar primeiro leva' : undefined}
        title="Compra direta não tem disputa: quem concluir primeiro fica com o imóvel."
        className={kind === 'direct' ? 'active' : ''}
        onClick={() => setKind('direct')}
        disabled={directCount === 0}
      >
        <div>
          <strong>Compra direta</strong>
          {!hideHousingDuplicates && <small>{directCount === 0 ? 'nenhum disponível agora' : 'sem disputa, quem fecha primeiro leva'}</small>}
        </div>
      </button>
    </div>

    {additionalFilters}

    {stateOptions.length > 2 && <div className="feed-rail-section">
      {!hideHousingDuplicates && <span className="uppy feed-rail-section-title">Estado</span>}
      <div className="feed-rail-stack">
        <Filter label="Estado" value={filters.state}
          field={hideHousingDuplicates}
          options={stateOptions}
          onChange={(value) => setFilters({ ...filters, state: value, city: 'Todas' })} />
      </div>
    </div>}

    {!hideHousingDuplicates && <div className="feed-rail-section">
      <span className="uppy feed-rail-section-title">Localização</span>
      <div className="feed-rail-stack">
        <Filter label="Cidade" value={filters.city}
          options={cityOptions}
          onChange={(value) => setFilters({ ...filters, city: value })} />
      </div>
    </div>}

    <div className="feed-rail-section feed-rail-section--availability">
      <span className="uppy feed-rail-section-title">Disponibilidade</span>
      <FilterSwitch
        checked={filters.showExpired}
        onChange={(value) => setFilters({ ...filters, showExpired: value })}
        label={hideHousingDuplicates ? 'Incluir encerrados' : 'Mostrar imóveis encerrados'}
        helper={hideHousingDuplicates ? null : 'Incluir imóveis cuja janela de compra já fechou'}
        title="Inclui imóveis cuja janela de compra já terminou."
      />
    </div>

    {showDetailSection && <div className="feed-rail-section feed-rail-section--details">
      {!hideHousingDuplicates && <span className="uppy feed-rail-section-title">Tipo de imóvel</span>}
      <div className="feed-rail-stack">
        {!hideHousingDuplicates && propertyTypeOptions.length > 2 && <Filter
          label="Tipo" value={filters.propertyType}
          options={propertyTypeOptions}
          onChange={(value) => setFilters({ ...filters, propertyType: value })}
        />}
        {saleDetailVisibility.showPraca && <Filter label="Rodada" value={filters.praca}
          field={hideHousingDuplicates}
          options={pracaOptions}
          onChange={(value) => setFilters({ ...filters, praca: value })} />}
        {saleDetailVisibility.showModalidade && <Filter label="Modalidade" value={filters.modalidade}
          field={hideHousingDuplicates}
          options={modalityOptions}
          onChange={(value) => setFilters({ ...filters, modalidade: value, praca: 'Todos' })} />}
      </div>
    </div>}

    <div className="feed-rail-section feed-rail-section--discount">
      <span className="uppy feed-rail-section-title">
        {hideHousingDuplicates ? 'Desconto mínimo' : 'Abaixo da avaliação'}
      </span>
      <div className="feed-rail-slider">
        <div className="feed-rail-slider-row">
          {hideHousingDuplicates && <span>Abaixo da avaliação</span>}
          <strong className="mono">{filters.discountMin}%</strong>
        </div>
        <input
          type="range" min="0" max="60" step="1"
          value={filters.discountMin}
          onChange={(event) => setFilters({ ...filters, discountMin: +event.target.value })}
          className="slider"
          style={{ '--fill': `${(filters.discountMin / 60) * 100}%` }}
          aria-label="Desconto mínimo abaixo da avaliação (em porcento)"
        />
      </div>
    </div>

    {visibleFilterCount > 0 && <button
      type="button"
      className="btn ghost sm feed-rail-clear"
      onClick={clearVisibleFilters}
      style={{ color: 'var(--accent)' }}
    >Limpar filtros ({visibleFilterCount})</button>}
  </div>;
}

export default function Feed({ watched, toggleWatch, properties, loading = false, embedded = false }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const { kind, filters, sort, view, page } = readParams(searchParams);
  const [sortNow, setSortNow] = useState(() => Date.now());
  // Mobile: railOpen controla se o rail aparece ou não E ("drawer" aberto/fechado).
  // Desktop: rail também começa aberto. O clique no « fecha, e o botão ⚙ na
  // toolbar volta a abrir.
  const [railOpen, setRailOpen] = useState(() => !embedded);
  const PAGE_SIZE = 12;

  // `replace` na paginação evita uma entrada de histórico para cada expansão.
  const setParams = useCallback((patch, { replace = false } = {}) => {
    setSearchParams(current => patchSearchParams(current, patch), { replace });
  }, [setSearchParams]);

  const setSort = (value) => setParams({ ordem: value });
  const setView = (value) => setParams({ vis: value === 'list' ? 'lista' : 'grid' });
  const setPage = (value) => setParams({ pagina: String(value) }, { replace: true });
  const byKind = useMemo(
    () => properties.filter(p => isDirectSaleModality(p.modalidade) === (kind === 'direct')),
    [properties, kind],
  );
  const filtered = useMemo(() => {
    let list = [...byKind];

    if (filters.propertyType !== 'Todos') list = list.filter(p => p.type === filters.propertyType);
    if (filters.discountMin > 0) list = list.filter(p => (p.discount ?? p.auctionDiscount ?? 0) >= filters.discountMin);
    if (filters.state !== 'Todos') list = list.filter(p => normalizeLocation(p.uf) === normalizeLocation(filters.state));
    if (filters.city !== 'Todas') list = list.filter(p => normalizeLocation(p.city) === normalizeLocation(filters.city));
    if (filters.praca !== 'Todos') list = list.filter(p => p.praca === filters.praca);
    if (filters.modalidade !== 'Todos') list = list.filter(p => p.modalidade === filters.modalidade);
    // Esconde imóveis encerrados por padrão — leilão cuja data já passou e
    // compra direta cuja janela de compra expirou. Sem data válida o item
    // passa (não temos como saber se expirou), e o toggle "Mostrar imóveis
    // encerrados" liga/desliga isso para a listagem inteira.
    if (!filters.showExpired) {
      list = list.filter(p => {
        const endsAt = getEndsAtMs(p.endsAt);
        if (!Number.isFinite(endsAt) || endsAt <= 0) return true;
        return endsAt > sortNow;
      });
    }

    if (sort === 'relevance') {
      // Relevância = data próxima primeiro, depois quanto do imóvel a gente
      // realmente conhece. Um imóvel sem foto, sem área e sem quartos é ruído
      // para quem está escolhendo onde morar, mesmo com desconto alto.
      const completeness = (p) => (
        (p.photoUrl ? 2 : 0) + (p.area > 0 ? 1 : 0) + (p.beds > 0 ? 1 : 0)
        + (p.neighborhood ? 1 : 0) + (Number.isFinite(p.appraisal) && p.appraisal > 0 ? 1 : 0)
      );
      list.sort((a, b) => {
        const aDate = getEndsAtMs(a.endsAt);
        const bDate = getEndsAtMs(b.endsAt);
        const aUpcoming = Number.isFinite(aDate) && aDate > sortNow ? aDate : Number.POSITIVE_INFINITY;
        const bUpcoming = Number.isFinite(bDate) && bDate > sortNow ? bDate : Number.POSITIVE_INFINITY;
        if (aUpcoming !== bUpcoming) return aUpcoming - bUpcoming;
        return completeness(b) - completeness(a);
      });
    }
    else if (sort === 'discount') list.sort((a, b) =>
      (b.discount ?? b.auctionDiscount ?? 0) - (a.discount ?? a.auctionDiscount ?? 0));
    else if (sort === 'soonest') {
      // This mode is about upcoming opportunities, not chronological history:
      // expired listings disappear, future dates come first, and missing dates
      // remain available only after every known upcoming deadline.
      list = list
        .filter(p => {
          const endsAt = getEndsAtMs(p.endsAt);
          return !Number.isFinite(endsAt) || endsAt <= 0 || endsAt > sortNow;
        })
        .sort((a, b) => {
          const aDate = getEndsAtMs(a.endsAt);
          const bDate = getEndsAtMs(b.endsAt);
          const aUpcoming = Number.isFinite(aDate) && aDate > sortNow ? aDate : Number.POSITIVE_INFINITY;
          const bUpcoming = Number.isFinite(bDate) && bDate > sortNow ? bDate : Number.POSITIVE_INFINITY;
          return aUpcoming - bUpcoming;
        });
    }
    else if (sort === 'price-asc') list.sort((a, b) => a.minBid - b.minBid);
    else if (sort === 'price-desc') list.sort((a, b) => b.minBid - a.minBid);
    return list;
  }, [filters, sort, sortNow, byKind]);

  useEffect(() => {
    if (sort !== 'soonest' && sort !== 'relevance') return undefined;
    const interval = window.setInterval(() => setSortNow(Date.now()), 60_000);
    return () => window.clearInterval(interval);
  }, [sort]);

  const paginated = filtered.slice(0, page * PAGE_SIZE);

  // Chip count no botão ⚙: filtros que desviam do padrão.
  const activeFilterCount =
    (filters.propertyType !== 'Todos' ? 1 : 0) +
    (filters.discountMin > 0 ? 1 : 0) +
    (filters.state !== 'Todos' ? 1 : 0) +
    (filters.city !== 'Todas' ? 1 : 0) +
    (filters.praca !== 'Todos' ? 1 : 0) +
    (filters.modalidade !== 'Todos' ? 1 : 0) +
    (filters.showExpired ? 1 : 0);

  // Em viewports estreitas o rail vira um "drawer" (media query o esconde por
  // padrão). Quando ele está aberto e a tela é estreita, Esc e click-fora
  // fecham. Em telas largas o rail nunca é um drawer — fica sempre visível
  // até o usuário apertar o «.
  useEffect(() => {
    if (!railOpen) return undefined;
    const mq = window.matchMedia('(max-width: 1100px)');
    const isMobileViewport = mq.matches;
    if (!isMobileViewport) return undefined;
    const onKeyDown = (event) => {
      if (event.key === 'Escape') setRailOpen(false);
    };
    const onPointerDown = (event) => {
      if (event.target.closest('.feed-rail')) return;
      if (event.target.closest('.feed-filter-toggle')) return;
      setRailOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, [railOpen]);

  return (
    <div className="page feed-page">

      {/* Header */}
      <div className="row between page-header fade-in" style={{ alignItems: 'flex-end', marginBottom: 18 }}>
        <div>
          <h1 className="h1">Imóveis</h1>
          <p style={{ margin: '4px 0 0', color: 'var(--fg-2)', fontSize: 14 }}>
            Imóveis da Caixa, com a conta de quanto você pagaria até receber a chave.
          </p>
        </div>
      </div>

      <div className={`feed-layout${railOpen && !embedded ? '' : ' rail-collapsed'}`}>
        {!embedded && <aside
          id="feed-rail"
          className={`feed-rail${railOpen ? ' open' : ''}`}
          aria-label="Filtros de busca"
          aria-hidden={!railOpen}
        >
          <CatalogSidebarFilters properties={properties} onCollapse={() => setRailOpen(false)} />
        </aside>}

        {/* ─── Main: toolbar horizontal + resultados ─── */}
        <div className="feed-main">
          {/* Toolbar — total, toggle do rail, ordenação e visualização */}
          <div className="feed-toolbar" role="region" aria-label="Barra de ferramentas do feed">
            {!embedded && !railOpen && (
              <button
                type="button"
                onClick={() => setRailOpen(true)}
                aria-expanded={railOpen}
                aria-controls="feed-rail"
                className="feed-filter-toggle open"
              >
                <span className="mono" aria-hidden="true">⚙</span>
                Filtros
                {activeFilterCount > 0 && (
                  <span className="feed-filter-count">{activeFilterCount}</span>
                )}
              </button>
            )}

            <div className="feed-result-count" aria-live="polite">
              <span><b>{filtered.length}</b>{filtered.length === 1 ? ' imóvel' : ' imóveis'}</span>
              <span className="mono">{filtered.length ? `1–${paginated.length} de ${filtered.length}` : '0 de 0'}</span>
            </div>

            <Sort value={sort} onChange={(value) => {
              if (value === 'soonest') setSortNow(Date.now());
              setSort(value);
            }} />
            <ViewToggle value={view} onChange={setView} />
          </div>

      {/* Content */}
      {loading && properties.length === 0 ? (
        <Loading />
      ) : filtered.length === 0 ? (
        <Empty />
      ) : view === 'grid' ? (
        <div className="property-grid feed-grid" style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))',
          gap: 24,
        }}>
          {paginated.map((p, i) => (
            <PropertyCard
              key={p.id}
              p={p}
              watched={watched.includes(p.id)}
              onToggleWatch={toggleWatch}
              staggerIndex={i}
            />
          ))}
        </div>
      ) : (
        <div className="card responsive-table" style={{ overflow: 'hidden' }}>
          {/* Sete colunas de cabeçalho para as sete células que PropertyRow
              renderiza. Antes havia uma coluna "risco" sem dado embaixo, o que
              deslocava todas as colunas seguintes. */}
          <div className="property-row table-head" style={{
            display: 'grid',
            gridTemplateColumns: '60px 1.6fr 1fr 1fr 1fr 1fr 32px',
            gap: 14,
            padding: '10px 18px',
            background: 'var(--bg-2)',
            fontSize: 10.5,
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            fontFamily: 'var(--f-mono)',
            color: 'var(--fg-3)',
          }}>
            <span>foto</span>
            <span>imóvel</span>
            <span>valor inicial</span>
            <span>avaliação</span>
            <span>imóveis parecidos</span>
            <span>{kind === 'direct' ? 'disponível' : 'leilão em'}</span>
            <span></span>
          </div>
          {paginated.map(p => (
            <PropertyRow
              key={p.id}
              p={p}
              watched={watched.includes(p.id)}
              onToggleWatch={toggleWatch}
            />
          ))}
        </div>
      )}

      {paginated.length < filtered.length && (
        <div style={{ textAlign: 'center', marginTop: 48 }}>
          <button className="btn lg" onClick={() => setPage(page + 1)}>
            Carregar mais
            <span className="mono" style={{ fontSize: 11, color: 'var(--fg-2)', marginLeft: 6 }}>
              {(filtered.length - paginated.length).toLocaleString('pt-BR')} restantes
            </span>
          </button>
        </div>
      )}
        </div>
      </div>
    </div>
  );
}

function Filter({ label, value, options, onChange, field = false }) {
  const [open, setOpen] = useState(false);
  const active = value !== options[0];
  return (
    <div className={`feed-filter${field ? ' feed-filter--field' : ''}${active ? ' active' : ''}`} style={{ position: 'relative' }}>
      {field && <span className="feed-filter-field-label">{label}</span>}
      <button
        type="button"
        className="feed-filter-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        style={field ? undefined : {
          display: 'inline-flex', alignItems: 'center', gap: 8,
          height: 32, padding: '0 12px',
          borderRadius: 8,
          border: '1px solid ' + (active ? 'var(--line-3)' : 'var(--line-1)'),
          background: active ? 'var(--bg-2)' : 'var(--bg-1)',
          color: active ? 'var(--fg-0)' : 'var(--fg-1)',
          fontSize: 12.5,
        }}
      >
        {!field && <span className="mono" style={{ fontSize: 10, color: 'var(--fg-3)' }}>{label}:</span>}
        <span style={{ fontWeight: active ? 500 : 400 }}>{value}</span>
        <span className="mono feed-filter-caret">▾</span>
      </button>
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 30 }}></div>
          <div className="card" style={{
            position: 'absolute', top: 'calc(100% + 4px)', left: 0,
            minWidth: 180, maxHeight: 320, overflowY: 'auto', padding: 4, zIndex: 31,
            boxShadow: '0 10px 28px rgba(17,24,39,0.08)',
          }}>
            {options.map(o => (
              <button
                key={o}
                onClick={() => { onChange(o); setOpen(false); }}
                style={{
                  display: 'block', width: '100%', textAlign: 'left',
                  padding: '7px 10px', borderRadius: 5,
                  fontSize: 12.5,
                  color: o === value ? 'var(--accent)' : 'var(--fg-1)',
                  background: o === value ? 'var(--accent-soft)' : 'transparent',
                  fontWeight: o === value ? 500 : 400,
                }}
                onMouseEnter={(e) => { if (o !== value) e.currentTarget.style.background = 'var(--bg-2)'; }}
                onMouseLeave={(e) => { if (o !== value) e.currentTarget.style.background = 'transparent'; }}
              >
                {o}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function Sort({ value, onChange }) {
  return (
    <div className="row gap-2" style={{ alignItems: 'center' }}>
      <span className="mono" style={{ fontSize: 10, color: 'var(--fg-3)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
        ordenar
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          height: 32, padding: '0 28px 0 12px',
          borderRadius: 8,
          border: '1px solid var(--line-1)',
          background: 'var(--bg-1)',
          fontSize: 12.5,
          fontFamily: 'var(--f-sans)',
          cursor: 'pointer',
          appearance: 'none',
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='8' height='5' viewBox='0 0 8 5' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M0 0l4 5 4-5z' fill='%23999'/%3E%3C/svg%3E")`,
          backgroundRepeat: 'no-repeat',
          backgroundPosition: 'right 10px center',
        }}
      >
        <option value="relevance">mais relevantes</option>
        <option value="discount">maior desconto estimado</option>
        <option value="soonest">encerra em breve</option>
        <option value="price-asc">menor preço</option>
        <option value="price-desc">maior preço</option>
      </select>
    </div>
  );
}

function ViewToggle({ value, onChange }) {
  return (
    <div style={{
      display: 'inline-flex',
      border: '1px solid var(--line-1)',
      borderRadius: 8,
      overflow: 'hidden',
      background: 'var(--bg-1)',
    }}>
      <button
        onClick={() => onChange('grid')}
        style={{
          height: 32, padding: '0 12px',
          background: value === 'grid' ? 'var(--bg-3)' : 'transparent',
          color: value === 'grid' ? 'var(--fg-0)' : 'var(--fg-2)',
          fontSize: 12, fontWeight: 500,
        }}
      >
        <span className="mono">▦</span> grid
      </button>
      <button
        onClick={() => onChange('list')}
        style={{
          height: 32, padding: '0 12px',
          background: value === 'list' ? 'var(--bg-3)' : 'transparent',
          color: value === 'list' ? 'var(--fg-0)' : 'var(--fg-2)',
          fontSize: 12, fontWeight: 500,
          borderLeft: '1px solid var(--line-1)',
        }}
      >
        <span className="mono">≡</span> lista
      </button>
    </div>
  );
}

function Loading() {
  return (
    <div className="card" style={{ padding: 60, textAlign: 'center' }}>
      <span className="countdown" style={{ justifyContent: 'center', color: 'var(--fg-2)' }}>
        <span className="dot" style={{ background: 'var(--accent)' }}></span>
        <span className="mono">Carregando imóveis…</span>
      </span>
    </div>
  );
}

function Empty() {
  return (
    <div className="card" style={{ padding: 60, textAlign: 'center' }}>
      <div style={{ fontSize: 28, color: 'var(--fg-3)', marginBottom: 12 }}>∅</div>
      <h3 className="h3" style={{ marginBottom: 6 }}>Nenhum resultado</h3>
      <p style={{ color: 'var(--fg-2)', margin: 0, fontSize: 13 }}>
        Afrouxe um filtro e tente novamente.
      </p>
    </div>
  );
}

// Switch iOS-style para filtros binários no rail.
// O knob se move horizontalmente e muda de cor quando ligado. Marcar com
// role="switch" comunica o estado binário para leitores de tela.
function FilterSwitch({ checked, onChange, label, helper, title }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      title={title}
      onClick={() => onChange(!checked)}
      className={`feed-switch${checked ? ' on' : ''}`}
    >
      <span className="feed-switch-knob" aria-hidden="true"></span>
      <span className="feed-switch-body">
        <span className="feed-switch-label">{label}</span>
        {helper && <span className="feed-switch-helper">{helper}</span>}
      </span>
    </button>
  );
}
