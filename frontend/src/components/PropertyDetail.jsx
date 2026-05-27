import { useState } from 'react';
import { ScoreBadge, Countdown, Photo, Specs } from './shared';
import { fmtBRL } from '../utils';

export default function PropertyDetail({ property, go, watched, toggleWatch }) {
  const [tab, setTab] = useState('market');

  // Simulator state lives here so both Costs and Viability share it
  const [reno, setReno] = useState(45);
  const [target, setTarget] = useState(30);
  const [exempt, setExempt] = useState('Reinvestimento em 180 dias');

  if (!property) {
    return (
      <div style={{ maxWidth: 1480, margin: '0 auto', padding: '60px 24px', textAlign: 'center' }}>
        <p style={{ color: 'var(--fg-2)', fontSize: 14 }}>Nenhum imóvel selecionado.</p>
        <button className="btn" onClick={() => go('feed')} style={{ marginTop: 16 }}>Voltar ao feed</button>
      </div>
    );
  }
  const p = property;
  const isWatched = watched?.includes(p.id);

  // Compute simulator values from seed costs + sliders
  const renoCost = Math.round((reno / 100) * 80000);
  const gainCapital = (exempt === 'Primeiro imóvel' || exempt === 'Reinvestimento em 180 dias')
    ? 0
    : Math.round(Math.max(0, (p.market || 0) * 0.94 - (p.minBid || 0)) * 0.15);

  const dynamicTotal = (p.costs || []).reduce((acc, r) => {
    if (r.kind === 'reno') return acc + renoCost;
    if (r.kind === 'tax' && r.label.toLowerCase().includes('ganho')) return acc + gainCapital;
    return acc + r.value;
  }, 0);

  const netSale = Math.round((p.market || 0) * 0.94);
  const grossROI = dynamicTotal > 0 ? Math.round(((netSale - dynamicTotal) / dynamicTotal) * 100) : 0;
  const maxBid = dynamicTotal > 0
    ? Math.round((netSale / (1 + target / 100)) - (dynamicTotal - (p.minBid || 0)))
    : 0;

  const sim = {
    reno, setReno, target, setTarget, exempt, setExempt,
    renoCost, gainCapital, dynamicTotal, netSale, grossROI, maxBid,
  };

  return (
    <div className="page detail-page" style={{ maxWidth: 1480, margin: '0 auto', padding: '20px 24px 80px' }}>

      {/* ===== Breadcrumb + actions ===== */}
      <div className="row between detail-top" style={{ marginBottom: 18 }}>
        <button
          onClick={() => go('feed')}
          className="row gap-2"
          style={{ color: 'var(--fg-2)', fontSize: 12.5 }}
        >
          <span className="mono">←</span>
          <span>Feed</span>
          <span className="mono" style={{ color: 'var(--fg-3)' }}>/</span>
          <span style={{ color: 'var(--fg-0)' }}>{p.title}</span>
        </button>
        <div className="row gap-2 detail-actions">
          <button className="btn sm" onClick={() => toggleWatch?.(p.id)}>
            <span style={{ color: isWatched ? 'var(--accent)' : 'var(--fg-2)' }}>
              {isWatched ? '★' : '☆'}
            </span>
            {isWatched ? 'Salvo' : 'Salvar'}
          </button>
          <button className="btn sm" onClick={() => p.auctionUrl && window.open(p.auctionUrl, '_blank')} disabled={!p.auctionUrl} title={p.auctionUrl || 'URL não disponível'}>
            <span className="mono">↗</span> Edital PDF
          </button>
          <button className="btn sm">
            <span className="mono">⎙</span> Exportar análise
          </button>
          <button className="btn sm primary">
            Dar lance
          </button>
        </div>
      </div>

      {/* ===== HERO: gallery + key facts ===== */}
      <div className="detail-hero-grid" style={{
        display: 'grid',
        gridTemplateColumns: '1.4fr 1fr',
        gap: 24,
        marginBottom: 24,
      }}>
        {/* Gallery */}
        <div>
          <div style={{ position: 'relative', borderRadius: 10, overflow: 'hidden', border: '1px solid var(--line-1)' }}>
            <Photo label={p.photoLabel} ratio="16/10" />
            <div style={{
              position: 'absolute', top: 14, left: 14,
              background: 'oklch(1 0 0 / 0.92)', padding: '6px 10px',
              borderRadius: 6, fontSize: 11,
              border: '1px solid var(--line-1)',
              fontFamily: 'var(--f-mono)',
            }}>
              1 / 12 fotos
            </div>
            <button style={{
              position: 'absolute', bottom: 14, right: 14,
              padding: '8px 14px', borderRadius: 6,
              background: 'oklch(1 0 0 / 0.95)',
              border: '1px solid var(--line-1)',
              fontSize: 12, fontWeight: 500,
            }}>
              Ver todas →
            </button>
          </div>
          <div className="row gap-2 thumb-strip" style={{ marginTop: 10 }}>
            {['Frente', 'Sala', 'Cozinha', 'Quarto', 'Banheiro', 'Vista'].map((l, i) => (
              <div key={l} style={{
                width: 80, height: 56,
                borderRadius: 6,
                background: 'oklch(0.92 0.005 75)',
                backgroundImage: 'repeating-linear-gradient(135deg, oklch(0.88 0.005 75) 0 1px, transparent 1px 8px)',
                border: i === 0 ? '2px solid var(--accent)' : '1px solid var(--line-1)',
                position: 'relative',
                cursor: 'pointer',
              }}>
                <span className="mono" style={{
                  position: 'absolute', bottom: 4, left: 4,
                  fontSize: 9, color: 'var(--fg-2)',
                  background: 'oklch(1 0 0 / 0.8)',
                  padding: '1px 4px', borderRadius: 3,
                }}>
                  {l}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Key facts panel */}
        <div className="card" style={{ padding: 22 }}>
          <div className="row gap-2 wrap" style={{ marginBottom: 14 }}>
            <span className="tag accent">{p.auctionType}</span>
            <span className="tag">{p.type}</span>
            <span className={`tag dot ${p.occupancy === 'desocupado' ? 'good' : p.occupancy === 'ocupado' ? 'warn' : 'bad'}`}>
              {p.occupancy}
            </span>
          </div>

          <h1 className="h1" style={{ marginBottom: 4 }}>{p.title}</h1>
          <p style={{ margin: '0 0 16px', fontSize: 13, color: 'var(--fg-2)' }}>
            {p.address} · {p.neighborhood}, {p.city}
          </p>

          {/* Specs — only shows fields with real data */}
          <Specs area={p.area} beds={p.beds} baths={p.baths} parking={p.parking} floor={p.floor} />

          <div className="divider" style={{ margin: '16px 0' }}></div>

          {/* Score + countdown */}
          <div className="row between" style={{ alignItems: 'flex-start', marginBottom: 16, gap: 12 }}>
            <div className="row gap-3" style={{ alignItems: 'center', flex: 1, minWidth: 0 }}>
              <ScoreBadge value={p.score} size={64} showLabel={false} />
              <div style={{ minWidth: 0 }}>
                <div className="uppy" style={{ color: 'var(--fg-3)' }}>Score Arremate</div>
                <div className="num-md" style={{ marginTop: 2 }}>{p.score}<span style={{ color: 'var(--fg-3)' }}>/100</span></div>
                <div className="mono" style={{ fontSize: 11, color: p.score >= 50 ? 'var(--good)' : 'var(--bad)', marginTop: 2 }}>
                  {p.score >= 50 ? '↑ acima da média' : '↓ abaixo da média'}
                </div>
              </div>
            </div>
            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              <div className="uppy" style={{ color: 'var(--fg-3)' }}>Encerra em</div>
              <div style={{ marginTop: 4 }}>
                <Countdown until={p.endsAt} dark />
              </div>
              <div className="mono" style={{ fontSize: 11, color: 'var(--fg-2)', marginTop: 2 }}>
                {p.endsAt ? new Date(p.endsAt).toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' }) + ' · ' + new Date(p.endsAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '—'}
              </div>
            </div>
          </div>

          <div className="divider" style={{ margin: '16px 0' }}></div>

          {/* Pricing grid — always shows 1ª and 2ª praça */}
          <PricingGrid p={p} />

          <div className="divider" style={{ margin: '16px 0 4px' }}></div>

          <Collapsible title="Descrição do imóvel">
            <p style={{ margin: 0, fontSize: 13, color: 'var(--fg-1)', lineHeight: 1.5 }}>
              {p.viability?.description || 'Descrição não disponível.'}
            </p>
          </Collapsible>

          <Collapsible title="Características">
            <div className="meta-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, fontSize: 12.5 }}>
              {p.viability?.features
                ? Object.entries(p.viability.features).map(([lbl, val]) => (
                    <Meta key={lbl} lbl={lbl} val={val} />
                  ))
                : <span style={{ color: 'var(--fg-2)' }}>Dados não disponíveis</span>
              }
            </div>
          </Collapsible>

          <Collapsible title="Dados do leilão" last>
            <div className="meta-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, fontSize: 12.5 }}>
              <Meta lbl="Leiloeiro" val={p.auctioneer} />
              <Meta lbl="Tribunal/Vara" val={p.court} />
              <Meta lbl="Processo" val={p.edital?.process || '—'} />
              <Meta lbl="Matrícula" val="—" />
            </div>
          </Collapsible>
        </div>
      </div>

      {/* ===== TABS ===== */}
      <div className="detail-tabs" style={{
        display: 'flex', gap: 0,
        borderBottom: '1px solid var(--line-1)',
        marginBottom: 24,
      }}>
        {[
          { v: 'market', l: 'Mercado', ix: '01' },
          { v: 'cost', l: 'Custos', ix: '02' },
          { v: 'viability', l: 'Viabilidade financeira', ix: '03' },
          { v: 'edital', l: 'Edital', ix: '04' },
          { v: 'legal', l: 'Jurídico', ix: '05', locked: true },
        ].map(t => (
          <button
            key={t.v}
            onClick={() => setTab(t.v)}
            style={{
              padding: '12px 18px',
              borderBottom: tab === t.v ? '2px solid var(--accent)' : '2px solid transparent',
              marginBottom: -1,
              color: tab === t.v ? 'var(--fg-0)' : 'var(--fg-2)',
              display: 'inline-flex', alignItems: 'center', gap: 8,
              fontSize: 13,
              fontWeight: tab === t.v ? 600 : 400,
              transition: 'color .15s',
            }}
          >
            <span className="mono" style={{ fontSize: 11, color: 'var(--fg-3)' }}>{t.ix}</span>
            <span>{t.l}</span>
            {t.locked && <span className="tag accent" style={{ padding: '1px 6px', fontSize: 9 }}>premium</span>}
          </button>
        ))}
      </div>

      {/* ===== TAB CONTENT ===== */}
      <div className="fade-in" key={tab}>
        {tab === 'market' && <Market p={p} />}
        {tab === 'cost' && <CostBreakdown p={p} sim={sim} />}
        {tab === 'viability' && <Viability p={p} sim={sim} />}
        {tab === 'legal' && <LegalLocked />}
        {tab === 'edital' && <Edital p={p} />}
      </div>
    </div>
  );
}

// ============================================================
// Shared small helpers
// ============================================================
function Meta({ lbl, val }) {
  return (
    <div>
      <span className="uppy" style={{ color: 'var(--fg-3)' }}>{lbl}</span>
      <div style={{ fontSize: 12.5, color: 'var(--fg-0)', marginTop: 2 }}>{val}</div>
    </div>
  );
}

function PricingGrid({ p }) {
  const has2nd = p.edital?.secondBidPrice && p.edital.secondBidPrice > 0;
  const secondDiscount = has2nd
    ? Math.round((p.minBid - p.edital.secondBidPrice) / p.minBid * 100)
    : 0;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
      <div>
        <span className="uppy" style={{ color: 'var(--fg-3)' }}>1ª praça</span>
        <div className="num-md" style={{ marginTop: 4 }}>R$ {fmtBRL(p.minBid)}</div>
        {p.edital?.firstBidDate && (
          <div className="mono" style={{ fontSize: 11, color: 'var(--fg-3)', marginTop: 2 }}>{p.edital.firstBidDate}</div>
        )}
      </div>
      <div>
        <span className="uppy" style={{ color: 'var(--fg-3)' }}>2ª praça</span>
        {has2nd ? (
          <>
            <div className="row gap-2 baseline" style={{ marginTop: 4 }}>
              <div className="num-md">{fmtBRL(p.edital.secondBidPrice)}</div>
              <span style={{ fontSize: 11, color: 'var(--good)', fontWeight: 500 }}>−{secondDiscount}%</span>
            </div>
            {p.edital?.secondBidDate && (
              <div className="mono" style={{ fontSize: 11, color: 'var(--fg-3)', marginTop: 2 }}>{p.edital.secondBidDate}</div>
            )}
          </>
        ) : (
          <div style={{ marginTop: 4, fontSize: 13, color: 'var(--fg-3)', fontStyle: 'italic' }}>
            Ainda não divulgada
          </div>
        )}
      </div>
    </div>
  );
}

function Collapsible({ title, children, last }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ borderBottom: last ? 'none' : '1px solid var(--line-1)' }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          width: '100%', padding: '12px 0',
          color: 'var(--fg-0)',
          fontSize: 13, fontWeight: 500,
          textAlign: 'left',
        }}
      >
        <span>{title}</span>
        <span className="mono" style={{
          fontSize: 11, color: 'var(--fg-2)',
          transition: 'transform .2s',
          transform: open ? 'rotate(180deg)' : 'rotate(0)',
        }}>▾</span>
      </button>
      {open && (
        <div className="fade-in" style={{ padding: '4px 0 16px' }}>
          {children}
        </div>
      )}
    </div>
  );
}

