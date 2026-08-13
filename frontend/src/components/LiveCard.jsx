import { fmtBRL } from '../utils';

// ============================================================
// LiveCard — Hero card showing analysis result or animated progress
// ============================================================
export function LiveCardHero({ entry, onClick, analyzed = false }) {
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
          fontSize: 12, fontWeight: 600,
          color: analyzed ? 'var(--good)' : 'var(--fg-2)',
        }}>
          <span style={{
            width: 6, height: 6, borderRadius: '50%',
            background: analyzed ? 'var(--good)' : 'var(--fg-3)',
          }} />
          {analyzed ? 'Análise concluída' : 'Dados do catálogo'}
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

        {/* Pricing — lance, avaliação e mercado estimado */}
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
              {entry.appraisal > 0 ? `R$ ${fmtBRL(entry.appraisal)}` : '—'}
            </span>
            {entry.appraisal > 0 && Number.isFinite(Number(entry.auctionDiscount)) && (
              <div className="mono" style={{ fontSize: 10, color: 'var(--fg-2)', marginTop: 2 }}>
                {Number(entry.auctionDiscount) >= 0
                  ? `${entry.auctionDiscount}% deságio`
                  : `+${Math.abs(entry.auctionDiscount).toFixed(1)}% ágio`}
              </div>
            )}
          </div>
          <div>
            <span style={{ display: 'block', fontSize: 11, color: 'var(--fg-3)', marginBottom: 2 }}>
              Mercado estimado
            </span>
            <span className="mono" style={{ fontSize: 17, fontWeight: 600, color: 'var(--fg-0)' }}>
              {entry.market > 0 ? `R$ ${fmtBRL(entry.market)}` : '—'}
            </span>
            {entry.market > 0 && Number.isFinite(Number(entry.discount)) && (
              <div className="mono" style={{
                fontSize: 10, marginTop: 2, fontWeight: 500,
                color: Number(entry.discount) > 0 ? 'var(--good)' : Number(entry.discount) < 0 ? 'var(--bad)' : 'var(--fg-2)',
              }}>
                {Number(entry.discount) >= 0 ? `${entry.discount}% desconto estimado` : `${entry.discount}% acima da estimativa`}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
