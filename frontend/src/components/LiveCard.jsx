import { useState, useEffect } from 'react';
import { fmtBRL } from '../utils';

const STEPS = [
  'Edital e documentação',
  'Preço de mercado da região',
  'Ônus e riscos na matrícula',
  'Lance máximo e custos',
  'Parecer de viabilidade',
];

// ============================================================
// LiveCard — Hero card showing analysis result or animated progress
// ============================================================
export function LiveCardHero({ entry, onClick }) {
  if (!entry) return null;

  return (
    <div
      className="card fade-in"
      onClick={onClick}
      style={{ cursor: onClick ? 'pointer' : 'default', marginBottom: 28 }}
    >
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 20px',
        background: 'var(--bg-2)',
        borderBottom: '1px solid var(--line-1)',
      }}>
        <span style={{
          fontFamily: 'var(--f-mono)', fontSize: 11, fontWeight: 500,
          color: 'var(--fg-3)', letterSpacing: '0.02em',
        }}>
          argos — análise de viabilidade
        </span>
        <span style={{
          display: 'flex', alignItems: 'center', gap: 6,
          fontSize: 12, fontWeight: 600, color: 'var(--good)',
        }}>
          <span style={{
            width: 6, height: 6, borderRadius: '50%',
            background: 'var(--good)',
          }} />
          Análise concluída
        </span>
      </div>

      {/* Body */}
      <div style={{ padding: 20 }}>
        <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
          <span className="tag">
            {entry.auctionType || 'Leilão Judicial'}
          </span>
          <span className="tag">{entry.type || 'Imóvel'}</span>
        </div>

        <h3 className="h3" style={{ marginBottom: 2 }}>{entry.title}</h3>
        <p style={{ margin: '0 0 16px', fontSize: 13, color: 'var(--fg-2)' }}>
          {entry.neighborhood ? `${entry.neighborhood}, ` : ''}{entry.city}
        </p>

        {/* Pricing — 3 valores: lance, avaliação, mercado IA */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
          <div>
            <span style={{ display: 'block', fontSize: 11, color: 'var(--fg-3)', marginBottom: 2 }}>Lance mínimo</span>
            <span className="mono" style={{ fontSize: 17, fontWeight: 600, color: 'var(--fg-0)' }}>
              R$ {fmtBRL(entry.minBid)}
            </span>
          </div>
          <div>
            <span style={{ display: 'block', fontSize: 11, color: 'var(--fg-3)', marginBottom: 2 }}>Avaliação leilão</span>
            <span className="mono" style={{ fontSize: 17, fontWeight: 500, color: 'var(--fg-1)' }}>
              R$ {fmtBRL(entry.appraisal)}
            </span>
            <div className="mono" style={{ fontSize: 10, color: 'var(--fg-2)', marginTop: 2 }}>
              {(entry.auctionDiscount ?? 0) >= 0
                ? `${entry.auctionDiscount ?? 0}% deságio`
                : `+${Math.abs(entry.auctionDiscount ?? 0).toFixed(1)}% ágio`}
            </div>
          </div>
          <div>
            <span style={{ display: 'block', fontSize: 11, color: 'var(--fg-3)', marginBottom: 2 }}>
              <span className="ia-chip" style={{ marginRight: 5 }}>IA</span>
              Mercado IA
            </span>
            <span className="mono" style={{ fontSize: 17, fontWeight: 600, color: 'var(--fg-0)' }}>
              R$ {fmtBRL(entry.market)}
            </span>
            <div className="mono" style={{
              fontSize: 10, marginTop: 2, fontWeight: 500,
              color: (entry.discount ?? 0) > 0 ? 'var(--good)' : (entry.discount ?? 0) < 0 ? 'var(--bad)' : 'var(--fg-2)',
            }}>
              {(entry.discount ?? 0) >= 0 ? `+${entry.discount}% desconto IA` : `${entry.discount}% acima IA`}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// LiveCardProgress — Animated analysis progress
// ============================================================
export function LiveCardProgress({ analyzing, onComplete }) {
  const [completedSteps, setCompletedSteps] = useState([]);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!analyzing) {
      setCompletedSteps([]);
      setDone(false);
      return;
    }

    const delays = [600, 1400, 2400, 3200, 3800];
    const timers = delays.map((delay, i) =>
      setTimeout(() => {
        setCompletedSteps(prev => [...prev, i]);
        if (i === delays.length - 1) {
          setTimeout(() => setDone(true), 600);
        }
      }, delay)
    );

    return () => timers.forEach(clearTimeout);
  }, [analyzing]);

  if (!analyzing && completedSteps.length === 0) return null;

  return (
    <div className="card fade-in is-visible" style={{ marginBottom: 20, overflow: 'hidden' }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 20px',
        background: 'var(--bg-2)',
        borderBottom: '1px solid var(--line-1)',
      }}>
        <span style={{
          fontFamily: 'var(--f-mono)', fontSize: 11, fontWeight: 500,
          color: 'var(--fg-3)', letterSpacing: '0.02em',
        }}>
          argos — análise de viabilidade
        </span>
        <span style={{
          display: 'flex', alignItems: 'center', gap: 6,
          fontSize: 12, fontWeight: 600,
          color: done ? 'var(--good)' : 'var(--accent)',
        }}>
          <span style={{
            width: 6, height: 6, borderRadius: '50%',
            background: done ? 'var(--good)' : 'var(--accent)',
            animation: done ? 'none' : 'live-blink 1.5s ease-in-out infinite',
          }} />
          {done ? 'Análise concluída' : 'Analisando...'}
        </span>
      </div>

      {/* Steps */}
      <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {STEPS.map((step, i) => {
          const isDone = completedSteps.includes(i);
          return (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', gap: 12,
              fontSize: 13, padding: '8px 12px', borderRadius: 8,
              background: isDone ? 'var(--good-soft)' : 'var(--bg-2)',
              border: `1px solid ${isDone ? 'rgba(22,163,74,0.2)' : 'var(--line-1)'}`,
              color: isDone ? 'var(--fg-1)' : 'var(--fg-3)',
              opacity: isDone ? 1 : 0.5,
              transition: 'all 0.35s ease',
            }}>
              <span style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                width: 20, height: 20, borderRadius: '50%', flexShrink: 0,
                background: isDone ? 'var(--good)' : 'var(--line-1)',
                color: isDone ? 'white' : 'var(--fg-3)',
                transition: 'all 0.3s ease',
              }}>
                <svg viewBox="0 0 24 24" width={13} height={13} fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 6 9 17l-5-5" />
                </svg>
              </span>
              <span>{step}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
