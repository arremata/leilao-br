import { useState, useEffect } from 'react';
import { fmtBRL, getEndsAtMs } from '../utils';

// ============================================================
// Score badge — circular AI score 0-100, color-coded
// ============================================================
export function ScoreBadge({ value = 87, size = 56, showLabel = true }) {
  const r = (size - 5) / 2;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - value / 100);
  const color =
    value >= 75 ? 'var(--good)' :
    value >= 50 ? 'var(--warn)' :
    'var(--bad)';
  const bg =
    value >= 75 ? 'var(--good-soft)' :
    value >= 50 ? 'var(--warn-soft)' :
    'var(--bad-soft)';
  return (
    <div className="score-wrap" style={{ '--size': size + 'px', background: bg, borderRadius: '50%' }}>
      <svg width={size} height={size}>
        <circle cx={size/2} cy={size/2} r={r}
          stroke="var(--bg-1)" strokeWidth="2.5" fill="none" />
        <circle cx={size/2} cy={size/2} r={r}
          stroke={color} strokeWidth="2.5" fill="none"
          strokeDasharray={c} strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset .5s ease' }} />
      </svg>
      <span className="score-val" style={{ color }}>{value}</span>
      {showLabel && size >= 60 && <span className="score-lbl">SCORE</span>}
    </div>
  );
}

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
  const ms = Math.max(0, untilMs - now);
  const ended = untilMs > 0 && ms === 0;
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
export function Photo({ label = 'FOTO IMÓVEL', ratio = '16/10', children, style }) {
  return (
    <div
      className="ph"
      style={{
        aspectRatio: ratio,
        width: '100%',
        ...style,
      }}
    >
      {children}
      <div className="ph-label">{label}</div>
    </div>
  );
}

// ============================================================
// Mini sparkline (last 12 months price trend)
// ============================================================
export function Sparkline({ points = [9, 9.2, 9.1, 9.5, 9.4, 9.6, 9.9, 10.2, 10.1, 10.4, 10.6, 11.0], color = 'var(--good)', width = 100, height = 28 }) {
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  const x = (i) => (i / (points.length - 1)) * width;
  const y = (v) => height - 2 - ((v - min) / range) * (height - 4);
  const path = points.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  return (
    <svg width={width} height={height} className="spark" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
      <path d={path} fill="none" stroke={color} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={x(points.length - 1)} cy={y(points[points.length - 1])} r="2.2" fill={color} />
    </svg>
  );
}

// ============================================================
// Risk flag dots — J F L O
// ============================================================
export function RiskDots({ flags }) {
  const items = [
    { k: 'j', label: 'Jurídico' },
    { k: 'f', label: 'Financeiro' },
    { k: 'l', label: 'Liquidez' },
    { k: 'o', label: 'Ocupação' },
  ];
  const color = (s) => s === 'good' ? 'var(--good)' : s === 'warn' ? 'var(--warn)' : s === 'bad' ? 'var(--bad)' : 'var(--bg-3)';
  return (
    <div className="row gap-2" style={{ alignItems: 'center' }}>
      {items.map(it => (
        <div key={it.k} className="row gap-1" title={it.label} style={{ alignItems: 'center' }}>
          <span style={{
            width: 8, height: 8, borderRadius: '50%',
            background: color(flags?.[it.k]),
            display: 'inline-block',
          }}></span>
          <span className="mono" style={{ fontSize: 10, color: 'var(--fg-2)', textTransform: 'uppercase' }}>
            {it.k}
          </span>
        </div>
      ))}
    </div>
  );
}

