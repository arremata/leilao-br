import { useState, useMemo, useEffect } from 'react';
import { PropertyCard, PropertyRow } from './shared';
import { getEndsAtMs } from '../utils';

const normalizeLocation = (value) => String(value || '')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .trim().toUpperCase();

const formatCity = (value) => String(value || '').toLocaleLowerCase('pt-BR')
  .replace(/(^|\s)\S/g, letter => letter.toLocaleUpperCase('pt-BR'));

export default function Feed({ go, watched, toggleWatch, properties, initialAddress = '', initialFilters = null }) {
  const [addressQuery, setAddressQuery] = useState(initialAddress);
  const [filters, setFilters] = useState({
    judicial: initialFilters?.judicial || 'Todos',
    praca: initialFilters?.praca || 'Todos',
    modalidade: initialFilters?.modalidade || 'Todos',
    propertyType: initialFilters?.propertyType || 'Todos',
    discountMin: initialFilters?.discountMin || 0,
    state: initialFilters?.state || initialFilters?.uf || 'Todos',
    city: initialFilters?.city || 'Todas',
  });
  const [sort, setSort] = useState('discount');
  const [sortNow, setSortNow] = useState(() => Date.now());
  const [view, setView] = useState('grid');
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 12;

  const stateOptions = useMemo(() => [
    'Todos',
    ...[...new Set(properties.map(p => p.uf).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, 'pt-BR')),
  ], [properties]);

  const cityOptions = useMemo(() => {
    const selectedState = normalizeLocation(filters.state);
    const cities = properties
      .filter(p => filters.state === 'Todos' || normalizeLocation(p.uf) === selectedState)
      .map(p => p.city)
      .filter(Boolean);
    const uniqueByNormalizedName = new Map();
    cities.forEach(city => uniqueByNormalizedName.set(normalizeLocation(city), formatCity(city)));
    return ['Todas', ...[...uniqueByNormalizedName.values()].sort((a, b) => a.localeCompare(b, 'pt-BR'))];
  }, [properties, filters.state]);

  const propertyTypeOptions = useMemo(() => [
    'Todos',
    ...[...new Set(properties.map(p => p.type).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, 'pt-BR')),
  ], [properties]);

  const modalityOptions = useMemo(() => [
    'Todos',
    ...[...new Set(properties.map(p => p.modalidade).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, 'pt-BR')),
  ], [properties]);

  const auctionTypeOptions = useMemo(() => [
    'Todos',
    ...[...new Set(properties.map(p => p.auctionType).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, 'pt-BR')),
  ], [properties]);

  const pracaOptions = useMemo(() => {
    const eligible = properties.filter(p =>
      filters.modalidade === 'Todos' || p.modalidade === filters.modalidade);
    return [
      'Todos',
      ...[...new Set(eligible.map(p => p.praca).filter(Boolean))]
        .sort((a, b) => a.localeCompare(b, 'pt-BR')),
    ];
  }, [properties, filters.modalidade]);

  const filtered = useMemo(() => {
    let list = [...properties];

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
    if (filters.judicial !== 'Todos') list = list.filter(p => p.auctionType === filters.judicial);
    if (filters.praca !== 'Todos') list = list.filter(p => p.praca === filters.praca);
    if (filters.modalidade !== 'Todos') list = list.filter(p => p.modalidade === filters.modalidade);

    if (sort === 'discount') list.sort((a, b) =>
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
  }, [addressQuery, filters, sort, sortNow, properties]);

  useEffect(() => {
    if (sort !== 'soonest') return undefined;
    const interval = window.setInterval(() => setSortNow(Date.now()), 60_000);
    return () => window.clearInterval(interval);
  }, [sort]);

  // Pagination is UI-derived state; resetting here is intentional whenever
  // search/sort inputs change.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setPage(1); }, [addressQuery, filters, sort]);

  const paginated = filtered.slice(0, page * PAGE_SIZE);

  const activeFilterCount =
    (addressQuery.trim() ? 1 : 0) +
    (filters.propertyType !== 'Todos' ? 1 : 0) +
    (filters.discountMin > 0 ? 1 : 0) +
    (filters.state !== 'Todos' ? 1 : 0) +
    (filters.city !== 'Todas' ? 1 : 0) +
    (filters.judicial !== 'Todos' ? 1 : 0) +
    (filters.praca !== 'Todos' ? 1 : 0) +
    (filters.modalidade !== 'Todos' ? 1 : 0);

  const clearAll = () => {
    setAddressQuery('');
    setFilters({
      judicial: 'Todos', praca: 'Todos', modalidade: 'Todos',
      propertyType: 'Todos',
      discountMin: 0, state: 'Todos', city: 'Todas',
    });
  };

  return (
    <div className="page feed-page" style={{ maxWidth: 1480, margin: '0 auto', padding: '28px 28px 80px' }}>

      {/* Header */}
      <div className="row between page-header fade-in" style={{ alignItems: 'flex-end', marginBottom: 18 }}>
        <div>
          <div className="eyebrow" style={{ marginBottom: 6 }}>
            <span className="ix">§ feed</span>
            <span>todas as oportunidades ativas</span>
          </div>
          <h1 className="h1">Feed de oportunidades</h1>
          <p style={{ margin: '4px 0 0', color: 'var(--fg-2)', fontSize: 14 }}>
            {properties.length} imóveis no portfólio
          </p>
        </div>
        <div className="row gap-2 page-actions">
          <button className="btn" disabled title="Disponível em breve.">
            <span className="mono" style={{ color: 'var(--fg-2)' }}>↗</span>
            Exportar CSV
            <span className="tag accent" style={{ padding: '1px 5px', fontSize: 8.5 }}>Em breve</span>
          </button>
        </div>
      </div>

      {/* Filter bar */}
      <div className="filter-bar" style={{
        position: 'sticky', top: 60, zIndex: 20,
        background: 'rgba(255,255,255,0.6)',
        backdropFilter: 'blur(16px) saturate(1.3)',
        WebkitBackdropFilter: 'blur(16px) saturate(1.3)',
        padding: '14px 0',
        borderBottom: '1px solid var(--line-1)',
        marginBottom: 20,
      }}>
        <div className="row gap-2 wrap filter-controls" style={{ alignItems: 'center' }}>

          {/* Address text search */}
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            height: 32, padding: '0 10px',
            borderRadius: 8,
            border: '1px solid ' + (addressQuery ? 'var(--line-3)' : 'var(--line-1)'),
            background: 'var(--bg-1)',
            minWidth: 180,
          }}>
            <span className="mono" style={{ color: 'var(--fg-3)', fontSize: 11 }}>⌕</span>
            <input
              placeholder="Endereço, bairro..."
              value={addressQuery}
              onChange={(e) => setAddressQuery(e.target.value)}
              style={{
                border: 0, outline: 'none', background: 'transparent',
                fontSize: 12.5, width: 130,
              }}
            />
            {addressQuery && (
              <button
                onClick={() => setAddressQuery('')}
                style={{ color: 'var(--fg-3)', fontSize: 14, lineHeight: 1 }}
              >
                ×
              </button>
            )}
          </div>

          {auctionTypeOptions.length > 2 && (
            <Filter label="Tipo de leilão" value={filters.judicial}
              options={auctionTypeOptions}
              onChange={(v) => setFilters({ ...filters, judicial: v })} />
          )}
          {pracaOptions.length > 1 && (
            <Filter label="Praça" value={filters.praca}
              options={pracaOptions}
              onChange={(v) => setFilters({ ...filters, praca: v })} />
          )}
          {propertyTypeOptions.length > 2 && (
            <Filter label="Imóvel" value={filters.propertyType}
              options={propertyTypeOptions}
              onChange={(v) => setFilters({ ...filters, propertyType: v })} />
          )}
          {modalityOptions.length > 2 && (
            <Filter label="Modalidade" value={filters.modalidade}
              options={modalityOptions}
              onChange={(v) => setFilters({ ...filters, modalidade: v, praca: 'Todos' })} />
          )}
          {stateOptions.length > 2 && (
            <Filter label="Estado" value={filters.state}
              options={stateOptions}
              onChange={(v) => setFilters({ ...filters, state: v, city: 'Todas' })} />
          )}
          <Filter label="Cidade" value={filters.city}
            options={cityOptions}
            onChange={(v) => setFilters({ ...filters, city: v })} />
          <RangeChip label="Desconto disponível" suffix="%" max={60} value={filters.discountMin}
            onChange={(v) => setFilters({ ...filters, discountMin: v })} />

          {activeFilterCount > 0 && (
            <button
              className="btn ghost sm"
              onClick={clearAll}
              style={{ color: 'var(--accent)' }}
            >
              Limpar {activeFilterCount}
            </button>
          )}

          <span style={{ flex: 1 }}></span>

          <Sort value={sort} onChange={(value) => {
            if (value === 'soonest') setSortNow(Date.now());
            setSort(value);
          }} />
          <ViewToggle value={view} onChange={setView} />
        </div>
      </div>

      {/* Result count */}
      <div className="row between" style={{ marginBottom: 16, alignItems: 'baseline' }}>
        <span className="mono" style={{ fontSize: 12, color: 'var(--fg-2)' }}>
          <b style={{ color: 'var(--fg-0)' }}>{filtered.length.toString().padStart(3, '0')}</b> resultados
          <span style={{ margin: '0 8px' }}>·</span>
          desconto oficial médio {Math.round(filtered.reduce((a, b) => a + (b.auctionDiscount || 0), 0) / Math.max(filtered.length, 1))}%
        </span>
        <span className="mono" style={{ fontSize: 11, color: 'var(--fg-3)' }}>
          1–{paginated.length} de {filtered.length}
        </span>
      </div>

      {/* Content */}
      {filtered.length === 0 ? (
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
              onClick={() => go('detail', p)}
              watched={watched.includes(p.id)}
              onToggleWatch={toggleWatch}
              staggerIndex={i}
            />
          ))}
        </div>
      ) : (
        <div className="card responsive-table" style={{ overflow: 'hidden' }}>
          <div className="property-row table-head" style={{
            display: 'grid',
            gridTemplateColumns: '60px 1.6fr 1fr 1fr 1fr 0.7fr 1fr 32px',
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
            <span>lance</span>
            <span>avaliação</span>
            <span>mercado estimado</span>
            <span>risco</span>
            <span>encerra em</span>
            <span></span>
          </div>
          {paginated.map(p => (
            <PropertyRow
              key={p.id}
              p={p}
              onClick={() => go('detail', p)}
              watched={watched.includes(p.id)}
              onToggleWatch={toggleWatch}
            />
          ))}
        </div>
      )}

      {paginated.length < filtered.length && (
        <div style={{ textAlign: 'center', marginTop: 48 }}>
          <button className="btn lg" onClick={() => setPage(p => p + 1)}>
            Carregar mais
            <span className="mono" style={{ fontSize: 11, color: 'var(--fg-2)', marginLeft: 6 }}>
              {(filtered.length - paginated.length).toLocaleString('pt-BR')} restantes
            </span>
          </button>
        </div>
      )}
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

function RangeChip({ label, suffix, value, onChange, max = 100 }) {
  const active = value > 0;
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 10,
      height: 32, padding: '0 12px',
      borderRadius: 8,
      border: '1px solid ' + (active ? 'var(--line-3)' : 'var(--line-1)'),
      background: active ? 'var(--bg-2)' : 'var(--bg-1)',
      fontSize: 12.5,
      minWidth: 200,
    }}>
      <span className="mono" style={{ fontSize: 10, color: 'var(--fg-3)' }}>{label} ≥</span>
      <span className="mono" style={{
        fontSize: 12, fontWeight: 500,
        color: active ? 'var(--accent)' : 'var(--fg-1)',
        minWidth: 28,
      }}>
        {value}{suffix}
      </span>
      <input
        type="range" min="0" max={max} step="1"
        value={value}
        onChange={(e) => onChange(+e.target.value)}
        className="slider"
        style={{ flex: 1, marginLeft: 4 }}
      />
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
