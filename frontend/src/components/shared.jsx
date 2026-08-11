import { useState, useEffect } from 'react';
import { fmtBRL, getEndsAtMs } from '../utils';

// ============================================================
// Countdown timer
// ============================================================
export function Countdown({ until, compact, dark }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const untilMs = getEndsAtMs(until);
  // No auction date — Caixa "compra direta" listings or unparseable date.
  // Avoid rendering a meaningless counting-down 00:00:00 forever.
  if (untilMs === 0) {
    return (
      <span className="countdown" style={{ color: 'var(--fg-2)' }}>
        <span className="dot" style={{ background: 'var(--fg-3)' }}></span>
        <span>Sem data</span>
      </span>
    );
  }
  const ms = Math.max(0, untilMs - now);
  const ended = ms === 0;
  const d = Math.floor(ms / 86400000);
  const h = Math.floor((ms % 86400000) / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const pad = (n) => String(n).padStart(2, '0');
  const urgent = ms < 86400000; // < 24h
  if (ended) {
    return (
      <span className="countdown" style={{ color: 'var(--fg-2)' }}>
        <span className="dot" style={{ background: 'var(--fg-3)' }}></span>
        <span>Encerrado</span>
      </span>
    );
  }
  return (
    <span className="countdown" style={{ color: urgent ? 'var(--bad)' : (dark ? 'var(--fg-0)' : 'var(--fg-1)') }}>
      <span className="dot" style={{ background: urgent ? 'var(--bad)' : 'var(--accent)' }}></span>
      {compact ? (
        <span>{d > 0 ? `${d}d ` : ''}{pad(h)}:{pad(m)}:{pad(s)}</span>
      ) : (
        <span>
          {d > 0 && <><b style={{ fontWeight: 600 }}>{d}</b>d </>}
          {pad(h)}:{pad(m)}:{pad(s)}
        </span>
      )}
    </span>
  );
}

// ============================================================
// Photo placeholder
// ============================================================
export function Photo({ label = 'FOTO IMÓVEL', photoUrl, ratio = '16/10', children, style }) {
  return (
    <div
      className="ph"
      style={{
        aspectRatio: ratio,
        width: '100%',
        position: 'relative',
        overflow: 'hidden',
        ...style,
      }}
    >
      {photoUrl ? (
        <img
          src={photoUrl}
          alt={label}
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
          }}
        />
      ) : null}
      {children}
      <div className="ph-label">{label}</div>
    </div>
  );
}

// ============================================================
// Risk summary — readable labels, highlights only issues
// ============================================================
export function RiskSummary({ flags }) {
  if (!flags) {
    return <span style={{ fontSize: 11, color: 'var(--fg-2)' }}>Análise pendente</span>;
  }
  const items = [
    { k: 'j', label: 'Jurídico' },
    { k: 'f', label: 'Financeiro' },
  ];
  const issues = items.filter(it => flags?.[it.k] && flags[it.k] !== 'good');
  if (issues.length === 0) {
    return (
      <span style={{ fontSize: 11, color: 'var(--good)', fontWeight: 500, fontFamily: 'var(--f-mono)' }}>
        ✓ Sem riscos
      </span>
    );
  }
  return (
    <div className="row gap-2" style={{ alignItems: 'center' }}>
      {issues.map(it => {
        const state = flags[it.k];
        const color = state === 'warn' ? 'var(--warn)' : 'var(--bad)';
        const bg = state === 'warn' ? 'var(--warn-soft)' : 'var(--bad-soft)';
        return (
          <span key={it.k} style={{
            fontSize: 11, padding: '2px 7px', borderRadius: 4,
            background: bg, color, fontWeight: 500,
          }}>
            {state === 'warn' ? '⚠' : '✕'} {it.label}
          </span>
        );
      })}
    </div>
  );
}

// ============================================================
// Risk flag dots — compact version for table rows
// ============================================================
export function RiskDots({ flags }) {
  const items = [
    { k: 'j', label: 'Jurídico' },
    { k: 'f', label: 'Financeiro' },
  ];
  const color = (s) => s === 'good' ? 'var(--good)' : s === 'warn' ? 'var(--warn)' : s === 'bad' ? 'var(--bad)' : 'var(--bg-3)';
  return (
    <div className="row gap-2" style={{ alignItems: 'center' }}>
      {items.map(it => (
        <span key={it.k} title={it.label} style={{
          width: 8, height: 8, borderRadius: '50%',
          background: color(flags?.[it.k]),
          display: 'inline-block',
        }} />
      ))}
    </div>
  );
}

