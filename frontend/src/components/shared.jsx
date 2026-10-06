import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { fmtBRL, getEndsAtMs } from '../utils';
import { usePropertyLink, stopLinkNavigation } from '../usePropertyLink';
import { imageSourceForAttempt } from '../imageFallback';
import { auctionSchedule, formatDayTime, saleTagLabel } from '../auctionRounds';
import { listingBadges } from '../listingFacts';
import { listingTitle, listingPrice, listingMoney, roundDifference } from '../listingPresentation';

// Cadeado das partes fechadas (consultoria, consulta de dívidas).
export function LockIcon({ size = 16, strokeWidth = 2 }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  );
}

// ============================================================
// Countdown timer
// ============================================================
export function Countdown({ until, compact, dark, endedLabel = 'Encerrado' }) {
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
        <span>{endedLabel}</span>
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
export function PropertyImage({ src, alt = '', style }) {
  const [failure, setFailure] = useState({ src: '', attempt: 0 });
  const attempt = failure.src === src ? failure.attempt : 0;
  const imageSrc = imageSourceForAttempt(src, attempt);
  if (!imageSrc) return null;
  return (
    <img
      key={imageSrc}
      src={imageSrc}
      alt={alt}
      referrerPolicy="no-referrer"
      onError={() => setFailure(current => ({
        src,
        attempt: current.src === src ? current.attempt + 1 : 1,
      }))}
      style={style}
    />
  );
}

export function Photo({ label = 'FOTO IMÓVEL', photoUrl, ratio = '16/10', children, style, showLabel = true }) {
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
        <PropertyImage
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
      {showLabel && <div className="ph-label">{label}</div>}
    </div>
  );
}

