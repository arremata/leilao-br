import { useState, useEffect } from 'react';
import { Countdown, Photo, Specs } from './shared';
import { fmtBRL } from '../utils';
import { fetchCatalogItem, analyzeCatalogItem } from '../api';

export default function PropertyDetail({ property, go, watched, toggleWatch }) {
  const [tab, setTab] = useState('market');

  // Simulator state lives here so both Costs and Viability share it
  // renoPct: 0 = sem reforma, 15 = leve, 50 = intermediária, 100 = completa.
  const [renoPct, setRenoPct] = useState(0);
  const [monthsToSale, setMonthsToSale] = useState(12); // 3..24
  const [target, setTarget] = useState(30);
  const [exempt, setExempt] = useState('Primeiro imóvel ou reinvestimento em 180 dias');
  const expenseStorageKey = property?.id ? `argos_property_expenses_${property.id}` : null;
  const [expenseEstimates, setExpenseEstimates] = useState(() => {
    if (!property?.id) return {};
    try {
      const saved = JSON.parse(localStorage.getItem(`argos_property_expenses_${property.id}`) || '{}');
      return saved && typeof saved === 'object' ? saved : {};
    } catch {
      return {};
    }
  });
  // Occupant-removal toggle: default ON when the property exposes a removal cost.
  // Initial state must be computed from a possibly-null property, so default to false
  // and let the sim re-derive availability after the early-return guard below.

  // On-demand enrichment for ingested catalog items. Seed / URL-analyzed
  // properties already carry marketDetail and skip the fetch entirely.
  const [enrichment, setEnrichment] = useState(null);
  // Thin catalog items start in the loading state (fetch fires on mount);
  // already-enriched or absent properties never fetch.
  const [enrichLoading, setEnrichLoading] = useState(() => !!property && !property.marketDetail);
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeError, setAnalyzeError] = useState(null);

  const alreadyEnriched = !!property?.marketDetail;

  // Fetch enrichment for a thin catalog item once. App remounts this component
  // per property (key={id}), so state resets naturally on navigation — no need
  // to clear it synchronously here.
  useEffect(() => {
    if (!property || alreadyEnriched) return undefined;
    let cancelled = false;
    fetchCatalogItem(property.id)
      .then(item => { if (!cancelled && item?.enrichment) setEnrichment(item.enrichment); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setEnrichLoading(false); });
    return () => { cancelled = true; };
  }, [property, alreadyEnriched]);

  if (!property) {
    return (
      <div style={{ maxWidth: 1480, margin: '0 auto', padding: '60px 24px', textAlign: 'center' }}>
        <p style={{ color: 'var(--fg-2)', fontSize: 14 }}>Nenhum imóvel selecionado.</p>
        <button className="btn" onClick={() => go('feed')} style={{ marginTop: 16 }}>Voltar ao feed</button>
      </div>
    );
  }
  // Effective property: an already-enriched result as-is, a thin catalog card
  // merged with its fetched enrichment, or the thin card alone (hero-only view).
  const enriched = alreadyEnriched
    ? property
    : (enrichment ? {
        ...property,
        ...enrichment,
        // Persisted enrichment may predate auction-date ingestion and contain
        // an empty endsAt. Never let it erase the fresher catalog countdown.
        endsAt: enrichment.endsAt || property.endsAt,
        firstAuctionAt: enrichment.firstAuctionAt || property.firstAuctionAt,
        secondAuctionAt: enrichment.secondAuctionAt || property.secondAuctionAt,
      } : null);
  const isEnriched = !!enriched;
  const p = enriched || property;
  const isWatched = watched?.includes(p.id);
  // Catalog responses historically used both names. Keep the official listing
  // reachable while older/newer backends converge on `auctionUrl`.
  const auctionUrl = p.auctionUrl || p.detailUrl;

  const handleAnalyze = async () => {
    setAnalyzing(true);
    setAnalyzeError(null);
    try {
      const result = await analyzeCatalogItem(property.id);
      setEnrichment(result);
    } catch (err) {
      setAnalyzeError(err.message || 'Falha ao analisar o imóvel.');
    } finally {
      setAnalyzing(false);
    }
  };

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
  const isLand = /terreno|lote/i.test(p.type || '');

  // Renovation rate: tier by region price/m², then interpolate by renoPct (0-100).
  // A posição totalmente à esquerda sempre significa custo zero. O cenário
  // Os percentuais representam somente a intensidade do cenário. A reforma
  // leve continua estimada por área na faixa de R$ 8–12 mil.
  const _renoRate = (pct, pricePerM2, area, land = false) => {
    if (land || !area) return 0;
    const lightTotal = Math.round(Math.min(12000, Math.max(8000, 8000 + ((area - 50) / 70) * 4000)));
    const lightRate = lightTotal / area;
    const tier = pricePerM2 > 6000 ? 'high' : pricePerM2 > 3000 ? 'mid' : 'low';
    const table = {
      high: { leve: lightRate, inter: 600, completa: 1200 },
      mid:  { leve: lightRate, inter: 500, completa: 1100 },
      low:  { leve: lightRate, inter: 400, completa: 1000 },
    };
    const t = table[tier];
    const p = Math.max(0, Math.min(100, pct));
    if (p === 0) return 0;
    if (p <= 15) {
      // sem reforma → leve
      return t.leve * (p / 15);
    }
    if (p <= 50) {
      // leve → intermediária
      return t.leve + (t.inter - t.leve) * ((p - 15) / 35);
    }
    // inter → completa
    return Math.round(t.inter + (t.completa - t.inter) * ((p - 50) / 50));
  };
  const rawRenoRate = _renoRate(
    renoPct, regionPricePerM2, p.area || 0, isLand,
  );
  const renoRate = Math.round(rawRenoRate);
  const renoCost = Math.round(rawRenoRate * (p.area || 0));
  const _renoLevelLabel = (pct) => {
    if (pct <= 0) return 'sem reforma';
    if (pct <= 15) return 'leve — pintura e ajustes';
    if (pct < 50) return 'inter- — cozinha, banheiros, piso';
    if (pct === 50) return 'intermediária — cozinha, banheiros, piso';
    if (pct < 100) return 'completa- — desmontagem parcial';
    return 'completa — desmontagem e reconstrução';
  };

  // --- Projected recurring debts over months-to-sale ---
  const monthlyCondo = expenseEstimates.condo != null
    ? Number(expenseEstimates.condo) || 0
    : Number(p.monthlyCondo) || 0;
  const monthlyIptu = expenseEstimates.iptu != null
    ? Number(expenseEstimates.iptu) || 0
    : Number(p.monthlyIptu) || 0;
  const projectedCondo = Math.round(monthlyCondo * monthsToSale);
  const projectedIptu = Math.round(monthlyIptu * monthsToSale);

  const setExpenseEstimate = (kind, value) => {
    const next = { ...expenseEstimates };
    const amount = Number(value);
    if (value === '' || !Number.isFinite(amount) || amount <= 0) delete next[kind];
    else next[kind] = amount;
    setExpenseEstimates(next);
    if (expenseStorageKey) localStorage.setItem(expenseStorageKey, JSON.stringify(next));
  };

  // --- Occupant removal cost (toggle, default on when property is not vacant) ---

  const gainCapital = exempt === 'Pagamento integral de GC'
    ? Math.round(Math.max(0, (p.market || 0) * 0.94 - (p.minBid || 0)) * 0.15)
    : 0;

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
          hint: `Nível: ${_renoLevelLabel(renoPct)}. R$ ${renoRate}/m² × ${Math.round(p.area || 0)} m².`,
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
      hint: `R$ ${fmtBRL(monthlyCondo)}/mês × ${monthsToSale} meses até a venda.`,
      kind: 'debt',
    });
  }
  if (monthlyIptu > 0) {
    dynamicRows.push({
      label: `IPTU projetado (${monthsToSale} meses)`,
      value: projectedIptu,
      hint: `R$ ${fmtBRL(monthlyIptu)}/mês × ${monthsToSale} meses até a venda.`,
      kind: 'debt',
    });
  }
  // ── Base cost model at minBid (seed values) ──
  // Used to derive fee rates and the target slider cap. The rows are then
  // rebased onto maxBid so the displayed total reflects the recommended bid.
  const baseTotal = dynamicRows.reduce((a, r) => a + r.value, 0);

  const netSale = Math.round((p.market || 0) * 0.94);
  const minBidFloor = p.minBid || 0;

  // %-of-bid fees scale with the actual arremate price: ITBI, comissão (leiloeiro/corretor),
  // custas judiciais, registro em cartório. Everything else (reform, debts, flat fees,
  // projected condo/IPTU, legal, capital gains) is independent of the bid.
  const _isScalingFee = (r) => {
    if (r.kind === 'price') return false;
    const lbl = r.label.toLowerCase();
    if (r.kind === 'tax' && lbl.includes('itbi')) return true;
    if (r.kind === 'fee' && (lbl.includes('comiss') || lbl.includes('custas') || lbl.includes('registro'))) return true;
    return false;
  };
  const scalingFeesAtMinBid = dynamicRows.filter(_isScalingFee).reduce((a, r) => a + r.value, 0);
  const flatCosts = baseTotal - minBidFloor - scalingFeesAtMinBid;
  const feeRate = minBidFloor > 0 ? scalingFeesAtMinBid / minBidFloor : 0;

  // Lance máximo recomendado nunca pode ser inferior ao lance mínimo do leilão.
  // Slider de meta de retorno é travado no ponto onde maxBid atinge o minBid:
  // at maxBid = minBid, total = minBid(1+feeRate) + flatCosts = baseTotal ⇒ target = (netSale/baseTotal - 1)*100
  const targetCap = baseTotal > 0
    ? Math.max(5, Math.min(80, Math.round((netSale / baseTotal - 1) * 100)))
    : 80;
  const effectiveTarget = Math.min(target, targetCap);
  // Solve for maxBid with fee scaling: total = maxBid(1+feeRate) + flatCosts = netSale/(1+T)
  // ⇒ maxBid = (netSale/(1+T) - flatCosts) / (1+feeRate)
  const maxBidRaw = baseTotal > 0
    ? Math.round((netSale / (1 + effectiveTarget / 100) - flatCosts) / (1 + feeRate))
    : 0;
  const maxBid = Math.max(maxBidRaw, minBidFloor);

  // Rebase the cost rows onto maxBid: price row → maxBid, scaling fees → maxBid × (orig/minBid).
  const rebasedRows = dynamicRows.map(r => {
    if (r.kind === 'price') {
      const suffix = '(lance máximo recomendado)';
      return { ...r, value: maxBid, hint: r.hint ? `${r.hint} ${suffix}` : suffix };
    }
    if (_isScalingFee(r) && minBidFloor > 0) {
      return { ...r, value: Math.round(r.value * maxBid / minBidFloor) };
    }
    return r;
  });
  const dynamicTotal = rebasedRows.reduce((a, r) => a + r.value, 0);
  const externalCosts = Math.max(0, dynamicTotal - maxBid);

  const sim = {
    renoPct, setRenoPct, monthsToSale, setMonthsToSale,
    target: effectiveTarget, setTarget, targetCap,
    exempt, setExempt,
    renoCost, renoRate, regionPricePerM2, isLand,
    monthlyCondo, monthlyIptu, projectedCondo, projectedIptu,
    expenseEstimates, setExpenseEstimate, expenseReference: p.expenseEstimate,
    gainCapital, dynamicTotal, dynamicRows: rebasedRows, netSale, maxBid, externalCosts,
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
          {auctionUrl && (
            <a
              className="btn sm primary"
              href={auctionUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              Acessar leilão <span aria-hidden="true">↗</span>
            </a>
          )}
          <button className="btn sm" onClick={() => toggleWatch?.(p.id)}>
            <span style={{ color: isWatched ? 'var(--accent)' : 'var(--fg-2)' }}>
              {isWatched ? '★' : '☆'}
            </span>
            {isWatched ? 'Salvo' : 'Salvar'}
          </button>
          <button className="btn sm" disabled title="Disponível em breve.">
            <span aria-hidden="true">✦</span>
            Exportar análise
            <span className="tag accent" style={{ padding: '1px 5px', fontSize: 8.5 }}>Em breve</span>
          </button>
          {!isEnriched && p.canAnalyze && (
            <button
              className="btn sm primary"
              onClick={handleAnalyze}
              disabled={analyzing || enrichLoading}
            >
              {analyzing ? 'Analisando…' : enrichLoading ? 'Carregando…' : 'Analisar imóvel'}
            </button>
          )}
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

        </div>
      </div>

      {isEnriched ? (<>
      {/* ===== TABS ===== */}
      <div className="detail-tabs" style={{
        display: 'flex', gap: 0,
        borderBottom: '1px solid var(--line-1)',
        marginBottom: 24,
      }}>
        {[
          { v: 'market', l: 'Mercado', ix: '01' },
          { v: 'cost', l: 'Viabilidade financeira', ix: '02' },
          { v: 'edital', l: 'Edital', ix: '03' },
          { v: 'legal', l: 'Jurídico', ix: '04', comingSoon: true },
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
            {t.comingSoon && <span className="tag accent" style={{ padding: '1px 6px', fontSize: 9 }}>em breve</span>}
          </button>
        ))}
      </div>

      {/* ===== TAB CONTENT ===== */}
      <div className="fade-in" key={tab}>
        {tab === 'market' && <Market p={p} />}
        {tab === 'cost' && <CostBreakdown p={p} sim={sim} />}
        {tab === 'legal' && <LegalComingSoon />}
        {tab === 'edital' && <Edital p={p} auctionUrl={auctionUrl} />}
      </div>
      </>) : (
        <AnalyzeCTA
          onAnalyze={handleAnalyze}
          analyzing={analyzing}
          loading={enrichLoading}
          error={analyzeError}
          canAnalyze={p.canAnalyze === true}
        />
      )}
    </div>
  );
}

