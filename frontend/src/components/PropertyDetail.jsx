import { useState, useEffect } from 'react';
import { Countdown, Photo, Specs, RiskSummary } from './shared';
import { fmtBRL } from '../utils';
import legalDemo from '../data/legalDemo';
import legalGlossary from '../data/legalGlossary';

// Feature flag — quando `false`, a aba Jurídica volta a ser bloqueada
// (card premium borrado) para quem não tem o plano. Mantido `true`
// nesta fase para construir/validar o conteúdo como se estivesse liberado.
const LEGAL_PREMIUM_UNLOCKED = true;

export default function PropertyDetail({ property, go, watched, toggleWatch }) {
  const [tab, setTab] = useState('market');

  // Simulator state lives here so both Costs and Viability share it
  // renoPct: 0 = leve, 60 = inter, 100 = completa (presets). Slider interpolates.
  const [renoPct, setRenoPct] = useState(60);
  const [monthsToSale, setMonthsToSale] = useState(12); // 3..24
  const [target, setTarget] = useState(30);
  const [exempt, setExempt] = useState('Primeiro imóvel ou reinvestimento em 180 dias');
  const [legalAI, setLegalAI] = useState(false);
  // Occupant-removal toggle: default ON when the property exposes a removal cost.
  // Initial state must be computed from a possibly-null property, so default to false
  // and let the sim re-derive availability after the early-return guard below.
  const [includeOccupantRemoval, setIncludeOccupantRemoval] = useState(false);

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

  // Análise jurídica: prioriza o que vem do backend (p.legal); enquanto
  // não existir, usa o dado de demonstração por id.
  const legal = p.legal || legalDemo[p.id] || null;
  const legalUnlocked = LEGAL_PREMIUM_UNLOCKED && !!legal;

  // --- Renovation cost: button-based, scaled by region's R$/m² ---
  // Region price/m² from the market indicators; fall back to market/area.
  const _neighborhoodIndicator = p.marketDetail?.indicators?.find(
    i => i.lbl.toLowerCase().includes('bairro') && i.val
  );
  const _parseBRLperM2 = (s) => {
    if (!s) return 0;
    const m = String(s).replace(/[^\d.,]/g, '').replace(/\.(?=\d{3})/g, '').replace(',', '.');
    const v = parseFloat(m);
    return isNaN(v) ? 0 : v;
  };
  const regionPricePerM2 = _parseBRLperM2(_neighborhoodIndicator?.val) || (p.area > 0 ? (p.market || 0) / p.area : 0);

  // Renovation rate: tier by region price/m², then interpolate by renoPct (0-100).
  // Presets: 0 = leve, 60 = inter, 100 = completa. Slider interpolates linearly
  // between leve→inter (0-60) and inter→completa (60-100).
  // Taxas calibradas realisticamente — leve ~R$60/m² para pintura/ajustes leve
  // em imóveis de leilão (R$5K para 80m² é o mercado).
  const _renoRate = (pct, pricePerM2) => {
    const tier = pricePerM2 > 6000 ? 'high' : pricePerM2 > 3000 ? 'mid' : 'low';
    const table = {
      high: { leve: 80,  inter: 600,  completa: 1200 },
      mid:  { leve: 70,  inter: 500,  completa: 1100 },
      low:  { leve: 60,  inter: 400,  completa: 1000 },
    };
    const t = table[tier];
    const p = Math.max(0, Math.min(100, pct));
    if (p <= 60) {
      // leve → inter
      return Math.round(t.leve + (t.inter - t.leve) * (p / 60));
    }
    // inter → completa
    return Math.round(t.inter + (t.completa - t.inter) * ((p - 60) / 40));
  };
  const renoRate = _renoRate(renoPct, regionPricePerM2);
  const renoCost = Math.round(renoRate * (p.area || 0));
  const _renoLevelLabel = (pct) => {
    if (pct <= 0) return 'leve — pintura e ajustes';
    if (pct < 30) return 'leve+ — pintura e ajustes';
    if (pct < 60) return 'inter- — cozinha, banheiros, piso';
    if (pct === 60) return 'intermediária — cozinha, banheiros, piso';
    if (pct < 100) return 'completa- — desmontagem parcial';
    return 'completa — desmontagem e reconstrução';
  };

  // --- Projected recurring debts over months-to-sale ---
  const monthlyCondo = p.monthlyCondo || 0;
  const monthlyIptu = p.monthlyIptu || 0;
  const projectedCondo = Math.round(monthlyCondo * monthsToSale);
  const projectedIptu = Math.round(monthlyIptu * monthsToSale);

  // --- Occupant removal cost (toggle, default on when property is not vacant) ---
  const occupantRemovalAvailable = (p.occupantRemovalCost ?? 0) > 0;
  const occupantRemovalCost = includeOccupantRemoval && occupantRemovalAvailable ? (p.occupantRemovalCost || 0) : 0;

  const gainCapital = exempt === 'Pagamento integral de GC'
    ? Math.round(Math.max(0, (p.market || 0) * 0.94 - (p.minBid || 0)) * 0.15)
    : 0;

  const legalAICost = legalAI ? 397 : 0;

  // Build the dynamic cost rows: take seed costs, replace reno + capital gains,
  // replace the condo/IPTU debt lines with projected values, add occupant removal.
  const dynamicRows = (p.costs || [])
    .filter(r => {
      // Drop the static condo/IPTU debt lines — replaced by projected versions below.
      const label = r.label.toLowerCase();
      if (r.kind === 'debt' && (label.includes('condomínio') || label.includes('condominio'))) return false;
      if (r.kind === 'debt' && label.includes('iptu')) return false;
      return true;
    })
    .map(r => {
      if (r.kind === 'reno') {
        return {
          ...r,
          value: renoCost,
          hint: `Nível: ${_renoLevelLabel(renoPct)}. R$ ${renoRate}/m² × ${Math.round(p.area || 0)} m². Região: R$ ${regionPricePerM2.toLocaleString('pt-BR')}/m².`,
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

  // Insert projected condo + IPTU as debt lines (only when they have a monthly value)
  if (monthlyCondo > 0) {
    dynamicRows.push({
      label: `Condomínio projetado (${monthsToSale} meses)`,
      value: projectedCondo,
      hint: `R$ ${monthlyCondo.toLocaleString('pt-BR')}/mês × ${monthsToSale} meses até a venda.`,
      kind: 'debt',
    });
  }
  if (monthlyIptu > 0) {
    dynamicRows.push({
      label: `IPTU projetado (${monthsToSale} meses)`,
      value: projectedIptu,
      hint: `R$ ${monthlyIptu.toLocaleString('pt-BR')}/mês × ${monthsToSale} meses até a venda.`,
      kind: 'debt',
    });
  }
  if (occupantRemovalCost > 0) {
    dynamicRows.push({
      label: 'Remoção de ocupante',
      value: occupantRemovalCost,
      hint: 'Estimativa de ação de imissão na posse — honorários advocatícios e custas.',
      kind: 'fee',
    });
  }
  if (legalAICost > 0) {
    dynamicRows.push({
      label: 'Assistente jurídico',
      value: legalAICost,
      hint: 'Diligência jurídica automatizada — matrícula, certidões, processos, protestos e parecer de nulidade.',
      kind: 'legal',
    });
  }

  const dynamicTotal = dynamicRows.reduce((a, r) => a + r.value, 0);

  const netSale = Math.round((p.market || 0) * 0.94);
  const grossROI = dynamicTotal > 0 ? Math.round(((netSale - dynamicTotal) / dynamicTotal) * 100) : 0;
  // Lance máximo recomendado nunca pode ser inferior ao lance mínimo do leilão.
  // O slider de meta de retorno é travado no ponto onde maxBid atinge o minBid:
  // maxBid = netSale/(1+target/100) - (dynamicTotal - minBid) = minBid  ⇒  target = (netSale/dynamicTotal - 1)*100
  const minBidFloor = p.minBid || 0;
  const targetCap = dynamicTotal > 0
    ? Math.max(5, Math.min(80, Math.round((netSale / dynamicTotal - 1) * 100)))
    : 80;
  const effectiveTarget = Math.min(target, targetCap);
  const maxBidRaw = dynamicTotal > 0
    ? Math.round((netSale / (1 + effectiveTarget / 100)) - (dynamicTotal - minBidFloor))
    : 0;
  const maxBid = Math.max(maxBidRaw, minBidFloor);

  const sim = {
    renoPct, setRenoPct, monthsToSale, setMonthsToSale,
    target: effectiveTarget, setTarget, targetCap,
    exempt, setExempt,
    legalAI, setLegalAI, legalAICost,
    renoCost, renoRate, regionPricePerM2,
    monthlyCondo, monthlyIptu, projectedCondo, projectedIptu,
    occupantRemovalAvailable, includeOccupantRemoval, setIncludeOccupantRemoval, occupantRemovalCost,
    gainCapital, dynamicTotal, dynamicRows, netSale, grossROI, maxBid,
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
          <button className="btn sm" disabled title="Em breve">
            <span className="mono">⎙</span> Exportar análise
          </button>
          <button className="btn sm primary" onClick={() => p.auctionUrl && window.open(p.auctionUrl, '_blank')} disabled={!p.auctionUrl} title={p.auctionUrl || 'URL não disponível'}>
            <span className="mono">↗</span> Acessar leilão
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
            <Photo label={p.photoLabel} photoUrl={p.photoUrl} ratio="16/10" />
            <div style={{
              position: 'absolute', top: 14, left: 14,
              background: 'rgba(255,255,255,0.92)', padding: '6px 10px',
              borderRadius: 6, fontSize: 11,
              border: '1px solid var(--line-1)',
              fontFamily: 'var(--f-mono)',
            }}>
              Fachada
            </div>
          </div>
          <div className="row gap-2 thumb-strip" style={{ marginTop: 10 }}>
            <div style={{
              width: 80, height: 56,
              borderRadius: 6,
              overflow: 'hidden',
              border: '2px solid var(--accent)',
              position: 'relative',
              cursor: 'pointer',
            }}>
              {p.photoUrl ? (
                <img src={p.photoUrl} alt="Fachada" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                <div style={{
                  width: '100%', height: '100%',
                  background: '#ECEEF1',
                  backgroundImage: 'repeating-linear-gradient(135deg, #E5E7EB 0 1px, transparent 1px 8px)',
                }} />
              )}
              <span className="mono" style={{
                position: 'absolute', bottom: 4, left: 4,
                fontSize: 9, color: 'var(--fg-2)',
                background: 'rgba(255,255,255,0.8)',
                padding: '1px 4px', borderRadius: 3,
              }}>
                Fachada
              </span>
            </div>
          </div>
        </div>

        {/* Key facts panel */}
        <div className="card" style={{ padding: 22 }}>
          <div className="row gap-2 wrap" style={{ marginBottom: 14 }}>
            <span className="tag accent">{p.praca || p.modalidade || p.auctionType}</span>
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

          {/* Countdown + risk summary */}
          <div className="row between" style={{ alignItems: 'flex-start', marginBottom: 16, gap: 12 }}>
            <div style={{ minWidth: 0 }}>
              <div className="uppy" style={{ color: 'var(--fg-3)' }}>Encerra em</div>
              <div style={{ marginTop: 4 }}>
                <Countdown until={p.endsAt} dark />
              </div>
              <div className="mono" style={{ fontSize: 11, color: 'var(--fg-2)', marginTop: 2 }}>
                {p.endsAt ? new Date(p.endsAt).toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' }) + ' · ' + new Date(p.endsAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '—'}
              </div>
            </div>
            <RiskSummary flags={p.risk} />
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
              <Meta lbl="Matrícula" val={p.viability?.features?.["Matrícula"] || "—"} />
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
          { v: 'legal', l: 'Jurídico', ix: '05', locked: !legalUnlocked },
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
        {tab === 'legal' && (legalUnlocked ? <LegalDetail legal={legal} p={p} /> : <LegalLocked />)}
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
              <div className="num-md">R$ {fmtBRL(p.edital.secondBidPrice)}</div>
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
  const appraisal = p.appraisal || 0;
  const market = p.market || 0;

  // Anchor for bar percentages: the larger of appraisal / market, so the bar
  // can visualize all three values on the same scale even when the IA market
  // estimate is smaller than the edital appraisal (or vice versa).
  const barMax = Math.max(market, appraisal, bid, 1);
  const bidPct = (bid / barMax) * 100;
  const appraisalPct = (appraisal / barMax) * 100;
  const marketPct = (market / barMax) * 100;

  // Gaps relative to each reference
  const gapVsMarket = market - bid;
  const gapVsAppraisal = appraisal - bid;
  const discountVsMarketPct = market > 0 ? ((market - bid) / market * 100) : 0;
  const desagioOficialPct = appraisal > 0 ? ((appraisal - bid) / appraisal * 100) : 0;

  // Valorização da região — extraída do indicador de preço/m² do bairro
  const appreciationIndicator = md.indicators.find(i => i.lbl.toLowerCase().includes('bairro'));
  const regionAppreciation = appreciationIndicator?.delta;

  // Filtrar "Liquidez · score" dos indicadores
  const filteredIndicators = md.indicators.filter(i => {
    const l = i.lbl.toLowerCase();
    return !l.includes('liquidez') && !l.includes('yield') && !l.includes('cap rate');
  });

  return (
    <div>
      <div className="analysis-grid" style={{ display: 'grid', gridTemplateColumns: '1.1fr 1fr', gap: 16, marginBottom: 16 }}>
        {/* § 01.01 — spread */}
        <div className="card" style={{ padding: 22 }}>
          <div className="row between" style={{ alignItems: 'flex-start', marginBottom: 18 }}>
            <div>
              <span className="uppy" style={{ color: 'var(--fg-3)' }}>§ 01.01 · spread</span>
              <h3 className="h2" style={{ marginTop: 4 }}>Lance vs. avaliação vs. mercado IA</h3>
            </div>
          </div>

          {/* 3-way stacked bar — bar fills with bid, markers for appraisal & market */}
          <div style={{ position: 'relative', marginTop: 30, marginBottom: 8 }}>
            <div style={{ height: 14, background: 'var(--bg-3)', borderRadius: 7, position: 'relative', overflow: 'visible' }}>
              {/* Bid fill */}
              <div style={{
                position: 'absolute', left: 0, top: 0, bottom: 0,
                width: `${Math.min(bidPct, 100)}%`,
                background: 'var(--accent)', borderRadius: 7,
              }}></div>
              {/* Appraisal marker — vertical line + dot above */}
              {appraisal > 0 && (
                <div style={{
                  position: 'absolute',
                  left: `${Math.min(appraisalPct, 100)}%`,
                  top: -8, bottom: -8, width: 2,
                  background: 'var(--fg-1)', transform: 'translateX(-1px)',
                }}></div>
              )}
              {/* Mercado IA marker — vertical line + dot above (uses --good) */}
              {market > 0 && (
                <div style={{
                  position: 'absolute',
                  left: `${Math.min(marketPct, 100)}%`,
                  top: -8, bottom: -8, width: 2,
                  background: 'var(--good)', transform: 'translateX(-1px)',
                }}></div>
              )}
            </div>
            {/* Tick labels under bar — only show if they fit; otherwise rely on legend below */}
          </div>

          {/* Legend — three rows: bid / appraisal / mercado IA */}
          <div style={{ marginTop: 16, display: 'grid', gridTemplateColumns: '1fr', gap: 8 }}>
            <div className="row between" style={{ alignItems: 'center' }}>
              <div className="row gap-2" style={{ alignItems: 'center' }}>
                <span style={{ width: 10, height: 10, borderRadius: 2, background: 'var(--accent)', display: 'inline-block' }}></span>
                <span className="uppy" style={{ color: 'var(--fg-2)' }}>Lance mínimo {has2nd && '(2ª praça)'}</span>
              </div>
              <div className="row gap-2" style={{ alignItems: 'baseline' }}>
                <span className="num-md" style={{ color: 'var(--accent)' }}>R$ {fmtBRL(bid)}</span>
                {market > 0 && (
                  <span className="mono" style={{ fontSize: 11, color: 'var(--fg-3)' }}>
                    {((bid / market) * 100).toFixed(0)}% do mercado
                  </span>
                )}
              </div>
            </div>
            <div className="row between" style={{ alignItems: 'center' }}>
              <div className="row gap-2" style={{ alignItems: 'center' }}>
                <span style={{ width: 10, height: 10, borderRadius: 2, background: 'var(--fg-1)', display: 'inline-block' }}></span>
                <span className="uppy" style={{ color: 'var(--fg-2)' }}>Avaliação edital</span>
              </div>
              <div className="row gap-2" style={{ alignItems: 'baseline' }}>
                <span className="num-md" style={{ color: 'var(--fg-1)' }}>R$ {fmtBRL(appraisal)}</span>
                {market > 0 && (
                  <span className="mono" style={{ fontSize: 11, color: 'var(--fg-3)' }}>
                    {((appraisal / market) * 100).toFixed(0)}% do mercado
                  </span>
                )}
              </div>
            </div>
            <div className="row between" style={{ alignItems: 'center' }}>
              <div className="row gap-2" style={{ alignItems: 'center' }}>
                <span style={{ width: 10, height: 10, borderRadius: 2, background: 'var(--good)', display: 'inline-block' }}></span>
                <span className="uppy" style={{ color: 'var(--fg-2)' }}>
                  <span className="ia-chip" style={{ marginRight: 6 }}>IA</span>
                  Mercado estimado
                </span>
              </div>
              <div className="row gap-2" style={{ alignItems: 'baseline' }}>
                <span className="num-md" style={{ color: 'var(--good)' }}>R$ {fmtBRL(market)}</span>
                <span className="mono" style={{ fontSize: 11, color: 'var(--fg-3)' }}>100% (referência)</span>
              </div>
            </div>
          </div>

          {/* Gap summary — two lines: vs mercado IA and vs avaliação (deságio oficial) */}
          <div style={{ marginTop: 16, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div style={{
              padding: '11px 13px', borderRadius: 6, fontSize: 12.5,
              background: gapVsMarket >= 0 ? 'var(--good-soft)' : 'var(--bad-soft)',
              borderLeft: `3px solid ${gapVsMarket >= 0 ? 'var(--good)' : 'var(--bad)'}`,
            }}>
              <div className="uppy" style={{ color: 'var(--fg-3)', fontSize: 10.5, marginBottom: 3 }}>vs. mercado IA</div>
              <div style={{ color: 'var(--fg-0)' }}>
                <b style={{ color: gapVsMarket >= 0 ? 'var(--good)' : 'var(--bad)', fontFamily: 'var(--f-mono)' }}>
                  R$ {fmtBRL(Math.abs(gapVsMarket))}
                </b>
              </div>
              <div className="mono" style={{ fontSize: 11, marginTop: 2, color: gapVsMarket >= 0 ? 'var(--good)' : 'var(--bad)' }}>
                {discountVsMarketPct >= 0
                  ? `${discountVsMarketPct.toFixed(0)}% desconto IA`
                  : `+${Math.abs(discountVsMarketPct).toFixed(1)}% acima IA`}
              </div>
            </div>
            <div style={{
              padding: '11px 13px', borderRadius: 6, fontSize: 12.5,
              background: gapVsAppraisal >= 0 ? 'var(--good-soft)' : 'var(--bad-soft)',
              borderLeft: `3px solid ${gapVsAppraisal >= 0 ? 'var(--good)' : 'var(--bad)'}`,
            }}>
              <div className="uppy" style={{ color: 'var(--fg-3)', fontSize: 10.5, marginBottom: 3 }}>vs. avaliação oficial</div>
              <div style={{ color: 'var(--fg-0)' }}>
                <b style={{ color: gapVsAppraisal >= 0 ? 'var(--good)' : 'var(--bad)', fontFamily: 'var(--f-mono)' }}>
                  R$ {fmtBRL(Math.abs(gapVsAppraisal))}
                </b>
              </div>
              <div className="mono" style={{ fontSize: 11, marginTop: 2, color: gapVsAppraisal >= 0 ? 'var(--good)' : 'var(--bad)' }}>
                {desagioOficialPct >= 0
                  ? `${desagioOficialPct.toFixed(0)}% desconto oficial`
                  : `+${Math.abs(desagioOficialPct).toFixed(1)}% ágio`}
              </div>
            </div>
          </div>
        </div>

        {/* § 01.02 — indicadores + valorização */}
        <div className="card" style={{ padding: 22 }}>
          <span className="uppy" style={{ color: 'var(--fg-3)' }}>§ 01.02 · indicadores</span>
          <h3 className="h2" style={{ marginTop: 4, marginBottom: 14 }}>{p.neighborhood} · base 2024–2026</h3>

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
  const {
    renoPct, setRenoPct, monthsToSale, setMonthsToSale,
    target, setTarget, targetCap, exempt, setExempt, legalAI, setLegalAI,
    renoCost, renoRate, regionPricePerM2,
    projectedCondo, projectedIptu,
    occupantRemovalAvailable, includeOccupantRemoval, setIncludeOccupantRemoval,
    netSale, grossROI, maxBid, dynamicRows, dynamicTotal,
  } = sim;

  if ((dynamicRows || []).length === 0) {
    return (
      <div className="card" style={{ padding: 40, textAlign: 'center' }}>
        <p style={{ color: 'var(--fg-2)', fontSize: 14 }}>Dados de custos não disponíveis para este imóvel.</p>
      </div>
    );
  }

  // Presets snap the slider to canonical levels. Slider position 0/60/100 = leve/inter/completa.
  const renoPresets = [
    { id: 'leve',     label: 'Leve',          pct: 0 },
    { id: 'inter',    label: 'Intermediária', pct: 60 },
    { id: 'completa', label: 'Completa',      pct: 100 },
  ];

  return (
    <div>
      {/* ── Simulator ── */}
      <div className="card" style={{ padding: 24, marginBottom: 20 }}>
        <div className="row between" style={{ alignItems: 'flex-start', marginBottom: 20 }}>
          <div>
            <span className="uppy" style={{ color: 'var(--fg-3)' }}>§ 02.01 · simulador</span>
            <h3 className="h2" style={{ marginTop: 4 }}>Cenário do investidor</h3>
            <p style={{ margin: '4px 0 0', fontSize: 12.5, color: 'var(--fg-2)' }}>
              Ajuste os controles — os custos abaixo recalculam ao vivo.
            </p>
          </div>
          <button className="btn sm" onClick={() => {
            setRenoPct(60);
            setMonthsToSale(12);
            setTarget(30);
            setExempt('Primeiro imóvel ou reinvestimento em 180 dias');
            setLegalAI(false);
            if (occupantRemovalAvailable) setIncludeOccupantRemoval(true);
          }}>
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

          {/* Renovation slider + presets + months-to-sale + target */}
          <div className="sim-sliders" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 24, marginBottom: 24 }}>
          {/* Renovation — slider + presets */}
          <div>
            <div className="row between baseline">
              <span className="uppy" style={{ color: 'var(--fg-3)' }}>Nível de reforma</span>
              <span className="mono" style={{ fontSize: 16, fontWeight: 500, color: 'var(--accent)' }}>
                R$ {fmtBRL(renoCost)}
              </span>
            </div>
            <input
              type="range" min={0} max={100} value={renoPct}
              onChange={(e) => setRenoPct(+e.target.value)}
              className="slider"
              style={{ width: '100%', marginTop: 14 }}
            />
            <div className="row between" style={{ marginTop: 8 }}>
              <span className="mono" style={{ fontSize: 10, color: 'var(--fg-3)' }}>leve</span>
              <span className="mono" style={{ fontSize: 10, color: 'var(--fg-3)' }}>completa</span>
            </div>
            <div className="row gap-2 wrap" style={{ marginTop: 10 }}>
              {renoPresets.map(b => {
                const active = renoPct === b.pct;
                return (
                  <button
                    key={b.id}
                    onClick={() => setRenoPct(b.pct)}
                    style={{
                      padding: '6px 10px', fontSize: 11.5, borderRadius: 6,
                      border: '1px solid ' + (active ? 'var(--accent)' : 'var(--line-1)'),
                      background: active ? 'var(--accent-soft)' : 'var(--bg-1)',
                      color: active ? 'var(--accent-strong)' : 'var(--fg-1)',
                      fontWeight: active ? 500 : 400,
                      transition: 'all .15s',
                      cursor: 'pointer',
                    }}
                  >
                    {b.label}
                  </button>
                );
              })}
            </div>
            <p style={{ margin: '10px 0 0', fontSize: 12, color: 'var(--fg-2)' }}>
              R$ {renoRate}/m² × {Math.round(p.area || 0)} m² · {renoPct}%
            </p>
          </div>

          {/* Months to sale */}
          <SliderField
            label="Meses até venda"
            value={monthsToSale}
            onChange={setMonthsToSale}
            display={`${monthsToSale}m`}
            description={`Condomínio + IPTU projetados: R$ ${fmtBRL(projectedCondo + projectedIptu)}`}
            min={3}
            max={24}
          />

          {/* Target ROI — travado no ponto onde o lance máximo atinge o lance mínimo */}
          <SliderField
            label="Meta de retorno líquido"
            value={target}
            onChange={setTarget}
            display={`${target}%`}
            description={target >= targetCap
              ? `Limite — lance máximo = lance mínimo do leilão`
              : `Após custos, impostos e venda projetada`}
            min={5}
            max={targetCap}
          />
        </div>

        {/* Region price/m² context */}
        <div style={{
          padding: '10px 14px', background: 'var(--bg-2)', borderRadius: 6,
          fontSize: 11.5, color: 'var(--fg-2)', marginBottom: 20,
        }}>
          <span className="mono" style={{ color: 'var(--fg-3)' }}>região:</span>{' '}
          R$ {regionPricePerM2.toLocaleString('pt-BR')}/m² · taxa de reforma aplicada: R$ {renoRate}/m²
        </div>

        {/* Tax scenario */}
        <div className="divider" style={{ margin: '0 0 20px' }}></div>
        <Selector
          label="Cenário tributário"
          value={exempt}
          options={['Primeiro imóvel ou reinvestimento em 180 dias', 'Pagamento integral de GC']}
          onChange={setExempt}
          hint="Isenção ou incidência do ganho de capital na venda"
        />

        {/* Occupant removal toggle (only when applicable) */}
        {occupantRemovalAvailable && (
          <>
            <div className="divider" style={{ margin: '20px 0' }}></div>
            <div className="row between" style={{ alignItems: 'center' }}>
              <div>
                <span className="uppy" style={{ color: 'var(--fg-3)' }}>Remoção de ocupante</span>
                <p style={{ margin: '4px 0 0', fontSize: 11.5, color: 'var(--fg-3)' }}>
                  Inclui R$ {fmtBRL(p.occupantRemovalCost || 0)} para ação de imissão na posse
                </p>
              </div>
              <button
                onClick={() => setIncludeOccupantRemoval(!includeOccupantRemoval)}
                style={{
                  width: 44, height: 24, borderRadius: 12,
                  background: includeOccupantRemoval ? 'var(--accent)' : 'var(--bg-3)',
                  position: 'relative', transition: 'background .2s',
                  border: '1px solid ' + (includeOccupantRemoval ? 'var(--accent)' : 'var(--line-2)'),
                  cursor: 'pointer', flexShrink: 0,
                }}
              >
                <span style={{
                  position: 'absolute', top: 2, left: includeOccupantRemoval ? 22 : 2,
                  width: 18, height: 18, borderRadius: '50%',
                  background: '#fff', transition: 'left .2s',
                  boxShadow: '0 1px 3px rgba(17,24,39,0.15)',
                }} />
              </button>
            </div>
          </>
        )}

        <div className="divider" style={{ margin: '20px 0' }}></div>
        <div className="row between" style={{ alignItems: 'center' }}>
          <div>
            <span className="uppy" style={{ color: 'var(--fg-3)' }}>Assistente jurídico</span>
            <p style={{ margin: '4px 0 0', fontSize: 11.5, color: 'var(--fg-3)' }}>
              Inclui R$ 397 de análise jurídica automatizada no custo total
            </p>
          </div>
          <button
            onClick={() => setLegalAI(!legalAI)}
            style={{
              width: 44, height: 24, borderRadius: 12,
              background: legalAI ? 'var(--accent)' : 'var(--bg-3)',
              position: 'relative', transition: 'background .2s',
              border: '1px solid ' + (legalAI ? 'var(--accent)' : 'var(--line-2)'),
              cursor: 'pointer', flexShrink: 0,
            }}
          >
            <span style={{
              position: 'absolute', top: 2, left: legalAI ? 22 : 2,
              width: 18, height: 18, borderRadius: '50%',
              background: '#fff', transition: 'left .2s',
              boxShadow: '0 1px 3px rgba(17,24,39,0.15)',
            }} />
          </button>
        </div>
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
            {/* Export ainda não implementado — sem handler ficava parecendo quebrado */}
            <button className="btn sm" disabled style={{ opacity: 0.55, cursor: 'not-allowed' }}>
              <span className="mono">↓</span> PDF <span className="tag" style={{ marginLeft: 6 }}>em breve</span>
            </button>
          </div>
        </div>

        <div className="card">
          <div className="cost-head" style={{
            display: 'grid', gridTemplateColumns: '24px 1fr 100px 160px', gap: 14,
            padding: '10px 20px', background: 'var(--bg-2)',
            fontFamily: 'var(--f-mono)', fontSize: 10.5,
            textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--fg-3)',
          }}>
            <span></span><span>Item</span>
            <span style={{ textAlign: 'right' }}>% do total</span>
            <span style={{ textAlign: 'right' }}>Valor</span>
          </div>
          {dynamicRows.map((r, i) => (
            <CostRow key={i} l={r.label} v={r.value} hint={r.hint} pct={dynamicTotal > 0 ? r.value / dynamicTotal * 100 : 0} />
          ))}
          <div className="cost-row" style={{
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
          Condomínio e IPTU projetados pela quantidade de meses até venda. Ganho de capital varia conforme reinvestimento.
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
      className="cost-row"
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

  const warnCount = v.riskDimensions.filter(d => d.state === 'warn').length;
  const badCount = v.riskDimensions.filter(d => d.state === 'bad').length;

  return (
    <div>
      {/* Metrics from simulator */}
      <div className="metrics-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16, marginBottom: 16 }}>
        <Metric lbl="ROI líquido projetado" big={`${grossROI >= 0 ? '+' : ''}${grossROI}%`} sub="Após custos, tributos e venda estimada" color={grossROI >= 25 ? 'var(--good)' : grossROI >= 10 ? 'var(--warn)' : 'var(--bad)'} />
        <Metric lbl="Custo total estimado" big={`R$ ${fmtBRL(dynamicTotal)}`} sub="Lance + reforma + tributos e débitos" />
        <Metric lbl="Lance máximo recomendado" big={`R$ ${fmtBRL(Math.max(0, maxBid))}`} sub={`Para atingir ${target}% de retorno líquido`} color="var(--accent)" />
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
              <p style={{ margin: '4px 0 0', fontSize: 12.5, color: 'var(--fg-2)' }}>Avaliação qualitativa nas três dimensões que mais impactam o arremate.</p>
            </div>
            <span className={`tag dot ${badCount > 0 ? 'bad' : warnCount > 0 ? 'warn' : 'good'}`}>
              {badCount > 0 ? `${badCount} crítica${badCount > 1 ? 's' : ''}` : warnCount > 0 ? `${warnCount} atenção` : 'sem riscos'}
            </span>
          </div>
          <div className="col gap-4" style={{ marginTop: 20 }}>
            {v.riskDimensions.map(rd => (
              <RiskBar key={rd.dim} dim={rd.dim} state={rd.state} note={rd.note} />
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

function RiskBar({ dim, state, note }) {
  const color = state === 'good' ? 'var(--good)' : state === 'warn' ? 'var(--warn)' : 'var(--bad)';
  const pct = state === 'good' ? 100 : state === 'warn' ? 60 : 25;
  return (
    <div>
      <div className="row between baseline" style={{ marginBottom: 8 }}>
        <span style={{ fontSize: 13.5, color: 'var(--fg-0)', fontWeight: 500 }}>{dim}</span>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, display: 'inline-block' }} />
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
// TAB 4 — LEGAL (análise jurídica — modo liberado)
// ============================================================
const REC_MAP = {
  participar: { label: 'Participar', color: 'var(--good)', bg: 'var(--good-soft)' },
  cautela: { label: 'Participar com cautela', color: 'var(--warn)', bg: 'var(--warn-soft)' },
  nao: { label: 'Não recomendado', color: 'var(--bad)', bg: 'var(--bad-soft)' },
};

function nivelState(n) {
  return n === 'baixo' ? 'good' : n === 'medio' ? 'warn' : 'bad';
}

function NivelBadge({ nivel }) {
  return <span className={`tag dot ${nivelState(nivel)}`} style={{ textTransform: 'capitalize' }}>{nivel}</span>;
}

const STATE_MAP = {
  verificado: { label: '✓ verificado', color: 'var(--good)', bg: 'var(--good-soft)' },
  'nao-localizado': { label: '— não localizado', color: 'var(--warn)', bg: 'var(--warn-soft)' },
  'requer-humano': { label: '⚑ requer autos', color: 'var(--bad)', bg: 'var(--bad-soft)' },
  'requer-autos': { label: '⚑ requer autos', color: 'var(--bad)', bg: 'var(--bad-soft)' },
};

function StateBadge({ estado }) {
  const s = STATE_MAP[estado] || STATE_MAP['nao-localizado'];
  return (
    <span className="mono" style={{
      fontSize: 10.5, padding: '2px 8px', borderRadius: 4,
      color: s.color, background: s.bg, whiteSpace: 'nowrap',
    }}>{s.label}</span>
  );
}

const GRAV_COLOR = { info: 'var(--fg-3)', warn: 'var(--warn)', bad: 'var(--bad)' };

const DOC_STATE_MAP = {
  baixado: { label: '✓ baixado', color: 'var(--good)', bg: 'var(--good-soft)' },
  parcial: { label: '◐ parcial', color: 'var(--warn)', bg: 'var(--warn-soft)' },
  'nao-disponivel': { label: '✕ não obtido', color: 'var(--bad)', bg: 'var(--bad-soft)' },
  'upload-pendente': { label: '⤓ enviar', color: 'var(--warn)', bg: 'var(--warn-soft)' },
};

function DocBadge({ status }) {
  const s = DOC_STATE_MAP[status] || DOC_STATE_MAP['nao-disponivel'];
  return (
    <span className="mono" style={{
      fontSize: 10.5, padding: '2px 8px', borderRadius: 4,
      color: s.color, background: s.bg, whiteSpace: 'nowrap',
    }}>{s.label}</span>
  );
}

// Índice e detector de termos do glossário no texto da análise.
const GLOSSARY_BY_TERM = Object.fromEntries(legalGlossary.map(t => [t.termo, t]));

const GLOSSARY_MATCHERS = [
  { src: 'art\\.?\\s*886', key: 'Art. 886 (CPC)' },
  { src: 'art\\.?\\s*887', key: 'Art. 887 (CPC)' },
  { src: 'art\\.?\\s*873', key: 'Art. 873 (CPC)' },
  { src: 'art\\.?\\s*889', key: 'Art. 889 (CPC)' },
  { src: 'art\\.?\\s*891', key: 'Art. 891 (CPC)' },
  { src: 'art\\.?\\s*895', key: 'Art. 895 (CPC)' },
  { src: 'art\\.?\\s*903', key: 'Art. 903 (CPC)' },
  { src: 'art\\.?\\s*843', key: 'Art. 843 (CPC)' },
  { src: 'art\\.?\\s*844', key: 'Art. 844 (CPC)' },
  { src: 'art\\.?\\s*(?:26|27|30)', key: 'Lei 9.514/97' },
  { src: 'lei\\s*9\\.?514(?:/97)?', key: 'Lei 9.514/97' },
  { src: 'lei\\s*8\\.?009(?:/90)?', key: 'Lei 8.009/90' },
  { src: 'bem de fam[íi]lia', key: 'Lei 8.009/90' },
  { src: 'CTN', key: 'CTN, art. 130, § único' },
  { src: 'pre[çc]o vil', key: 'Preço vil' },
  { src: 'propter rem', key: 'Propter rem' },
  { src: 'aliena[çc][ãa]o fiduci[áa]ria', key: 'Alienação fiduciária' },
  { src: 'consolida[çc][ãa]o(?: da propriedade)?', key: 'Consolidação da propriedade' },
  { src: 'purga[çc][ãa]o da mora', key: 'Purgação da mora' },
  { src: 'imiss[ãa]o na posse', key: 'Imissão na posse' },
  { src: 'pra[çc]a', key: 'Praça (1ª e 2ª)' },
  { src: 'matr[íi]cula', key: 'Matrícula' },
  { src: 'penhora', key: 'Penhora' },
  { src: 'usufruto', key: 'Usufruto / direito real de habitação' },
  { src: 'carta de arremata[çc][ãa]o', key: 'Carta de arrematação' },
  { src: 'venda direta', key: 'Venda direta' },
  { src: 'DataJud', key: 'DataJud' },
  { src: 'ONR', key: 'ONR' },
];

const GLOSSARY_RE = new RegExp(GLOSSARY_MATCHERS.map(m => `(${m.src})`).join('|'), 'gi');

// Quebra um texto em nós React, transformando termos técnicos em elementos interativos.
function linkify(text, openGlossary) {
  if (!text || typeof text !== 'string') return text;
  const out = [];
  let last = 0;
  let key = 0;
  GLOSSARY_RE.lastIndex = 0;
  let m;
  while ((m = GLOSSARY_RE.exec(text)) !== null) {
    let termKey = null;
    for (let i = 0; i < GLOSSARY_MATCHERS.length; i++) {
      if (m[i + 1] !== undefined) { termKey = GLOSSARY_MATCHERS[i].key; break; }
    }
    if (m.index > last) out.push(text.slice(last, m.index));
    out.push(
      <GlossaryTerm key={key++} text={m[0]} termKey={termKey} openGlossary={openGlossary} />
    );
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out.length ? out : text;
}

function GlossaryTerm({ text, termKey, openGlossary }) {
  const [hover, setHover] = useState(false);
  const entry = GLOSSARY_BY_TERM[termKey];
  if (!entry) return text;
  return (
    <span
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={() => openGlossary(termKey)}
      style={{
        position: 'relative', cursor: 'help',
        borderBottom: '1px dashed var(--accent)',
        color: 'inherit',
      }}
    >
      {text}
      {hover && (
        <span style={{
          position: 'absolute', bottom: '100%', left: 0, marginBottom: 6,
          width: 260, maxWidth: '70vw', padding: '10px 12px', borderRadius: 8,
          background: 'var(--fg-0)', color: 'var(--bg-1)',
          fontSize: 11.5, lineHeight: 1.45, fontWeight: 400,
          boxShadow: '0 8px 24px rgba(17,24,39,0.22)', zIndex: 70,
          whiteSpace: 'normal', textAlign: 'left',
        }}>
          <b>{entry.termo}</b>
          <span style={{ display: 'block', marginTop: 4 }}>{entry.definicao}</span>
          <span style={{ display: 'block', marginTop: 6, fontSize: 10, opacity: 0.7 }}>Clique para abrir o glossário ›</span>
        </span>
      )}
    </span>
  );
}

function GlossaryDrawer({ open, onClose, query, setQuery }) {
  // Busca controlada pelo LegalDetail: clicar num termo linkificado abre o
  // modal já filtrado por aquele termo.
  const q = query || '';
  const setQ = setQuery;
  const ql = q.trim().toLowerCase();
  // Esc fecha o modal enquanto aberto
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  const groups = {};
  for (const t of legalGlossary) {
    if (ql && !`${t.termo} ${t.definicao}`.toLowerCase().includes(ql)) continue;
    (groups[t.categoria] = groups[t.categoria] || []).push(t);
  }
  const cats = Object.keys(groups);
  if (!open) return null;
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(17,24,39,0.22)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 24, zIndex: 60,
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Glossário jurídico"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(560px, 100%)', maxHeight: 'min(640px, 86vh)',
          background: 'var(--bg-1)', borderRadius: 14,
          border: '1px solid var(--line-1)',
          boxShadow: '0 24px 64px rgba(17,24,39,0.28)',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}
      >
        <div className="row between" style={{ padding: '16px 20px', borderBottom: '1px solid var(--line-1)', alignItems: 'center', flexShrink: 0 }}>
          <div>
            <span className="uppy" style={{ color: 'var(--fg-3)' }}>referência</span>
            <h3 className="h2" style={{ marginTop: 2 }}>Glossário jurídico</h3>
          </div>
          <button onClick={onClose} className="btn sm" aria-label="Fechar glossário"><span className="mono">✕</span></button>
        </div>
        <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--line-1)', flexShrink: 0 }}>
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar termo ou artigo…"
            style={{
              width: '100%', padding: '8px 12px', fontSize: 13,
              border: '1px solid var(--line-1)', borderRadius: 6,
              background: 'var(--bg-2)', color: 'var(--fg-0)',
            }}
          />
        </div>
        <div style={{ overflowY: 'auto', padding: '8px 20px 24px', flex: 1 }}>
          {cats.length === 0 && (
            <p style={{ fontSize: 13, color: 'var(--fg-2)', marginTop: 16 }}>Nenhum termo encontrado.</p>
          )}
          {cats.map(cat => (
            <div key={cat} style={{ marginTop: 18 }}>
              <span className="uppy" style={{ color: 'var(--fg-3)' }}>{cat}</span>
              <div style={{ marginTop: 8 }}>
                {groups[cat].map(t => (
                  <div key={t.termo} style={{ padding: '10px 0', borderTop: '1px solid var(--line-1)' }}>
                    <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--fg-0)' }}>{t.termo}</div>
                    <p style={{ margin: '4px 0 0', fontSize: 12.5, color: 'var(--fg-1)', lineHeight: 1.5 }}>{t.definicao}</p>
                  </div>
                ))}
              </div>
            </div>
          ))}
          <p style={{ marginTop: 24, fontSize: 11, color: 'var(--fg-3)', lineHeight: 1.5 }}>
            Conteúdo educativo — não substitui orientação de advogado.
          </p>
        </div>
      </div>
    </div>
  );
}

function LegalDetail({ legal, p }) {
  const [glossaryOpen, setGlossaryOpen] = useState(false);
  const [glossaryQuery, setGlossaryQuery] = useState('');
  // Clicar num termo linkificado abre o glossário filtrado pelo termo.
  const openGlossary = (termKey) => {
    setGlossaryQuery(termKey || '');
    setGlossaryOpen(true);
  };
  const lk = (text) => linkify(text, openGlossary);
  if (!legal) {
    return (
      <div className="card" style={{ padding: 40, textAlign: 'center' }}>
        <p style={{ color: 'var(--fg-2)', fontSize: 14 }}>Análise jurídica não disponível para este imóvel.</p>
      </div>
    );
  }

  const rec = REC_MAP[legal.conclusao?.recomendacao] || REC_MAP.cautela;
  const fmtVal = (v) => (v == null ? '—' : `R$ ${fmtBRL(v)}`);

  return (
    <div>
      {/* ── Cabeçalho: modalidade + base legal ── */}
      <div className="card" style={{ padding: 22, marginBottom: 16 }}>
        <div className="row between" style={{ alignItems: 'flex-start', gap: 12 }}>
          <div style={{ minWidth: 0 }}>
            <div className="row gap-2 wrap" style={{ marginBottom: 10 }}>
              <span className="uppy" style={{ color: 'var(--fg-3)' }}>§ 05 · análise jurídica</span>
              <span className="ia-chip">IA</span>
            </div>
            <h3 className="h2" style={{ marginBottom: 6 }}>{legal.modalidadeLabel || 'Análise jurídica'}</h3>
            {legal.baseLegal && (
              <p style={{ margin: 0, fontSize: 12.5, color: 'var(--fg-2)', lineHeight: 1.5 }}>{lk(legal.baseLegal)}</p>
            )}
          </div>
          <button className="btn sm" onClick={() => openGlossary('')} style={{ flexShrink: 0 }} title="Abrir glossário jurídico">
            <span className="mono">§</span> Glossário
          </button>
        </div>
      </div>

      {/* ── Conclusão (3 linhas) ── */}
      {legal.conclusao && (
        <div style={{
          padding: '18px 20px', borderRadius: 10, marginBottom: 16,
          background: rec.bg, borderLeft: `3px solid ${rec.color}`,
        }}>
          <div className="row gap-2 baseline" style={{ marginBottom: 10 }}>
            <span className="uppy" style={{ color: 'var(--fg-3)' }}>Recomendação</span>
            <span style={{ fontSize: 15, fontWeight: 600, color: rec.color }}>{rec.label}</span>
          </div>
          <p style={{ margin: '0 0 6px', fontSize: 13, color: 'var(--fg-1)' }}>
            <b style={{ color: 'var(--fg-0)' }}>Principal risco:</b> {lk(legal.conclusao.principalRisco)}
          </p>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--fg-1)' }}>
            <b style={{ color: 'var(--fg-0)' }}>Providência antes do lance:</b> {lk(legal.conclusao.providencia)}
          </p>
        </div>
      )}

      {/* ── Desocupação (consistente com a aba Viabilidade) ── */}
      {p?.occupancy === 'ocupado' && (p?.occupantRemovalCost ?? 0) > 0 && (
        <div style={{
          display: 'flex', gap: 12, alignItems: 'flex-start',
          padding: '12px 16px', borderRadius: 8, marginBottom: 16,
          background: 'var(--warn-soft)', borderLeft: '3px solid var(--warn)',
        }}>
          <span style={{ color: 'var(--warn)', fontSize: 13 }}>⌂</span>
          <div>
            <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--fg-0)' }}>
              Imóvel ocupado — custo de desocupação estimado: R$ {fmtBRL(p.occupantRemovalCost)}
            </div>
            <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--fg-2)' }}>
              Estimativa de ação de imissão na posse, já contabilizada como custo do arrematante na aba <b style={{ color: 'var(--fg-1)' }}>Viabilidade</b>.
            </p>
          </div>
        </div>
      )}

      {/* ── Riscos jurídicos ── */}
      {legal.riscos?.length > 0 && (
        <div className="card" style={{ padding: 22, marginBottom: 16 }}>
          <span className="uppy" style={{ color: 'var(--fg-3)' }}>§ 05.01 · riscos jurídicos</span>
          <h3 className="h2" style={{ marginTop: 4, marginBottom: 16 }}>Classificação por tipo de risco</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 14 }}>
            {legal.riscos.map((r, i) => (
              <div key={i} style={{ padding: '14px 16px', border: '1px solid var(--line-1)', borderRadius: 8, background: 'var(--bg-1)' }}>
                <div className="row between" style={{ alignItems: 'flex-start', gap: 10, marginBottom: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--fg-0)' }}>{lk(r.tipo)}</span>
                  <NivelBadge nivel={r.nivel} />
                </div>
                <div style={{ marginBottom: 6 }}><StateBadge estado={r.verificacao} /></div>
                <p style={{ margin: 0, fontSize: 11.5, color: 'var(--fg-2)', lineHeight: 1.45 }}>{lk(r.fonte)}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Processo / Partes / Dívida ── */}
      <div className="analysis-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
        {legal.processo && (
          <div className="card" style={{ padding: 22 }}>
            <span className="uppy" style={{ color: 'var(--fg-3)' }}>§ 05.02 · processo</span>
            <h3 className="h2" style={{ marginTop: 4, marginBottom: 14 }}>Procedimento e partes</h3>
            <div className="meta-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, fontSize: 12.5 }}>
              <Meta lbl="Tipo" val={legal.processo.tipo || '—'} />
              <Meta lbl="Número / edital" val={legal.processo.numero || '—'} />
              <Meta lbl="Foro / origem" val={legal.processo.foro || '—'} />
              <Meta lbl="Fase" val={legal.processo.fase || '—'} />
              {legal.partes && <Meta lbl="Credor / exequente" val={legal.partes.credor || '—'} />}
              {legal.partes && <Meta lbl="Devedor / executado" val={legal.partes.devedor || '—'} />}
            </div>
            {legal.partes?.observacao && (
              <p style={{ margin: '12px 0 0', fontSize: 11.5, color: 'var(--fg-2)' }}>↳ {legal.partes.observacao}</p>
            )}
          </div>
        )}
        {legal.divida && (
          <div className="card" style={{ padding: 22 }}>
            <span className="uppy" style={{ color: 'var(--fg-3)' }}>§ 05.02 · dívida</span>
            <h3 className="h2" style={{ marginTop: 4, marginBottom: 14 }}>Valor da dívida</h3>
            <div className="num-xl" style={{ marginBottom: 6 }}>{fmtVal(legal.divida.valor)}</div>
            <div className="meta-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, fontSize: 12.5, marginTop: 10 }}>
              <Meta lbl="Atualização" val={legal.divida.dataAtualizacao || '—'} />
              <div>
                <span className="uppy" style={{ color: 'var(--fg-3)' }}>Memória de cálculo</span>
                <div style={{ marginTop: 4 }}><StateBadge estado={legal.divida.memoriaCalculo} /></div>
              </div>
            </div>
            {legal.divida.impugnacao && (
              <p style={{ margin: '12px 0 0', fontSize: 11.5, color: 'var(--fg-2)' }}>↳ {legal.divida.impugnacao}</p>
            )}
          </div>
        )}
      </div>

      {/* ── Matrícula ── */}
      {legal.matricula && (
        <div className="card" style={{ padding: 22, marginBottom: 16 }}>
          <span className="uppy" style={{ color: 'var(--fg-3)' }}>§ 05.03 · matrícula</span>
          <h3 className="h2" style={{ marginTop: 4, marginBottom: 14 }}>
            Matrícula {legal.matricula.numero || '—'} · {legal.matricula.cartorio || '—'}
          </h3>
          <div className="meta-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, fontSize: 12.5, marginBottom: 16 }}>
            <Meta lbl="Proprietário registral" val={legal.matricula.proprietario || '—'} />
            <Meta lbl="Titularidade" val={legal.matricula.titularidade || '—'} />
          </div>
          {legal.matricula.onus?.length > 0 && (
            <>
              <div className="divider" style={{ margin: '4px 0 14px' }}></div>
              <span className="uppy" style={{ color: 'var(--fg-3)' }}>Ônus e gravames</span>
              <div className="col gap-2" style={{ marginTop: 10 }}>
                {legal.matricula.onus.map((o, i) => (
                  <div key={i} style={{ display: 'grid', gridTemplateColumns: '10px 1fr', gap: 12, alignItems: 'baseline' }}>
                    <span style={{ color: GRAV_COLOR[o.gravidade] || 'var(--fg-3)', fontSize: 11 }}>●</span>
                    <div>
                      <span style={{ fontSize: 13, color: 'var(--fg-0)', fontWeight: 500 }}>{lk(o.tipo)}</span>
                      <span style={{ fontSize: 12.5, color: 'var(--fg-2)' }}> — {lk(o.descricao)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Edital + Avaliação ── */}
      <div className="analysis-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
        {legal.editalAnalise && (
          <div className="card" style={{ padding: 22 }}>
            <span className="uppy" style={{ color: 'var(--fg-3)' }}>§ 05.04 · edital</span>
            <h3 className="h2" style={{ marginTop: 4, marginBottom: 14 }}>Análise do edital</h3>
            <div className="meta-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, fontSize: 12.5 }}>
              <Meta lbl="Publicação" val={legal.editalAnalise.dataPublicacao || '—'} />
              <Meta lbl="Avaliação" val={fmtVal(legal.editalAnalise.valorAvaliacao)} />
              <Meta lbl="Lance mínimo" val={fmtVal(legal.editalAnalise.lanceMinimo)} />
              <Meta lbl="Desocupação" val={legal.editalAnalise.desocupacao || '—'} />
            </div>
            {legal.editalAnalise.debitos && (
              <p style={{ margin: '12px 0 0', fontSize: 11.5, color: 'var(--fg-2)' }}>
                <b style={{ color: 'var(--fg-1)' }}>Débitos:</b> {legal.editalAnalise.debitos}
              </p>
            )}
            {legal.editalAnalise.divergencias?.length > 0 && (
              <div style={{ marginTop: 12 }}>
                {legal.editalAnalise.divergencias.map((d, i) => (
                  <div key={i} style={{ padding: '8px 12px', background: 'var(--warn-soft)', borderRadius: 6, borderLeft: '2px solid var(--warn)', marginTop: 6, fontSize: 12, color: 'var(--fg-1)' }}>{lk(d)}</div>
                ))}
              </div>
            )}
          </div>
        )}
        {legal.avaliacao && (
          <div className="card" style={{ padding: 22 }}>
            <span className="uppy" style={{ color: 'var(--fg-3)' }}>§ 05.04 · avaliação</span>
            <h3 className="h2" style={{ marginTop: 4, marginBottom: 14 }}>Análise da avaliação</h3>
            <div className="meta-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, fontSize: 12.5 }}>
              <Meta lbl="Valor" val={fmtVal(legal.avaliacao.valor)} />
              <Meta lbl="Data" val={legal.avaliacao.data || '—'} />
              <Meta lbl="Avaliador" val={legal.avaliacao.avaliador || '—'} />
              <div>
                <span className="uppy" style={{ color: 'var(--fg-3)' }}>Vistoria</span>
                <div style={{ marginTop: 4 }}><StateBadge estado={legal.avaliacao.vistoria} /></div>
              </div>
            </div>
            {legal.avaliacao.atualidade && (
              <p style={{ margin: '12px 0 0', fontSize: 11.5, color: 'var(--fg-2)' }}>↳ {lk(legal.avaliacao.atualidade)}</p>
            )}
          </div>
        )}
      </div>

      {/* ── Atos essenciais / verificações (proveniência) ── */}
      {legal.verificacoes?.length > 0 && (
        <div className="card" style={{ padding: 22, marginBottom: 16 }}>
          <span className="uppy" style={{ color: 'var(--fg-3)' }}>§ 05.05 · atos essenciais</span>
          <h3 className="h2" style={{ marginTop: 4, marginBottom: 6 }}>Checagens e proveniência</h3>
          <p style={{ margin: '0 0 14px', fontSize: 12, color: 'var(--fg-2)' }}>
            Cada item indica se foi <b>verificado</b> no documento, <b>não localizado</b> ou se <b>requer leitura dos autos</b> por um especialista.
          </p>
          <div>
            {legal.verificacoes.map((v, i) => (
              <div key={i} className="row between" style={{
                gap: 12, padding: '10px 0', alignItems: 'center',
                borderTop: i === 0 ? 'none' : '1px solid var(--line-1)',
              }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, color: 'var(--fg-0)' }}>{lk(v.item)}</div>
                  <div className="mono" style={{ fontSize: 11, color: 'var(--fg-3)', marginTop: 2 }}>
                    {v.fonte}{v.nota && v.nota !== '—' ? ` · ${v.nota}` : ''}
                  </div>
                </div>
                <StateBadge estado={v.estado} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Documentos analisados (proveniência das fontes) ── */}
      {legal.documentos?.length > 0 && (
        <div className="card" style={{ padding: 22, marginBottom: 16 }}>
          <span className="uppy" style={{ color: 'var(--fg-3)' }}>§ 05.06 · documentos analisados</span>
          <h3 className="h2" style={{ marginTop: 4, marginBottom: 6 }}>Fontes da análise</h3>
          <p style={{ margin: '0 0 14px', fontSize: 12, color: 'var(--fg-2)' }}>
            Documentos em que a IA se baseou — e o que foi extraído de cada um. Itens “não obtidos” limitam a análise e exigem diligência manual.
          </p>
          <div>
            {legal.documentos.map((d, i) => (
              <div key={i} style={{
                display: 'grid', gridTemplateColumns: '1fr auto', gap: 12,
                padding: '12px 0', alignItems: 'start',
                borderTop: i === 0 ? 'none' : '1px solid var(--line-1)',
              }}>
                <div style={{ minWidth: 0 }}>
                  <div className="row gap-2 baseline" style={{ flexWrap: 'wrap' }}>
                    <span className="tag" style={{ fontSize: 10 }}>{d.tipo}</span>
                    {d.url ? (
                      <a href={d.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 13, color: 'var(--accent)', fontWeight: 500 }}>{d.nome} ↗</a>
                    ) : (
                      <span style={{ fontSize: 13, color: 'var(--fg-0)', fontWeight: 500 }}>{d.nome}</span>
                    )}
                  </div>
                  <div className="mono" style={{ fontSize: 11, color: 'var(--fg-3)', marginTop: 3 }}>
                    {d.origem}{d.data ? ` · ${d.data}` : ''}
                  </div>
                  <p style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--fg-2)', lineHeight: 1.45 }}>
                    <b style={{ color: 'var(--fg-1)' }}>Base:</b> {d.baseou}
                  </p>
                </div>
                <DocBadge status={d.status} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Disclaimer ── */}
      <div style={{ padding: 14, background: 'var(--bg-2)', borderRadius: 6, fontSize: 11.5, color: 'var(--fg-2)', lineHeight: 1.5 }}>
        <b style={{ color: 'var(--fg-1)' }}>↳ Aviso:</b> triagem jurídica automatizada por IA, baseada nos documentos disponíveis. Não substitui parecer de advogado. Itens marcados como “requer autos” dependem de diligência humana antes do lance.
      </div>

      <GlossaryDrawer
        open={glossaryOpen}
        onClose={() => setGlossaryOpen(false)}
        query={glossaryQuery}
        setQuery={setGlossaryQuery}
      />
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
          background: 'rgba(255,255,255,0.92)', backdropFilter: 'blur(12px)',
          boxShadow: '0 20px 50px rgba(17,24,39,0.08)',
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
      <div className="row between edital-header" style={{ alignItems: 'flex-start', marginBottom: 18 }}>
        <div>
          <span className="uppy" style={{ color: 'var(--fg-3)' }}>§ 04 · edital integral</span>
          <h3 className="h2" style={{ marginTop: 4 }}>Edital de Leilão Judicial Eletrônico</h3>
          <p style={{ margin: '4px 0 0', fontSize: 12.5, color: 'var(--fg-2)' }}>Originado em: {e.firstBidDate || 'não informado'}</p>
        </div>
        <div className="row gap-2">
          <button className="btn sm" onClick={() => p.auctionUrl && window.open(p.auctionUrl, '_blank')} disabled={!p.auctionUrl}>
            <span className="mono">↓</span> PDF original
          </button>
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