// ============================================================
// Spec inline (m², beds, baths, parking)
// ============================================================
export function Specs({ area, beds, baths, parking, floor, dense }) {
  const items = [
    area > 0 && { v: Number(area).toLocaleString('pt-BR', { maximumFractionDigits: 2 }), l: 'm²', symbol: '⌗' },
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
// Selos do imóvel: quem mora lá, FGTS, financiamento
// ============================================================
export function ListingBadges({ p, size }) {
  return (
    <ul className={`listing-badges${size === 'lg' ? ' listing-badges--lg' : ''}`} aria-label="Situação e formas de pagamento">
      {listingBadges(p).map(badge => (
        <li key={badge.key} className={`listing-badge listing-badge--${badge.tone}`} title={badge.title}>
          {badge.label}
        </li>
      ))}
    </ul>
  );
}

const ROUND_STATE_LABEL = { ended: 'Encerrada', current: 'Vigente', upcoming: 'Se não vender' };

function RoundDifference({ difference }) {
  if (!difference) return null;
  return (
    <span className={`property_card-difference is-${difference.tone}`}>
      {difference.amount === 0 ? 'Mesmo preço da 1ª rodada' : <>
        {difference.percentage} · {listingMoney(Math.abs(difference.amount))} a {difference.amount < 0 ? 'menos' : 'mais'}
      </>}
      {difference.amount !== 0 && <span className="property_card-comparison"> em relação à 1ª rodada</span>}
    </span>
  );
}

export function RoundStrip({ schedule }) {
  if (schedule.kind !== 'rounds') return null;
  const difference = roundDifference(schedule);
  return (
    <div className="property_card-rounds" aria-label="Datas e preços das rodadas">
      {schedule.rounds.map(round => (
        <div key={round.round} className={`property_card-round is-${round.state}`}>
          <div className="property_card-round-info">
            <span className="property_card-round-label">{round.round}ª rodada <span className="property_card-state">· {ROUND_STATE_LABEL[round.state]}</span></span>
            <span className="property_card-date">{formatDayTime(round.at) || 'Data a publicar'}</span>
          </div>
          <strong className="property_card-round-price" title={round.price ? `R$ ${fmtBRL(round.price)}` : undefined}>{listingMoney(round.price)}</strong>
          {round.round === 2 && <RoundDifference difference={difference} />}
        </div>
      ))}
    </div>
  );
}

function SaveProperty({ p, watched, onToggleWatch, overlay = false }) {
  const label = watched ? 'Remover dos salvos' : 'Salvar este imóvel';
  return (
    <button
      className={`property_card-save${overlay ? ' is-overlay' : ''}${watched ? ' is-saved' : ''}`}
      onClick={e => { stopLinkNavigation(e); onToggleWatch?.(p.id); }}
      aria-label={label} aria-pressed={!!watched} title={label}
    >
      <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill={watched ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round">
        <path d="m12 3 2.8 5.7 6.3.9-4.6 4.4 1.1 6.3-5.6-3-5.6 3 1.1-6.3L3 9.6l6.2-.9Z" />
      </svg>
    </button>
  );
}

export function PropertyCard({ p, watched, onToggleWatch, staggerIndex = 0 }) {
  const schedule = auctionSchedule(p);
  const price = listingPrice(p, schedule);
  const title = listingTitle(p);
  const link = usePropertyLink(p.id);
  return (
    <Link {...link} className="card fade-in property-card is-hoverable" style={{ transitionDelay: `${Math.min(staggerIndex * 80, 400)}ms` }}>
      <div className="property_card-photo">
        <Photo label={title} photoUrl={p.photoUrl} ratio="16/10" showLabel={false} />
        <div className="property-card-clock">
          {schedule.current && <span className="property-card-clock-round">{schedule.current.round}ª rodada</span>}
          {schedule.isOpenTender && !schedule.ended && <span className="property-card-clock-round">Rodada única</span>}
          <Countdown until={schedule.headline.until} compact dark endedLabel={schedule.headline.short || 'Encerrado'} />
        </div>
        <SaveProperty p={p} watched={watched} onToggleWatch={onToggleWatch} overlay />
      </div>
      <div className="property-card-body">
        <div className="property_card-tags"><span className="tag">{saleTagLabel(p, schedule, { compact: true })}</span><span className="tag">{p.type || 'Imóvel'}</span></div>
        <h3 className="property_card-title">{title}</h3>
        <div className="property_card-specs"><Specs area={p.area} beds={p.beds} baths={p.baths} parking={p.parking} floor={p.floor} /></div>
        <ListingBadges p={p} />
        <div className="property_card-pricing">
          <span className="property_card-price-label">{schedule.ended ? 'Último valor inicial' : /venda direta/i.test(p.modalidade || '') ? 'Preço de venda' : schedule.current ? `Valor inicial · ${schedule.current.round}ª rodada` : 'Valor inicial'}</span>
          <strong className="property_card-price" title={price ? `R$ ${fmtBRL(price)}` : undefined}>{listingMoney(price)}</strong>
          {schedule.kind === 'rounds' ? <RoundStrip schedule={schedule} /> : schedule.headline.until > 0 && <div className="property_card-single-date">{schedule.isOpenTender ? 'Rodada única' : 'Data'} · {formatDayTime(schedule.headline.until)}</div>}
          <div className="property_card-appraisal"><span>Valor de avaliação</span><strong title={p.appraisal ? `R$ ${fmtBRL(p.appraisal)}` : undefined}>{listingMoney(p.appraisal)}</strong></div>
        </div>
      </div>
    </Link>
  );
}

export function PropertyRow({ p, watched, onToggleWatch }) {
  const schedule = auctionSchedule(p);
  const price = listingPrice(p, schedule);
  const link = usePropertyLink(p.id);
  return (
    <Link {...link} className="property-row property_listing-row">
      <div className="property_listing-photo"><PropertyImage src={p.photoUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /></div>
      <div className="property_listing-summary">
        <h3>{listingTitle(p)}</h3>
        <div className="property_card-date">{saleTagLabel(p, schedule)}</div>
        <ListingBadges p={p} />
      </div>
      <div><strong className="property_listing-price">{listingMoney(price)}</strong><div className="property_card-date">{schedule.current ? `${schedule.current.round}ª rodada vigente` : 'Valor inicial'}</div></div>
      <div><strong>{listingMoney(p.appraisal)}</strong><div className="property_card-date">Avaliação</div></div>
      <div>{schedule.kind === 'rounds' ? <RoundStrip schedule={schedule} /> : <span className="property_card-date">{formatDayTime(schedule.headline.until) || 'Sem data'}</span>}</div>
      <SaveProperty p={p} watched={watched} onToggleWatch={onToggleWatch} />
    </Link>
  );
}
