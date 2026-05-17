import { useMemo } from 'react';
import { PropertyCard, PropertyRow, ScoreBadge, Countdown, Sparkline, RiskDots, fmtBRL, getEndsAtMs } from './shared';

export default function Home({ go, watched, toggleWatch, properties, dashboard }) {
  const endingToday = useMemo(() =>
    [...properties].sort((a, b) => getEndsAtMs(a.endsAt) - getEndsAtMs(b.endsAt)).slice(0, 3),
    [properties]);
  const topScored = useMemo(() =>
    [...properties].sort((a, b) => b.score - a.score).slice(0, 3),
    [properties]);
  const watchedItems = useMemo(() =>
    properties.filter(p => watched.includes(p.id)),
    [watched, properties]);

  return (
    <div style={{ padding: '24px 24px 80px', maxWidth: 1480, margin: '0 auto' }}>

      {/* ========== Greeting + KPI strip ========== */}
      <div style={{ marginBottom: 32 }}>
        <div className="row between baseline" style={{ marginBottom: 18 }}>
          <div>
            <h1 className="h1">Bom dia, {dashboard?.greeting?.name || 'Investidor'}.</h1>
            <p style={{ margin: '4px 0 0', color: 'var(--fg-2)', fontSize: 14 }}>
              {dashboard?.greeting?.subtitle || `${properties.length} imóveis no portfólio.`}
            </p>
          </div>
          <div className="row gap-2">
            <button className="btn">Importar edital</button>
            <button className="btn primary" onClick={() => go('feed')}>
              Ver feed completo
            </button>
          </div>
        </div>

        {/* KPI strip */}
        <div className="card" style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          overflow: 'hidden',
        }}>
          {(dashboard?.kpis || []).slice(0, 2).map((kpi, i) => (
            <Kpi key={i} lbl={kpi.lbl} val={kpi.val} delta={kpi.delta} pos={kpi.pos} urgent={kpi.urgent} />
          ))}
          <Kpi lbl="Sua watchlist" val={watchedItems.length.toString().padStart(2, '0')} delta={`${watchedItems.length === 0 ? 'nada salvo' : 'monitorando'}`} />
          {(dashboard?.kpis || []).slice(2).map((kpi, i, arr) => (
            <Kpi key={i + 2} lbl={kpi.lbl} val={kpi.val} delta={kpi.delta} pos={kpi.pos} urgent={kpi.urgent} last={i === arr.length - 1} />
          ))}
        </div>
      </div>

      {/* ========== Search command ========== */}
      <div className="card" style={{ padding: 18, marginBottom: 32 }}>
        <div className="row gap-3" style={{ alignItems: 'center' }}>
          <span className="mono" style={{ color: 'var(--fg-2)', fontSize: 14 }}>⌕</span>
          <input
            placeholder="Buscar por matrícula, endereço, processo, cidade ou edital..."
            style={{
              flex: 1, border: 0, outline: 'none', background: 'transparent',
              fontSize: 15, color: 'var(--fg-0)',
            }}
          />
          <span className="mono" style={{ fontSize: 11, color: 'var(--fg-3)' }}>
            ⌘ K
          </span>
        </div>
        <div className="divider" style={{ margin: '14px 0 12px' }}></div>
        <div className="row gap-2 wrap" style={{ alignItems: 'center' }}>
          <span className="uppy" style={{ color: 'var(--fg-3)' }}>filtros rápidos</span>
          <button className="tag">Apartamentos em SP</button>
          <button className="tag">Desconto ≥ 40%</button>
          <button className="tag">Desocupados</button>
          <button className="tag">Score ≥ 80</button>
          <button className="tag">Encerra em 48h</button>
        </div>
      </div>

      {/* ========== Section 1 — Encerrando hoje ========== */}
      <Section
        ix="01"
        title="Encerrando nas próximas 24h"
        sub="Itens onde o tempo é o fator decisivo."
        action={<button className="btn ghost sm" onClick={() => go('feed')}>Ver todos os {properties.length} →</button>}
      >
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 18 }}>
          {endingToday.map(p => (
            <PropertyCard
              key={p.id}
              p={p}
              onClick={() => go('detail', p)}
              watched={watched.includes(p.id)}
              onToggleWatch={toggleWatch}
            />
          ))}
        </div>
      </Section>

      {/* ========== Section 2 — Top score + Market signals split ========== */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: 24, marginBottom: 40 }}>
        <Section
          ix="02"
          title="Top score disponível"
          sub="Os melhores ratings da IA, atualizados às 06:00."
          flush
        >
          <div className="col gap-3">
            {topScored.map((p, i) => (
              <CompactRow key={p.id} p={p} rank={i + 1} onClick={() => go('detail', p)} />
            ))}
          </div>
        </Section>

        <Section
          ix="03"
          title="Sinais de mercado"
          sub="Movimento agregado por cidade · 30 dias."
          flush
        >
          <div className="card" style={{ padding: 18 }}>
            {(dashboard?.citySignals || []).map((cs, i, arr) => (
              <div key={cs.city}>
                {i > 0 && <div className="divider" style={{ margin: '14px 0' }}></div>}
                <CitySignal city={cs.city} volume={cs.volume} delta={cs.delta} trend={cs.trend} pos={cs.pos} />
              </div>
            ))}
          </div>
        </Section>
      </div>

      {/* ========== Section 3 — Watchlist ========== */}
      {watchedItems.length > 0 ? (
        <Section
          ix="04"
          title="Sua watchlist"
          sub="Itens salvos · monitoramos preço, riscos e prazo automaticamente."
          action={<button className="btn ghost sm">Configurar alertas →</button>}
        >
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
          ix="04"
          title="Sua watchlist está vazia"
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

      {/* ========== Section 5 — Alerts feed ========== */}
      <Section
        ix="05"
        title="Atividade recente"
        sub="O que mudou nos imóveis que você analisou."
      >
        <div className="card">
          {(dashboard?.activity || []).map((a, i, arr) => (
            <ActivityItem
              key={i}
              time={a.time}
              type={a.type}
              title={a.title}
              text={a.text}
              tone={a.tone}
              last={i === arr.length - 1}
            />
          ))}
        </div>
      </Section>

    </div>
  );
}

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

