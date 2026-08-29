import { useState, useMemo, useEffect } from 'react';
import { PropertyRow, Countdown } from './shared';
import { LiveCardHero } from './LiveCard';
import { fmtBRL } from '../utils';
import { fetchCatalogItem } from '../api';

export default function Home({ go, watched, toggleWatch, properties, dashboard, onSearch, history }) {
  const [latestDetailCache, setLatestDetailCache] = useState(null);
  const topDiscounted = useMemo(() =>
    [...properties].sort((a, b) =>
      (b.discount ?? b.auctionDiscount ?? 0) - (a.discount ?? a.auctionDiscount ?? 0)).slice(0, 3),
    [properties]);
  const watchedItems = useMemo(() =>
    properties.filter(p => watched.includes(p.id)),
    [watched, properties]);
  const latestHistory = history?.[0] || null;
  const latestLive = latestHistory
    ? properties.find(p => p.id === latestHistory.id)
    : null;
  const latestDetail = latestDetailCache && latestDetailCache.catalogId === latestHistory?.id
    ? latestDetailCache.detail
    : null;
  const latestEntry = latestHistory
    ? {
        ...latestHistory,
        ...latestLive,
        ...latestDetail,
        ...(latestDetail?.enrichment || {}),
      }
    : null;

  useEffect(() => {
    let cancelled = false;
    if (!latestHistory?.id) return undefined;
    fetchCatalogItem(latestHistory.id)
      .then(detail => {
        if (!cancelled) {
          setLatestDetailCache({ catalogId: latestHistory.id, detail });
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [latestHistory?.id]);

  return (
    <div className="page home-page" style={{ padding: '28px 28px 80px', maxWidth: 1480, margin: '0 auto' }}>

      {/* ========== Overview + KPI strip ========== */}
      <div style={{ marginBottom: 32 }}>
        <div className="row between baseline page-header fade-in" style={{ marginBottom: 18 }}>
          <div>
            <h1 className="h1">Visão geral dos leilões</h1>
            <p style={{ margin: '4px 0 0', color: 'var(--fg-2)', fontSize: 14 }}>
              {properties.length} imóveis disponíveis no catálogo.
            </p>
          </div>
          <div className="row gap-2 page-actions">
            <button className="btn primary" onClick={() => go('feed')}>
              Ver feed completo
            </button>
          </div>
        </div>

        {/* KPI strip — only first 2 API KPIs + watchlist */}
        <div className="card kpi-strip fade-in" style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          overflow: 'hidden',
        }}>
          {(dashboard?.kpis || []).slice(0, 2).map((kpi, i) => (
            <Kpi key={i} lbl={kpi.lbl} val={kpi.val} delta={kpi.delta} pos={kpi.pos} urgent={kpi.urgent} />
          ))}
          <Kpi
            lbl="Watchlist local"
            val={watchedItems.length.toString().padStart(2, '0')}
            delta={watchedItems.length === 0 ? 'nada salvo' : 'monitorando'}
            last
          />
        </div>
      </div>

      {/* ========== Live Card Hero — last analysis ========== */}
      {latestEntry && (
        <LiveCardHero
          entry={latestEntry}
          analyzed={!!latestDetail?.enrichment}
          onClick={() => {
            const live = properties.find(p => p.id === latestHistory.id);
            if (live) go('detail', live);
          }}
        />
      )}

      {/* ========== Search + Filters ========== */}
      <SearchCommand onSearch={onSearch} properties={properties} />

      {/* ========== Section 01 — Top descontos ========== */}
      <div style={{ marginBottom: 40 }}>
        <Section
          ix="01"
          title="Top oportunidades"
          sub="Maior desconto estimado no portfólio, atualizado às 06:00."
          flush
        >
          <div className="col gap-3">
            {topDiscounted.map((p, i) => (
              <CompactRow key={p.id} p={p} rank={i + 1} onClick={() => go('detail', p)} />
            ))}
          </div>
        </Section>

      </div>

      {/* ========== Section 03 — Watchlist ========== */}
      {watchedItems.length > 0 ? (
        <Section
          ix="03"
          title="Watchlist"
          sub="Itens salvos neste navegador."
          action={<button className="btn ghost sm" disabled title="Em breve">Configurar alertas →</button>}
        >
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
              <span>encerra</span>
              <span></span>
            </div>
            {watchedItems.map(p => (
              <PropertyRow
                key={p.id}
                p={p}
                onClick={() => go('detail', p)}
                watched
                onToggleWatch={toggleWatch}
              />
            ))}
          </div>
        </Section>
      ) : (
        <Section
          ix="03"
          title="Watchlist vazia"
          sub="Salve imóveis com a estrela para acompanhar mudanças de preço, novos riscos detectados e proximidade do leilão."
        >
          <div className="card" style={{ padding: 32, textAlign: 'center' }}>
            <div style={{ fontSize: 32, color: 'var(--fg-3)', marginBottom: 12 }}>☆</div>
            <p style={{ margin: '0 0 16px', color: 'var(--fg-2)', fontSize: 13 }}>
              Nenhum imóvel salvo. Vá ao feed e marque os primeiros candidatos.
            </p>
            <button className="btn" onClick={() => go('feed')}>Explorar feed</button>
          </div>
        </Section>
      )}

      {(dashboard?.activity || []).length > 0 && (
        <Section ix="04" title="Atividade recente" sub="Atualizações recentes do catálogo.">
          <div className="card">
            {dashboard.activity.map((a, i, arr) => (
              <ActivityItem key={i} time={a.time} type={a.type} title={a.title} text={a.text} tone={a.tone} last={i === arr.length - 1} />
            ))}
          </div>
        </Section>
      )}

    </div>
  );
}

// ============================================================
// Search command bar with expandable filter panel
// ============================================================
function SearchCommand({ onSearch, properties }) {
  const [address, setAddress] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [sf, setSf] = useState({
    discountMin: 0,
    judicial: 'Todos',
    praca: 'Todos',
    modalidade: 'Todos',
  });
  const modalityOptions = useMemo(() => [
    ['Todos', 'Todos'],
    ...[...new Set(properties.map(p => p.modalidade).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, 'pt-BR'))
      .map(value => [value, value]),
  ], [properties]);
  const auctionTypeOptions = useMemo(() => [
    ['Todos', 'Todos'],
    ...[...new Set(properties.map(p => p.auctionType).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, 'pt-BR'))
      .map(value => [value, value]),
  ], [properties]);
  const pracaOptions = useMemo(() => {
    const eligible = properties.filter(p =>
      sf.modalidade === 'Todos' || p.modalidade === sf.modalidade);
    return [
      ['Todos', 'Todos'],
      ...[...new Set(eligible.map(p => p.praca).filter(Boolean))]
        .sort((a, b) => a.localeCompare(b, 'pt-BR'))
        .map(value => [value, value]),
    ];
  }, [properties, sf.modalidade]);

  const activeCount =
    (sf.discountMin > 0 ? 1 : 0) +
    (sf.judicial !== 'Todos' ? 1 : 0) +
    (sf.praca !== 'Todos' ? 1 : 0) +
    (sf.modalidade !== 'Todos' ? 1 : 0);

  const clearFilters = () => setSf({
    discountMin: 0,
    judicial: 'Todos', praca: 'Todos', modalidade: 'Todos',
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    onSearch(address, sf);
  };

  return (
    <div className="card command-card" style={{ padding: 0, marginBottom: 32 }}>
      <form onSubmit={handleSubmit}>
        <div className="row gap-3" style={{ padding: '14px 18px', alignItems: 'center' }}>
          <span className="mono" style={{ color: 'var(--fg-2)', fontSize: 14 }}>⌕</span>
          <input
            placeholder="Buscar por endereço, bairro ou cidade..."
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            style={{
              flex: 1, border: 0, outline: 'none', background: 'transparent',
              fontSize: 15, color: 'var(--fg-0)',
            }}
          />
          <button
            type="button"
            onClick={() => setShowFilters(v => !v)}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              height: 32, padding: '0 12px',
              borderRadius: 8,
              border: '1px solid ' + (activeCount > 0 ? 'var(--line-3)' : 'var(--line-1)'),
              background: activeCount > 0 ? 'var(--bg-2)' : 'var(--bg-1)',
              color: activeCount > 0 ? 'var(--fg-0)' : 'var(--fg-1)',
              fontSize: 13, cursor: 'pointer',
            }}
          >
            Filtros
            {activeCount > 0 && (
              <span style={{
                background: 'var(--accent)', color: 'var(--accent-ink)',
                borderRadius: 10, padding: '1px 6px', fontSize: 11, fontWeight: 600,
              }}>{activeCount}</span>
            )}
            <span className="mono" style={{ fontSize: 10, color: 'var(--fg-3)' }}>
              {showFilters ? '▲' : '▾'}
            </span>
          </button>
          <button type="submit" className="btn sm primary">
            Buscar
          </button>
        </div>
      </form>

      {showFilters && (
        <div style={{
          borderTop: '1px solid var(--line-1)',
          padding: '20px 18px',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))',
          gap: '20px 28px',
        }}>
          <FilterGroup
            label="Desconto mínimo"
            options={[['Todos', 0], ['≥ 20%', 20], ['≥ 30%', 30], ['≥ 40%', 40], ['≥ 50%', 50]]}
            value={sf.discountMin}
            onChange={(v) => setSf(s => ({ ...s, discountMin: v }))}
          />
          {auctionTypeOptions.length > 2 && (
            <FilterGroup
              label="Judicial / Extrajudicial"
              options={auctionTypeOptions}
              value={sf.judicial}
              onChange={(v) => setSf(s => ({ ...s, judicial: v }))}
            />
          )}
          {pracaOptions.length > 1 && (
            <FilterGroup
              label="Praça"
              options={pracaOptions}
              value={sf.praca}
              onChange={(v) => setSf(s => ({ ...s, praca: v }))}
            />
          )}
          <FilterGroup
            label="Modalidade"
            options={modalityOptions}
            value={sf.modalidade}
            onChange={(v) => setSf(s => ({ ...s, modalidade: v, praca: 'Todos' }))}
          />
          {activeCount > 0 && (
            <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'flex-end', paddingTop: 4 }}>
              <button
                type="button"
                className="btn ghost sm"
                style={{ color: 'var(--accent)' }}
                onClick={clearFilters}
              >
                Limpar filtros
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function FilterGroup({ label, options, value, onChange }) {
  return (
    <div>
      <div className="uppy" style={{ color: 'var(--fg-3)', marginBottom: 8 }}>{label}</div>
      <div className="row gap-2 wrap">
        {options.map(([lbl, val]) => {
          const active = value === val;
          return (
            <button
              key={lbl}
              type="button"
              onClick={() => onChange(val)}
              style={{
                padding: '4px 10px', borderRadius: 6,
                border: '1px solid ' + (active ? 'var(--accent)' : 'var(--line-1)'),
                background: active ? 'var(--accent-soft)' : 'var(--bg-1)',
                color: active ? 'var(--accent-strong)' : 'var(--fg-1)',
                fontSize: 12.5, fontWeight: active ? 500 : 400,
                cursor: 'pointer',
              }}
            >
              {lbl}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================
// KPI tile
// ============================================================
function Kpi({ lbl, val, delta, pos, urgent, last }) {
  return (
    <div style={{
      padding: '18px 20px',
      borderRight: last ? 'none' : '1px solid var(--line-1)',
    }}>
      <div className="uppy" style={{ color: 'var(--fg-2)' }}>{lbl}</div>
      <div className="num-xl" style={{
        marginTop: 8,
        color: urgent ? 'var(--bad)' : 'var(--fg-0)',
      }}>
        {val}
      </div>
      <div className="mono" style={{
        marginTop: 6, fontSize: 11,
        color: pos ? 'var(--good)' : urgent ? 'var(--bad)' : 'var(--fg-2)',
      }}>
        {pos && '↑ '}{delta}
      </div>
    </div>
  );
}

// ============================================================
// Section wrapper
// ============================================================
function Section({ ix, title, sub, action, children }) {
  return (
    <section className="content-section fade-in" style={{ marginBottom: 40 }}>
      <div className="row between section-head" style={{ alignItems: 'flex-end', marginBottom: 16 }}>
        <div>
          <div className="eyebrow" style={{ marginBottom: 6 }}>
            <span className="ix">§ {ix}</span>
            <span>{title}</span>
          </div>
          {sub && <p style={{ margin: 0, fontSize: 13, color: 'var(--fg-2)', maxWidth: 560 }}>{sub}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

// ============================================================
// Compact ranked row for top-score list
// ============================================================
function CompactRow({ p, rank, onClick }) {
  const discount = p.discount ?? p.auctionDiscount;
  const discountLabel = p.discount == null ? 'desconto oficial' : 'desconto estimado';
  return (
    <div
      onClick={onClick}
      className="card hov compact-row"
      style={{
        display: 'grid',
        gridTemplateColumns: '24px 1fr auto auto',
        gap: 14,
        padding: '14px 18px',
        alignItems: 'center',
      }}
    >
      <span className="mono" style={{ fontSize: 12, color: 'var(--fg-3)' }}>
        #{rank}
      </span>
      <div>
        <div style={{ fontSize: 14, fontWeight: 500 }}>{p.title}</div>
        <div style={{ fontSize: 11.5, color: 'var(--fg-2)', marginTop: 2 }}>
          {p.neighborhood}, {p.city} · {p.praca || p.modalidade || p.auctionType} · {p.auctioneer}
        </div>
        <div className="row gap-3" style={{ marginTop: 6 }}>
          <span className="mono" style={{ fontSize: 12 }}>
            <span style={{ color: 'var(--fg-2)' }}>lance </span>
            <span style={{ color: 'var(--fg-0)', fontWeight: 500 }}>R$ {fmtBRL(p.minBid)}</span>
          </span>
          {Number.isFinite(discount) && (
            <span className="mono" style={{ fontSize: 12, color: discount > 0 ? 'var(--good)' : 'var(--bad)' }}>
              {discount >= 0 ? `−${discount}%` : `+${Math.abs(discount).toFixed(1)}%`} {discountLabel}
            </span>
          )}
        </div>
      </div>
      <div style={{ textAlign: 'right' }}>
        <Countdown until={p.endsAt} compact />
        <div style={{ marginTop: 6 }}>
        </div>
      </div>
      <span className="mono" style={{ fontSize: 14, color: 'var(--fg-3)' }}>→</span>
    </div>
  );
}

// ============================================================
// Activity feed item
// ============================================================
function ActivityItem({ time, title, text, tone, last }) {
  const color = tone === 'good' ? 'var(--good)' :
                tone === 'warn' ? 'var(--warn)' :
                tone === 'bad' ? 'var(--bad)' :
                'var(--fg-3)';
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '14px 70px 1fr',
      gap: 14,
      padding: '14px 18px',
      borderBottom: last ? 'none' : '1px solid var(--line-1)',
      alignItems: 'flex-start',
    }}>
      <span style={{
        width: 8, height: 8, borderRadius: '50%',
        background: color, marginTop: 6,
      }}></span>
      <span className="mono" style={{ fontSize: 11, color: 'var(--fg-3)', paddingTop: 2 }}>
        {time}
      </span>
      <div>
        <div style={{ fontSize: 13, fontWeight: 500 }}>{title}</div>
        <div style={{ fontSize: 12.5, color: 'var(--fg-2)', marginTop: 2 }}>{text}</div>
      </div>
    </div>
  );
}
