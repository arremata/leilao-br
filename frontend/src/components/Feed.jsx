import { useState, useMemo } from 'react';
import { PropertyCard, PropertyRow, fmtBRL, getEndsAtMs } from './shared';

export default function Feed({ go, watched, toggleWatch, properties }) {
  const [filters, setFilters] = useState({
    auctionType: 'Todos',
    occupancy: 'Todos',
    propertyType: 'Todos',
    scoreMin: 0,
    discountMin: 0,
    city: 'Todas',
  });
  const [sort, setSort] = useState('score');
  const [view, setView] = useState('grid'); // grid | list

  const filtered = useMemo(() => {
    let list = [...properties];
    if (filters.auctionType !== 'Todos') list = list.filter(p => p.auctionType === filters.auctionType);
    if (filters.occupancy !== 'Todos') list = list.filter(p => p.occupancy === filters.occupancy);
    if (filters.propertyType !== 'Todos') list = list.filter(p => p.type === filters.propertyType);
    if (filters.scoreMin > 0) list = list.filter(p => p.score >= filters.scoreMin);
    if (filters.discountMin > 0) list = list.filter(p => p.discount >= filters.discountMin);
    if (filters.city !== 'Todas') list = list.filter(p => p.city.startsWith(filters.city));
    if (sort === 'score') list.sort((a, b) => b.score - a.score);
    else if (sort === 'discount') list.sort((a, b) => b.discount - a.discount);
    else if (sort === 'roi') list.sort((a, b) => b.roi - a.roi);
    else if (sort === 'soonest') list.sort((a, b) => getEndsAtMs(a.endsAt) - getEndsAtMs(b.endsAt));
    else if (sort === 'price-asc') list.sort((a, b) => a.minBid - b.minBid);
    else if (sort === 'price-desc') list.sort((a, b) => b.minBid - a.minBid);
    return list;
  }, [filters, sort, properties]);

  const activeFilterCount =
    (filters.auctionType !== 'Todos' ? 1 : 0) +
    (filters.occupancy !== 'Todos' ? 1 : 0) +
    (filters.propertyType !== 'Todos' ? 1 : 0) +
    (filters.scoreMin > 0 ? 1 : 0) +
    (filters.discountMin > 0 ? 1 : 0) +
    (filters.city !== 'Todas' ? 1 : 0);

  return (
    <div style={{ maxWidth: 1480, margin: '0 auto', padding: '24px 24px 80px' }}>

      {/* Header */}
      <div className="row between" style={{ alignItems: 'flex-end', marginBottom: 18 }}>
        <div>
          <div className="eyebrow" style={{ marginBottom: 6 }}>
            <span className="ix">§ feed</span>
            <span>todos os leilões ativos</span>
          </div>
          <h1 className="h1">Feed de leilões</h1>
          <p style={{ margin: '4px 0 0', color: 'var(--fg-2)', fontSize: 14 }}>
            {properties.length} imóveis no portfólio
          </p>
        </div>
        <div className="row gap-2">
          <button className="btn">
            <span className="mono" style={{ color: 'var(--fg-2)' }}>⌥</span>
            Salvar busca
          </button>
          <button className="btn">
            <span className="mono" style={{ color: 'var(--fg-2)' }}>↗</span>
            Exportar CSV
          </button>
        </div>
      </div>

      {/* Filter bar */}
      <div style={{
        position: 'sticky', top: 60, zIndex: 20,
        background: 'color-mix(in oklab, var(--bg-0) 94%, transparent)',
        backdropFilter: 'blur(12px)',
        padding: '14px 0',
        borderBottom: '1px solid var(--line-1)',
        marginBottom: 20,
      }}>
        <div className="row gap-2 wrap" style={{ alignItems: 'center' }}>
          <Filter label="Tipo de leilão" value={filters.auctionType}
            options={['Todos', '1ª praça', '2ª praça', 'Judicial', 'Extrajudicial']}
            onChange={(v) => setFilters({ ...filters, auctionType: v })} />
          <Filter label="Imóvel" value={filters.propertyType}
            options={['Todos', 'Apartamento', 'Casa', 'Cobertura', 'Comercial', 'Galpão', 'Terreno']}
            onChange={(v) => setFilters({ ...filters, propertyType: v })} />
          <Filter label="Ocupação" value={filters.occupancy}
            options={['Todos', 'desocupado', 'ocupado', 'disputado']}
            onChange={(v) => setFilters({ ...filters, occupancy: v })} />
          <Filter label="Cidade" value={filters.city}
            options={['Todas', 'São Paulo', 'Rio de Janeiro', 'Belo Horizonte', 'Curitiba', 'Balneário Camboriú', 'Barueri']}
            onChange={(v) => setFilters({ ...filters, city: v })} />
          <RangeChip label="Score" suffix=" pts" value={filters.scoreMin}
            onChange={(v) => setFilters({ ...filters, scoreMin: v })} />
          <RangeChip label="Desconto" suffix="%" value={filters.discountMin}
            onChange={(v) => setFilters({ ...filters, discountMin: v })} />
          {activeFilterCount > 0 && (
            <button
              className="btn ghost sm"
              onClick={() => setFilters({
                auctionType: 'Todos', occupancy: 'Todos', propertyType: 'Todos',
                scoreMin: 0, discountMin: 0, city: 'Todas',
              })}
              style={{ color: 'var(--accent)' }}
            >
              Limpar {activeFilterCount}
            </button>
          )}

          <span style={{ flex: 1 }}></span>

          <Sort value={sort} onChange={setSort} />
          <ViewToggle value={view} onChange={setView} />
        </div>
      </div>

      {/* Result count */}
      <div className="row between" style={{ marginBottom: 16, alignItems: 'baseline' }}>
        <span className="mono" style={{ fontSize: 12, color: 'var(--fg-2)' }}>
          <b style={{ color: 'var(--fg-0)' }}>{filtered.length.toString().padStart(3, '0')}</b> resultados
          <span style={{ margin: '0 8px' }}>·</span>
          score médio {Math.round(filtered.reduce((a, b) => a + b.score, 0) / Math.max(filtered.length, 1))}
          <span style={{ margin: '0 8px' }}>·</span>
          desconto médio {Math.round(filtered.reduce((a, b) => a + b.discount, 0) / Math.max(filtered.length, 1))}%
        </span>
        <span className="mono" style={{ fontSize: 11, color: 'var(--fg-3)' }}>
          1–{filtered.length} de {filtered.length}
        </span>
      </div>

      {/* Content */}
      {filtered.length === 0 ? (
        <Empty />
      ) : view === 'grid' ? (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))',
          gap: 18,
        }}>
          {filtered.map(p => (
            <PropertyCard
              key={p.id}
              p={p}
              onClick={() => go('detail', p)}
              watched={watched.includes(p.id)}
              onToggleWatch={toggleWatch}
            />
          ))}
        </div>
      ) : (
        <div className="card" style={{ overflow: 'hidden' }}>
          <div style={{
            display: 'grid',
            gridTemplateColumns: '60px 60px 1.6fr 1fr 0.9fr 0.9fr 0.7fr 1fr 32px',
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
            <span>score</span>
            <span>imóvel</span>
            <span>preço</span>
            <span>desconto</span>
            <span>roi</span>
            <span>risco</span>
            <span>encerra em</span>
            <span></span>
          </div>
          {filtered.map(p => (
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

      {properties.length > filtered.length && (
        <div style={{ textAlign: 'center', marginTop: 48 }}>
          <button className="btn lg">
            Carregar mais
            <span className="mono" style={{ fontSize: 11, color: 'var(--fg-2)', marginLeft: 6 }}>
              {(properties.length - filtered.length).toLocaleString('pt-BR')} restantes
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
            minWidth: 180, padding: 4, zIndex: 31,
            boxShadow: '0 10px 28px oklch(0 0 0 / 0.08)',
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

function RangeChip({ label, suffix, value, onChange }) {
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
        type="range" min="0" max="100" step="5"
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
        <option value="score">melhor score</option>
        <option value="discount">maior desconto</option>
        <option value="roi">maior ROI projetado</option>
        <option value="soonest">encerra antes</option>
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