// ============================================================
// TAB 1 — MARKET
// ============================================================
function Market({ p }) {
  const md = p.marketDetail;

  if (!md) {
    return (
      <div className="card" style={{ padding: 40, textAlign: 'center' }}>
        <p style={{ color: 'var(--fg-2)', fontSize: 14 }}>Dados de mercado não disponíveis para este imóvel.</p>
      </div>
    );
  }

  const has2nd = p.edital?.secondBidPrice && p.edital.secondBidPrice > 0;
  const bid = has2nd ? p.edital.secondBidPrice : p.minBid;
  const bidPct = p.market > 0 ? (bid / p.market * 100) : 0;
  const gapValue = p.market - bid;
  const discountPct = p.market > 0 ? ((p.market - bid) / p.market * 100) : 0;

  // Valorização da região — extraída do indicador de preço/m² do bairro
  const appreciationIndicator = md.indicators.find(i => i.lbl.toLowerCase().includes('bairro'));
  const regionAppreciation = appreciationIndicator?.delta;

  // Filtrar "Liquidez · score" dos indicadores
  const filteredIndicators = md.indicators.filter(i => !i.lbl.toLowerCase().includes('liquidez'));

  return (
    <div>
      <div className="analysis-grid" style={{ display: 'grid', gridTemplateColumns: '1.1fr 1fr', gap: 16, marginBottom: 16 }}>
        {/* § 01.01 — spread */}
        <div className="card" style={{ padding: 22 }}>
          <div className="row between" style={{ alignItems: 'flex-start', marginBottom: 18 }}>
            <div>
              <span className="uppy" style={{ color: 'var(--fg-3)' }}>§ 01.01 · spread</span>
              <h3 className="h2" style={{ marginTop: 4 }}>Valor de mercado vs. lance mínimo</h3>
            </div>
          </div>
          <div style={{ position: 'relative', marginTop: 28 }}>
            <div style={{ height: 12, background: 'var(--bg-3)', borderRadius: 6, position: 'relative' }}>
              <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${Math.min(bidPct, 100)}%`, background: 'var(--accent)', borderRadius: 6 }}></div>
              <div style={{ position: 'absolute', left: `${Math.min(bidPct, 100)}%`, top: -10, width: 2, height: 32, background: 'var(--fg-0)' }}></div>
            </div>
            <div className="row between" style={{ marginTop: 14 }}>
              <div>
                <span className="uppy" style={{ color: 'var(--fg-3)' }}>Lance mínimo</span>
                <div className="num-md" style={{ marginTop: 4, color: 'var(--accent)' }}>R$ {fmtBRL(bid)}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <span className="uppy" style={{ color: 'var(--fg-3)' }}>Mercado estimado</span>
                <div className="num-md" style={{ marginTop: 4 }}>R$ {fmtBRL(p.market)}</div>
              </div>
            </div>
            <div style={{ marginTop: 18, padding: '12px 14px', background: gapValue >= 0 ? 'var(--good-soft)' : 'var(--bad-soft)', borderRadius: 6, fontSize: 13, color: 'var(--fg-0)' }}>
              <b style={{ color: gapValue >= 0 ? 'var(--good)' : 'var(--bad)', fontFamily: 'var(--f-mono)' }}>R$ {fmtBRL(Math.abs(gapValue))}</b>
              <span style={{ color: 'var(--fg-1)' }}> de gap bruto · </span>
              <b>{discountPct >= 0 ? `−${discountPct.toFixed(0)}%` : `+${Math.abs(discountPct).toFixed(1)}%`}</b>
              <span style={{ color: 'var(--fg-1)' }}> {discountPct >= 0 ? 'abaixo' : 'acima'} da avaliação</span>
            </div>
          </div>
        </div>

        {/* § 01.02 — indicadores + valorização */}
        <div className="card" style={{ padding: 22 }}>
          <span className="uppy" style={{ color: 'var(--fg-3)' }}>§ 01.02 · indicadores</span>
          <h3 className="h2" style={{ marginTop: 4, marginBottom: 14 }}>{p.neighborhood} · base 2024–26</h3>

          {regionAppreciation && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 14,
              padding: '12px 14px', borderRadius: 8,
              background: appreciationIndicator.pos ? 'var(--good-soft)' : 'var(--bad-soft)',
              borderLeft: `3px solid ${appreciationIndicator.pos ? 'var(--good)' : 'var(--bad)'}`,
              marginBottom: 18,
            }}>
              <div>
                <div className="uppy" style={{ color: 'var(--fg-3)' }}>Valorização da região</div>
                <div className="num-xl" style={{ color: appreciationIndicator.pos ? 'var(--good)' : 'var(--bad)', marginTop: 4 }}>
                  {regionAppreciation}
                </div>
              </div>
            </div>
          )}

          <div className="metrics-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
            {filteredIndicators.map(ind => (
              <Stat2 key={ind.lbl} lbl={ind.lbl} val={ind.val} delta={ind.delta} pos={ind.pos} neg={ind.neg} />
            ))}
          </div>
        </div>
      </div>

      {/* § 01.03 — comparáveis (trend removida) */}
      {md.comparables.length > 0 && (
        <div className="card" style={{ marginTop: 16, padding: 22 }}>
          <span className="uppy" style={{ color: 'var(--fg-3)' }}>§ 01.03 · comparáveis</span>
          <h3 className="h2" style={{ marginTop: 4, marginBottom: 16 }}>Imóveis vendidos no raio de 800m · 6 meses</h3>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', fontSize: 12.5, borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ fontFamily: 'var(--f-mono)', fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--fg-3)' }}>
                  <th style={{ textAlign: 'left', padding: '8px 12px', borderBottom: '1px solid var(--line-1)' }}>Endereço</th>
                  <th style={{ textAlign: 'right', padding: '8px 12px', borderBottom: '1px solid var(--line-1)' }}>Área</th>
                  <th style={{ textAlign: 'right', padding: '8px 12px', borderBottom: '1px solid var(--line-1)' }}>Quartos</th>
                  <th style={{ textAlign: 'right', padding: '8px 12px', borderBottom: '1px solid var(--line-1)' }}>R$/m²</th>
                  <th style={{ textAlign: 'right', padding: '8px 12px', borderBottom: '1px solid var(--line-1)' }}>Venda</th>
                  <th style={{ textAlign: 'left', padding: '8px 12px', borderBottom: '1px solid var(--line-1)' }}>Fonte</th>
                  <th style={{ textAlign: 'center', padding: '8px 12px', borderBottom: '1px solid var(--line-1)' }}>Link</th>
                </tr>
              </thead>
              <tbody>
                {md.comparables.map((r, i) => (
                  <tr key={i}>
                    <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--line-1)' }}>{r.address}</td>
                    <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--line-1)', textAlign: 'right', fontFamily: 'var(--f-mono)' }}>{r.areaM2} m²</td>
                    <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--line-1)', textAlign: 'right', fontFamily: 'var(--f-mono)' }}>{r.beds ?? '—'}</td>
                    <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--line-1)', textAlign: 'right', fontFamily: 'var(--f-mono)' }}>R$ {fmtBRL(r.pricePerM2)}</td>
                    <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--line-1)', textAlign: 'right', fontFamily: 'var(--f-mono)' }}>R$ {fmtBRL(r.salePrice)}</td>
                    <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--line-1)', color: 'var(--fg-2)' }}>{r.source || '—'}</td>
                    <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--line-1)', textAlign: 'center' }}>
                      {r.url ? (
                        <a href={r.url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)', fontSize: 11, fontFamily: 'var(--f-mono)' }}>↗ ver</a>
                      ) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function Stat2({ lbl, val, delta, pos, neg }) {
  return (
    <div>
      <span className="uppy" style={{ color: 'var(--fg-3)' }}>{lbl}</span>
      <div className="num-md" style={{ marginTop: 4 }}>{val}</div>
      <span className="mono" style={{
        fontSize: 11.5, marginTop: 2, display: 'inline-block',
        color: pos ? 'var(--good)' : neg ? 'var(--bad)' : 'var(--fg-2)',
      }}>
        {delta}
      </span>
    </div>
  );
}

// ============================================================
// TAB 2 — COSTS (with simulator at top)
// ============================================================
function CostBreakdown({ p, sim }) {
  const { reno, setReno, target, setTarget, exempt, setExempt, renoCost, gainCapital, netSale, grossROI, maxBid } = sim;

  const rows = (p.costs || []).map(r => {
    if (r.kind === 'reno') {
      return {
        ...r,
        value: renoCost,
        hint: `Nível: ${reno < 25 ? 'mínima — pintura e ajustes' : reno < 60 ? 'padrão — cozinha, banheiros, piso' : 'completa — desmontagem e reconstrução'}. Ajuste o slider acima.`,
      };
    }
    if (r.kind === 'tax' && r.label.toLowerCase().includes('ganho')) {
      return {
        ...r,
        value: gainCapital,
        hint: gainCapital === 0
          ? `Isento — ${exempt.toLowerCase()}.`
          : 'Alíquota de 15% sobre o ganho líquido estimado na venda.',
      };
    }
    return r;
  });

  const dynamicTotal = rows.reduce((a, r) => a + r.value, 0);

  if (rows.length === 0) {
    return (
      <div className="card" style={{ padding: 40, textAlign: 'center' }}>
        <p style={{ color: 'var(--fg-2)', fontSize: 14 }}>Dados de custos não disponíveis para este imóvel.</p>
      </div>
    );
  }

  return (
    <div>
      {/* ── Simulator ── */}
      <div className="card" style={{ padding: 24, marginBottom: 20 }}>
        <div className="row between" style={{ alignItems: 'flex-start', marginBottom: 20 }}>
          <div>
            <span className="uppy" style={{ color: 'var(--fg-3)' }}>§ 02.01 · simulador</span>
            <h3 className="h2" style={{ marginTop: 4 }}>Cenário do investidor</h3>
            <p style={{ margin: '4px 0 0', fontSize: 12.5, color: 'var(--fg-2)' }}>
              Arraste os controles — os custos abaixo recalculam ao vivo.
            </p>
          </div>
          <button className="btn sm" onClick={() => { setReno(45); setTarget(30); setExempt('Reinvestimento em 180 dias'); }}>
            Resetar
          </button>
        </div>

        {/* Metric tiles */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14, marginBottom: 24 }}>
          <SimMetric
            lbl="ROI líquido projetado"
            big={`${grossROI >= 0 ? '+' : ''}${grossROI}%`}
            color={grossROI >= 25 ? 'var(--good)' : grossROI >= 10 ? 'var(--warn)' : 'var(--bad)'}
          />
          <SimMetric lbl="Custo total estimado" big={`R$ ${fmtBRL(dynamicTotal)}`} />
          <SimMetric
            lbl="Lance máximo recomendado"
            big={`R$ ${fmtBRL(Math.max(0, maxBid))}`}
            color="var(--accent)"
          />
          <SimMetric
            lbl="Venda estimada (líq. 6%)"
            big={`R$ ${fmtBRL(netSale)}`}
            color="var(--fg-1)"
          />
        </div>

        {/* Sliders */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 32, marginBottom: 24 }}>
          <SliderField
            label="Nível de reforma"
            value={reno}
            onChange={setReno}
            display={`R$ ${fmtBRL(renoCost)}`}
            description={reno < 25 ? 'Mínima — pintura e ajustes' : reno < 60 ? 'Padrão — cozinha, banheiros, piso' : 'Completa — desmontagem e reconstrução'}
          />
          <SliderField
            label="Meta de retorno líquido"
            value={target}
            onChange={setTarget}
            display={`${target}%`}
            description="Após custos, impostos e venda em 12 meses"
            min={5}
            max={80}
          />
        </div>

        {/* Tax scenario */}
        <div className="divider" style={{ margin: '0 0 20px' }}></div>
        <Selector
          label="Cenário tributário"
          value={exempt}
          options={['Primeiro imóvel', 'Reinvestimento em 180 dias', 'Pagamento integral de GC']}
          onChange={setExempt}
          hint="Isenção ou incidência do ganho de capital na venda"
        />
      </div>

      {/* ── Cost table ── */}
      <div>
        <div className="row between" style={{ alignItems: 'flex-end', marginBottom: 16 }}>
          <div>
            <span className="uppy" style={{ color: 'var(--fg-3)' }}>§ 02.02 · custo total</span>
            <h3 className="h2" style={{ marginTop: 4 }}>Da batida do martelo à chave na mão</h3>
            <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--fg-2)', maxWidth: 540 }}>
              Cada centavo que sai do bolso, linha a linha. Passe o cursor em qualquer item para entender o porquê.
            </p>
          </div>
          <div className="row gap-2">
            <button className="btn sm"><span className="mono">↓</span> PDF</button>
          </div>
        </div>

        <div className="card">
          <div style={{
            display: 'grid', gridTemplateColumns: '24px 1fr 100px 160px', gap: 14,
            padding: '10px 20px', background: 'var(--bg-2)',
            fontFamily: 'var(--f-mono)', fontSize: 10.5,
            textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--fg-3)',
          }}>
            <span></span><span>Item</span>
            <span style={{ textAlign: 'right' }}>% do total</span>
            <span style={{ textAlign: 'right' }}>Valor</span>
          </div>
          {rows.map((r, i) => (
            <CostRow key={i} l={r.label} v={r.value} hint={r.hint} pct={dynamicTotal > 0 ? r.value / dynamicTotal * 100 : 0} />
          ))}
          <div style={{
            display: 'grid', gridTemplateColumns: '24px 1fr 100px 160px', gap: 14,
            padding: '20px 20px', background: 'var(--bg-2)',
            alignItems: 'baseline', borderTop: '2px solid var(--line-2)',
          }}>
            <span className="mono" style={{ color: 'var(--fg-3)' }}>∑</span>
            <span style={{ fontSize: 15, fontWeight: 600 }}>Custo total — chave na mão</span>
            <span></span>
            <span className="num-xl" style={{ textAlign: 'right', color: 'var(--accent)' }}>R$ {fmtBRL(dynamicTotal)}</span>
          </div>
        </div>
        <p style={{ marginTop: 14, fontSize: 11.5, color: 'var(--fg-3)' }}>
          Cálculo conservador. Ganho de capital varia conforme reinvestimento. Honorários advocatícios não inclusos.
        </p>
      </div>
    </div>
  );
}

function SimMetric({ lbl, big, color = 'var(--fg-0)' }) {
  return (
    <div style={{
      padding: '14px 16px',
      background: 'var(--bg-2)', borderRadius: 8,
      border: '1px solid var(--line-1)',
    }}>
      <span className="uppy" style={{ color: 'var(--fg-3)' }}>{lbl}</span>
      <div className="num-xl" style={{ marginTop: 8, color }}>{big}</div>
    </div>
  );
}

function CostRow({ l, v, hint, pct }) {
  const [open, setOpen] = useState(false);
  return (
    <div
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      style={{
        display: 'grid',
        gridTemplateColumns: '24px 1fr 100px 160px',
        gap: 14,
        padding: '14px 20px',
        borderTop: '1px solid var(--line-1)',
        alignItems: 'baseline',
        transition: 'background .15s',
        background: open ? 'var(--bg-2)' : 'transparent',
      }}
    >
      <button style={{
        width: 16, height: 16, borderRadius: '50%',
        border: '1px solid var(--line-2)',
        color: 'var(--fg-3)', fontSize: 9,
        fontFamily: 'var(--f-mono)',
      }}>?</button>
      <div>
        <div style={{ fontSize: 13.5, color: 'var(--fg-0)' }}>{l}</div>
        {open && hint && (
          <div style={{ marginTop: 5, fontSize: 11.5, color: 'var(--fg-2)', maxWidth: 480 }}>{hint}</div>
        )}
      </div>
      <div style={{ textAlign: 'right' }}>
        {v > 0 && (
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 40, height: 4, borderRadius: 2, background: 'var(--bg-3)', overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${Math.min(pct * 2.5, 100)}%`, background: 'var(--fg-3)' }}></div>
            </div>
            <span className="mono" style={{ fontSize: 11, color: 'var(--fg-2)', minWidth: 32, textAlign: 'right' }}>
              {pct.toFixed(1)}%
            </span>
          </div>
        )}
      </div>
      <span className="mono" style={{
        fontSize: 15, textAlign: 'right',
        color: v === 0 ? 'var(--fg-3)' : 'var(--fg-0)',
        fontWeight: 500, letterSpacing: '-0.02em',
      }}>
        {v === 0 ? '— isento' : `R$ ${fmtBRL(v)}`}
      </span>
    </div>
  );
}

