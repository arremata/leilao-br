import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { fmtBRL, getEndsAtMs } from '../utils';
import { usePropertyLink, stopLinkNavigation } from '../usePropertyLink';
import { imageSourceForAttempt } from '../imageFallback';
import { auctionSchedule, formatDayTime, saleTagLabel } from '../auctionRounds';
import { listingBadges } from '../listingFacts';

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
      <div className="ph-label">{label}</div>
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

const ROUND_STATE_LABEL = {
  ended: 'encerrada',
  current: 'agora',
  upcoming: 'se não vender',
};

// ============================================================
// As duas rodadas de um Leilão SFI, lado a lado
// ============================================================
/** "R$ 134 mil", "R$ 1,2 mi": cabe numa linha do quadro da rodada. */
function shortBRL(value) {
  if (value >= 1_000_000) {
    return `R$ ${(value / 1_000_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mi`;
  }
  if (value >= 1_000) return `R$ ${Math.round(value / 1_000).toLocaleString('pt-BR')} mil`;
  return `R$ ${fmtBRL(value)}`;
}

export function RoundStrip({ schedule, compact }) {
  if (schedule.kind !== 'rounds') return null;
  const [first, second] = schedule.rounds;
  // No Leilão SFI o mínimo da 2ª rodada é a dívida com as despesas. Quase
  // sempre fica abaixo da 1ª, mas não sempre: quando a dívida passa do valor
  // do imóvel, a 2ª rodada é MAIS cara, e o quadro tem de dizer isso.
  const diff = first.price && second.price ? second.price - first.price : 0;
  // Os dois quadros têm sempre as mesmas cinco linhas; a do rodapé fica
  // reservada mesmo vazia, para os dois terem a mesma altura e alinhamento.
  // Sem centavos: o quadro é estreito e o valor exato está na página.
  const priceLabel = (price) => (price ? `R$ ${Math.round(price).toLocaleString('pt-BR')}` : 'a publicar');
  // Se um preço é longo, os dois usam a letra menor: o par segue um padrão só.
  const longPrices = schedule.rounds.some(round => priceLabel(round.price).length > 11);
  return (
    <div className={`round-strip${compact ? ' round-strip--compact' : ''}`}>
      {schedule.rounds.map(round => {
        const price = priceLabel(round.price);
        const footer = round.round === 2 && diff !== 0 && round.state !== 'ended'
          ? `${shortBRL(Math.abs(diff))} a ${diff < 0 ? 'menos' : 'mais'}`
          : '';
        return (
          <div key={round.round} className={`round-step is-${round.state}`}>
            <span className="round-step-title">{round.round}ª rodada</span>
            <span className="round-step-state">
              {/* Na rodada que está valendo, quanto falta — como na foto do card. */}
              {round.state === 'current'
                ? <Countdown until={round.at} compact />
                : ROUND_STATE_LABEL[round.state]}
            </span>
            <span
              className={`round-step-price${longPrices ? ' is-long' : ''}`}
              title={round.price ? `R$ ${fmtBRL(round.price)}` : undefined}
            >
              {price}
            </span>
            <span className="round-step-date">{formatDayTime(round.at) || 'data a publicar'}</span>
            <span
              className={`round-step-drop${round.round === 2 && diff > 0 ? ' is-up' : ''}`}
              aria-hidden={!footer}
            >
              {footer || ' '}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ============================================================
// Property card — DENSE, lots of information
// ============================================================
export function PropertyCard({ p, watched, onToggleWatch, staggerIndex = 0 }) {
  const hasMarketAnalysis = Number.isFinite(p.market) && Number.isFinite(p.discount);
  const isDirectSale = /venda direta/i.test(p.modalidade || '');
  const schedule = auctionSchedule(p);
  const link = usePropertyLink(p.id);
  return (
    <Link
      {...link}
      className="card hov fade-in property-card"
      style={{ transitionDelay: `${Math.min(staggerIndex * 80, 400)}ms` }}
    >
      {/* Photo with overlays */}
      <div style={{ position: 'relative' }}>
        <Photo label={p.photoLabel} photoUrl={p.photoUrl} ratio="16/10" />
        {/* Rodada + contagem, no canto: "2ª rodada · 2d 18:51:13" */}
        <div className="property-card-clock">
          {schedule.current ? (
            <span className="property-card-clock-round">{schedule.current.round}ª rodada</span>
          ) : schedule.isOpenTender && !schedule.ended ? (
            <span className="property-card-clock-round">Rodada única</span>
          ) : null}
          <Countdown
            until={schedule.headline.until}
            compact
            dark
            endedLabel={schedule.headline.short || 'Encerrado'}
          />
        </div>
        {/* Watch button bottom-right */}
        <button
          onClick={(e) => { stopLinkNavigation(e); onToggleWatch?.(p.id); }}
          style={{
            position: 'absolute', bottom: 12, right: 12,
            width: 32, height: 32, borderRadius: 8,
            background: 'rgba(255,255,255,0.78)',
            border: '1px solid rgba(255,255,255,0.6)',
            color: watched ? 'var(--accent)' : 'var(--fg-2)',
            backdropFilter: 'blur(8px)',
            fontSize: 14,
          }}
          title={watched ? 'Remover dos salvos' : 'Salvar este imóvel'}
        >
          {watched ? '★' : '☆'}
        </button>
      </div>

      {/* Body */}
      <div className="property-card-body">
        {/* Tags */}
        <div className="row gap-2 wrap" style={{ marginBottom: 10 }}>
          <span className="tag">{saleTagLabel(p, schedule, { compact: true })}</span>
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

        {/* Quem mora lá e como dá para pagar */}
        <ListingBadges p={p} />

        <div className="divider" style={{ margin: '16px 0' }}></div>

        {/* Leilão SFI: as duas rodadas, com a que está valendo em destaque.
            Demais modalidades: o preço de partida numa linha. */}
        {schedule.kind === 'rounds' ? (
          <div style={{ marginBottom: 16 }}>
            <RoundStrip schedule={schedule} compact />
          </div>
        ) : (
          <div style={{ marginBottom: 16 }}>
            <div className="row between baseline">
              <span className="uppy" style={{ color: 'var(--fg-2)' }}>
                {isDirectSale ? 'preço de venda' : 'valor inicial'}
              </span>
              <span className="num-md" style={{ color: 'var(--fg-0)' }}>
                R$ {fmtBRL(p.minBid)}
              </span>
            </div>
            {schedule.isOpenTender && (
              <p className="single-round-note">
                <b>Rodada única.</b> Não tem 2ª rodada com preço menor.
              </p>
            )}
          </div>
        )}

        {/* Economia em reais, nunca em porcentagem: "38% de deságio" não diz
            nada para quem nunca comprou um imóvel. */}
        <div className="property-card-metrics" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginTop: 'auto' }}>
          <div>
            <span className="uppy" style={{ color: 'var(--fg-3)' }}>Valor de avaliação</span>
            <div className="num-md" style={{ marginTop: 3, color: 'var(--fg-0)' }}>
              R$ {fmtBRL(p.appraisal)}
            </div>
            {p.appraisal > 0 && p.minBid > 0 && p.appraisal !== p.minBid && (
              <div style={{ fontSize: 11.5, color: p.appraisal > p.minBid ? 'var(--good)' : 'var(--warn)', marginTop: 4, fontWeight: 500 }}>
                R$ {fmtBRL(Math.abs(p.appraisal - p.minBid))} {p.appraisal > p.minBid ? 'abaixo' : 'acima'}
              </div>
            )}
          </div>
          <div className="property-card-metric-end" style={{ textAlign: 'right' }}>
            <span className="uppy" style={{ color: 'var(--fg-3)' }}>
              Imóveis parecidos
            </span>
            {hasMarketAnalysis ? <>
              <div className="num-md" style={{ marginTop: 3, color: 'var(--fg-0)' }}>
                R$ {fmtBRL(p.market)}
              </div>
              <div style={{
                fontSize: 11.5, marginTop: 4, fontWeight: 500,
                color: p.market > p.minBid ? 'var(--good)' : 'var(--bad)',
              }}>
                {p.market > p.minBid
                  ? `R$ ${fmtBRL(p.market - p.minBid)} mais barato`
                  : `R$ ${fmtBRL(p.minBid - p.market)} mais caro`}
              </div>
            </> : (
              <div style={{ marginTop: 5, fontSize: 12, color: 'var(--fg-2)' }}>ainda não calculado</div>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
}

// ============================================================
// Property row (table-like dense)
// ============================================================
export function PropertyRow({ p, watched, onToggleWatch }) {
  const hasMarketAnalysis = Number.isFinite(p.market) && Number.isFinite(p.discount);
  const isDirectSale = /venda direta/i.test(p.modalidade || '');
  const schedule = auctionSchedule(p);
  const badges = listingBadges(p);
  const link = usePropertyLink(p.id);
  return (
    <Link
      {...link}
      className="property-row"
      style={{
        display: 'grid',
        gridTemplateColumns: '60px 1.6fr 1fr 1fr 1fr 1fr 32px',
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
        backgroundImage: 'repeating-linear-gradient(135deg, #E5E7EB 0 1px, transparent 1px 8px)',
      }}>
        <PropertyImage src={p.photoUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      </div>
      <div>
        <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--fg-0)', lineHeight: 1.25 }}>
          {p.title}
        </div>
        <div style={{ fontSize: 11.5, color: 'var(--fg-2)', marginTop: 2 }}>
          {p.neighborhood}, {p.city} · {p.area} m² · {p.beds} dorm · {saleTagLabel(p, schedule)}
        </div>
        <div className="property-row-badges">
          {badges.map(badge => (
            <span key={badge.key} className={`listing-badge listing-badge--${badge.tone}`} title={badge.title}>
              {badge.label}
            </span>
          ))}
        </div>
      </div>
      <div>
        <div className="num-sm" style={{ color: 'var(--fg-0)' }}>R$ {fmtBRL(p.minBid)}</div>
        <div style={{ fontSize: 11, color: 'var(--fg-2)' }}>
          {isDirectSale ? 'preço de venda' : 'valor inicial'}
        </div>
      </div>
      <div>
        <div className="num-sm" style={{ color: 'var(--fg-1)' }}>R$ {fmtBRL(p.appraisal)}</div>
        {p.appraisal > 0 && p.minBid > 0 && p.appraisal !== p.minBid && (
          <div style={{ fontSize: 11, color: p.appraisal > p.minBid ? 'var(--good)' : 'var(--warn)', fontWeight: 500 }}>
            R$ {fmtBRL(Math.abs(p.appraisal - p.minBid))} {p.appraisal > p.minBid ? 'abaixo' : 'acima'}
          </div>
        )}
      </div>
      <div>
        {hasMarketAnalysis ? <>
          <div className="num-sm" style={{ color: 'var(--fg-0)' }}>R$ {fmtBRL(p.market)}</div>
          <div style={{
            fontSize: 11, fontWeight: 500,
            color: p.market > p.minBid ? 'var(--good)' : 'var(--bad)',
          }}>
            {p.market > p.minBid
              ? `R$ ${fmtBRL(p.market - p.minBid)} mais barato`
              : `R$ ${fmtBRL(p.minBid - p.market)} mais caro`}
          </div>
        </> : <div style={{ fontSize: 11.5, color: 'var(--fg-2)' }}>ainda não calculado</div>}
      </div>
      <div>
        <Countdown
          until={schedule.headline.until}
          compact
          endedLabel={schedule.headline.short || 'Encerrado'}
        />
        {schedule.current && (
          <div style={{ fontSize: 11, color: 'var(--fg-2)', marginTop: 2 }}>
            {schedule.current.round}ª rodada
          </div>
        )}
      </div>
      <button
        onClick={(e) => { stopLinkNavigation(e); onToggleWatch?.(p.id); }}
        style={{
          width: 28, height: 28, borderRadius: 6,
          color: watched ? 'var(--accent)' : 'var(--fg-3)',
          fontSize: 14,
        }}
      >
        {watched ? '★' : '☆'}
      </button>
    </Link>
  );
}