function Section({ ix, title, sub, action, children }) {
  return (
    <section style={{ marginBottom: 40 }}>
      <div className="row between" style={{ alignItems: 'flex-end', marginBottom: 16 }}>
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

function CompactRow({ p, rank, onClick }) {
  return (
    <div
      onClick={onClick}
      className="card hov"
      style={{
        display: 'grid',
        gridTemplateColumns: '24px 56px 1fr auto auto',
        gap: 14,
        padding: '14px 18px',
        alignItems: 'center',
      }}
    >
      <span className="mono" style={{ fontSize: 12, color: 'var(--fg-3)' }}>
        #{rank}
      </span>
      <ScoreBadge value={p.score} size={48} showLabel={false} />
      <div>
        <div style={{ fontSize: 14, fontWeight: 500 }}>{p.title}</div>
        <div style={{ fontSize: 11.5, color: 'var(--fg-2)', marginTop: 2 }}>
          {p.neighborhood}, {p.city} · {p.auctionType} · {p.auctioneer}
        </div>
        <div className="row gap-3" style={{ marginTop: 6 }}>
          <span className="mono" style={{ fontSize: 12 }}>
            <span style={{ color: 'var(--fg-2)' }}>lance </span>
            <span style={{ color: 'var(--fg-0)', fontWeight: 500 }}>R$ {fmtBRL(p.minBid)}</span>
          </span>
          <span className="mono" style={{ fontSize: 12, color: p.discount > 0 ? 'var(--good)' : 'var(--bad)' }}>{p.discount >= 0 ? `−${p.discount}%` : `+${Math.abs(p.discount).toFixed(1)}%`}</span>
          <span className="mono" style={{ fontSize: 12, color: p.roi > 0 ? 'var(--good)' : p.roi < 0 ? 'var(--bad)' : 'var(--fg-2)' }}>{p.roi >= 0 ? `+${p.roi}%` : `${p.roi}%`} ROI</span>
        </div>
      </div>
      <div style={{ textAlign: 'right' }}>
        <Countdown until={p.endsAt} compact />
        <div style={{ marginTop: 6 }}>
          <RiskDots flags={p.risk} />
        </div>
      </div>
      <span className="mono" style={{ fontSize: 14, color: 'var(--fg-3)' }}>→</span>
    </div>
  );
}

function CitySignal({ city, volume, delta, trend, pos }) {
  return (
    <div className="row between" style={{ alignItems: 'center' }}>
      <div style={{ minWidth: 140 }}>
        <div style={{ fontSize: 13, fontWeight: 500 }}>{city}</div>
        <div className="mono" style={{ fontSize: 11, color: 'var(--fg-2)', marginTop: 2 }}>
          {volume} leilões
        </div>
      </div>
      <Sparkline points={trend} color={pos ? 'var(--good)' : 'var(--bad)'} width={120} height={28} />
      <div style={{ textAlign: 'right', minWidth: 70 }}>
        <div className="num-sm" style={{ color: pos ? 'var(--good)' : 'var(--bad)' }}>{delta}</div>
        <div className="mono" style={{ fontSize: 10, color: 'var(--fg-3)' }}>preço/m²</div>
      </div>
    </div>
  );
}

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