function SliderField({ label, value, onChange, display, description, min = 0, max = 100 }) {
  return (
    <div>
      <div className="row between baseline">
        <span className="uppy" style={{ color: 'var(--fg-3)' }}>{label}</span>
        <span className="mono" style={{ fontSize: 18, fontWeight: 500, color: 'var(--accent)' }}>{display}</span>
      </div>
      <input
        type="range" min={min} max={max} value={value}
        onChange={(e) => onChange(+e.target.value)}
        className="slider"
        style={{ width: '100%', marginTop: 14 }}
      />
      <div className="row between" style={{ marginTop: 8 }}>
        <span className="mono" style={{ fontSize: 10, color: 'var(--fg-3)' }}>{min}%</span>
        <span className="mono" style={{ fontSize: 10, color: 'var(--fg-3)' }}>{max}%</span>
      </div>
      <p style={{ margin: '10px 0 0', fontSize: 12, color: 'var(--fg-2)' }}>{description}</p>
    </div>
  );
}

function Selector({ label, value, options, onChange, hint }) {
  return (
    <div>
      <span className="uppy" style={{ color: 'var(--fg-3)' }}>{label}</span>
      <div className="row gap-2 wrap" style={{ marginTop: 10 }}>
        {options.map(o => (
          <button
            key={o}
            onClick={() => onChange(o)}
            style={{
              padding: '7px 12px', fontSize: 12.5, borderRadius: 6,
              border: '1px solid ' + (o === value ? 'var(--accent)' : 'var(--line-1)'),
              background: o === value ? 'var(--accent-soft)' : 'var(--bg-1)',
              color: o === value ? 'var(--accent-strong)' : 'var(--fg-1)',
              fontWeight: o === value ? 500 : 400,
              transition: 'all .15s',
            }}
          >
            {o}
          </button>
        ))}
      </div>
      {hint && <p style={{ margin: '10px 0 0', fontSize: 11.5, color: 'var(--fg-3)' }}>{hint}</p>}
    </div>
  );
}