// ============================================================
// Spec inline (m², beds, baths, parking)
// ============================================================
export function Specs({ area, beds, baths, parking, floor, dense }) {
  const items = [
    area > 0 && { v: area, l: 'm²', symbol: '⌗' },
    beds > 0 && { v: beds, l: beds === 1 ? 'dorm' : 'dorms', symbol: '◐' },
    baths > 0 && { v: baths, l: baths === 1 ? 'banho' : 'banhos', symbol: '◑' },
    parking > 0 && { v: parking, l: parking === 1 ? 'vaga' : 'vagas', symbol: '⌑' },
    floor && { v: floor, l: 'andar', symbol: '↑' },
  ].filter(Boolean);
  return (
    <div className="row" style={{ gap: dense ? 10 : 14, flexWrap: 'wrap' }}>
      {items.map((it, i) => (
        <span key={i} className="row gap-1" style={{ alignItems: 'baseline', fontSize: dense ? 12 : 13 }}>
          <span className="mono" style={{ color: 'var(--fg-0)', fontWeight: 500 }}>{it.v}</span>
          <span style={{ color: 'var(--fg-2)', fontSize: 11 }}>{it.l}</span>
        </span>
      ))}
    </div>
  );
}

// ============================================================
// Property card — DENSE, lots of information
// ============================================================
export function PropertyCard({ p, onClick, watched, onToggleWatch, staggerIndex = 0 }) {
  const hasMarketAnalysis = Number.isFinite(p.market) && Number.isFinite(p.discount);
  return (
    <article
      className="card hov fade-in property-card"
      onClick={onClick}
      style={{ transitionDelay: `${Math.min(staggerIndex * 80, 400)}ms` }}
    >
      {/* Photo with overlays */}
      <div style={{ position: 'relative' }}>
        <Photo label={p.photoLabel} photoUrl={p.photoUrl} ratio="16/10" />
        {/* Countdown top-right */}
        <div style={{
          position: 'absolute', top: 14, right: 12,
          background: 'rgba(255,255,255,0.78)',
          padding: '5px 10px', borderRadius: 8,
          backdropFilter: 'blur(8px)',
          border: '1px solid rgba(255,255,255,0.6)',
        }}>
          <Countdown until={p.endsAt} compact dark />
        </div>
        {/* Watch button bottom-right */}
        <button
          onClick={(e) => { e.stopPropagation(); onToggleWatch?.(p.id); }}
          style={{
            position: 'absolute', bottom: 12, right: 12,
            width: 32, height: 32, borderRadius: 8,
            background: 'rgba(255,255,255,0.78)',
            border: '1px solid rgba(255,255,255,0.6)',
            color: watched ? 'var(--accent)' : 'var(--fg-2)',
            backdropFilter: 'blur(8px)',
            fontSize: 14,
          }}
          title={watched ? 'Remover da watchlist' : 'Adicionar à watchlist'}
        >
          {watched ? '★' : '☆'}
        </button>
      </div>

      {/* Body */}
      <div style={{ padding: 18 }}>
        {/* Tags */}
        <div className="row gap-2 wrap" style={{ marginBottom: 10 }}>
          <span className="tag">{p.praca || p.modalidade || p.auctionType}</span>
          <span className="tag">{p.type}</span>
        </div>

        {/* Title + address */}
        <h3 className="h3" style={{ marginBottom: 2 }}>
          {p.title}
        </h3>
        <p style={{ margin: '0 0 12px', fontSize: 12, color: 'var(--fg-2)' }}>
          {p.address} · {p.neighborhood}, {p.city}
        </p>

        {/* Specs */}
        <Specs area={p.area} beds={p.beds} baths={p.baths} parking={p.parking} floor={p.floor} dense />

        <div className="divider" style={{ margin: '16px 0' }}></div>

        {/* Lance mínimo — compact header */}
        <div className="row between baseline" style={{ marginBottom: 16 }}>
          <span className="uppy" style={{ color: 'var(--fg-2)' }}>lance mínimo</span>
          <span className="num-md" style={{ color: 'var(--fg-0)' }}>
            R$ {fmtBRL(p.minBid)}
          </span>
        </div>

        {/* Avaliação leilão + Mercado IA — 2 colunas */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <div>
            <span className="uppy" style={{ color: 'var(--fg-3)' }}>Avaliação leilão</span>
            <div className="num-md" style={{ marginTop: 3, color: 'var(--fg-0)' }}>
              R$ {fmtBRL(p.appraisal)}
            </div>
            <div className="mono" style={{ fontSize: 11, color: 'var(--fg-1)', marginTop: 4 }}>
              {(p.auctionDiscount ?? 0) >= 0
                ? `${p.auctionDiscount ?? 0}% desconto oficial`
                : `+${Math.abs(p.auctionDiscount ?? 0).toFixed(1)}% ágio`}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <span className="uppy" style={{ color: 'var(--fg-3)' }}>
              <span className="ia-chip" style={{ marginRight: 6 }}>IA</span>
              Mercado IA
            </span>
            {hasMarketAnalysis ? <>
              <div className="num-md" style={{ marginTop: 3, color: 'var(--fg-0)' }}>
                R$ {fmtBRL(p.market)}
              </div>
              <div className="mono" style={{
                fontSize: 11, marginTop: 4,
                color: p.discount > 0 ? 'var(--good)' : p.discount < 0 ? 'var(--bad)' : 'var(--fg-2)',
                fontWeight: 500,
              }}>
                {p.discount >= 0 ? `+${p.discount}% desconto IA` : `${p.discount}% acima IA`}
              </div>
            </> : (
              <div style={{ marginTop: 5, fontSize: 12, color: 'var(--fg-2)' }}>Análise pendente</div>
            )}
          </div>
        </div>

        <div className="divider" style={{ margin: '16px 0' }}></div>

        {/* Bottom row: risk summary + leiloeiro */}
        <div className="row between" style={{ alignItems: 'center' }}>
          <RiskSummary flags={p.risk} />
          <span className="mono" style={{ fontSize: 10.5, color: 'var(--fg-2)' }}>
            {p.auctioneer}
          </span>
        </div>
      </div>
    </article>
  );
}

// ============================================================
// Property row (table-like dense)
// ============================================================
export function PropertyRow({ p, onClick, watched, onToggleWatch }) {
  const hasMarketAnalysis = Number.isFinite(p.market) && Number.isFinite(p.discount);
  return (
    <div
      className="property-row"
      onClick={onClick}
      style={{
        display: 'grid',
        gridTemplateColumns: '60px 1.6fr 1fr 1fr 1fr 0.7fr 1fr 32px',
        gap: 14,
        padding: '16px 20px',
        alignItems: 'center',
        borderTop: '1px solid var(--line-1)',
        cursor: 'pointer',
        transition: 'background .15s',
      }}
      onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-2)'}
      onMouseLeave={e => e.currentTarget.style.background = ''}
    >
      <div style={{
        width: 56, height: 42, borderRadius: 8, overflow: 'hidden',
        background: '#ECEEF1',
        backgroundImage: p.photoUrl ? 'none' : 'repeating-linear-gradient(135deg, #E5E7EB 0 1px, transparent 1px 8px)',
      }}>
        {p.photoUrl && <img src={p.photoUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
      </div>
      <div>
        <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--fg-0)', lineHeight: 1.25 }}>
          {p.title}
        </div>
        <div style={{ fontSize: 11.5, color: 'var(--fg-2)', marginTop: 2 }}>
          {p.neighborhood}, {p.city} · {p.area} m² · {p.beds} dorm · {p.praca || p.modalidade || p.auctionType}
        </div>
      </div>
      <div>
        <div className="num-sm" style={{ color: 'var(--fg-0)' }}>R$ {fmtBRL(p.minBid)}</div>
        <div className="mono" style={{ fontSize: 11, color: 'var(--fg-2)' }}>lance mínimo</div>
      </div>
      <div>
        <div className="num-sm" style={{ color: 'var(--fg-1)' }}>R$ {fmtBRL(p.appraisal)}</div>
        <div className="mono" style={{ fontSize: 11, color: 'var(--fg-2)' }}>
          {(p.auctionDiscount ?? 0) >= 0 ? `−${p.auctionDiscount ?? 0}% oficial` : `+${Math.abs(p.auctionDiscount ?? 0).toFixed(1)}% ágio`}
        </div>
      </div>
      <div>
        {hasMarketAnalysis ? <>
          <div className="num-sm" style={{ color: 'var(--fg-0)' }}>R$ {fmtBRL(p.market)}</div>
          <div className="mono" style={{
            fontSize: 11,
            color: p.discount > 0 ? 'var(--good)' : p.discount < 0 ? 'var(--bad)' : 'var(--fg-2)',
            fontWeight: 500,
          }}>
            {p.discount >= 0 ? `+${p.discount}% IA` : `${p.discount}% acima IA`}
          </div>
        </> : <div style={{ fontSize: 11.5, color: 'var(--fg-2)' }}>Análise pendente</div>}
      </div>
      <RiskDots flags={p.risk} />
      <Countdown until={p.endsAt} compact />
      <button
        onClick={(e) => { e.stopPropagation(); onToggleWatch?.(p.id); }}
        style={{
          width: 28, height: 28, borderRadius: 6,
          color: watched ? 'var(--accent)' : 'var(--fg-3)',
          fontSize: 14,
        }}
      >
        {watched ? '★' : '☆'}
      </button>
    </div>
  );
}