// ============================================================
// Spec inline (m², beds, baths, parking)
// ============================================================
export function Specs({ area, beds, baths, parking, floor, dense }) {
  const items = [
    area && { v: area, l: 'm²', symbol: '⌗' },
    beds != null && { v: beds, l: beds === 1 ? 'dorm' : 'dorms', symbol: '◐' },
    baths != null && { v: baths, l: baths === 1 ? 'banho' : 'banhos', symbol: '◑' },
    parking != null && { v: parking, l: parking === 1 ? 'vaga' : 'vagas', symbol: '⌑' },
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
export function PropertyCard({ p, onClick, watched, onToggleWatch }) {
  const occColor = p.occupancy === 'desocupado' ? 'good' :
                   p.occupancy === 'ocupado' ? 'warn' : 'bad';
  return (
    <article
      className="card hov fade-in property-card"
      onClick={onClick}
    >
      {/* Photo with overlays */}
      <div style={{ position: 'relative' }}>
        <Photo label={p.photoLabel} ratio="16/10" />
        {/* Score top-left */}
        <div style={{ position: 'absolute', top: 12, left: 12 }}>
          <ScoreBadge value={p.score} size={52} showLabel={false} />
        </div>
        {/* Countdown top-right */}
        <div style={{
          position: 'absolute', top: 14, right: 12,
          background: 'oklch(1 0 0 / 0.9)',
          padding: '5px 10px', borderRadius: 6,
          backdropFilter: 'blur(4px)',
          border: '1px solid var(--line-1)',
        }}>
          <Countdown until={p.endsAt} compact dark />
        </div>
        {/* Watch button bottom-right */}
        <button
          onClick={(e) => { e.stopPropagation(); onToggleWatch?.(p.id); }}
          style={{
            position: 'absolute', bottom: 12, right: 12,
            width: 32, height: 32, borderRadius: 6,
            background: 'oklch(1 0 0 / 0.9)',
            border: '1px solid var(--line-1)',
            color: watched ? 'var(--accent)' : 'var(--fg-2)',
            backdropFilter: 'blur(4px)',
            fontSize: 14,
          }}
          title={watched ? 'Remover da watchlist' : 'Adicionar à watchlist'}
        >
          {watched ? '★' : '☆'}
        </button>
      </div>

      {/* Body */}
      <div style={{ padding: 16 }}>
        {/* Tags */}
        <div className="row gap-2 wrap" style={{ marginBottom: 10 }}>
          <span className="tag">{p.auctionType}</span>
          <span className="tag">{p.type}</span>
          <span className={`tag dot ${occColor}`}>{p.occupancy}</span>
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

        <div className="divider" style={{ margin: '14px 0' }}></div>

        {/* Numbers — 2 column layout */}
        <div className="property-card-metrics" style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 14 }}>
          <div>
            <span className="uppy" style={{ color: 'var(--fg-3)' }}>lance mínimo</span>
            <div className="num-md" style={{ marginTop: 3, color: 'var(--fg-0)' }}>
              R$ {fmtBRL(p.minBid)}
            </div>
            <div className="row gap-2 baseline" style={{ marginTop: 4 }}>
              <span className="mono" style={{ fontSize: 11, color: 'var(--fg-2)', textDecoration: 'line-through' }}>
                R$ {fmtBRL(p.market)}
              </span>
              <span className="mono" style={{ fontSize: 11, color: p.discount > 0 ? 'var(--good)' : 'var(--bad)', fontWeight: 500 }}>
                {p.discount >= 0 ? `−${p.discount}%` : `+${Math.abs(p.discount).toFixed(1)}%`}
              </span>
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <span className="uppy" style={{ color: 'var(--fg-3)' }}>ROI projetado</span>
            <div className="num-md" style={{ marginTop: 3, color: p.roi > 0 ? 'var(--good)' : p.roi < 0 ? 'var(--bad)' : 'var(--fg-2)' }}>
              {p.roi >= 0 ? `+${p.roi}%` : `${p.roi}%`}
            </div>
            <div className="mono" style={{ fontSize: 11, color: 'var(--fg-2)', marginTop: 4 }}>
              em 12 meses
            </div>
          </div>
        </div>

        <div className="divider" style={{ margin: '14px 0' }}></div>

        {/* Bottom row: risk + leiloeiro */}
        <div className="row between" style={{ alignItems: 'center' }}>
          <RiskDots flags={p.risk} />
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
  return (
    <div
      className="property-row"
      onClick={onClick}
      style={{
        display: 'grid',
        gridTemplateColumns: '60px 60px 1.6fr 1fr 0.9fr 0.9fr 0.7fr 1fr 32px',
        gap: 14,
        padding: '14px 18px',
        alignItems: 'center',
        borderTop: '1px solid var(--line-1)',
        cursor: 'pointer',
        transition: 'background .15s',
      }}
      onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-2)'}
      onMouseLeave={e => e.currentTarget.style.background = ''}
    >
      <div style={{
        width: 56, height: 42, borderRadius: 6, overflow: 'hidden',
        background: 'oklch(0.92 0.005 75)',
        backgroundImage: 'repeating-linear-gradient(135deg, oklch(0.88 0.005 75) 0 1px, transparent 1px 8px)',
      }}></div>
      <ScoreBadge value={p.score} size={44} showLabel={false} />
      <div>
        <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--fg-0)', lineHeight: 1.25 }}>
          {p.title}
        </div>
        <div style={{ fontSize: 11.5, color: 'var(--fg-2)', marginTop: 2 }}>
          {p.neighborhood}, {p.city} · {p.area} m² · {p.beds} dorm · {p.auctionType}
        </div>
      </div>
      <div>
        <div className="num-sm" style={{ color: 'var(--fg-0)' }}>R$ {fmtBRL(p.minBid)}</div>
        <div className="mono" style={{ fontSize: 11, color: 'var(--fg-2)', textDecoration: 'line-through' }}>
          R$ {fmtBRL(p.market)}
        </div>
      </div>
      <div>
        <div className="num-sm" style={{ color: p.discount > 0 ? 'var(--good)' : 'var(--bad)' }}>{p.discount >= 0 ? `−${p.discount}%` : `+${Math.abs(p.discount).toFixed(1)}%`}</div>
        <div className="mono" style={{ fontSize: 11, color: 'var(--fg-2)' }}>desconto</div>
      </div>
      <div>
        <div className="num-sm" style={{ color: p.roi > 0 ? 'var(--good)' : p.roi < 0 ? 'var(--bad)' : 'var(--fg-2)' }}>{p.roi >= 0 ? `+${p.roi}%` : `${p.roi}%`}</div>
        <div className="mono" style={{ fontSize: 11, color: 'var(--fg-2)' }}>ROI</div>
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