function AnalyzeCTA({ onAnalyze, analyzing, loading, error, canAnalyze }) {
  const collectionQueued = error?.toLowerCase().includes('priorizada');
  return (
    <div className="card fade-in" style={{ padding: 40, textAlign: 'center', maxWidth: 560, margin: '0 auto' }}>
      <div className="mono" style={{ fontSize: 11, color: 'var(--fg-3)', marginBottom: 10 }}>ANÁLISE NÃO EXECUTADA</div>
      <h2 style={{ fontSize: 18, margin: '0 0 8px', color: 'var(--fg-0)' }}>Este imóvel ainda não foi analisado</h2>
      <p style={{ fontSize: 13, color: 'var(--fg-2)', lineHeight: 1.55, margin: canAnalyze ? '0 0 22px' : 0 }}>
        {canAnalyze
          ? 'Rode a análise para estimar o valor de mercado por comparáveis, a viabilidade financeira e os custos totais.'
          : 'A análise detalhada ainda não está disponível neste ambiente. Os dados oficiais do leilão permanecem acessíveis acima.'}
      </p>
      {canAnalyze && (
        <button className="btn primary" onClick={onAnalyze} disabled={analyzing || loading} style={{ minWidth: 180 }}>
          {analyzing ? 'Analisando…' : loading ? 'Carregando…' : 'Analisar imóvel'}
        </button>
      )}
      {error && <p style={{ marginTop: 16, fontSize: 12.5, color: collectionQueued ? 'var(--fg-2)' : 'var(--bad)' }}>{error}</p>}
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
  const firstBidPrice = p.firstAuctionPrice || p.edital?.firstBidPrice || p.minBid;
  const secondBidPrice = p.secondAuctionPrice || p.edital?.secondBidPrice || 0;
  const appraisal = p.appraisal || 0;
  const has2nd = secondBidPrice > 0;
  const firstBidDate = p.edital?.firstBidDate || (p.firstAuctionAt
    ? new Date(p.firstAuctionAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
    : null);
  const secondBidDate = p.edital?.secondBidDate || (p.secondAuctionAt
    ? new Date(p.secondAuctionAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
    : null);
  const secondDiscount = has2nd
    ? Math.round((firstBidPrice - secondBidPrice) / firstBidPrice * 100)
    : 0;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 16 }}>
      <div>
        <span className="uppy" style={{ color: 'var(--fg-3)' }}>1ª praça</span>
        <div className="num-md" style={{ marginTop: 4 }}>R$ {fmtBRL(firstBidPrice)}</div>
        {firstBidDate && (
          <div className="mono" style={{ fontSize: 11, color: 'var(--fg-3)', marginTop: 2 }}>{firstBidDate}</div>
        )}
      </div>
      <div>
        <span className="uppy" style={{ color: 'var(--fg-3)' }}>Valor de avaliação</span>
        {appraisal > 0 ? (
          <>
            <div className="num-md" style={{ marginTop: 4 }}>R$ {fmtBRL(appraisal)}</div>
            {p.auctionDiscount != null && (
              <div className="mono" style={{ fontSize: 11, color: 'var(--fg-3)', marginTop: 2 }}>
                {Number(p.auctionDiscount).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}% desconto oficial
              </div>
            )}
          </>
        ) : (
          <div style={{ marginTop: 4, fontSize: 13, color: 'var(--fg-3)', fontStyle: 'italic' }}>
            Não informado
          </div>
        )}
      </div>
      <div>
        <span className="uppy" style={{ color: 'var(--fg-3)' }}>2ª praça</span>
        {has2nd ? (
          <>
            <div className="row gap-2 baseline" style={{ marginTop: 4 }}>
              <div className="num-md">R$ {fmtBRL(secondBidPrice)}</div>
              <span style={{ fontSize: 11, color: 'var(--good)', fontWeight: 500 }}>−{secondDiscount}%</span>
            </div>
            {secondBidDate && (
              <div className="mono" style={{ fontSize: 11, color: 'var(--fg-3)', marginTop: 2 }}>{secondBidDate}</div>
            )}
          </>
        ) : (
          <>
            <div style={{ marginTop: 4, fontSize: 13, color: 'var(--fg-3)', fontStyle: 'italic' }}>
              Valor ainda não divulgado
            </div>
            {secondBidDate && (
              <div className="mono" style={{ fontSize: 11, color: 'var(--fg-3)', marginTop: 2 }}>{secondBidDate}</div>
            )}
          </>
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
  // can visualize all three values on the same scale even when the market
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
  const filteredIndicators = md.indicators;
  const mapsQuery = encodeURIComponent([p.address, p.city].filter(Boolean).join(', '));
  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${mapsQuery}`;
  const mapsEmbedUrl = `https://www.google.com/maps?q=${mapsQuery}&output=embed`;

  return (
    <div>
      <div className="analysis-grid" style={{ display: 'grid', gridTemplateColumns: '1.1fr 1fr', gap: 16, marginBottom: 16 }}>
        {/* § 01.01 — spread */}
        <div className="card" style={{ padding: 22 }}>
          <div className="row between" style={{ alignItems: 'flex-start', marginBottom: 18 }}>
            <div>
              <span className="uppy" style={{ color: 'var(--fg-3)' }}>§ 01.01 · spread</span>
              <h3 className="h2" style={{ marginTop: 4 }}>Lance vs. avaliação vs. mercado estimado</h3>
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
              {/* Estimated-market marker — vertical line + dot above */}
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

          {/* Legend — three rows: bid / appraisal / estimated market */}
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
                  Mercado estimado
                </span>
              </div>
              <div className="row gap-2" style={{ alignItems: 'baseline' }}>
                <span className="num-md" style={{ color: 'var(--good)' }}>R$ {fmtBRL(market)}</span>
                <span className="mono" style={{ fontSize: 11, color: 'var(--fg-3)' }}>100% (referência)</span>
              </div>
            </div>
          </div>

          {/* Gap summary — estimated market and official appraisal */}
          <div style={{ marginTop: 16, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div style={{
              padding: '11px 13px', borderRadius: 6, fontSize: 12.5,
              background: gapVsMarket >= 0 ? 'var(--good-soft)' : 'var(--bad-soft)',
              borderLeft: `3px solid ${gapVsMarket >= 0 ? 'var(--good)' : 'var(--bad)'}`,
            }}>
              <div className="uppy" style={{ color: 'var(--fg-3)', fontSize: 10.5, marginBottom: 3 }}>vs. mercado estimado</div>
              <div style={{ color: 'var(--fg-0)' }}>
                <b style={{ color: gapVsMarket >= 0 ? 'var(--good)' : 'var(--bad)', fontFamily: 'var(--f-mono)' }}>
                  R$ {fmtBRL(Math.abs(gapVsMarket))}
                </b>
              </div>
              <div className="mono" style={{ fontSize: 11, marginTop: 2, color: gapVsMarket >= 0 ? 'var(--good)' : 'var(--bad)' }}>
                {discountVsMarketPct >= 0
                  ? `−${discountVsMarketPct.toFixed(0)}% desconto estimado`
                  : `+${Math.abs(discountVsMarketPct).toFixed(1)}% acima da estimativa`}
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
                  ? `−${desagioOficialPct.toFixed(0)}% deságio oficial`
                  : `+${Math.abs(desagioOficialPct).toFixed(1)}% ágio`}
              </div>
            </div>
          </div>
        </div>

        {/* § 01.02 — indicadores + valorização */}
        <div className="card" style={{ padding: 22 }}>
          <span className="uppy" style={{ color: 'var(--fg-3)' }}>§ 01.02 · indicadores</span>
          <h3 className="h2" style={{ marginTop: 4, marginBottom: 14 }}>{p.neighborhood} · base 2024–2026</h3>

          <div className="metrics-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
            {filteredIndicators.map(ind => (
              <Stat2 key={ind.lbl} lbl={ind.lbl} val={ind.val} delta={ind.delta} pos={ind.pos} neg={ind.neg} />
            ))}
          </div>
        </div>
      </div>

      <div className="card" style={{ marginTop: 16, padding: 22 }}>
        <div className="row between" style={{ alignItems: 'center', marginBottom: 14 }}>
          <div>
            <span className="uppy" style={{ color: 'var(--fg-3)' }}>§ 01.03 · localização</span>
            <h3 className="h2" style={{ marginTop: 4 }}>Google Maps · vista do local</h3>
          </div>
          <a className="btn sm" href={mapsUrl} target="_blank" rel="noopener noreferrer">Abrir no Google ↗</a>
        </div>
        <iframe
          title={`Mapa de ${p.address}`}
          src={mapsEmbedUrl}
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
          style={{ width: '100%', height: 320, border: 0, borderRadius: 8 }}
        />
      </div>

      {/* § 01.04 — comparáveis (trend removida) */}
      {md.comparables.length > 0 && (
        <div className="card" style={{ marginTop: 16, padding: 22 }}>
          <span className="uppy" style={{ color: 'var(--fg-3)' }}>§ 01.04 · comparáveis</span>
          <h3 className="h2" style={{ marginTop: 4, marginBottom: 16 }}>Anúncios usados na referência regional</h3>
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
    target, setTarget, targetCap, exempt, setExempt,
    renoCost, renoRate, regionPricePerM2, isLand,
    projectedCondo, projectedIptu,
    expenseEstimates, setExpenseEstimate, expenseReference,
    netSale, maxBid, dynamicRows, dynamicTotal, externalCosts,
  } = sim;

  if ((dynamicRows || []).length === 0) {
    return (
      <div className="card" style={{ padding: 40, textAlign: 'center' }}>
        <p style={{ color: 'var(--fg-2)', fontSize: 14 }}>Dados de custos não disponíveis para este imóvel.</p>
      </div>
    );
  }

  // Presets snap the slider to canonical levels.
  const renoPresets = [
    { id: 'none',     label: 'Sem reforma',   pct: 0 },
    { id: 'leve',     label: 'Leve',          pct: 15 },
    { id: 'inter',    label: 'Intermediária', pct: 50 },
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
            setRenoPct(0);
            setMonthsToSale(12);
            setTarget(30);
            setExempt('Primeiro imóvel ou reinvestimento em 180 dias');
          }}>
            Resetar
          </button>
        </div>

        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: 14, padding: 16, marginBottom: 24, border: '1px solid var(--line-1)',
          borderRadius: 10, background: 'var(--bg-2)',
        }}>
          <RecurringExpenseField
            label="Condomínio mensal"
            estimatedValue={expenseEstimates.condo}
            calculatedValue={p.monthlyCondo}
            onChange={(value) => setExpenseEstimate('condo', value)}
          />
          <RecurringExpenseField
            label="IPTU mensal"
            estimatedValue={expenseEstimates.iptu}
            calculatedValue={p.monthlyIptu}
            onChange={(value) => setExpenseEstimate('iptu', value)}
          />
          <p style={{ gridColumn: '1 / -1', margin: 0, fontSize: 11.5, color: 'var(--fg-2)' }}>
            {expenseReference
              ? `Estimativas para ${expenseReference.city}/${expenseReference.uf}, referência ${expenseReference.referenceYear}: IPTU de ${(expenseReference.annualIptuRate * 100).toLocaleString('pt-BR')}% a.a. sobre a avaliação e condomínio de R$ ${fmtBRL(expenseReference.condoPerM2Monthly)}/m²/mês. Fonte: ${expenseReference.source}`
              : 'Ainda não há referência cadastrada para esta cidade. Você pode inserir estimativas mensais, salvas somente neste navegador.'}
          </p>
        </div>

        {/* Metric tiles — tonal hierarchy: hero (maxBid) / good (venda) / cost (total) / muted (external) */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 14, marginBottom: 24 }}>
          <SimMetric
            lbl="Custos externos"
            big={`R$ ${fmtBRL(externalCosts)}`}
            sub="Tudo além do arremate: taxas, reforma, débitos"
            tone="muted"
          />
          <SimMetric
            lbl="Custo total estimado"
            big={`R$ ${fmtBRL(dynamicTotal)}`}
            sub="Arremate + custos externos (baseado no lance máximo)"
            tone="cost"
          />
          <SimMetric
            lbl="Lance máximo recomendado"
            big={`R$ ${fmtBRL(Math.max(0, maxBid))}`}
            sub={`Para atingir ${target}% de retorno líquido`}
            tone="hero"
          />
          <SimMetric
            lbl="Venda estimada (líq. 6%)"
            big={`R$ ${fmtBRL(netSale)}`}
            sub="Valor de mercado líquido de comissão de venda"
            tone="good"
            delta={netSale - dynamicTotal}
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
              disabled={isLand}
              className="slider"
              style={{ width: '100%', marginTop: 14 }}
            />
            <div className="row between" style={{ marginTop: 8 }}>
              <span className="mono" style={{ fontSize: 10, color: 'var(--fg-3)' }}>sem reforma</span>
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
              {isLand
                ? 'Terreno não recebe estimativa de reforma'
                : `R$ ${renoRate}/m² × ${Math.round(p.area || 0)} m² · cenário ${renoPct}%`}
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
          R$ {fmtBRL(regionPricePerM2)}/m² · taxa de reforma aplicada: R$ {fmtBRL(renoRate)}/m²
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
          <div className="cost-head" style={{
            display: 'grid', gridTemplateColumns: '24px minmax(180px, 1fr) 120px minmax(210px, 260px)', gap: 14,
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
            display: 'grid', gridTemplateColumns: '24px minmax(180px, 1fr) 120px minmax(210px, 260px)', gap: 14,
            padding: '20px 20px', background: 'var(--bg-2)',
            alignItems: 'baseline', borderTop: '2px solid var(--line-2)',
          }}>
            <span className="mono" style={{ color: 'var(--fg-3)' }}>∑</span>
            <span style={{ fontSize: 15, fontWeight: 600 }}>Custo total — chave na mão</span>
            <span></span>
            <span className="num-xl cost-total-value" style={{ textAlign: 'right', color: 'var(--accent)', minWidth: 0 }}>R$ {fmtBRL(dynamicTotal)}</span>
          </div>
        </div>
        <p style={{ marginTop: 14, fontSize: 11.5, color: 'var(--fg-3)' }}>
          Condomínio e IPTU projetados pela quantidade de meses até venda. Ganho de capital varia conforme reinvestimento.
        </p>
      </div>
    </div>
  );
}

function RecurringExpenseField({ label, estimatedValue, calculatedValue, onChange }) {
  const userAdjusted = estimatedValue != null;
  const value = userAdjusted ? estimatedValue : (calculatedValue || '');
  return (
    <label style={{ display: 'block' }}>
      <span className="row between" style={{ marginBottom: 7 }}>
        <span className="uppy" style={{ color: 'var(--fg-2)' }}>{label}</span>
        <span className="mono" style={{ fontSize: 10, color: userAdjusted ? 'var(--warn)' : 'var(--fg-2)' }}>
          {userAdjusted ? 'AJUSTADO PELO USUÁRIO' : calculatedValue ? 'ESTIMATIVA DA CIDADE' : 'SEM REFERÊNCIA'}
        </span>
      </span>
      <div className="row" style={{
        height: 40, padding: '0 12px', border: '1px solid var(--line-2)',
        borderRadius: 8, background: 'var(--bg-1)',
      }}>
        <span style={{ color: 'var(--fg-2)', marginRight: 6 }}>R$</span>
        <input
          type="number" min="0" step="0.01" inputMode="decimal"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="Insira uma estimativa" aria-label={label}
          style={{ width: '100%', border: 0, outline: 0, background: 'transparent', fontFamily: 'var(--f-mono)' }}
        />
        <span style={{ color: 'var(--fg-3)', fontSize: 11 }}>/mês</span>
      </div>
    </label>
  );
}

// Tonal palette — hero (maxBid) leads, good (venda) follows, cost is neutral-bold, muted recedes.
const _tones = {
  hero:   { cardBg: 'var(--accent)',           border: 'var(--accent-strong)', num: 'var(--accent-ink)',  lbl: 'rgba(255,255,255,0.75)', sub: 'rgba(255,255,255,0.85)', chipBg: 'rgba(255,255,255,0.18)', chipFg: '#fff' },
  good:   { cardBg: 'var(--good-soft)',         border: 'var(--good)',           num: 'var(--good)',         lbl: 'var(--fg-3)',            sub: 'var(--fg-2)',            chipBg: 'var(--good)',           chipFg: '#fff' },
  cost:   { cardBg: 'var(--bg-1)',              border: 'var(--line-2)',         num: 'var(--fg-0)',         lbl: 'var(--fg-3)',            sub: 'var(--fg-2)',            chipBg: 'var(--bg-3)',           chipFg: 'var(--fg-1)' },
  muted:  { cardBg: 'var(--bg-2)',              border: 'var(--line-1)',         num: 'var(--fg-1)',         lbl: 'var(--fg-3)',            sub: 'var(--fg-3)',            chipBg: 'transparent',          chipFg: 'var(--fg-2)' },
};
function SimMetric({ lbl, big, sub, tone = 'muted', delta }) {
  const t = _tones[tone] || _tones.muted;
  const showDelta = typeof delta === 'number';
  const deltaPos = delta >= 0;
  return (
    <div style={{
      padding: '16px 18px',
      background: t.cardBg, borderRadius: 10,
      border: `1px solid ${t.border}`,
      boxShadow: tone === 'hero' ? '0 6px 18px rgba(124,58,237,0.22)' : 'none',
    }}>
      <span className="uppy" style={{ color: t.lbl, fontSize: 10.5, letterSpacing: '0.06em' }}>{lbl}</span>
      <div className="num-xl" style={{ marginTop: 8, color: t.num, fontSize: tone === 'hero' ? 30 : 26, fontWeight: 600 }}>{big}</div>
      {showDelta && (
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 4,
          marginTop: 6, padding: '3px 8px', borderRadius: 6,
          background: deltaPos ? 'var(--good)' : 'var(--bad)',
          color: '#fff', fontSize: 11.5, fontWeight: 600,
          fontFamily: 'var(--f-mono)',
        }}>
          <span>{deltaPos ? '▲' : '▼'}</span>
          <span>R$ {fmtBRL(Math.abs(delta))}</span>
          <span style={{ fontWeight: 400, opacity: 0.85 }}>lucro líq.</span>
        </div>
      )}
      {sub && <p style={{ margin: showDelta ? '8px 0 0' : '6px 0 0', fontSize: 11.5, color: t.sub, lineHeight: 1.4 }}>{sub}</p>}
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
        gridTemplateColumns: '24px minmax(180px, 1fr) 120px minmax(210px, 260px)',
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
      <span className="mono cost-money-value" style={{
        fontSize: 15, textAlign: 'right',
        minWidth: 0,
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
// TAB 4 — LEGAL (coming soon)
// ============================================================
function LegalComingSoon() {
  return (
    <div className="card" style={{ minHeight: 360, display: 'grid', placeItems: 'center', padding: 32, textAlign: 'center' }}>
      <div style={{ maxWidth: 440 }}>
        <span className="tag accent" style={{ display: 'inline-block', marginBottom: 16 }}>em breve</span>
        <h3 className="h1" style={{ marginBottom: 12 }}>Análise jurídica</h3>
        <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6, color: 'var(--fg-2)' }}>
          Estamos preparando uma análise jurídica mais clara e confiável para os imóveis de leilão.
        </p>
      </div>
    </div>
  );
}

// ============================================================
// TAB 3 — EDITAL
// ============================================================
function Edital({ p, auctionUrl }) {
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
          {auctionUrl && (
            <a className="btn sm" href={auctionUrl} target="_blank" rel="noopener noreferrer">
              Acessar leilão <span aria-hidden="true">↗</span>
            </a>
          )}
        </div>
      </div>
      <div className="meta-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18, marginBottom: 22 }}>
        <Meta lbl="Processo" val={e.process || '—'} />
        <Meta lbl="Exequente" val={e.creditor || '—'} />
        <Meta lbl="Executado" val={e.debtor || '—'} />
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
      {e.summaryNote && (
        <div style={{ marginTop: 22, padding: 14, background: 'var(--bg-2)', borderRadius: 6, fontSize: 12, color: 'var(--fg-2)' }}>
          <b style={{ color: 'var(--fg-1)' }}>↳</b> {e.summaryNote}
        </div>
      )}
    </div>
  );
}
