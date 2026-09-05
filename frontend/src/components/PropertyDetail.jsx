import { useState, useEffect } from 'react';
import { Countdown, Photo, Specs } from './shared';
import { fmtBRL } from '../utils';
import { fetchCatalogItem, analyzeCatalogItem } from '../api';

const REGISTRATION_RATES = {
  PR: 0.008, SP: 0.009, RJ: 0.0085, MG: 0.0075, RS: 0.007,
  SC: 0.007, DF: 0.008, BA: 0.008, GO: 0.0075,
};
const BRAZILIAN_UFS = new Set([
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT',
  'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO',
  'RR', 'SC', 'SP', 'SE', 'TO',
]);

function readStoredObject(key, fallback = {}) {
  if (!key) return fallback;
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || 'null');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function normalizedCostLabel(value) {
  return String(value || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function isDirectSaleProperty(property) {
  return normalizedCostLabel(property?.modalidade).includes('venda direta');
}

function isOpenTenderProperty(property) {
  return normalizedCostLabel(property?.modalidade).includes('licitacao aberta');
}

function costRowId(row, index = 0) {
  if (row.id) return String(row.id);
  const label = normalizedCostLabel(row.label);
  if (row.kind === 'price' || label.includes('lance de arremate')) return 'auction_bid';
  if (label.includes('itbi')) return 'itbi';
  if (label.includes('comiss')) return 'auctioneer_commission';
  if (label.includes('registro') || label.includes('cartorio') || label.includes('emolument')) return 'property_registration';
  if (label.includes('desocup')) return 'occupant_removal';
  if (row.kind === 'reno' || label.includes('reforma')) return 'renovation';
  if (label.includes('ganho de capital')) return 'capital_gains';
  if (label.includes('condomin')) return 'projected_condo';
  if (label.includes('iptu')) return 'projected_iptu';
  const slug = label.replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'cost';
  return `source_${slug}_${index}`;
}

function propertyUf(property) {
  const direct = String(property.uf || property.state || '').toUpperCase().trim();
  if (BRAZILIAN_UFS.has(direct)) return direct;
  const cityMatch = String(property.city || '').toUpperCase().match(/\b([A-Z]{2})\s*$/);
  return cityMatch && BRAZILIAN_UFS.has(cityMatch[1]) ? cityMatch[1] : '';
}

function formatAuctionDate(value) {
  if (!value) return '';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return String(value);
  return parsed.toLocaleString('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'America/Sao_Paulo',
  });
}

function formatAuctionEvent(date, price) {
  const parts = [];
  const formattedDate = formatAuctionDate(date);
  const numericPrice = Number(price);
  if (formattedDate) parts.push(formattedDate);
  if (Number.isFinite(numericPrice) && numericPrice > 0) parts.push(`R$ ${fmtBRL(numericPrice)}`);
  return parts.join(' · ');
}

export default function PropertyDetail({ property, go, watched, toggleWatch }) {
  const [tab, setTab] = useState('market');

  // Simulator state lives here so both Costs and Viability share it
  // renoPct: 0 = sem reforma, 15 = leve, 50 = intermediária, 100 = completa.
  const [renoPct, setRenoPct] = useState(() => (
    /terreno|lote|gleba/i.test(property?.type || '') ? 0 : 15
  ));
  const [monthsToSale, setMonthsToSale] = useState(12); // 3..24
  const [target, setTarget] = useState(30);
  const [exempt, setExempt] = useState('Primeiro imóvel ou reinvestimento em 180 dias');
  const expenseStorageKey = property?.id ? `arremate_property_expenses_${property.id}` : null;
  const costStorageKey = property?.id ? `arremate_property_costs_${property.id}` : null;
  const [expenseEstimates, setExpenseEstimates] = useState(() => {
    if (!property?.id) return {};
    return readStoredObject(
      `arremate_property_expenses_${property.id}`,
      readStoredObject(`argos_property_expenses_${property.id}`),
    );
  });
  const [costPreferences, setCostPreferences] = useState(() => (
    property?.id ? readStoredObject(`arremate_property_costs_${property.id}`, { overrides: {}, customCosts: [] }) : {}
  ));

  // On-demand enrichment for ingested catalog items. Seed / URL-analyzed
  // properties already carry marketDetail and skip the fetch entirely.
  const [catalogDetail, setCatalogDetail] = useState(null);
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
      .then(item => {
        if (!cancelled && item) {
          setCatalogDetail(item);
          if (item.enrichment) setEnrichment(item.enrichment);
        }
      })
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
  const catalogProperty = catalogDetail
    ? { ...property, ...catalogDetail }
    : property;
  // Effective property: an already-enriched result as-is, a thin catalog card
  // merged with its fetched enrichment, or the thin card alone (hero-only view).
  const enriched = alreadyEnriched
    ? catalogProperty
    : (enrichment ? {
        ...catalogProperty,
        ...enrichment,
        // Persisted enrichment may predate auction-date ingestion and contain
        // an empty endsAt. Never let it erase the fresher catalog countdown.
        endsAt: enrichment.endsAt || catalogProperty.endsAt,
        firstAuctionAt: enrichment.firstAuctionAt || catalogProperty.firstAuctionAt,
        secondAuctionAt: enrichment.secondAuctionAt || catalogProperty.secondAuctionAt,
        firstAuctionPrice: catalogProperty.firstAuctionPrice ?? enrichment.firstAuctionPrice,
        secondAuctionPrice: catalogProperty.secondAuctionPrice ?? enrichment.secondAuctionPrice,
        modalidade: catalogProperty.modalidade || enrichment.modalidade,
        auctionType: catalogProperty.auctionType || enrichment.auctionType,
        matricula: catalogProperty.matricula || enrichment.matricula,
        editalUrl: catalogProperty.editalUrl || enrichment.editalUrl,
        matriculaUrl: catalogProperty.matriculaUrl || enrichment.matriculaUrl,
        editalData: catalogProperty.editalData || enrichment.editalData,
      } : null);
  const isEnriched = !!enriched;
  const p = enriched || catalogProperty;
  const isDirectSale = isDirectSaleProperty(p);
  const commissionExempt = isDirectSale;
  const isWatched = watched?.includes(p.id);
  // Catalog responses historically used both names. Keep the official listing
  // reachable while older/newer backends converge on `auctionUrl`.
  const auctionUrl = p.auctionUrl || p.detailUrl;
  const editalUrl = p.editalUrl || p.edital?.editalUrl;
  const matriculaUrl = p.matriculaUrl || p.edital?.matriculaUrl;
  const saleRulesUrl = p.editalData?.saleRulesUrl || p.edital?.editalData?.saleRulesUrl;

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

  // --- Renovation cost: slider or direct value, scaled by region's R$/m² ---
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
  const suggestedRenoCost = Math.round(rawRenoRate * (p.area || 0));
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
    if (value === '' || !Number.isFinite(amount) || amount < 0) delete next[kind];
    else next[kind] = Math.max(0, amount);
    setExpenseEstimates(next);
    if (expenseStorageKey) {
      try {
        localStorage.setItem(expenseStorageKey, JSON.stringify(next));
      } catch {
        // The calculator remains usable when storage is unavailable.
      }
    }
  };

  const persistCostPreferences = (update) => {
    setCostPreferences(current => {
      const next = typeof update === 'function' ? update(current) : update;
      if (costStorageKey) {
        try {
          localStorage.setItem(costStorageKey, JSON.stringify(next));
        } catch {
          // The calculator remains usable when storage is unavailable.
        }
      }
      return next;
    });
  };
  const legacyCostOverrides = costPreferences?.overrides && typeof costPreferences.overrides === 'object'
    ? costPreferences.overrides
    : {};
  const scenarioPreferences = costPreferences?.scenario && typeof costPreferences.scenario === 'object'
    ? costPreferences.scenario
    : {};
  const customCosts = Array.isArray(costPreferences?.customCosts)
    ? costPreferences.customCosts.filter(item => item && item.id && item.label && Number.isFinite(Number(item.value)))
    : [];
  const setScenarioPreference = (key, value) => {
    persistCostPreferences(current => {
      const next = { ...(current || {}) };
      delete next.overrides;
      const scenario = { ...(current?.scenario || {}) };
      if (value == null) delete scenario[key];
      else scenario[key] = value;
      return { ...next, scenario, customCosts: current?.customCosts || [] };
    });
  };
  const addCustomCost = (label, value) => {
    const trimmedLabel = String(label || '').trim();
    const amount = Number(value);
    if (!trimmedLabel || !Number.isFinite(amount) || amount < 0) return;
    const id = `custom_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    persistCostPreferences(current => ({
      ...(current || {}),
      scenario: current?.scenario || {},
      customCosts: [...(Array.isArray(current?.customCosts) ? current.customCosts : []), {
        id, label: trimmedLabel, value: amount,
      }],
    }));
  };
  const removeCustomCost = (id) => {
    persistCostPreferences(current => ({
      ...(current || {}),
      scenario: current?.scenario || {},
      customCosts: (Array.isArray(current?.customCosts) ? current.customCosts : []).filter(item => item.id !== id),
    }));
  };
  const resetScenarioPreferences = () => {
    persistCostPreferences(current => {
      const next = { ...(current || {}) };
      delete next.overrides;
      return { ...next, scenario: {}, customCosts: current?.customCosts || [] };
    });
  };

  const hasScenarioValue = (key) => Object.prototype.hasOwnProperty.call(scenarioPreferences, key)
    && Number.isFinite(Number(scenarioPreferences[key]));
  const hasLegacyEvictionCost = Object.prototype.hasOwnProperty.call(legacyCostOverrides, 'occupant_removal')
    && Number.isFinite(Number(legacyCostOverrides.occupant_removal));
  const legacyEvictionCost = Number(legacyCostOverrides.occupant_removal);
  const evictionAdjusted = hasScenarioValue('evictionCost') || hasLegacyEvictionCost;
  const evictionCost = hasScenarioValue('evictionCost')
    ? Math.max(0, Number(scenarioPreferences.evictionCost))
    : (hasLegacyEvictionCost ? Math.max(0, legacyEvictionCost) : 5000);
  const renovationAdjusted = hasScenarioValue('renovationCost');
  const renoCost = renovationAdjusted
    ? Math.max(0, Number(scenarioPreferences.renovationCost))
    : suggestedRenoCost;
  const appliedRenoRate = p.area > 0 ? Math.round(renoCost / p.area) : 0;
  const setRenoLevel = (value) => {
    setRenoPct(Math.max(0, Math.min(100, Number(value) || 0)));
    setScenarioPreference('renovationCost', null);
  };
  const setRenovationBudget = (value) => {
    const amount = Math.max(0, Number(value) || 0);
    if (!isLand && p.area > 0) {
      let closestPct = 0;
      let closestDistance = Infinity;
      for (let pct = 0; pct <= 100; pct += 1) {
        const candidate = _renoRate(pct, regionPricePerM2, p.area, false) * p.area;
        const distance = Math.abs(candidate - amount);
        if (distance < closestDistance) {
          closestPct = pct;
          closestDistance = distance;
        }
      }
      setRenoPct(closestPct);
    }
    setScenarioPreference('renovationCost', amount);
  };

  const marketSaleSuggestion = Math.max(0, Number(p.market) || 0);
  const appraisalSaleSuggestion = Math.max(0, Number(p.appraisal) || 0);
  const defaultSaleBasis = marketSaleSuggestion > 0 ? 'market' : 'appraisal';
  const saleBasis = ['market', 'appraisal', 'custom'].includes(scenarioPreferences.saleBasis)
    ? scenarioPreferences.saleBasis
    : defaultSaleBasis;
  const customSaleValue = Number(scenarioPreferences.saleValue);
  const saleValue = saleBasis === 'custom' && Number.isFinite(customSaleValue)
    ? Math.max(0, customSaleValue)
    : (saleBasis === 'appraisal' ? appraisalSaleSuggestion : marketSaleSuggestion);
  const setSaleBasis = (basis) => {
    persistCostPreferences(current => {
      const next = { ...(current || {}) };
      delete next.overrides;
      const scenario = { ...(current?.scenario || {}), saleBasis: basis };
      delete scenario.saleValue;
      return { ...next, scenario, customCosts: current?.customCosts || [] };
    });
  };
  const setCustomSaleValue = (value) => {
    persistCostPreferences(current => {
      const next = { ...(current || {}) };
      delete next.overrides;
      return {
        ...next,
        scenario: { ...(current?.scenario || {}), saleBasis: 'custom', saleValue: Math.max(0, Number(value) || 0) },
        customCosts: current?.customCosts || [],
      };
    });
  };

  const resetExpenseEstimates = () => {
    setExpenseEstimates({});
    if (expenseStorageKey) {
      try {
        localStorage.removeItem(expenseStorageKey);
      } catch {
        // The calculator remains usable when storage is unavailable.
      }
    }
  };

  const gainCapital = exempt === 'Pagamento integral de GC'
    ? Math.round(Math.max(0, saleValue - (p.minBid || 0)) * 0.15)
    : 0;

  const minBidFloor = Number(p.minBid) || 0;
  const uf = propertyUf(p);
  const registrationRate = BRAZILIAN_UFS.has(uf) ? (REGISTRATION_RATES[uf] || 0.0075) : null;

  // Normalize legacy cached cost rows and backfill the new platform estimates
  // so the feature works before every persisted enrichment has been refreshed.
  let sourceRows = (p.costs || [])
    .filter(r => {
      const label = normalizedCostLabel(r.label);
      if (r.kind === 'debt' && (label.includes('condomínio') || label.includes('condominio'))) return false;
      if (r.kind === 'debt' && label.includes('iptu')) return false;
      return true;
    })
    .map((r, index) => ({ ...r, id: costRowId(r, index), value: Number(r.value) || 0 }))
    // Commission is rebuilt from the current structured edital below. This
    // prevents a stale materialized 5% estimate from overriding official data.
    .filter(r => r.id !== 'auctioneer_commission');

  const ensureCost = (row) => {
    if (!sourceRows.some(item => item.id === row.id)) sourceRows.push(row);
  };
  ensureCost({
    id: 'auction_bid', label: isDirectSale ? 'Preço de venda' : 'Lance de arremate', value: minBidFloor,
    hint: isDirectSale
      ? 'Preço mínimo publicado pela Caixa para a venda direta.'
      : 'Valor mínimo informado para o leilão.',
    kind: 'price',
  });
  const editalData = p.editalData || p.edital?.editalData || {};
  const officialCommissionRate = Number(editalData.commissionRate);
  if (commissionExempt) {
    ensureCost({
      id: 'auctioneer_commission', label: 'Comissão isenta', value: 0, rate: 0,
      hint: `${isDirectSale ? 'Venda direta' : 'Licitação aberta'} não prevê comissão de leiloeiro.`,
      kind: 'fee',
    });
  } else if (Number.isFinite(officialCommissionRate) && officialCommissionRate > 0 && officialCommissionRate <= 0.3) {
    ensureCost({
      id: 'auctioneer_commission',
      label: `Comissão do leiloeiro · edital (${(officialCommissionRate * 100).toLocaleString('pt-BR')}%)`,
      value: Math.round(minBidFloor * officialCommissionRate), rate: officialCommissionRate,
      hint: editalData.commissionTerms || 'Percentual extraído diretamente do edital oficial.',
      kind: 'fee',
    });
  } else {
    ensureCost({
      id: 'auctioneer_commission', label: 'Comissão do leiloeiro · não informada', value: 0,
      hint: 'O percentual oficial não está disponível nos dados estruturados do edital. Confirme antes de ofertar.',
      kind: 'fee',
    });
  }
  if (registrationRate != null) {
    ensureCost({
      id: 'property_registration',
      label: `Registro em cartório · ${uf} (${(registrationRate * 100).toLocaleString('pt-BR')}%)`,
      value: Math.round(minBidFloor * registrationRate), rate: registrationRate,
      hint: 'Referência simplificada baseada nas tabelas estaduais de emolumentos reunidas pelo IRIB (2025). O valor final varia por faixa e pelos atos praticados; confirme com o cartório.',
      kind: 'fee',
    });
  }
  ensureCost({
    id: 'occupant_removal', label: 'Desocupação do imóvel · estimativa', value: 5000,
    hint: 'Reserva inicial para medidas de desocupação. Ajuste conforme a situação do imóvel e a orientação profissional.',
    kind: 'fee',
  });
  ensureCost({
    id: 'renovation', label: 'Reforma estimada', value: 0,
    hint: 'Calculada no simulador por área e faixa regional.', kind: 'reno',
  });
  ensureCost({
    id: 'capital_gains', label: 'Imposto sobre ganho de capital', value: 0,
    hint: 'Calculado conforme o cenário tributário selecionado.', kind: 'tax',
  });

  sourceRows = sourceRows.map(r => {
      if (r.id === 'auction_bid' || r.kind === 'price') {
        return {
          ...r,
          id: 'auction_bid',
          label: isDirectSale ? 'Preço de venda' : 'Lance de arremate',
          hint: isDirectSale
            ? 'Preço mínimo publicado pela Caixa para a venda direta.'
            : (r.hint || 'Valor mínimo informado para o leilão.'),
        };
      }
      if (r.id === 'property_registration' && registrationRate != null && !Number.isFinite(Number(r.rate))) {
        return {
          ...r,
          label: `Registro em cartório · ${uf} (${(registrationRate * 100).toLocaleString('pt-BR')}%)`,
          value: Math.round(minBidFloor * registrationRate),
          rate: registrationRate,
          hint: 'Referência simplificada baseada nas tabelas estaduais de emolumentos reunidas pelo IRIB (2025). O valor final varia por faixa e pelos atos praticados; confirme com o cartório.',
        };
      }
      if (r.id === 'occupant_removal') {
        return {
          ...r,
          value: evictionCost,
          hint: evictionAdjusted
            ? 'Valor de desocupação informado por você no cenário do investidor.'
            : 'Reserva inicial de R$ 5.000. Ajuste no cenário conforme a situação do imóvel e a orientação profissional.',
        };
      }
      if (r.id === 'renovation' || r.kind === 'reno') {
        return {
          ...r,
          id: 'renovation',
          value: renoCost,
          hint: renovationAdjusted
            ? `Valor de reforma informado por você. Referência leve da plataforma: R$ ${fmtBRL(suggestedRenoCost)}.`
            : `Nível: ${_renoLevelLabel(renoPct)}. R$ ${renoRate}/m² × ${Math.round(p.area || 0)} m².`,
        };
      }
      if (r.id === 'capital_gains' || (r.kind === 'tax' && normalizedCostLabel(r.label).includes('ganho'))) {
        return {
          ...r,
          id: 'capital_gains',
          value: gainCapital,
          hint: gainCapital === 0
            ? `Isento — ${exempt.toLowerCase()}.`
            : 'Alíquota de 15% sobre o ganho líquido estimado na venda.',
        };
      }
      return r;
    });

  if (monthlyCondo > 0) {
    sourceRows.push({
      id: 'projected_condo',
      label: `Condomínio projetado (${monthsToSale} meses)`,
      value: projectedCondo,
      hint: `R$ ${fmtBRL(monthlyCondo)}/mês × ${monthsToSale} meses até a venda.`,
      kind: 'debt',
    });
  }
  if (monthlyIptu > 0) {
    sourceRows.push({
      id: 'projected_iptu',
      label: `IPTU projetado (${monthsToSale} meses)`,
      value: projectedIptu,
      hint: `R$ ${fmtBRL(monthlyIptu)}/mês × ${monthsToSale} meses até a venda.`,
      kind: 'debt',
    });
  }

  const rowOrder = {
    auction_bid: 0, itbi: 10, auctioneer_commission: 20,
    property_registration: 30, occupant_removal: 40,
    overdue_iptu: 50, overdue_condo: 51, projected_condo: 52,
    projected_iptu: 53, renovation: 60, capital_gains: 70,
  };
  sourceRows.sort((a, b) => (rowOrder[a.id] ?? 55) - (rowOrder[b.id] ?? 55));

  const _isScalingFee = (r) => {
    if (r.kind === 'price') return false;
    if (Number.isFinite(Number(r.rate)) && Number(r.rate) > 0) return true;
    const lbl = normalizedCostLabel(r.label);
    if (r.kind === 'tax' && lbl.includes('itbi')) return true;
    if (r.kind === 'fee' && (lbl.includes('comiss') || lbl.includes('custas') || lbl.includes('registro') || lbl.includes('emolument'))) return true;
    return false;
  };
  const rateForRow = (r) => Number(r.rate) > 0
    ? Number(r.rate)
    : (minBidFloor > 0 ? (Number(r.value) || 0) / minBidFloor : 0);
  const scalableRows = sourceRows.filter(_isScalingFee);
  const feeRate = scalableRows.reduce((total, row) => total + rateForRow(row), 0);
  const flatCosts = sourceRows.reduce((total, row) => {
    if (row.kind === 'price' || _isScalingFee(row)) return total;
    return total + (Number(row.value) || 0);
  }, 0) + customCosts.reduce((total, row) => total + Math.max(0, Number(row.value) || 0), 0);
  const baseTotal = minBidFloor * (1 + feeRate) + flatCosts;

  const targetCap = baseTotal > 0
    ? Math.max(5, Math.min(80, Math.round((saleValue / baseTotal - 1) * 100)))
    : 80;
  const effectiveTarget = Math.min(target, targetCap);
  const maxBidRaw = baseTotal > 0
    ? Math.round((saleValue / (1 + effectiveTarget / 100) - flatCosts) / (1 + feeRate))
    : 0;
  const recommendedBid = Math.max(maxBidRaw, minBidFloor);
  const consideredBid = recommendedBid;

  const dynamicRows = sourceRows.map(r => {
    if (r.kind === 'price') {
      return {
        ...r, id: 'auction_bid', value: consideredBid,
        hint: `${r.hint || ''} ${isDirectSale
          ? 'Proposta máxima recomendada'
          : 'Lance máximo recomendado'} para o cenário atual.`,
      };
    }
    if (_isScalingFee(r)) return { ...r, value: Math.round(consideredBid * rateForRow(r)) };
    return r;
  }).concat(customCosts.map(row => ({
    ...row, value: Math.max(0, Number(row.value) || 0), kind: 'custom', custom: true,
    hint: 'Custo extra salvo neste navegador.',
  })));
  const dynamicTotal = dynamicRows.reduce((total, row) => total + (Number(row.value) || 0), 0);
  const externalCosts = Math.max(0, dynamicTotal - consideredBid);

  const sim = {
    renoPct, setRenoPct: setRenoLevel, monthsToSale, setMonthsToSale,
    target: effectiveTarget, setTarget, targetCap,
    exempt, setExempt,
    renoCost, renovationAdjusted, renoRate: appliedRenoRate, regionPricePerM2, isLand,
    monthlyCondo, monthlyIptu, projectedCondo, projectedIptu,
    expenseEstimates, setExpenseEstimate, expenseReference: p.expenseEstimate,
    evictionCost, evictionAdjusted,
    setEvictionCost: (value) => setScenarioPreference('evictionCost', value),
    resetEvictionCost: () => setScenarioPreference('evictionCost', null),
    setRenovationCost: setRenovationBudget,
    saleValue, saleBasis, marketSaleSuggestion, appraisalSaleSuggestion,
    setSaleBasis, setCustomSaleValue,
    gainCapital, dynamicTotal, dynamicRows, maxBid: consideredBid,
    externalCosts, customCosts, addCustomCost, removeCustomCost,
    resetScenarioPreferences, resetExpenseEstimates,
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
              {isDirectSale ? 'Acessar venda' : 'Acessar leilão'} <span aria-hidden="true">↗</span>
            </a>
          )}
          {editalUrl && (
            <a
              className="btn sm"
              href={editalUrl}
              target="_blank"
              rel="noopener noreferrer"
              download
            >
              Baixar edital <span aria-hidden="true">↓</span>
            </a>
          )}
          {matriculaUrl && (
            <a
              className="btn sm"
              href={matriculaUrl}
              target="_blank"
              rel="noopener noreferrer"
              download
            >
              Baixar matrícula <span aria-hidden="true">↓</span>
            </a>
          )}
          {saleRulesUrl && (
            <a
              className="btn sm"
              href={saleRulesUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              Regras da venda <span aria-hidden="true">↗</span>
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
              <div className="uppy" style={{ color: 'var(--fg-3)' }}>
                {isDirectSale ? 'Disponibilidade' : 'Encerra em'}
              </div>
              <div style={{ marginTop: 4 }}>
                {isDirectSale && !p.endsAt
                  ? <span style={{ color: 'var(--fg-2)', fontSize: 13 }}>Sem prazo divulgado</span>
                  : <Countdown until={p.endsAt} dark />}
              </div>
              <div className="mono" style={{ fontSize: 11, color: 'var(--fg-2)', marginTop: 2 }}>
                {p.endsAt
                  ? new Date(p.endsAt).toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' }) + ' · ' + new Date(p.endsAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
                  : isDirectSale ? 'Sujeito à disponibilidade na Caixa' : '—'}
              </div>
            </div>
          </div>

          <div className="divider" style={{ margin: '16px 0' }}></div>

          {/* Pricing labels follow the official sale modality. */}
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
          { v: 'edital', l: isDirectSale ? 'Documentos' : 'Edital', ix: '03' },
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
  const modality = normalizedCostLabel(p.modalidade);
  const isDirectSale = modality.includes('venda direta');
  const isOpenTender = modality.includes('licitacao');
  const isSfiAuction = modality.includes('leilao sfi');
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
        <span className="uppy" style={{ color: 'var(--fg-3)' }}>
          {isDirectSale ? 'Preço de venda' : isOpenTender ? 'Valor mínimo' : '1ª praça'}
        </span>
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
      {isSfiAuction && (
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
      )}
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
  const isDirectSale = isDirectSaleProperty(p);

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
  const confidence = {
    low: { label: 'Baixa', tone: 'bad' },
    medium: { label: 'Média', tone: 'warn' },
    high: { label: 'Alta', tone: 'good' },
  }[md.confidenceLevel];
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
              <h3 className="h2" style={{ marginTop: 4 }}>
                {isDirectSale ? 'Preço de venda vs. avaliação vs. mercado estimado' : 'Lance vs. avaliação vs. mercado estimado'}
              </h3>
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
                <span className="uppy" style={{ color: 'var(--fg-2)' }}>
                  {isDirectSale ? 'Preço de venda' : `Lance mínimo ${has2nd ? '(2ª praça)' : ''}`}
                </span>
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
                <span className="uppy" style={{ color: 'var(--fg-2)' }}>
                  {isDirectSale ? 'Avaliação oficial' : 'Avaliação edital'}
                </span>
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
          <div className="row between" style={{ alignItems: 'flex-start', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
            <div>
              <span className="uppy" style={{ color: 'var(--fg-3)' }}>§ 01.02 · indicadores</span>
              <h3 className="h2" style={{ marginTop: 4 }}>{p.neighborhood} · base 2024–2026</h3>
            </div>
            {confidence && (
              <span className={`tag dot ${confidence.tone}`}>
                Confiabilidade {confidence.label}
              </span>
            )}
          </div>

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
  const isDirectSale = isDirectSaleProperty(p);
  const isOpenTender = isOpenTenderProperty(p);
  const commissionExempt = isDirectSale;
  const {
    renoPct, setRenoPct, monthsToSale, setMonthsToSale,
    target, setTarget, targetCap, exempt, setExempt,
    renoCost, renovationAdjusted, renoRate, regionPricePerM2, isLand,
    projectedCondo, projectedIptu,
    expenseEstimates, setExpenseEstimate, expenseReference,
    evictionCost, evictionAdjusted, setEvictionCost, resetEvictionCost,
    setRenovationCost,
    saleValue, saleBasis, marketSaleSuggestion, appraisalSaleSuggestion,
    setSaleBasis, setCustomSaleValue,
    maxBid, dynamicRows, dynamicTotal, externalCosts, customCosts,
    addCustomCost, removeCustomCost, resetScenarioPreferences, resetExpenseEstimates,
  } = sim;

  if ((dynamicRows || []).length === 0) {
    return (
      <div className="card" style={{ padding: 40, textAlign: 'center' }}>
        <p style={{ color: 'var(--fg-2)', fontSize: 14 }}>Dados de custos não disponíveis para este imóvel.</p>
      </div>
    );
  }

  const bidFloor = Math.max(0, Number(p.minBid) || 0);
  const bidRoom = Math.max(0, maxBid - bidFloor);
  const floorLabel = isDirectSale
    ? 'Preço mínimo da venda'
    : (isOpenTender ? 'Valor mínimo da licitação' : `Valor ${p.praca ? `da ${p.praca}` : 'de praça'}`);
  const externalCostTags = [
    'ITBI',
    commissionExempt ? 'Comissão isenta' : 'Comissão leiloeiro',
    'Registro cartório',
  ];

  return (
    <div>
      {/* ── Simulator ── */}
      <div className="card simulator-card" style={{ padding: 24, marginBottom: 20 }}>
        <div className="row between" style={{ alignItems: 'flex-start', marginBottom: 24, paddingBottom: 20, borderBottom: '1px solid var(--line-1)' }}>
          <div>
            <span className="uppy" style={{ color: 'var(--fg-3)' }}>§ 02.01 · simulador</span>
            <h3 className="h2" style={{ marginTop: 6 }}>Cenário do investidor</h3>
            <p style={{ margin: '6px 0 0', fontSize: 13, color: 'var(--fg-2)' }}>
              Ajuste os controles — os custos abaixo recalculam ao vivo.
            </p>
          </div>
          <button className="btn sm simulator-reset-btn" onClick={() => {
            setRenoPct(isLand ? 0 : 15);
            setMonthsToSale(12);
            setTarget(30);
            setExempt('Primeiro imóvel ou reinvestimento em 180 dias');
            resetScenarioPreferences();
            resetExpenseEstimates();
          }}>
            Resetar
          </button>
        </div>

        <div className="scenario-cost-panel">
          <div className="scenario-cost-panel-head">
            <div>
              <span className="uppy">Custos ajustáveis</span>
              <p>Altere somente as premissas que dependem da sua estratégia.</p>
            </div>
            <span className="mono scenario-saved-note">salvos neste navegador</span>
          </div>
          <div className="scenario-cost-grid">
          <ScenarioMoneyField
            label="Condomínio mensal"
            value={sim.monthlyCondo}
            adjusted={expenseEstimates.condo != null}
            defaultLabel={p.monthlyCondo ? 'Estimativa da cidade' : 'Sem referência cadastrada'}
            suffix="/mês"
            onCommit={(value) => setExpenseEstimate('condo', value)}
            onReset={() => setExpenseEstimate('condo', '')}
          />
          <ScenarioMoneyField
            label="IPTU mensal"
            value={sim.monthlyIptu}
            adjusted={expenseEstimates.iptu != null}
            defaultLabel={p.monthlyIptu ? 'Estimativa da cidade' : 'Sem referência cadastrada'}
            suffix="/mês"
            onCommit={(value) => setExpenseEstimate('iptu', value)}
            onReset={() => setExpenseEstimate('iptu', '')}
          />
          <ScenarioMoneyField
            label="Desocupação"
            value={evictionCost}
            adjusted={evictionAdjusted}
            defaultLabel="Sugestão da plataforma"
            onCommit={setEvictionCost}
            onReset={resetEvictionCost}
          />
          </div>
          <p style={{ gridColumn: '1 / -1', margin: 0, fontSize: 11.5, color: 'var(--fg-2)' }}>
            {expenseReference
              ? `Estimativas para ${expenseReference.city}/${expenseReference.uf}, referência ${expenseReference.referenceYear}: IPTU de ${(expenseReference.annualIptuRate * 100).toLocaleString('pt-BR')}% a.a. sobre a avaliação e condomínio de R$ ${fmtBRL(expenseReference.condoPerM2Monthly)}/m²/mês. Fonte: ${expenseReference.source}`
              : 'Ainda não há referência cadastrada para esta cidade. Você pode inserir estimativas mensais, salvas somente neste navegador.'}
          </p>
          <CustomCostsEditor
            costs={customCosts}
            onAdd={addCustomCost}
            onRemove={removeCustomCost}
          />
        </div>

        {/* Four-card summary rail; the first three preserve the cost equation. */}
        <div className="cost-equation" aria-label="Composição do custo total estimado">
          <div className="cost-equation-card">
            <SimMetric
              lbl={isDirectSale ? 'Proposta máxima recomendada' : 'Lance máximo recomendado'}
              big={`R$ ${fmtBRL(Math.max(0, maxBid))}`}
              sub={`Para atingir ${target}% de retorno líquido`}
              tone="hero"
            >
              <div className="bid-room">
                <div>
                  <span>{floorLabel}</span>
                  <strong>R$ {fmtBRL(bidFloor)}</strong>
                </div>
                <div className="bid-room-delta">
                  <span aria-hidden="true">↕</span>
                  <strong>R$ {fmtBRL(bidRoom)}</strong>
                  <span>{bidRoom > 0 ? 'de margem para trabalhar' : 'sem margem adicional'}</span>
                </div>
              </div>
            </SimMetric>
          </div>
          <span className="cost-equation-operator" aria-hidden="true">+</span>
          <div className="cost-equation-card">
          <SimMetric
            lbl="Custos externos"
            big={`R$ ${fmtBRL(externalCosts)}`}
            sub={isDirectSale ? 'Tudo além da compra: taxas, reforma, débitos' : 'Tudo além do arremate: taxas, reforma, débitos'}
            tone="muted"
          >
            <div className="automatic-cost-tags" aria-label="Custos calculados automaticamente">
              {externalCostTags.map(tag => <span key={tag}>{tag}</span>)}
            </div>
          </SimMetric>
          </div>
          <span className="cost-equation-operator" aria-hidden="true">=</span>
          <div className="cost-equation-card">
          <SimMetric
            lbl="Custo total estimado"
            big={`R$ ${fmtBRL(dynamicTotal)}`}
            sub={isDirectSale ? 'Proposta máxima + demais despesas' : 'Lance máximo + demais despesas'}
            tone="cost"
          >
            <div className="total-equation-copy">
              <span>R$ {fmtBRL(maxBid)}</span>
              <span>+</span>
              <span>R$ {fmtBRL(externalCosts)}</span>
            </div>
          </SimMetric>
          </div>
          <div className="cost-equation-card sale-scenario-context">
            <SaleValueMetric
              value={saleValue}
              basis={saleBasis}
              marketValue={marketSaleSuggestion}
              appraisalValue={appraisalSaleSuggestion}
              onBasisChange={setSaleBasis}
              onValueChange={setCustomSaleValue}
              delta={saleValue - dynamicTotal}
            />
          </div>
        </div>

          {/* Renovation control + months-to-sale + target */}
          <div className="sim-sliders" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 24, marginBottom: 24 }}>
          {/* Renovation — one synchronized value + slider */}
          <div>
            <div className="row between baseline">
              <span className="uppy" style={{ color: 'var(--fg-3)' }}>Nível de reforma</span>
              <RenovationMoneyEditor
                value={renoCost}
                adjusted={renovationAdjusted}
                disabled={isLand}
                onCommit={setRenovationCost}
              />
            </div>
            <input
              type="range" min={0} max={100} value={renoPct}
              onChange={(e) => setRenoPct(+e.target.value)}
              disabled={isLand}
              className="slider"
              style={{ width: '100%', marginTop: 14, '--fill': `${renoPct}%` }}
            />
            <div className="row between" style={{ marginTop: 8 }}>
              <span className="mono" style={{ fontSize: 9.5, letterSpacing: '.06em', color: 'var(--fg-3)' }}>sem reforma</span>
              <span className="mono" style={{ fontSize: 9.5, letterSpacing: '.06em', color: 'var(--fg-3)' }}>completa</span>
            </div>
            <p style={{ margin: '10px 0 0', fontSize: 12, color: 'var(--fg-2)' }}>
              {isLand
                ? 'Terreno não recebe estimativa de reforma'
                : renovationAdjusted
                  ? 'Valor digitado por você · arraste o controle para voltar ao cálculo por intensidade'
                  : `R$ ${renoRate}/m² × ${Math.round(p.area || 0)} m² · cenário ${renoPct}%`}
            </p>
          </div>

          {/* Months to sale */}
          <SliderField
            label="Meses até venda"
            value={monthsToSale}
            onChange={setMonthsToSale}
            display={`${monthsToSale}m`}
            unit=""
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
            unit="%"
            description={target >= targetCap
              ? (isDirectSale
                  ? 'Limite — proposta máxima = preço mínimo da venda'
                  : 'Limite — lance máximo = lance mínimo do leilão')
              : `Após custos, impostos e venda projetada`}
            min={5}
            max={targetCap}
          />
        </div>

        {/* Region price/m² context */}
        <div className="sim-region-strip">
          <span style={{ color: 'var(--fg-3)', textTransform: 'uppercase', letterSpacing: '.06em', fontSize: 10 }}>região</span>
          <b>R$ {fmtBRL(regionPricePerM2)}/m²</b>
          <span className="sep" aria-hidden="true"></span>
          <span style={{ color: 'var(--fg-3)', textTransform: 'uppercase', letterSpacing: '.06em', fontSize: 10 }}>taxa de reforma aplicada</span>
          <b>R$ {fmtBRL(renoRate)}/m²</b>
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
        <div className="row between cost-section-header" style={{ alignItems: 'flex-end', marginBottom: 16 }}>
          <div>
            <span className="uppy" style={{ color: 'var(--fg-3)' }}>§ 02.02 · custo total</span>
            <h3 className="h2" style={{ marginTop: 4 }}>
              {isDirectSale ? 'Da proposta à chave na mão' : 'Da batida do martelo à chave na mão'}
            </h3>
            <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--fg-2)', maxWidth: 540 }}>
              Valores consolidados do cenário acima. Para incluir ou remover gastos adicionais, use “Custos ajustáveis” no § 02.01.
            </p>
          </div>
          <div className="row gap-2">
            <button className="btn sm" disabled title="Disponível em breve."><span className="mono">↓</span> PDF</button>
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
          {dynamicRows.map(r => (
            <CostRow
              key={r.id}
              l={r.label}
              v={r.value}
              hint={r.hint}
              pct={dynamicTotal > 0 ? r.value / dynamicTotal * 100 : 0}
              custom={r.custom}
            />
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
          {isDirectSale
            ? 'ITBI e registro acompanham a proposta recomendada. A comissão é isenta nesta modalidade.'
            : 'Comissão do edital, ITBI e registro acompanham o lance recomendado. As demais premissas são ajustadas no cenário do investidor.'}
        </p>
      </div>
    </div>
  );
}

function ScenarioMoneyField({
  label, value, adjusted, defaultLabel, suffix, onCommit, onReset,
}) {
  const [draft, setDraft] = useState(null);
  const displayedValue = draft == null ? (Number.isFinite(Number(value)) ? String(value) : '') : draft;
  const commit = () => {
    if (draft == null) return;
    if (draft.trim() === '') onReset?.();
    else {
      const amount = Number(draft);
      if (Number.isFinite(amount) && amount >= 0) onCommit?.(amount);
    }
    setDraft(null);
  };

  return (
    <div className="scenario-money-field">
      <label>
        <span className="uppy">{label}</span>
      <div className="scenario-money-input">
        <span>R$</span>
        <input
          type="number" min="0" step="0.01" inputMode="decimal"
          value={displayedValue}
          onFocus={() => setDraft(String(value ?? ''))}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === 'Enter') { event.preventDefault(); event.currentTarget.blur(); }
            if (event.key === 'Escape') setDraft(null);
          }}
          placeholder="0,00" aria-label={label}
        />
        {suffix && <span className="scenario-money-suffix">{suffix}</span>}
      </div>
      </label>
      <div className="scenario-money-meta">
        <span>{adjusted ? 'Valor informado por você' : defaultLabel}</span>
        {adjusted && <button type="button" onClick={onReset}>Restaurar sugestão</button>}
      </div>
    </div>
  );
}

function RenovationMoneyEditor({ value, adjusted, disabled, onCommit }) {
  const [draft, setDraft] = useState(null);
  const displayedValue = draft == null ? String(Math.round(Number(value) || 0)) : draft;
  const commit = () => {
    if (draft == null) return;
    const amount = Number(draft);
    if (Number.isFinite(amount) && amount >= 0) onCommit(amount);
    setDraft(null);
  };

  return (
    <label className={`renovation-money-editor${adjusted ? ' adjusted' : ''}`}>
      <span>R$</span>
      <input
        type="number"
        min="0"
        step="100"
        inputMode="decimal"
        value={displayedValue}
        disabled={disabled}
        onFocus={event => {
          setDraft(String(Math.round(Number(value) || 0)));
          event.currentTarget.select();
        }}
        onChange={event => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={event => {
          if (event.key === 'Enter') { event.preventDefault(); event.currentTarget.blur(); }
          if (event.key === 'Escape') setDraft(null);
        }}
        aria-label="Valor da reforma"
      />
      {adjusted && <span className="renovation-money-status">digitado</span>}
    </label>
  );
}

// Tonal palette — hero (maxBid) leads, good (venda) follows, cost is neutral-bold, muted recedes.
const _tones = {
  hero:   { cardBg: 'var(--accent)',           border: 'var(--accent-strong)', num: '#fff',                 lbl: 'rgba(255,255,255,0.72)', sub: 'rgba(255,255,255,0.78)', chipBg: 'rgba(255,255,255,0.18)', chipFg: '#fff' },
  good:   { cardBg: 'var(--good-soft)',         border: 'var(--good)',           num: 'var(--good)',         lbl: 'var(--fg-3)',            sub: 'var(--fg-2)',            chipBg: 'var(--good)',           chipFg: '#fff' },
  cost:   { cardBg: 'var(--bg-1)',              border: 'var(--line-2)',         num: 'var(--fg-0)',         lbl: 'var(--fg-3)',            sub: 'var(--fg-2)',            chipBg: 'var(--bg-3)',           chipFg: 'var(--fg-1)' },
  muted:  { cardBg: 'var(--bg-1)',              border: 'var(--line-1)',         num: 'var(--fg-1)',         lbl: 'var(--fg-3)',            sub: 'var(--fg-3)',            chipBg: 'transparent',          chipFg: 'var(--fg-2)' },
};
function SimMetric({ lbl, big, sub, tone = 'muted', delta, children }) {
  const t = _tones[tone] || _tones.muted;
  const showDelta = typeof delta === 'number';
  const deltaPos = delta >= 0;
  return (
    <div className={`sim-metric ${tone}`} style={{
      padding: '16px',
      background: t.cardBg,
      borderRadius: 12,
      border: `1px solid ${t.border}`,
      boxShadow: tone === 'hero' ? '0 8px 28px rgba(124,58,237,0.26)' : '0 1px 3px rgba(17,24,39,0.04)',
    }}>
      <span className="uppy" style={{ color: t.lbl, fontSize: 10, letterSpacing: '0.09em' }}>{lbl}</span>
      <div className="num-xl" style={{
        marginTop: 8,
        color: t.num,
        fontSize: tone === 'hero' ? 28 : tone === 'cost' ? 25 : 24,
        fontWeight: tone === 'hero' || tone === 'cost' ? 600 : 500,
        letterSpacing: tone === 'hero' ? '-0.03em' : '-0.02em',
      }}>{big}</div>
      {showDelta && (
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 5,
          marginTop: 8, padding: '4px 10px', borderRadius: 999,
          background: deltaPos ? 'var(--good)' : 'var(--bad)',
          color: '#fff', fontSize: 11, fontWeight: 600,
          fontFamily: 'var(--f-mono)',
        }}>
          <span>{deltaPos ? '▲' : '▼'}</span>
          <span>R$ {fmtBRL(Math.abs(delta))}</span>
          <span style={{ fontWeight: 400, opacity: 0.85 }}>lucro líq.</span>
        </div>
      )}
      {sub && <p style={{ margin: showDelta ? '8px 0 0' : '7px 0 0', fontSize: 11.5, color: t.sub, lineHeight: 1.45 }}>{sub}</p>}
      {children}
    </div>
  );
}

function SaleValueMetric({
  value, basis, marketValue, appraisalValue, onBasisChange, onValueChange, delta,
}) {
  const [draft, setDraft] = useState(null);
  const displayedValue = draft == null ? String(value || 0) : draft;
  const commit = () => {
    if (draft == null || draft.trim() === '') {
      setDraft(null);
      return;
    }
    const amount = Number(draft);
    if (Number.isFinite(amount) && amount >= 0) onValueChange(amount);
    setDraft(null);
  };

  return (
    <div className="sale-value-metric">
      <div className="row between">
        <span className="uppy">Valor de venda no cenário</span>
        {basis === 'custom' && <span className="sale-custom-tag">personalizado</span>}
      </div>
      <div className="sale-value-input">
        {draft == null ? (
          <button type="button" onClick={() => setDraft(String(value || 0))} aria-label="Alterar valor de venda no cenário">
            R$ {fmtBRL(value)}
          </button>
        ) : (
          <>
            <span>R$</span>
            <input
              autoFocus
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              value={displayedValue}
              onChange={event => setDraft(event.target.value)}
              onBlur={commit}
              onKeyDown={event => {
                if (event.key === 'Enter') { event.preventDefault(); event.currentTarget.blur(); }
                if (event.key === 'Escape') setDraft(null);
              }}
              aria-label="Valor de venda no cenário"
            />
          </>
        )}
      </div>
      <div className={`sale-delta ${delta >= 0 ? 'positive' : 'negative'}`}>
        <span>{delta >= 0 ? '▲' : '▼'}</span>
        R$ {fmtBRL(Math.abs(delta))} resultado estimado
      </div>
      <div className="sale-basis-toggle" aria-label="Sugestão para o valor de venda">
        <button
          type="button"
          className={basis === 'market' ? 'active' : ''}
          disabled={marketValue <= 0}
          aria-pressed={basis === 'market'}
          onClick={() => onBasisChange('market')}
        >
          <span>Mercado</span>
          <small>R$ {fmtBRL(marketValue)}</small>
        </button>
        <button
          type="button"
          className={basis === 'appraisal' ? 'active' : ''}
          disabled={appraisalValue <= 0}
          aria-pressed={basis === 'appraisal'}
          onClick={() => onBasisChange('appraisal')}
        >
          <span>Avaliação oficial</span>
          <small>R$ {fmtBRL(appraisalValue)}</small>
        </button>
      </div>
      <p>Escolha uma sugestão ou digite o preço que pretende realizar na venda.</p>
    </div>
  );
}

function CostRow({ l, v, hint, pct, custom, onDelete }) {
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
      <button
        type="button"
        onClick={() => setOpen(current => !current)}
        aria-label={`Explicação de ${l}`}
        aria-expanded={open}
        style={{
        width: 16, height: 16, borderRadius: '50%',
        border: '1px solid var(--line-2)',
        color: 'var(--fg-3)', fontSize: 9,
        fontFamily: 'var(--f-mono)',
      }}>?</button>
      <div>
        <div className="row gap-2" style={{ alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ fontSize: 13.5, color: 'var(--fg-0)' }}>{l}</div>
          {custom && <span className="tag" style={{ padding: '2px 5px', fontSize: 8.5, color: 'var(--accent-strong)' }}>extra</span>}
          {custom && onDelete && (
            <button type="button" className="cost-inline-action danger" onClick={onDelete} aria-label={`Excluir ${l}`}>remover</button>
          )}
        </div>
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
        minWidth: 0, textAlign: 'right', color: v === 0 ? 'var(--fg-3)' : 'var(--fg-0)',
        fontWeight: 500, letterSpacing: '-0.02em',
      }}>R$ {fmtBRL(v)}</span>
    </div>
  );
}

function CustomCostsEditor({ costs, onAdd, onRemove }) {
  return (
    <section className="scenario-extra-costs" aria-labelledby="additional-costs-title">
      <div className="scenario-extra-costs-head">
        <div>
          <span className="uppy" id="additional-costs-title">Gastos adicionais</span>
          <p>Inclua quantos gastos precisar; eles entram automaticamente nos custos externos.</p>
        </div>
        {costs.length > 0 && <span className="mono">{costs.length} {costs.length === 1 ? 'item' : 'itens'}</span>}
      </div>
      <div className="scenario-extra-costs-grid">
        {costs.map(cost => (
          <div className="scenario-extra-cost-item" key={cost.id}>
            <div>
              <span>{cost.label}</span>
              <strong>R$ {fmtBRL(cost.value)}</strong>
            </div>
            <button type="button" onClick={() => onRemove(cost.id)} aria-label={`Remover ${cost.label}`}>×</button>
          </div>
        ))}
        <CustomCostForm onAdd={onAdd} />
      </div>
    </section>
  );
}

function CustomCostForm({ onAdd }) {
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState('');
  const [value, setValue] = useState('');
  const valid = label.trim() && value !== '' && Number.isFinite(Number(value)) && Number(value) >= 0;
  const suggestions = ['Gasolina', 'Transporte', 'Diligências', 'Outras despesas'];

  if (!open) {
    return (
      <button type="button" className="custom-cost-trigger" onClick={() => setOpen(true)}>
        <span className="custom-cost-plus" aria-hidden="true">＋</span>
        <span>
          <strong>Adicionar gasto</strong>
          <small>Gasolina, transporte, diligências ou outro</small>
        </span>
      </button>
    );
  }

  return (
    <form
      className="custom-cost-form"
      onSubmit={event => {
        event.preventDefault();
        if (!valid) return;
        onAdd(label, Number(value));
        setLabel('');
        setValue('');
        setOpen(false);
      }}
    >
      <div className="custom-cost-suggestions">
        <span className="uppy">Sugestões rápidas</span>
        <div className="row gap-2 wrap">
          {suggestions.map(suggestion => (
            <button type="button" key={suggestion} onClick={() => setLabel(suggestion)}>
              {suggestion}
            </button>
          ))}
        </div>
      </div>
      <label>
        <span className="uppy">Descrição do gasto</span>
        <input
          autoFocus
          value={label}
          maxLength={80}
          onChange={event => setLabel(event.target.value)}
          placeholder="Ex.: gasolina para visitar o imóvel"
        />
      </label>
      <label>
        <span className="uppy">Valor</span>
        <div className="custom-cost-money">
          <span>R$</span>
          <input
            type="number"
            min="0"
            step="0.01"
            inputMode="decimal"
            value={value}
            onChange={event => setValue(event.target.value)}
            placeholder="300,00"
          />
        </div>
      </label>
      <div className="row gap-2 custom-cost-actions">
        <button type="button" className="btn sm" onClick={() => { setOpen(false); setLabel(''); setValue(''); }}>Cancelar</button>
        <button type="submit" className="btn sm primary" disabled={!valid}>Adicionar</button>
      </div>
    </form>
  );
}

function SliderField({ label, value, onChange, display, unit = '%', description, min = 0, max = 100 }) {
  const pct = max > min ? ((value - min) / (max - min)) * 100 : 0;
  return (
    <div>
      <div className="row between baseline">
        <span className="uppy" style={{ color: 'var(--fg-3)' }}>{label}</span>
        <span className="mono" style={{ fontSize: 17, fontWeight: 600, color: 'var(--accent)' }}>{display}</span>
      </div>
      <input
        type="range" min={min} max={max} value={value}
        onChange={(e) => onChange(+e.target.value)}
        className="slider"
        style={{ width: '100%', marginTop: 14, '--fill': `${pct}%` }}
      />
      <div className="row between" style={{ marginTop: 8 }}>
        <span className="mono" style={{ fontSize: 9.5, letterSpacing: '.06em', color: 'var(--fg-3)' }}>{min}{unit}</span>
        <span className="mono" style={{ fontSize: 9.5, letterSpacing: '.06em', color: 'var(--fg-3)' }}>{max}{unit}</span>
      </div>
      <p style={{ margin: '10px 0 0', fontSize: 12, color: 'var(--fg-2)', lineHeight: 1.5 }}>{description}</p>
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
  const d = p.editalData || e?.editalData || {};
  const editalUrl = p.editalUrl || e?.editalUrl;
  const matriculaUrl = p.matriculaUrl || e?.matriculaUrl;
  const matricula = p.matricula || d.matricula || e?.matricula;
  const modality = p.modalidade || '';
  const normalizedModality = modality.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const isDirectSale = normalizedModality.includes('venda direta');
  const isOpenTender = normalizedModality.includes('licitacao');
  const commissionExempt = isDirectSale;
  const isSfiAuction = normalizedModality.includes('leilao sfi');
  const saleRulesUrl = d.saleRulesUrl;
  const firstAuctionDate = isDirectSale ? null : (p.firstAuctionAt || e?.firstBidDate || p.endsAt);
  const secondAuctionDate = isDirectSale ? null : (p.secondAuctionAt || e?.secondBidDate);
  const firstAuctionPrice = isDirectSale
    ? (d.minimumSalePrice ?? p.minBid)
    : (p.firstAuctionPrice ?? e?.firstBidPrice ?? p.minBid);
  const secondAuctionPrice = isDirectSale ? null : (p.secondAuctionPrice ?? e?.secondBidPrice);
  const firstAuctionEvent = formatAuctionEvent(firstAuctionDate, firstAuctionPrice);
  const secondAuctionEvent = formatAuctionEvent(secondAuctionDate, secondAuctionPrice);
  const propertyFacts = [
    d.propertyNumber && { label: 'Nº do imóvel', value: d.propertyNumber },
    !isDirectSale && d.lotNumber && { label: 'Item / lote', value: d.lotNumber },
    matricula && { label: 'Matrícula', value: matricula },
    d.registryOffice && { label: 'Cartório / ofício', value: d.registryOffice },
    d.iptuRegistration && { label: 'Inscrição do IPTU', value: d.iptuRegistration },
    d.occupancy && { label: 'Situação', value: d.occupancy },
    d.negativeAuctionRegistration && {
      label: isDirectSale ? 'Averbação dos leilões anteriores' : 'Averbação dos leilões negativos',
      value: d.negativeAuctionRegistration,
    },
    Number(d.minimumSalePrice ?? p.minBid) > 0 && {
      label: 'Valor mínimo', value: `R$ ${fmtBRL(Number(d.minimumSalePrice ?? p.minBid))}`,
    },
    Number(d.appraisalValue ?? p.appraisal) > 0 && {
      label: 'Avaliação', value: `R$ ${fmtBRL(Number(d.appraisalValue ?? p.appraisal))}`,
    },
  ].filter(Boolean);
  const auctionFacts = [
    !isDirectSale && d.auctionNumber && { label: 'Nº da licitação', value: d.auctionNumber },
    modality && { label: 'Modalidade', value: modality },
    firstAuctionEvent && {
      label: isDirectSale ? 'Preço de venda' : isOpenTender ? 'Licitação' : '1º leilão',
      value: firstAuctionEvent,
    },
    isSfiAuction && secondAuctionEvent && { label: '2º leilão', value: secondAuctionEvent },
    !isDirectSale && d.publicationDate && { label: 'Edital publicado em', value: d.publicationDate },
    !isDirectSale && d.resultDate && { label: 'Homologação prevista', value: d.resultDate },
    !isDirectSale && e?.process && { label: 'Processo', value: e.process },
    !isDirectSale && e?.creditor && { label: 'Exequente', value: e.creditor },
    !isDirectSale && e?.debtor && { label: 'Executado', value: e.debtor },
  ].filter(Boolean);
  const auctioneerSite = d.auctioneerSite
    ? (/^https?:\/\//i.test(d.auctioneerSite) ? d.auctioneerSite : `https://${d.auctioneerSite}`)
    : '';
  const auctioneerFacts = [
    d.auctioneerName && { label: 'Leiloeiro oficial', value: d.auctioneerName },
    d.auctioneerRegistration && { label: 'Registro na Junta Comercial', value: d.auctioneerRegistration },
    d.auctioneerSite && {
      label: 'Site',
      value: <a href={auctioneerSite} target="_blank" rel="noopener noreferrer">{d.auctioneerSite} ↗</a>,
    },
    d.auctioneerPhone && { label: 'Telefone', value: d.auctioneerPhone },
    d.auctioneerEmail && {
      label: 'E-mail',
      value: <a href={`mailto:${d.auctioneerEmail}`}>{d.auctioneerEmail}</a>,
    },
  ].filter(Boolean);
  const commissionRate = Number(d.commissionRate);
  const paymentNotes = [
    commissionExempt && {
      label: 'Comissão do leiloeiro', value: 'Comissão isenta nesta modalidade.',
    },
    !commissionExempt && Number.isFinite(commissionRate) && commissionRate > 0 && {
      label: `Comissão do leiloeiro · ${Number((commissionRate * 100).toFixed(2)).toLocaleString('pt-BR')}%`,
      value: d.commissionTerms || 'Percentual informado no edital oficial.',
    },
    !commissionExempt && d.commissionPaymentDeadline && {
      label: 'Pagamento da comissão', value: d.commissionPaymentDeadline,
    },
    d.paymentMethods && { label: 'Formas de pagamento aceitas', value: d.paymentMethods },
    d.cashPaymentDeadline && { label: 'Pagamento da parte à vista', value: d.cashPaymentDeadline },
    d.registeredInstrumentDeadline && {
      label: 'Entrega da escritura/contrato registrado', value: d.registeredInstrumentDeadline,
    },
    d.expenseRules && { label: 'Responsabilidade por despesas', value: d.expenseRules },
  ].filter(Boolean);
  const officialAlerts = [...new Set([
    ...(Array.isArray(d.alerts) ? d.alerts : []),
    ...(!isDirectSale && Array.isArray(e?.liens) ? e.liens : []),
  ].filter(Boolean))];
  const documentSource = p.source?.toLowerCase() === 'caixa'
    ? 'Caixa Econômica Federal'
    : 'Fonte oficial do leilão';
  if (!e && !editalUrl && !matriculaUrl && !matricula && Object.keys(d).length === 0) {
    return (
      <div className="card" style={{ padding: 40, textAlign: 'center' }}>
        <p style={{ color: 'var(--fg-2)', fontSize: 14 }}>
          {isDirectSale
            ? 'Os documentos e dados oficiais desta venda ainda não estão disponíveis.'
            : 'Dados do edital não disponíveis para este imóvel.'}
        </p>
      </div>
    );
  }
  return (
    <div className="card" style={{ padding: 24, fontSize: 13, lineHeight: 1.65 }}>
      <div className="row between edital-header" style={{ alignItems: 'flex-start', marginBottom: 18 }}>
        <div>
          <span className="uppy" style={{ color: 'var(--fg-3)' }}>§ 04 · documentos oficiais</span>
          <h3 className="h2" style={{ marginTop: 4 }}>
            {isDirectSale ? 'Documentos e dados da venda' : 'Edital e matrícula do imóvel'}
          </h3>
          <p style={{ margin: '4px 0 0', fontSize: 12.5, color: 'var(--fg-2)' }}>Fonte: {documentSource}</p>
        </div>
        <div className="row gap-2 edital-document-actions">
          {editalUrl && (
            <a className="btn sm" href={editalUrl} target="_blank" rel="noopener noreferrer" download>
              Baixar edital <span aria-hidden="true">↓</span>
            </a>
          )}
          {matriculaUrl && (
            <a className="btn sm" href={matriculaUrl} target="_blank" rel="noopener noreferrer" download>
              Baixar matrícula <span aria-hidden="true">↓</span>
            </a>
          )}
          {saleRulesUrl && (
            <a className="btn sm" href={saleRulesUrl} target="_blank" rel="noopener noreferrer">
              Regras da venda <span aria-hidden="true">↗</span>
            </a>
          )}
          {auctionUrl && (
            <a className="btn sm edital-auction-link" href={auctionUrl} target="_blank" rel="noopener noreferrer">
              {isDirectSale ? 'Acessar venda' : 'Acessar leilão'} <span aria-hidden="true">↗</span>
            </a>
          )}
        </div>
      </div>
      {isDirectSale && (
        <div className="direct-sale-document-note">
          <strong>Venda direta não é leilão.</strong>
          <span>
            Esta modalidade não possui edital individual, lote, praças, leiloeiro ou comissão de leiloeiro.
            Consulte a matrícula e as regras gerais da Caixa antes de enviar uma proposta.
          </span>
        </div>
      )}
      <EditalFacts title="Dados do imóvel" items={propertyFacts} />
      <EditalFacts title={isDirectSale ? 'Dados da venda' : 'Dados do leilão'} items={auctionFacts} />
      {!commissionExempt && <EditalFacts title="Leiloeiro e contatos" items={auctioneerFacts} />}
      <EditalNotes title={isDirectSale ? 'Pagamento e responsabilidades' : 'Pagamento e prazos'} items={paymentNotes} />
      {(d.propertyDescription || e?.propertyDescription) && (
        <section className="edital-section">
          <h4 className="h3" style={{ marginBottom: 10 }}>Descrição do bem</h4>
          <p style={{ margin: 0, color: 'var(--fg-1)' }}>{d.propertyDescription || e.propertyDescription}</p>
        </section>
      )}
      {officialAlerts.length > 0 && (
        <section className="edital-section">
          <h4 className="h3" style={{ marginBottom: 10 }}>Alertas do documento oficial</h4>
          <ul className="edital-alerts">
            {officialAlerts.map((alert, index) => <li key={`${index}-${alert}`}>{alert}</li>)}
          </ul>
        </section>
      )}
      {!isDirectSale && e?.summaryNote && (
        <div style={{ marginTop: 22, padding: 14, background: 'var(--bg-2)', borderRadius: 6, fontSize: 12, color: 'var(--fg-2)' }}>
          <b style={{ color: 'var(--fg-1)' }}>↳</b> {e.summaryNote}
        </div>
      )}
    </div>
  );
}

function EditalFacts({ title, items }) {
  if (!items.length) return null;
  return (
    <section className="edital-section">
      <h4 className="h3">{title}</h4>
      <div className="edital-facts">
        {items.map(item => <Meta key={item.label} lbl={item.label} val={item.value} />)}
      </div>
    </section>
  );
}

function EditalNotes({ title, items }) {
  if (!items.length) return null;
  return (
    <section className="edital-section">
      <h4 className="h3">{title}</h4>
      <div className="edital-notes">
        {items.map(item => (
          <div className="edital-note" key={item.label}>
            <span className="uppy">{item.label}</span>
            <p>{item.value}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
