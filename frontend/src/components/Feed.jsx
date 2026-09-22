import { useState, useMemo, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { PropertyCard, PropertyRow } from './shared';
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

// A busca mora na URL, e não em estado local: é isso que faz voltar de um
// imóvel devolver a mesma lista, e faz uma busca ser compartilhável. Só o que
// difere do padrão aparece no endereço, para não virar uma parede de
// parâmetros.
const DEFAULTS = {
  aba: 'leiloes', q: '', estado: 'Todos', cidade: 'Todas', tipo: 'Todos',
  rodada: 'Todos', modalidade: 'Todos', desconto: '0',
  ordem: 'relevance', vis: 'grid', pagina: '1', encerrados: '0',
};

function readParams(searchParams) {
  const get = (key) => searchParams.get(key) ?? DEFAULTS[key];
  return {
    kind: get('aba') === 'direta' ? 'direct' : 'auction',
    addressQuery: get('q'),
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

export default function Feed({ watched, toggleWatch, properties, loading = false, embedded = false }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const { kind, addressQuery, filters, sort, view, page } = readParams(searchParams);
  const [sortNow, setSortNow] = useState(() => Date.now());
  // Mobile: railOpen controla se o rail aparece ou não E ("drawer" aberto/fechado).
  // Desktop: rail também começa aberto. O clique no « fecha, e o botão ⚙ na
  // toolbar volta a abrir.
  const [railOpen, setRailOpen] = useState(() => !embedded);
  const PAGE_SIZE = 12;

  // `replace` para o que a pessoa ajusta em rajada (texto e paginação): cada
  // tecla não deve virar uma entrada no histórico.
  const setParams = useCallback((patch, { replace = false } = {}) => {
    setSearchParams(current => {
      const next = new URLSearchParams(current);
      Object.entries(patch).forEach(([key, value]) => {
        const asText = value == null ? '' : String(value);
        if (asText === '' || asText === DEFAULTS[key]) next.delete(key);
        else next.set(key, asText);
      });
      // Qualquer mudança de busca recomeça da primeira página.
      if (!('pagina' in patch)) next.delete('pagina');
      return next;
    }, { replace });
  }, [setSearchParams]);

  const setKind = (value) => setParams({ aba: value === 'direct' ? 'direta' : 'leiloes' });
  const setAddressQuery = (value) => setParams({ q: value }, { replace: true });
  const setSort = (value) => setParams({ ordem: value });
  const setView = (value) => setParams({ vis: value === 'list' ? 'lista' : 'grid' });
  const setPage = (value) => setParams({ pagina: String(value) }, { replace: true });
  const setFilters = (next) => setParams({
    estado: next.state, cidade: next.city, tipo: next.propertyType,
    rodada: next.praca, modalidade: next.modalidade, desconto: String(next.discountMin),
    encerrados: next.showExpired ? '1' : '0',
  });

  const byKind = useMemo(
    () => properties.filter(p => isDirectSaleModality(p.modalidade) === (kind === 'direct')),
    [properties, kind],
  );
  const directCount = useMemo(
    () => properties.filter(p => isDirectSaleModality(p.modalidade)).length,
    [properties],
  );

  const stateOptions = useMemo(() => [
    'Todos',
    ...[...new Set(byKind.map(p => p.uf).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, 'pt-BR')),
  ], [byKind]);

  const cityOptions = useMemo(() => {
    const selectedState = normalizeLocation(filters.state);
    const cities = byKind
      .filter(p => filters.state === 'Todos' || normalizeLocation(p.uf) === selectedState)
      .map(p => p.city)
      .filter(Boolean);
    const uniqueByNormalizedName = new Map();
    cities.forEach(city => uniqueByNormalizedName.set(normalizeLocation(city), formatCity(city)));
    return ['Todas', ...[...uniqueByNormalizedName.values()].sort((a, b) => a.localeCompare(b, 'pt-BR'))];
  }, [byKind, filters.state]);

  const propertyTypeOptions = useMemo(() => [
    'Todos',
    ...[...new Set(byKind.map(p => p.type).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, 'pt-BR')),
  ], [byKind]);

  const modalityOptions = useMemo(() => [
    'Todos',
    ...[...new Set(byKind.map(p => p.modalidade).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, 'pt-BR')),
  ], [byKind]);

  const pracaOptions = useMemo(() => {
    const eligible = byKind.filter(p =>
      filters.modalidade === 'Todos' || p.modalidade === filters.modalidade);
    return [
      'Todos',
      ...[...new Set(eligible.map(p => p.praca).filter(Boolean))]
        .sort((a, b) => a.localeCompare(b, 'pt-BR')),
    ];
  }, [byKind, filters.modalidade]);

  const filtered = useMemo(() => {
    let list = [...byKind];

    if (addressQuery.trim()) {
      const q = addressQuery.toLowerCase();
      list = list.filter(p =>
        p.address?.toLowerCase().includes(q) ||
        p.neighborhood?.toLowerCase().includes(q) ||
        p.city?.toLowerCase().includes(q) ||
        p.title?.toLowerCase().includes(q)
      );
    }
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
  }, [addressQuery, filters, sort, sortNow, byKind]);

  useEffect(() => {
    if (sort !== 'soonest' && sort !== 'relevance') return undefined;
    const interval = window.setInterval(() => setSortNow(Date.now()), 60_000);
    return () => window.clearInterval(interval);
  }, [sort]);

  const paginated = filtered.slice(0, page * PAGE_SIZE);

  // Chip count no botão ⚙: apenas filtros não-search que desviam do padrão.
  // A query de busca tem seu próprio campo sempre visível; contá-la aqui
  // faria o chip piscar "1" sempre que alguém digita, o que confunde.
  const activeFilterCount =
    (filters.propertyType !== 'Todos' ? 1 : 0) +
    (filters.discountMin > 0 ? 1 : 0) +
    (filters.state !== 'Todos' ? 1 : 0) +
    (filters.city !== 'Todas' ? 1 : 0) +
    (filters.praca !== 'Todos' ? 1 : 0) +
    (filters.modalidade !== 'Todos' ? 1 : 0) +
    (filters.showExpired ? 1 : 0);

  const clearAll = () => setParams({
    q: '', estado: 'Todos', cidade: 'Todas', tipo: 'Todos',
    rodada: 'Todos', modalidade: 'Todos', desconto: '0', encerrados: '0',
  });

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

      <div className={`feed-layout${railOpen ? '' : ' rail-collapsed'}`}>
        {/* ─── Sidebar: kind tabs + todos os filtros ─── */}
        <aside
          id="feed-rail"
          className={`feed-rail${railOpen ? ' open' : ''}`}
          aria-label="Filtros de busca"
          aria-hidden={!railOpen}
        >
          <div className="feed-rail-inner">
            <div className="feed-rail-head">
              <span className="uppy" style={{ color: 'var(--fg-3)' }}>Tipo de venda</span>
              <button
                type="button"
                className="feed-rail-collapse"
                onClick={() => setRailOpen(false)}
                aria-label="Esconder filtros"
                title="Esconder filtros"
              >
                «
              </button>
            </div>

            {/* Kind tabs — botões full-width empilhados verticalmente */}
            <div className="kind-tabs kind-tabs--rail" role="tablist" aria-label="Tipo de venda">
              <button
                role="tab"
                aria-selected={kind === 'auction'}
                className={kind === 'auction' ? 'active' : ''}
                onClick={() => setKind('auction')}
              >
                <div>
                  <strong>Leilões</strong>
                  <small>tem disputa e data</small>
                </div>
              </button>
              <button
                role="tab"
                aria-selected={kind === 'direct'}
                className={kind === 'direct' ? 'active' : ''}
                onClick={() => setKind('direct')}
                disabled={directCount === 0}
              >
                <div>
                  <strong>Compra direta</strong>
                  <small>{directCount === 0 ? 'nenhum disponível agora' : 'sem disputa, quem fecha primeiro leva'}</small>
                </div>
              </button>
            </div>

            {/* Localização */}
            <div className="feed-rail-section">
              <span className="uppy" style={{ color: 'var(--fg-3)', display: 'block', marginBottom: 10 }}>Localização</span>
              <div className="feed-rail-stack">
                {stateOptions.length > 2 && (
                  <Filter label="Estado" value={filters.state}
                    options={stateOptions}
                    onChange={(v) => setFilters({ ...filters, state: v, city: 'Todas' })} />
                )}
                <Filter label="Cidade" value={filters.city}
                  options={cityOptions}
                  onChange={(v) => setFilters({ ...filters, city: v })} />
              </div>
            </div>

            {/* Disponibilidade — toggle de leilões já encerrados */}
            <div className="feed-rail-section">
              <span className="uppy" style={{ color: 'var(--fg-3)', display: 'block', marginBottom: 10 }}>Disponibilidade</span>
              <FilterSwitch
                checked={filters.showExpired}
                onChange={(v) => setFilters({ ...filters, showExpired: v })}
                label="Mostrar imóveis encerrados"
                helper="Incluir imóveis cuja janela de compra já fechou"
              />
            </div>

            {/* Tipo de imóvel */}
            <div className="feed-rail-section">
              <span className="uppy" style={{ color: 'var(--fg-3)', display: 'block', marginBottom: 10 }}>Tipo de imóvel</span>
              <div className="feed-rail-stack">
                {propertyTypeOptions.length > 2 && (
                  <Filter label="Tipo" value={filters.propertyType}
                    options={propertyTypeOptions}
                    onChange={(v) => setFilters({ ...filters, propertyType: v })} />
                )}
                {pracaOptions.length > 1 && (
                  <Filter label="Rodada" value={filters.praca}
                    options={pracaOptions}
                    onChange={(v) => setFilters({ ...filters, praca: v })} />
                )}
                {modalityOptions.length > 2 && (
                  <Filter label="Modalidade" value={filters.modalidade}
                    options={modalityOptions}
                    onChange={(v) => setFilters({ ...filters, modalidade: v, praca: 'Todos' })} />
                )}
              </div>
            </div>

            <div className="feed-rail-section">
              <span className="uppy" style={{ color: 'var(--fg-3)', display: 'block', marginBottom: 6 }}>
                Abaixo da avaliação
              </span>
              <div className="feed-rail-slider">
                <div className="feed-rail-slider-row">
                  <strong className="mono">{filters.discountMin}%</strong>
                </div>
                <input
                  type="range"
                  min="0"
                  max="60"
                  step="1"
                  value={filters.discountMin}
                  onChange={(e) => setFilters({ ...filters, discountMin: +e.target.value })}
                  className="slider"
                  style={{ '--fill': `${(filters.discountMin / 60) * 100}%` }}
                  aria-label="Desconto mínimo abaixo da avaliação (em porcento)"
                />
              </div>
            </div>

            {activeFilterCount > 0 && (
              <button
                type="button"
                className="btn ghost sm feed-rail-clear"
                onClick={clearAll}
                style={{ color: 'var(--accent)' }}
              >
                Limpar filtros ({activeFilterCount})
              </button>
            )}
          </div>
        </aside>

        {/* ─── Main: toolbar horizontal + resultados ─── */}
        <div className="feed-main">
          {/* Toolbar — busca, toggle do rail, sort, view */}
          <div className="feed-toolbar" role="region" aria-label="Barra de ferramentas do feed">
            {!railOpen && (
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

            <div className="feed-search">
              <span className="mono feed-search-icon">⌕</span>
              <input
                placeholder="Endereço, bairro, cidade..."
                value={addressQuery}
                onChange={(e) => setAddressQuery(e.target.value)}
                aria-label="Buscar por endereço, bairro ou cidade"
              />
              {addressQuery && (
                <button
                  onClick={() => setAddressQuery('')}
                  aria-label="Limpar busca"
                  className="feed-search-clear"
                >
                  ×
                </button>
              )}
            </div>

            <Sort value={sort} onChange={(value) => {
              if (value === 'soonest') setSortNow(Date.now());
              setSort(value);
            }} />
            <ViewToggle value={view} onChange={setView} />
          </div>

      {/* Result count */}
      <div className="row between" style={{ marginBottom: 16, alignItems: 'baseline' }}>
        <span style={{ fontSize: 13, color: 'var(--fg-2)' }}>
          <b style={{ color: 'var(--fg-0)' }}>{filtered.length}</b>
          {filtered.length === 1 ? ' imóvel' : ' imóveis'}
        </span>
        <span className="mono" style={{ fontSize: 11, color: 'var(--fg-3)' }}>
          1–{paginated.length} de {filtered.length}
        </span>
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

function Filter({ label, value, options, onChange }) {
  const [open, setOpen] = useState(false);
  const active = value !== options[0];
  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 8,
          height: 32, padding: '0 12px',
          borderRadius: 8,
          border: '1px solid ' + (active ? 'var(--line-3)' : 'var(--line-1)'),
          background: active ? 'var(--bg-2)' : 'var(--bg-1)',
          color: active ? 'var(--fg-0)' : 'var(--fg-1)',
          fontSize: 12.5,
        }}
      >
        <span className="mono" style={{ fontSize: 10, color: 'var(--fg-3)' }}>{label}:</span>
        <span style={{ fontWeight: active ? 500 : 400 }}>{value}</span>
        <span className="mono" style={{ fontSize: 10, color: 'var(--fg-3)' }}>▾</span>
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
function FilterSwitch({ checked, onChange, label, helper }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
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