// ============================================================
// TAB 3 — VIABILITY (simulator removed — results come from Costs tab)
// ============================================================
function Viability({ p, sim }) {
  const v = p.viability;
  const { dynamicTotal, grossROI, maxBid, target } = sim;

  if (!v) {
    return (
      <div className="card" style={{ padding: 40, textAlign: 'center' }}>
        <p style={{ color: 'var(--fg-2)', fontSize: 14 }}>Dados de viabilidade não disponíveis para este imóvel.</p>
      </div>
    );
  }

  const goodCount = v.riskDimensions.filter(d => d.state === 'good').length;
  const warnCount = v.riskDimensions.filter(d => d.state === 'warn').length;
  const badCount = v.riskDimensions.filter(d => d.state === 'bad').length;

  return (
    <div>
      {/* Metrics from simulator */}
      <div className="metrics-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16, marginBottom: 16 }}>
        <Metric lbl="ROI líquido projetado" big={`${grossROI >= 0 ? '+' : ''}${grossROI}%`} sub="Após custos, tributos e venda estimada" color={grossROI >= 25 ? 'var(--good)' : grossROI >= 10 ? 'var(--warn)' : 'var(--bad)'} />
        <Metric lbl="Custo total estimado" big={`R$ ${fmtBRL(dynamicTotal)}`} sub="Lance + reforma + tributos e débitos" />
        <Metric lbl="Lance máximo recomendado" big={`R$ ${fmtBRL(Math.max(0, maxBid))}`} sub={`Para atingir ${target}% de retorno líquido`} color="var(--accent)" />
        <Metric lbl="Payback" big="11 meses" sub="Considerando venda direta após reforma" />
      </div>

      <div style={{ marginBottom: 24, padding: '10px 16px', background: 'var(--bg-2)', borderRadius: 6, fontSize: 12, color: 'var(--fg-2)' }}>
        ↳ Valores calculados com base no simulador da aba <b style={{ color: 'var(--fg-1)' }}>Custos</b>. Ajuste lá para recalcular.
      </div>

      <div className="analysis-grid" style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 16 }}>
        <div className="card" style={{ padding: 22 }}>
          <div className="row between" style={{ alignItems: 'flex-start', marginBottom: 18 }}>
            <div>
              <span className="uppy" style={{ color: 'var(--fg-3)' }}>§ 03.01</span>
              <h3 className="h2" style={{ marginTop: 4 }}>Riscos por dimensão</h3>
              <p style={{ margin: '4px 0 0', fontSize: 12.5, color: 'var(--fg-2)' }}>Score quebrado nas quatro dimensões que mais explicam atrito em leilões.</p>
            </div>
            <span className={`tag dot ${badCount > 0 ? 'bad' : warnCount > 0 ? 'warn' : 'good'}`}>
              {goodCount} boas{warnCount > 0 ? ` · ${warnCount} atenção` : ''}{badCount > 0 ? ` · ${badCount} crítico${badCount > 1 ? 's' : ''}` : ''}
            </span>
          </div>
          <div className="col gap-4" style={{ marginTop: 20 }}>
            {v.riskDimensions.map(rd => (
              <RiskBar key={rd.dim} dim={rd.dim} pct={rd.pct} state={rd.state} note={rd.note} />
            ))}
          </div>
        </div>

        <div className="card" style={{ padding: 22 }}>
          <div className="row between" style={{ alignItems: 'flex-start', marginBottom: 18 }}>
            <div>
              <span className="uppy" style={{ color: 'var(--fg-3)' }}>§ 03.02</span>
              <h3 className="h2" style={{ marginTop: 4 }}>Alertas detectados</h3>
            </div>
            <span className="mono" style={{ fontSize: 11, color: 'var(--fg-2)' }}>{v.alerts.length} itens</span>
          </div>
          <div className="col gap-3" style={{ marginTop: 20 }}>
            {v.alerts.map((a, i) => (
              <Alert key={i} level={a.level} title={a.title}>{a.text}</Alert>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function Metric({ lbl, big, sub, color = 'var(--fg-0)' }) {
  return (
    <div className="card" style={{ padding: 20 }}>
      <span className="uppy" style={{ color: 'var(--fg-3)' }}>{lbl}</span>
      <div className="num-xl" style={{ marginTop: 10, color }}>{big}</div>
      <p style={{ margin: '10px 0 0', fontSize: 12, color: 'var(--fg-2)', lineHeight: 1.45 }}>{sub}</p>
    </div>
  );
}

function RiskBar({ dim, pct, state, note }) {
  return (
    <div>
      <div className="row between baseline" style={{ marginBottom: 8 }}>
        <span style={{ fontSize: 13.5, color: 'var(--fg-0)', fontWeight: 500 }}>{dim}</span>
        <span className="mono" style={{ fontSize: 12, color: 'var(--fg-2)' }}>
          <b style={{ color: state === 'good' ? 'var(--good)' : state === 'warn' ? 'var(--warn)' : 'var(--bad)', fontWeight: 500 }}>{pct}</b>/100
        </span>
      </div>
      <div className={`bar ${state}`}>
        <i style={{ width: `${pct}%` }}></i>
      </div>
      <p style={{ margin: '6px 0 0', fontSize: 11.5, color: 'var(--fg-2)' }}>{note}</p>
    </div>
  );
}

function Alert({ level, title, children }) {
  const color = level === 'good' ? 'var(--good)' : level === 'warn' ? 'var(--warn)' : 'var(--bad)';
  const bg = level === 'good' ? 'var(--good-soft)' : level === 'warn' ? 'var(--warn-soft)' : 'var(--bad-soft)';
  return (
    <div style={{ padding: '12px 14px', background: bg, borderRadius: 6, borderLeft: `2px solid ${color}` }}>
      <div className="row gap-2 baseline" style={{ marginBottom: 4 }}>
        <span style={{ color, fontSize: 11 }}>●</span>
        <span style={{ fontSize: 13, color: 'var(--fg-0)', fontWeight: 500 }}>{title}</span>
      </div>
      <p style={{ margin: '0 0 0 16px', fontSize: 12, color: 'var(--fg-1)' }}>{children}</p>
    </div>
  );
}

// ============================================================
// TAB 4 — LEGAL (locked)
// ============================================================
function LegalLocked() {
  return (
    <div style={{ position: 'relative', minHeight: 540 }}>
      <div aria-hidden style={{ filter: 'blur(10px)', opacity: 0.55, pointerEvents: 'none', userSelect: 'none' }}>
        <h3 className="h2" style={{ marginBottom: 18 }}>Matrícula 87.412 · 14º cartório de registro de imóveis</h3>
        <div className="metrics-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="card" style={{ padding: 22 }}>
              <span className="uppy" style={{ color: 'var(--fg-3)' }}>Item {i}</span>
              <div className="num-md" style={{ marginTop: 8 }}>0000000000 0000</div>
              <p style={{ marginTop: 10, color: 'var(--fg-2)', fontSize: 13 }}>
                Lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore.
              </p>
            </div>
          ))}
        </div>
      </div>
      <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', padding: 24 }}>
        <div className="card" style={{
          width: 'min(560px, 100%)', padding: 32,
          background: 'oklch(1 0 0 / 0.92)', backdropFilter: 'blur(12px)',
          boxShadow: '0 20px 50px oklch(0 0 0 / 0.08)',
        }}>
          <div className="row gap-2 baseline" style={{ marginBottom: 18 }}>
            <span style={{ width: 26, height: 26, display: 'grid', placeItems: 'center', border: '1.5px solid var(--accent)', borderRadius: '50%', color: 'var(--accent)', fontSize: 12, fontFamily: 'var(--f-mono)' }}>⚿</span>
            <span className="uppy" style={{ color: 'var(--accent)' }}>conteúdo premium</span>
          </div>
          <h3 className="h1" style={{ marginBottom: 14 }}>Pesquisa jurídica completa</h3>
          <p style={{ margin: 0, fontSize: 14, color: 'var(--fg-1)' }}>
            Diligência jurídica feita por advogados parceiros — você arremata sabendo exatamente os riscos.
          </p>
          <ul style={{ margin: '22px 0', padding: 0, listStyle: 'none' }}>
            {[
              ['Matrícula 30 anos', 'Histórico completo de transferências e ônus'],
              ['Certidões pessoais', 'Federal, estadual, municipal, trabalhista'],
              ['Processos cíveis e criminais', 'Pesquisa nominal nos 27 estados'],
              ['Protestos e SCPC', 'Cartórios e órgãos de proteção'],
              ['Parecer de nulidade', 'Probabilidade de anulação do arremate'],
            ].map(([t, d]) => (
              <li key={t} style={{ display: 'grid', gridTemplateColumns: '14px 1fr', gap: 12, padding: '8px 0', borderTop: '1px solid var(--line-1)', alignItems: 'baseline' }}>
                <span style={{ color: 'var(--good)', fontSize: 11 }}>✓</span>
                <div>
                  <div style={{ fontSize: 13, color: 'var(--fg-0)', fontWeight: 500 }}>{t}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--fg-2)' }}>{d}</div>
                </div>
              </li>
            ))}
          </ul>
          <div className="row between" style={{ alignItems: 'flex-end' }}>
            <div>
              <div className="num-xl" style={{ color: 'var(--fg-0)' }}>
                R$ 397<span style={{ fontSize: 13, color: 'var(--fg-2)', fontWeight: 400, fontFamily: 'var(--f-sans)' }}> / imóvel</span>
              </div>
              <span className="mono" style={{ fontSize: 11, color: 'var(--fg-2)', marginTop: 4, display: 'inline-block' }}>entrega em até 24h</span>
            </div>
            <button className="btn primary lg">Desbloquear agora →</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// TAB 5 — EDITAL
// ============================================================
function Edital({ p }) {
  const e = p.edital;
  if (!e) {
    return (
      <div className="card" style={{ padding: 40, textAlign: 'center' }}>
        <p style={{ color: 'var(--fg-2)', fontSize: 14 }}>Dados do edital não disponíveis para este imóvel.</p>
      </div>
    );
  }
  return (
    <div className="card" style={{ padding: 24, fontSize: 13, lineHeight: 1.65 }}>
      <div className="row between" style={{ alignItems: 'flex-start', marginBottom: 18 }}>
        <div>
          <span className="uppy" style={{ color: 'var(--fg-3)' }}>§ 04 · edital integral</span>
          <h3 className="h2" style={{ marginTop: 4 }}>Edital de Leilão Judicial Eletrônico</h3>
          <p style={{ margin: '4px 0 0', fontSize: 12.5, color: 'var(--fg-2)' }}>Originado em: {e.firstBidDate || 'não informado'}</p>
        </div>
        <div className="row gap-2">
          <button className="btn sm"><span className="mono">↗</span> Abrir no tribunal</button>
          <button className="btn sm"><span className="mono">↓</span> PDF original</button>
        </div>
      </div>
      <div className="meta-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18, marginBottom: 22 }}>
        <Meta lbl="Processo" val={e.process || '—'} />
        <Meta lbl="Exequente" val={e.creditor || '—'} />
        <Meta lbl="Executado" val={e.debtor || '—'} />
        <Meta lbl="Modalidade" val={e.modality || '—'} />
        <Meta lbl="1ª praça" val={e.firstBidDate ? `${e.firstBidDate} · R$ ${fmtBRL(e.firstBidPrice)}` : '—'} />
        <Meta lbl="2ª praça" val={e.secondBidDate ? `${e.secondBidDate} · R$ ${fmtBRL(e.secondBidPrice)}` : '—'} />
      </div>
      {e.propertyDescription && (
        <>
          <h4 className="h3" style={{ marginBottom: 10 }}>Descrição do bem</h4>
          <p style={{ margin: 0, color: 'var(--fg-1)' }}>{e.propertyDescription}</p>
        </>
      )}
      {e.liens.length > 0 && (
        <>
          <div className="divider" style={{ margin: '20px 0' }}></div>
          <h4 className="h3" style={{ marginBottom: 10 }}>Ônus, gravames e dívidas</h4>
          <ul style={{ margin: 0, paddingLeft: 18, color: 'var(--fg-1)' }}>
            {e.liens.map((l, i) => <li key={i}>{l}</li>)}
          </ul>
        </>
      )}
      {e.paymentTerms && (
        <>
          <div className="divider" style={{ margin: '20px 0' }}></div>
          <h4 className="h3" style={{ marginBottom: 10 }}>Forma de pagamento</h4>
          <p style={{ margin: 0, color: 'var(--fg-1)' }}>{e.paymentTerms}</p>
        </>
      )}
      {e.summaryNote && (
        <div style={{ marginTop: 22, padding: 14, background: 'var(--bg-2)', borderRadius: 6, fontSize: 12, color: 'var(--fg-2)' }}>
          <b style={{ color: 'var(--fg-1)' }}>↳</b> {e.summaryNote}
        </div>
      )}
    </div>
  );
}
