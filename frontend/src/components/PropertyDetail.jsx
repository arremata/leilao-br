import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Countdown, Photo, Specs } from './shared';
import { fmtBRL, pracaLabel, mapsQuery } from '../utils';
import { analyzeCatalogItem } from '../api';
import { buildNextSteps, AFTER_PURCHASE_STEPS } from '../content/nextStepsContent';

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

// Nível de reforma escrito como a pergunta de quem vai morar: dá para me mudar
// já, ou preciso mexer antes?
function renovationLevelLabel(pct) {
  if (pct <= 0) return 'pronto para morar, sem obra';
  if (pct <= 15) return 'pintura e pequenos ajustes';
  if (pct < 100) return 'cozinha, banheiros e piso';
  return 'obra completa, imóvel refeito por dentro';
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

// A hora de um leilão é hora civil brasileira. Sem fixar o fuso, quem abrisse
// de fora do país veria um horário diferente do que a Caixa publica.
const SAO_PAULO = 'America/Sao_Paulo';

/** Formato curto usado dentro do card do imóvel: "14 de set. · 10:00". */
function formatAuctionDayTime(value) {
  if (!value) return '';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return String(value);
  const dia = parsed.toLocaleDateString('pt-BR', { day: 'numeric', month: 'short', timeZone: SAO_PAULO });
  const hora = parsed.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: SAO_PAULO });
  return `${dia} · ${hora}`;
}

/** Formato longo, com ano, para o registro oficial na aba de documentos. */
function formatAuctionDate(value) {
  if (!value) return '';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return String(value);
  return parsed.toLocaleString('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: SAO_PAULO,
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

export default function PropertyDetail({ property, watched, toggleWatch }) {
  const isRemoved = property?.status === 'removed';
  // Abre na primeira pergunta que a pessoa faz: quanto vou pagar no total.
  const [tab, setTab] = useState('cost');

  // renoPct: 0 = pronto para morar, 15 = pintura e ajustes, 50 = cozinha e
  // banheiros, 100 = reforma completa.
  const [renoPct, setRenoPct] = useState(() => (
    /terreno|lote|gleba/i.test(property?.type || '') ? 0 : 15
  ));
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

  // A busca do imóvel é responsabilidade de PropertyRoute. Aqui já chega ou o
  // card completo com `enrichment`, ou o card magro da lista enquanto a busca
  // não voltou. `analyzeCatalogItem` continua sendo disparado daqui.
  const [analyzedResult, setAnalyzedResult] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeError, setAnalyzeError] = useState(null);

  const alreadyEnriched = !!property?.marketDetail;
  const enrichment = analyzedResult || property?.enrichment || null;
  const catalogProperty = property;
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
      setAnalyzedResult(result);
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
  const suggestedRenoCost = Math.round(rawRenoRate * (p.area || 0));
  // Condomínio e IPTU não são custo de carregamento até uma revenda: são a
  // conta que chega todo mês depois que a pessoa se muda.
  const monthlyCondo = expenseEstimates.condo != null
    ? Number(expenseEstimates.condo) || 0
    : Number(p.monthlyCondo) || 0;
  const monthlyIptu = expenseEstimates.iptu != null
    ? Number(expenseEstimates.iptu) || 0
    : Number(p.monthlyIptu) || 0;
  const monthlyToLive = monthlyCondo + monthlyIptu;

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

  const minBidFloor = Number(p.minBid) || 0;
  const uf = propertyUf(p);
  const registrationRate = BRAZILIAN_UFS.has(uf) ? (REGISTRATION_RATES[uf] || 0.0075) : null;

  // O enriquecimento fica PERSISTIDO no banco: enquanto as análises antigas não
  // forem recalculadas, elas continuam trazendo as linhas de dívida com valor
  // zero ("IPTU em dia."), a linha de ganho de capital e os rótulos da era do
  // investidor. Corrigir só o backend não basta — o que já está gravado precisa
  // ser normalizado na leitura.
  let sourceRows = (p.costs || [])
    .filter(r => {
      const label = normalizedCostLabel(r.label);
      // Dívida sem valor apurado não vira linha: ausência de evidência não é
      // afirmação de que a dívida não existe.
      if (r.kind === 'debt' && (label.includes('condomínio') || label.includes('condominio'))) return false;
      if (r.kind === 'debt' && label.includes('iptu')) return false;
      // Ganho de capital só existe para quem revende.
      if (label.includes('ganho de capital')) return false;
      return true;
    })
    .map((r, index) => ({ ...r, id: costRowId(r, index), value: Number(r.value) || 0 }))
    .filter(r => r.id !== 'capital_gains')
    // Commission is rebuilt from the current structured edital below. This
    // prevents a stale materialized 5% estimate from overriding official data.
    .filter(r => r.id !== 'auctioneer_commission');

  const ensureCost = (row) => {
    if (!sourceRows.some(item => item.id === row.id)) sourceRows.push(row);
  };
  ensureCost({
    id: 'auction_bid', label: isDirectSale ? 'Preço de venda' : 'Valor da compra', value: minBidFloor,
    hint: isDirectSale
      ? 'Preço que a Caixa pede por este imóvel.'
      : 'Valor mínimo informado para o leilão.',
    kind: 'price',
  });
  const editalData = p.editalData || p.edital?.editalData || {};
  const officialCommissionRate = Number(editalData.commissionRate);
  if (commissionExempt) {
    ensureCost({
      id: 'auctioneer_commission', label: 'Sem comissão de leiloeiro', value: 0, rate: 0,
      hint: `Nesta modalidade você não paga comissão de leiloeiro.`,
      kind: 'fee',
    });
  } else if (Number.isFinite(officialCommissionRate) && officialCommissionRate > 0 && officialCommissionRate <= 0.3) {
    ensureCost({
      id: 'auctioneer_commission',
      label: `Comissão do leiloeiro (${(officialCommissionRate * 100).toLocaleString('pt-BR')}%)`,
      value: Math.round(minBidFloor * officialCommissionRate), rate: officialCommissionRate,
      hint: editalData.commissionTerms || 'Percentual que está nas regras oficiais desta venda. Você paga isso além do lance.',
      kind: 'fee',
    });
  } else {
    ensureCost({
      id: 'auctioneer_commission', label: 'Comissão do leiloeiro · não informada', value: 0,
      hint: 'As regras oficiais não trouxeram esse percentual de forma clara. Confirme antes de dar lance — você paga a comissão além do lance.',
      kind: 'fee',
    });
  }
  if (registrationRate != null) {
    ensureCost({
      id: 'property_registration',
      label: `Registro em cartório (${(registrationRate * 100).toLocaleString('pt-BR')}%)`,
      value: Math.round(minBidFloor * registrationRate), rate: registrationRate,
      hint: 'Estimativa da taxa do cartório para passar o imóvel para o seu nome, com base nas tabelas estaduais de 2025. O valor exato varia; confirme com o cartório.',
      kind: 'fee',
    });
  }
  ensureCost({
    id: 'occupant_removal', label: 'Tirar quem está morando', value: 5000,
    hint: 'Reserva inicial, caso seja preciso desocupar o imóvel. Confirme a situação antes de dar lance e ajuste o valor.',
    kind: 'fee',
  });
  ensureCost({
    id: 'renovation', label: 'Reforma', value: 0,
    hint: 'Quanto você pretende gastar para deixar o imóvel pronto para morar.', kind: 'reno',
  });

  sourceRows = sourceRows.map(r => {
      if (r.id === 'auction_bid' || r.kind === 'price') {
        return {
          ...r,
          id: 'auction_bid',
          label: isDirectSale ? 'Preço de venda' : 'Valor da compra',
          hint: isDirectSale
            ? 'Preço que a Caixa pede por este imóvel.'
            : (r.hint || 'Menor valor aceito nesta rodada do leilão.'),
        };
      }
      if (r.id === 'property_registration') {
        const rate = Number.isFinite(Number(r.rate)) && Number(r.rate) > 0
          ? Number(r.rate)
          : registrationRate;
        if (rate == null) return r;
        return {
          ...r,
          label: `Registro em cartório (${(rate * 100).toLocaleString('pt-BR')}%)`,
          value: Number.isFinite(Number(r.rate)) && Number(r.rate) > 0
            ? r.value
            : Math.round(minBidFloor * rate),
          rate,
          hint: 'Estimativa da taxa do cartório para passar o imóvel para o seu nome, com base nas tabelas estaduais de 2025. O valor exato varia; confirme com o cartório.',
        };
      }
      // O rótulo é reescrito, e não só o valor: análises já gravadas trazem
      // "Desocupação do imóvel · estimativa" e "Reforma estimada", da era do
      // investidor, e não serão recalculadas tão cedo.
      if (r.id === 'occupant_removal') {
        return {
          ...r,
          label: 'Tirar quem está morando',
          value: evictionCost,
          hint: evictionAdjusted
            ? 'Valor informado por você.'
            : 'Reserva inicial de R$ 5.000, caso seja preciso desocupar o imóvel. Confirme a situação antes de dar lance e ajuste o valor.',
        };
      }
      if (r.id === 'renovation' || r.kind === 'reno') {
        return {
          ...r,
          id: 'renovation',
          label: 'Reforma',
          value: renoCost,
          hint: renovationAdjusted
            ? `Valor informado por você. A estimativa para pintura e ajustes neste imóvel é de R$ ${fmtBRL(suggestedRenoCost)}.`
            : `${renovationLevelLabel(renoPct)} — estimativa para ${Math.round(p.area || 0)} m².`,
        };
      }
      if (r.id === 'auctioneer_commission') {
        return { ...r, label: commissionExempt ? 'Sem comissão de leiloeiro' : r.label };
      }
      return r;
    });

  // Condomínio e IPTU mensais não entram no custo até a chave: eles são a conta
  // recorrente de morar no imóvel e aparecem no próprio bloco mensal.

  const rowOrder = {
    auction_bid: 0, itbi: 10, auctioneer_commission: 20,
    property_registration: 30, occupant_removal: 40,
    overdue_iptu: 50, overdue_condo: 51, renovation: 60,
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
  // "Seu limite" é um fato, não um conselho: é o valor de oferta a partir do
  // qual o custo total até a chave ultrapassa o valor de avaliação oficial do
  // imóvel. Não depende de preço de saída, prazo de revenda nem meta de
  // retorno — nada disso existe para quem vai morar.
  const appraisalValue = Math.max(0, Number(p.appraisal) || 0);
  const bidLimitRaw = appraisalValue > 0 && (1 + feeRate) > 0
    ? Math.round((appraisalValue - flatCosts) / (1 + feeRate))
    : 0;
  const hasBidLimit = bidLimitRaw > 0;
  const bidLimit = hasBidLimit ? bidLimitRaw : 0;

  // A pessoa informa quanto pretende oferecer. O padrão é o valor inicial
  // publicado — o que ela pagaria se arrematasse pelo mínimo.
  const offerAdjusted = hasScenarioValue('offer');
  const consideredBid = offerAdjusted
    ? Math.max(0, Number(scenarioPreferences.offer))
    : minBidFloor;
  const offerOverLimit = hasBidLimit && consideredBid > bidLimit;

  const dynamicRows = sourceRows.map(r => {
    if (r.kind === 'price') {
      return {
        ...r, id: 'auction_bid', value: consideredBid,
        hint: offerAdjusted
          ? 'Valor que você pretende oferecer.'
          : (r.hint || 'Valor mínimo publicado para esta venda.'),
      };
    }
    if (_isScalingFee(r)) return { ...r, value: Math.round(consideredBid * rateForRow(r)) };
    return r;
  }).concat(customCosts.map(row => ({
    ...row, value: Math.max(0, Number(row.value) || 0), kind: 'custom', custom: true,
    hint: 'Gasto que você adicionou. Fica salvo neste navegador.',
  })));
  const dynamicTotal = dynamicRows.reduce((total, row) => total + (Number(row.value) || 0), 0);
  const externalCosts = Math.max(0, dynamicTotal - consideredBid);

  const sim = {
    renoPct, setRenoPct: setRenoLevel,
    renoCost, renovationAdjusted, renoRate: appliedRenoRate, regionPricePerM2, isLand,
    monthlyCondo, monthlyIptu, monthlyToLive,
    expenseEstimates, setExpenseEstimate, expenseReference: p.expenseEstimate,
    evictionCost, evictionAdjusted,
    setEvictionCost: (value) => setScenarioPreference('evictionCost', value),
    resetEvictionCost: () => setScenarioPreference('evictionCost', null),
    setRenovationCost: setRenovationBudget,
    appraisalValue, bidLimit, hasBidLimit, offerOverLimit,
    offer: consideredBid, offerAdjusted, minBidFloor,
    setOffer: (value) => setScenarioPreference('offer', value),
    resetOffer: () => setScenarioPreference('offer', null),
    dynamicTotal, dynamicRows,
    externalCosts, customCosts, addCustomCost, removeCustomCost,
    resetScenarioPreferences, resetExpenseEstimates,
  };

  return (
    <div className="page detail-page" style={{ maxWidth: 1480, margin: '0 auto', padding: '20px 24px 80px' }}>

      {/* ===== Breadcrumb + actions ===== */}
      <div className="row between detail-top" style={{ marginBottom: 18 }}>
        <Link
          to="/"
          className="row gap-2"
          style={{ color: 'var(--fg-2)', fontSize: 12.5 }}
        >
          <span className="mono">←</span>
          <span>Imóveis</span>
          <span className="mono" style={{ color: 'var(--fg-3)' }}>/</span>
          <span style={{ color: 'var(--fg-0)' }}>{p.title}</span>
        </Link>
        <div className="row gap-2 detail-actions">
          {auctionUrl && (
            <a
              /* Num imóvel que saiu do catálogo, esta deixa de ser a ação
                 principal: seria convidar a pessoa a dar lance no que não
                 existe mais. O link fica, para ela poder conferir. */
              className={`btn sm${isRemoved ? '' : ' primary'}`}
              href={auctionUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              {isRemoved
                ? 'Conferir na Caixa'
                : isDirectSale ? 'Ver na Caixa' : 'Ver o leilão na Caixa'}
              {' '}<span aria-hidden="true">↗</span>
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
              Baixar as regras <span aria-hidden="true">↓</span>
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
              Baixar a certidão do imóvel <span aria-hidden="true">↓</span>
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
          {!isEnriched && p.canAnalyze && (
            <button
              className="btn sm primary"
              onClick={handleAnalyze}
              disabled={analyzing}
            >
              {analyzing ? 'Calculando…' : 'Calcular os custos'}
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
            <span className="tag accent">{pracaLabel(p.praca) || p.modalidade || p.auctionType}</span>
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
                  ? formatAuctionDayTime(p.endsAt)
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
          { v: 'cost', l: 'Quanto você vai pagar', ix: '01' },
          { v: 'guide', l: 'O que fazer agora', ix: '02' },
          { v: 'market', l: 'Preço na região', ix: '03' },
          { v: 'edital', l: isDirectSale ? 'Documentos' : 'Regras deste leilão', ix: '04' },
          { v: 'legal', l: 'Pendências do imóvel', ix: '05', comingSoon: true },
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
        {tab === 'cost' && <CostBreakdown p={p} sim={sim} />}
        {tab === 'guide' && <NextSteps p={p} />}
        {tab === 'market' && <Market p={p} />}
        {tab === 'legal' && <LegalComingSoon />}
        {tab === 'edital' && <Edital p={p} auctionUrl={auctionUrl} />}
      </div>
      </>) : (
        <AnalyzeCTA
          onAnalyze={handleAnalyze}
          analyzing={analyzing}
          error={analyzeError}
          canAnalyze={p.canAnalyze === true}
        />
      )}
    </div>
  );
}

function AnalyzeCTA({ onAnalyze, analyzing, error, canAnalyze }) {
  const collectionQueued = error?.toLowerCase().includes('priorizada');
  return (
    <div className="card fade-in" style={{ padding: 40, textAlign: 'center', maxWidth: 560, margin: '0 auto' }}>
      <h2 style={{ fontSize: 18, margin: '0 0 8px', color: 'var(--fg-0)' }}>Ainda não calculamos as contas deste imóvel</h2>
      <p style={{ fontSize: 13, color: 'var(--fg-2)', lineHeight: 1.55, margin: canAnalyze ? '0 0 22px' : 0 }}>
        {canAnalyze
          ? 'Você pode pedir o cálculo agora. Vamos somar tudo o que você pagaria até receber a chave e comparar o preço com imóveis parecidos na região.'
          : 'O cálculo ainda não está disponível aqui. Os dados oficiais da Caixa continuam acima.'}
      </p>
      {canAnalyze && (
        <button className="btn primary" onClick={onAnalyze} disabled={analyzing} style={{ minWidth: 180 }}>
          {analyzing ? 'Calculando…' : 'Calcular os custos'}
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
  // O edital guarda a data como ISO, não como texto pronto — renderizá-la
  // direto colocava "2026-09-14T13:00:00+00:00" na tela. formatAuctionDate
  // converte para o fuso de São Paulo e devolve a própria string quando a fonte
  // já vem formatada.
  const firstBidDate = formatAuctionDayTime(p.edital?.firstBidDate || p.firstAuctionAt);
  const secondBidDate = formatAuctionDayTime(p.edital?.secondBidDate || p.secondAuctionAt);
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 16 }}>
      <div>
        <span className="uppy" style={{ color: 'var(--fg-3)' }}>
          {isDirectSale
            ? 'Preço de venda'
            : isOpenTender
              ? 'Valor inicial'
              : `Valor inicial${p.praca ? ` · ${pracaLabel(p.praca)}` : ''}`}
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
            {firstBidPrice > 0 && appraisal > firstBidPrice && (
              <div className="mono" style={{ fontSize: 11, color: 'var(--good)', marginTop: 2 }}>
                R$ {fmtBRL(appraisal - firstBidPrice)} abaixo da avaliação
              </div>
            )}
          </>
        ) : (
          <div style={{ marginTop: 4, fontSize: 13, color: 'var(--fg-3)' }}>
            A Caixa não informou o valor de avaliação deste imóvel.
          </div>
        )}
      </div>
      {isSfiAuction && (
        <div>
          <span className="uppy" style={{ color: 'var(--fg-3)' }}>Se não vender · 2ª rodada</span>
          {has2nd ? (
            <>
              <div className="num-md" style={{ marginTop: 4 }}>R$ {fmtBRL(secondBidPrice)}</div>
              {firstBidPrice > secondBidPrice && (
                <div style={{ fontSize: 11, color: 'var(--good)', fontWeight: 500, marginTop: 2 }}>
                  R$ {fmtBRL(firstBidPrice - secondBidPrice)} a menos
                </div>
              )}
              {secondBidDate && (
                <div className="mono" style={{ fontSize: 11, color: 'var(--fg-3)', marginTop: 2 }}>{secondBidDate}</div>
              )}
            </>
          ) : (
            <>
              <div style={{ marginTop: 4, fontSize: 13, color: 'var(--fg-3)' }}>
                O valor da segunda rodada ainda não foi divulgado.
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
  const filteredIndicators = md.indicators;
  const comparableCount = Array.isArray(md.comparables) ? md.comparables.length : 0;
  // A confiança é comunicada em três estados e em linguagem comum: o que a
  // pessoa precisa saber é se a estimativa se apoia em pouca ou muita evidência.
  const confidence = {
    low: {
      label: 'Estimativa com pouca base',
      tone: 'bad',
      note: comparableCount > 0
        ? `Encontramos ${comparableCount} ${comparableCount === 1 ? 'imóvel parecido' : 'imóveis parecidos'} na região. É pouco para uma estimativa firme.`
        : 'Encontramos poucos imóveis parecidos na região. É pouco para uma estimativa firme.',
    },
    medium: {
      label: 'Estimativa razoável',
      tone: 'warn',
      note: comparableCount > 0
        ? `Baseada em ${comparableCount} ${comparableCount === 1 ? 'imóvel parecido' : 'imóveis parecidos'} na região.`
        : 'Baseada em imóveis parecidos na região.',
    },
    high: {
      label: 'Estimativa bem apoiada',
      tone: 'good',
      note: comparableCount > 0
        ? `Baseada em ${comparableCount} ${comparableCount === 1 ? 'imóvel parecido' : 'imóveis parecidos'} na região.`
        : 'Baseada em imóveis parecidos na região.',
    },
  }[md.confidenceLevel];
  const mapsSearch = encodeURIComponent(mapsQuery(p));
  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${mapsSearch}`;
  const mapsEmbedUrl = `https://www.google.com/maps?q=${mapsSearch}&output=embed`;

  return (
    <div>
      <div className="analysis-grid" style={{ display: 'grid', gridTemplateColumns: '1.1fr 1fr', gap: 16, marginBottom: 16 }}>
        {/* Comparação: preço pedido, avaliação oficial e imóveis parecidos */}
        <div className="card" style={{ padding: 22 }}>
          <div className="row between" style={{ alignItems: 'flex-start', marginBottom: 18 }}>
            <div>
              <h3 className="h2" style={{ marginTop: 4 }}>
                Como este preço se compara
              </h3>
              <p style={{ margin: '6px 0 0', fontSize: 12.5, color: 'var(--fg-2)', lineHeight: 1.5 }}>
                Três números diferentes: o que a Caixa pede, quanto um avaliador
                oficial disse que o imóvel vale, e quanto imóveis parecidos na
                região têm sido vendidos.
              </p>
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
                  {isDirectSale ? 'Preço de venda' : `Valor inicial ${has2nd ? '· 2ª rodada' : ''}`}
                </span>
              </div>
              <div className="row gap-2" style={{ alignItems: 'baseline' }}>
                <span className="num-md" style={{ color: 'var(--accent)' }}>R$ {fmtBRL(bid)}</span>
              </div>
            </div>
            <div className="row between" style={{ alignItems: 'center' }}>
              <div className="row gap-2" style={{ alignItems: 'center' }}>
                <span style={{ width: 10, height: 10, borderRadius: 2, background: 'var(--fg-1)', display: 'inline-block' }}></span>
                <span className="uppy" style={{ color: 'var(--fg-2)' }}>
                  Valor de avaliação
                </span>
              </div>
              <div className="row gap-2" style={{ alignItems: 'baseline' }}>
                <span className="num-md" style={{ color: 'var(--fg-1)' }}>R$ {fmtBRL(appraisal)}</span>
              </div>
            </div>
            <div className="row between" style={{ alignItems: 'center' }}>
              <div className="row gap-2" style={{ alignItems: 'center' }}>
                <span style={{ width: 10, height: 10, borderRadius: 2, background: 'var(--good)', display: 'inline-block' }}></span>
                <span className="uppy" style={{ color: 'var(--fg-2)' }}>
                  Imóveis parecidos na região
                </span>
              </div>
              <div className="row gap-2" style={{ alignItems: 'baseline' }}>
                <span className="num-md" style={{ color: 'var(--good)' }}>R$ {fmtBRL(market)}</span>
                <span className="mono" style={{ fontSize: 11, color: 'var(--fg-3)' }}>estimativa nossa</span>
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
              <div className="uppy" style={{ color: 'var(--fg-3)', fontSize: 10.5, marginBottom: 3 }}>
                comparado a imóveis parecidos
              </div>
              <div style={{ color: 'var(--fg-0)' }}>
                <b style={{ color: gapVsMarket >= 0 ? 'var(--good)' : 'var(--bad)', fontFamily: 'var(--f-mono)' }}>
                  R$ {fmtBRL(Math.abs(gapVsMarket))}
                </b>
              </div>
              <div style={{ fontSize: 11.5, marginTop: 2, color: gapVsMarket >= 0 ? 'var(--good)' : 'var(--bad)' }}>
                {gapVsMarket >= 0 ? 'mais barato' : 'mais caro'}
              </div>
            </div>
            <div style={{
              padding: '11px 13px', borderRadius: 6, fontSize: 12.5,
              background: gapVsAppraisal >= 0 ? 'var(--good-soft)' : 'var(--bad-soft)',
              borderLeft: `3px solid ${gapVsAppraisal >= 0 ? 'var(--good)' : 'var(--bad)'}`,
            }}>
              <div className="uppy" style={{ color: 'var(--fg-3)', fontSize: 10.5, marginBottom: 3 }}>
                comparado ao valor de avaliação
              </div>
              <div style={{ color: 'var(--fg-0)' }}>
                <b style={{ color: gapVsAppraisal >= 0 ? 'var(--good)' : 'var(--bad)', fontFamily: 'var(--f-mono)' }}>
                  R$ {fmtBRL(Math.abs(gapVsAppraisal))}
                </b>
              </div>
              <div style={{ fontSize: 11.5, marginTop: 2, color: gapVsAppraisal >= 0 ? 'var(--good)' : 'var(--bad)' }}>
                {gapVsAppraisal >= 0 ? 'abaixo da avaliação' : 'acima da avaliação'}
              </div>
            </div>
          </div>
        </div>

        {/* § 01.02 — indicadores + valorização */}
        <div className="card" style={{ padding: 22 }}>
          <div className="row between" style={{ alignItems: 'flex-start', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
            <div>
              <h3 className="h2" style={{ marginTop: 4 }}>A região: {p.neighborhood}</h3>
            </div>
            {confidence && (
              <span className={`tag dot ${confidence.tone}`}>
                {confidence.label}
              </span>
            )}
          </div>
          {confidence && (
            <p style={{ margin: '0 0 14px', fontSize: 12.5, color: 'var(--fg-2)', lineHeight: 1.5 }}>
              {confidence.note} Estimativa nossa, não é valor oficial.
            </p>
          )}

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
            <h3 className="h2" style={{ marginTop: 4 }}>Onde fica</h3>
          </div>
          <a className="btn sm" href={mapsUrl} target="_blank" rel="noopener noreferrer">Abrir no Google Maps ↗</a>
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
          <h3 className="h2" style={{ marginTop: 4, marginBottom: 4 }}>Os imóveis que usamos para comparar</h3>
          <p style={{ margin: '0 0 16px', fontSize: 12.5, color: 'var(--fg-2)' }}>
            São anúncios reais de imóveis parecidos na região. Você pode abrir cada um e conferir.
          </p>
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
  const commissionExempt = isDirectSale;
  const {
    renoPct, setRenoPct,
    renoCost, renovationAdjusted, isLand,
    monthlyCondo, monthlyIptu, monthlyToLive,
    expenseEstimates, setExpenseEstimate, expenseReference,
    evictionCost, evictionAdjusted, setEvictionCost, resetEvictionCost,
    setRenovationCost,
    appraisalValue, bidLimit, hasBidLimit, offerOverLimit,
    offer, offerAdjusted, minBidFloor, setOffer, resetOffer,
    dynamicRows, dynamicTotal, externalCosts, customCosts,
    addCustomCost, removeCustomCost, resetScenarioPreferences, resetExpenseEstimates,
  } = sim;

  if ((dynamicRows || []).length === 0) {
    return (
      <div className="card" style={{ padding: 40, textAlign: 'center' }}>
        <p style={{ color: 'var(--fg-2)', fontSize: 14 }}>Ainda não temos os custos deste imóvel.</p>
      </div>
    );
  }

  const externalCostTags = [
    'ITBI',
    commissionExempt ? 'Sem comissão de leiloeiro' : 'Comissão do leiloeiro',
    'Registro em cartório',
  ];
  // Posição da oferta na barra: o limite fica a 75% da largura, para que ficar
  // acima dele seja visível sem estourar o desenho.
  const barPct = hasBidLimit
    ? Math.min(100, (offer / bidLimit) * 75)
    : 0;

  return (
    <div>
      {/* ── Simulator ── */}
      <div className="card simulator-card" style={{ padding: 24, marginBottom: 20 }}>
        <div className="row between" style={{ alignItems: 'flex-start', marginBottom: 24, paddingBottom: 20, borderBottom: '1px solid var(--line-1)' }}>
          <div>
            <h3 className="h2">Quanto você vai pagar até receber a chave</h3>
            <p style={{ margin: '6px 0 0', fontSize: 13, color: 'var(--fg-2)', maxWidth: 560 }}>
              Comece pelo valor que pretende oferecer. Tudo abaixo recalcula sozinho.
            </p>
          </div>
          <button className="btn sm simulator-reset-btn" onClick={() => {
            setRenoPct(isLand ? 0 : 15);
            resetScenarioPreferences();
            resetExpenseEstimates();
          }}>
            Recomeçar
          </button>
        </div>

        {/* Quanto você pretende oferecer + o limite factual */}
        <div className="buyer-offer">
          <div className="buyer-offer-field">
            <span className="uppy">
              {isDirectSale ? 'Quanto você vai pagar' : 'Quanto você pretende oferecer'}
            </span>
            <OfferInput value={offer} onCommit={setOffer} />
            <div className="buyer-offer-meta">
              <span>
                {offerAdjusted
                  ? 'Valor informado por você'
                  : `Valor inicial publicado: R$ ${fmtBRL(minBidFloor)}`}
              </span>
              {offerAdjusted && (
                <button type="button" onClick={resetOffer}>Voltar ao valor inicial</button>
              )}
            </div>
          </div>

          {hasBidLimit ? (
            <div className={`buyer-limit${offerOverLimit ? ' over' : ''}`}>
              <span className="uppy">Seu limite</span>
              <div className="buyer-limit-bar" role="img" aria-label={
                offerOverLimit
                  ? `Sua oferta passa o limite de R$ ${fmtBRL(bidLimit)}`
                  : `Sua oferta está dentro do limite de R$ ${fmtBRL(bidLimit)}`
              }>
                <i style={{ width: `${barPct}%` }} />
                <span className="buyer-limit-mark" style={{ left: '75%' }} />
              </div>
              <strong>até R$ {fmtBRL(bidLimit)}</strong>
              <p>
                {offerOverLimit
                  ? `Com o valor que você digitou, o custo total passa os R$ ${fmtBRL(appraisalValue)} do valor de avaliação do imóvel.`
                  : `Acima de R$ ${fmtBRL(bidLimit)}, o custo total passa os R$ ${fmtBRL(appraisalValue)} do valor de avaliação do imóvel.`}
              </p>
            </div>
          ) : (
            <div className="buyer-limit">
              <span className="uppy">Seu limite</span>
              <p>
                A Caixa não informou o valor de avaliação deste imóvel, então não
                dá para dizer a partir de quanto você passaria a pagar mais do que
                ele vale.
              </p>
            </div>
          )}
        </div>

        {/* ── A conta aberta, item por item ── */}
        <div className="card" style={{ marginTop: 24 }}>
          <div className="cost-head" style={{
            display: 'grid', gridTemplateColumns: '24px minmax(180px, 1fr) 120px minmax(210px, 260px)', gap: 14,
            padding: '10px 20px', background: 'var(--bg-2)',
            fontFamily: 'var(--f-mono)', fontSize: 10.5,
            textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--fg-3)',
          }}>
            <span></span><span>O que você paga</span>
            <span style={{ textAlign: 'right' }}>peso</span>
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
              onDelete={r.custom ? () => removeCustomCost(r.id) : null}
            />
          ))}
          <div className="cost-row" style={{
            display: 'grid', gridTemplateColumns: '24px minmax(180px, 1fr) 120px minmax(210px, 260px)', gap: 14,
            padding: '20px 20px', background: 'var(--bg-2)',
            alignItems: 'baseline', borderTop: '2px solid var(--line-2)',
          }}>
            <span className="mono" style={{ color: 'var(--fg-3)' }}>∑</span>
            <span style={{ fontSize: 15, fontWeight: 600 }}>Total até a chave</span>
            <span></span>
            <span className="num-xl cost-total-value" style={{ textAlign: 'right', color: 'var(--accent)', minWidth: 0 }}>R$ {fmtBRL(dynamicTotal)}</span>
          </div>
        </div>
        <div className="automatic-cost-tags" aria-label="Somados automaticamente" style={{ marginTop: 12 }}>
          {externalCostTags.map(tag => <span key={tag}>{tag}</span>)}
          <span>Fora da compra: R$ {fmtBRL(externalCosts)}</span>
        </div>

        {/* ── Valores que dependem de você ── */}
        <div className="scenario-cost-panel" style={{ marginTop: 24 }}>
          <div className="scenario-cost-panel-head">
            <div>
              <span className="uppy">Valores que dependem de você</span>
              <p>Mude o que quiser. A conta acima acompanha.</p>
            </div>
            <span className="mono scenario-saved-note">salvos neste navegador</span>
          </div>
          <div className="scenario-cost-grid">
            <ScenarioMoneyField
              label="Tirar quem está morando"
              value={evictionCost}
              adjusted={evictionAdjusted}
              defaultLabel="Reserva sugerida por nós"
              onCommit={setEvictionCost}
              onReset={resetEvictionCost}
            />
          </div>

          {/* Reforma — a pergunta é "dá para me mudar já?" */}
          <div style={{ marginTop: 18 }}>
            <div className="row between baseline">
              <span className="uppy" style={{ color: 'var(--fg-3)' }}>
                Precisa de reforma para você se mudar?
              </span>
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
              aria-label="Precisa de reforma para você se mudar?"
            />
            <div className="row between" style={{ marginTop: 8 }}>
              <span style={{ fontSize: 11, color: 'var(--fg-3)' }}>dá para morar já</span>
              <span style={{ fontSize: 11, color: 'var(--fg-3)' }}>precisa refazer tudo</span>
            </div>
            <p style={{ margin: '10px 0 0', fontSize: 12, color: 'var(--fg-2)' }}>
              {isLand
                ? 'Terreno não recebe estimativa de reforma.'
                : renovationAdjusted
                  ? 'Valor digitado por você. Arraste o controle para voltar à nossa estimativa.'
                  : `${renovationLevelLabel(renoPct).charAt(0).toUpperCase()}${renovationLevelLabel(renoPct).slice(1)} — estimativa para ${Math.round(p.area || 0)} m².`}
            </p>
          </div>

          <CustomCostsEditor
            costs={customCosts}
            onAdd={addCustomCost}
            onRemove={removeCustomCost}
          />
        </div>
      </div>

      {/* ── Quanto custa por mês morar aqui ── */}
      <div className="card" style={{ padding: 24 }}>
        <h3 className="h2">Quanto custa por mês morar aqui</h3>
        <p style={{ margin: '6px 0 18px', fontSize: 13, color: 'var(--fg-2)', maxWidth: 620 }}>
          Isso não entra no total acima. É a conta que chega todo mês depois que você se muda.
        </p>
        <div className="scenario-cost-grid">
          <ScenarioMoneyField
            label="Condomínio por mês"
            value={monthlyCondo}
            adjusted={expenseEstimates.condo != null}
            defaultLabel={p.monthlyCondo ? 'Estimativa para a cidade' : 'Não sabemos o valor deste condomínio'}
            suffix="/mês"
            onCommit={(value) => setExpenseEstimate('condo', value)}
            onReset={() => setExpenseEstimate('condo', '')}
          />
          <ScenarioMoneyField
            label="IPTU por mês"
            value={monthlyIptu}
            adjusted={expenseEstimates.iptu != null}
            defaultLabel={p.monthlyIptu ? 'Estimativa para a cidade' : 'Não sabemos o IPTU deste imóvel'}
            suffix="/mês"
            onCommit={(value) => setExpenseEstimate('iptu', value)}
            onReset={() => setExpenseEstimate('iptu', '')}
          />
          {/* Sem referência, o total NÃO é zero: é desconhecido. Mostrar
              "R$ 0,00" afirmaria que morar aqui não custa nada por mês. */}
          <div className="monthly-total">
            <span className="uppy">Por mês, somando</span>
            {monthlyToLive > 0 ? (
              <>
                <strong>R$ {fmtBRL(monthlyToLive)}</strong>
                <span>condomínio + IPTU</span>
              </>
            ) : (
              <>
                <strong className="unknown">Ainda não sabemos</strong>
                <span>digite os valores que descobrir</span>
              </>
            )}
          </div>
        </div>
        <p style={{ margin: '14px 0 0', fontSize: 11.5, color: 'var(--fg-2)' }}>
          {expenseReference
            ? `Estimativa para ${expenseReference.city}/${expenseReference.uf}, com base em ${expenseReference.referenceYear}. Fonte: ${expenseReference.source}. Confirme o condomínio com o síndico antes de decidir.`
            : 'Ainda não temos referência de custo mensal para esta cidade. Você pode digitar os valores que descobrir; eles ficam salvos neste navegador.'}
        </p>
      </div>
    </div>
  );
}

function OfferInput({ value, onCommit }) {
  const [draft, setDraft] = useState(null);
  const displayed = draft == null ? String(Math.round(Number(value) || 0)) : draft;
  const commit = () => {
    if (draft == null) return;
    const amount = Number(draft);
    if (Number.isFinite(amount) && amount >= 0) onCommit(amount);
    setDraft(null);
  };
  return (
    <label className="buyer-offer-input">
      <span>R$</span>
      <input
        type="number" min="0" step="100" inputMode="decimal"
        value={displayed}
        onFocus={() => setDraft(String(Math.round(Number(value) || 0)))}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') { event.preventDefault(); event.currentTarget.blur(); }
          if (event.key === 'Escape') setDraft(null);
        }}
        aria-label="Quanto você pretende oferecer"
      />
    </label>
  );
}

function ScenarioMoneyField({
  label, value, adjusted, defaultLabel, suffix, onCommit, onReset,
}) {
  const [draft, setDraft] = useState(null);
  // Zero sem referência é "não sabemos", não "custa zero": o campo fica vazio
  // com o placeholder, e o rótulo abaixo explica que não temos o dado.
  const displayedValue = draft == null
    ? (Number.isFinite(Number(value)) && Number(value) > 0 ? String(value) : '')
    : draft;
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
          <p>Gasolina para visitar, transporte, o que mais você previr. Entra na conta acima.</p>
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

// ============================================================
// TAB 5 — PENDÊNCIAS DO IMÓVEL (em breve)
// ============================================================
// O nome evita "análise jurídica" e "parecer": o que o produto faz é leitura de
// documento e organização de informação. Esta aba é o destino do trabalho de
// ingestão com citação verificável que está em andamento.
function LegalComingSoon() {
  return (
    <div className="card" style={{ minHeight: 360, display: 'grid', placeItems: 'center', padding: 32, textAlign: 'center' }}>
      <div style={{ maxWidth: 460 }}>
        <span className="tag accent" style={{ display: 'inline-block', marginBottom: 16 }}>em breve</span>
        <h3 className="h1" style={{ marginBottom: 12 }}>Pendências do imóvel</h3>
        <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6, color: 'var(--fg-2)' }}>
          Estamos organizando, em um lugar só, o que os documentos oficiais dizem
          sobre dívidas, processos e restrições deste imóvel — sempre com o trecho
          do documento à vista. Enquanto isso, o que já sabemos está na aba de
          documentos.
        </p>
      </div>
    </div>
  );
}

// ============================================================
// TAB 2 — O QUE FAZER AGORA
// ============================================================
// Estrutura, estados e datas moram aqui. O texto explicativo de cada passo vive
// em `nextStepsContent.js` e é de responsabilidade da revisão editorial: até que
// um passo tenha texto revisado, ele mostra só o rótulo e o prazo. Nunca um
// texto provisório inventado — descrever o que dá errado ao atrasar um prazo é
// afirmação de processo com consequência jurídica.
function NextSteps({ p }) {
  const isDirectSale = isDirectSaleProperty(p);
  const storageKey = p?.id ? `arremate_property_steps_${p.id}` : null;
  const [done, setDone] = useState(() => (
    p?.id ? readStoredObject(`arremate_property_steps_${p.id}`) : {}
  ));

  const toggle = (id) => {
    const next = { ...done };
    if (next[id]) delete next[id];
    else next[id] = true;
    setDone(next);
    if (storageKey) {
      try { localStorage.setItem(storageKey, JSON.stringify(next)); } catch { /* segue utilizável */ }
    }
  };

  const d = p.editalData || p.edital?.editalData || {};
  const steps = buildNextSteps({ property: p, editalData: d, isDirectSale });
  const afterSteps = isDirectSale ? AFTER_PURCHASE_STEPS.direct : AFTER_PURCHASE_STEPS.auction;

  // Fixado na montagem: a contagem de dias não precisa se mover durante a
  // leitura, e ler o relógio durante o render torna o componente impuro.
  const [now] = useState(() => Date.now());
  const deadline = p.endsAt ? new Date(p.endsAt) : null;
  const daysLeft = deadline && !Number.isNaN(deadline.getTime())
    ? Math.ceil((deadline.getTime() - now) / 86400000)
    : null;

  return (
    <div>
      <div className="card" style={{ padding: 24, marginBottom: 16 }}>
        <h3 className="h2">
          {isDirectSale ? 'O que fazer para comprar este imóvel' : 'O que fazer antes do leilão'}
        </h3>
        <p style={{ margin: '6px 0 0', fontSize: 13, color: 'var(--fg-2)', maxWidth: 620 }}>
          {daysLeft != null && daysLeft > 0
            ? `Faltam ${daysLeft} ${daysLeft === 1 ? 'dia' : 'dias'} para o leilão.`
            : isDirectSale
              ? 'Não há disputa nem data: quem fecha primeiro, leva.'
              : 'A data deste leilão não foi divulgada.'}
          {' '}Marque o que já fez. Fica salvo neste navegador.
        </p>
        <ol className="next-steps">
          {steps.map(step => (
            <StepRow key={step.id} step={step} done={!!done[step.id]} onToggle={() => toggle(step.id)} />
          ))}
        </ol>
      </div>

      <div className="card" style={{ padding: 24 }}>
        <h3 className="h2">Depois que o imóvel for seu</h3>
        <p style={{ margin: '6px 0 0', fontSize: 13, color: 'var(--fg-2)', maxWidth: 620 }}>
          A compra não termina no pagamento. Estes são os passos até a chave na mão.
        </p>
        <ol className="next-steps">
          {afterSteps.map(step => (
            <StepRow key={step.id} step={step} done={!!done[step.id]} onToggle={() => toggle(step.id)} />
          ))}
        </ol>
      </div>
    </div>
  );
}

function StepRow({ step, done, onToggle }) {
  return (
    <li className={`next-step${done ? ' done' : ''}`}>
      <button
        type="button"
        onClick={onToggle}
        aria-pressed={done}
        aria-label={done ? `Desmarcar: ${step.label}` : `Marcar como feito: ${step.label}`}
        className="next-step-check"
      >
        {done ? '✓' : ''}
      </button>
      <div className="next-step-body">
        <span className="next-step-label">{step.label}</span>
        {step.body && <p className="next-step-note">{step.body}</p>}
      </div>
      <span className="next-step-when">
        {step.when || (step.hasDeadline ? <em>prazo não informado nos documentos</em> : null)}
      </span>
    </li>
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
    matricula && { label: 'Matrícula (a certidão do imóvel no cartório)', value: matricula },
    d.registryOffice && { label: 'Cartório / ofício', value: d.registryOffice },
    d.iptuRegistration && { label: 'Inscrição do IPTU', value: d.iptuRegistration },
    d.occupancy && { label: 'Tem alguém morando?', value: d.occupancy },
    d.negativeAuctionRegistration && {
      label: 'Leilões anteriores que não venderam',
      value: d.negativeAuctionRegistration,
    },
    Number(d.minimumSalePrice ?? p.minBid) > 0 && {
      label: 'Valor inicial', value: `R$ ${fmtBRL(Number(d.minimumSalePrice ?? p.minBid))}`,
    },
    Number(d.appraisalValue ?? p.appraisal) > 0 && {
      label: 'Valor de avaliação', value: `R$ ${fmtBRL(Number(d.appraisalValue ?? p.appraisal))}`,
    },
  ].filter(Boolean);
  const auctionFacts = [
    !isDirectSale && d.auctionNumber && { label: 'Nº da licitação', value: d.auctionNumber },
    modality && { label: 'Modalidade', value: modality },
    firstAuctionEvent && {
      label: isDirectSale ? 'Preço de venda' : isOpenTender ? 'Data da licitação' : 'Primeira rodada',
      value: firstAuctionEvent,
    },
    isSfiAuction && secondAuctionEvent && { label: 'Segunda rodada', value: secondAuctionEvent },
    !isDirectSale && d.publicationDate && { label: 'Regras publicadas em', value: d.publicationDate },
    !isDirectSale && d.resultDate && { label: 'Resultado previsto para', value: d.resultDate },
    !isDirectSale && e?.process && { label: 'Processo', value: e.process },
    !isDirectSale && e?.creditor && { label: 'Quem está cobrando a dívida', value: e.creditor },
    !isDirectSale && e?.debtor && { label: 'Antigo dono', value: e.debtor },
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
      label: 'Comissão do leiloeiro', value: 'Nesta modalidade você não paga comissão de leiloeiro.',
    },
    !commissionExempt && Number.isFinite(commissionRate) && commissionRate > 0 && {
      label: `Comissão do leiloeiro · ${Number((commissionRate * 100).toFixed(2)).toLocaleString('pt-BR')}%`,
      value: d.commissionTerms || 'Pago por você, além do lance. Não está incluído no preço.',
    },
    !commissionExempt && d.commissionPaymentDeadline && {
      label: 'Pagamento da comissão', value: d.commissionPaymentDeadline,
    },
    d.paymentMethods && { label: 'Como dá para pagar', value: d.paymentMethods },
    d.cashPaymentDeadline && { label: 'Prazo para pagar a parte à vista', value: d.cashPaymentDeadline },
    d.registeredInstrumentDeadline && {
      label: 'Prazo para receber o documento registrado', value: d.registeredInstrumentDeadline,
    },
    d.expenseRules && { label: 'Quem paga cada despesa', value: d.expenseRules },
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
            ? 'Os documentos oficiais desta venda ainda não estão disponíveis.'
            : 'As regras oficiais deste leilão ainda não estão disponíveis aqui.'}
        </p>
      </div>
    );
  }
  return (
    <div className="card" style={{ padding: 24, fontSize: 13, lineHeight: 1.65 }}>
      <div className="row between edital-header" style={{ alignItems: 'flex-start', marginBottom: 18 }}>
        <div>
          <h3 className="h2">
            {isDirectSale ? 'Documentos oficiais desta venda' : 'As regras oficiais deste leilão'}
          </h3>
          <p style={{ margin: '4px 0 0', fontSize: 12.5, color: 'var(--fg-2)' }}>Fonte: {documentSource}</p>
        </div>
        <div className="row gap-2 edital-document-actions">
          {editalUrl && (
            <a className="btn sm" href={editalUrl} target="_blank" rel="noopener noreferrer" download>
              Baixar as regras <span aria-hidden="true">↓</span>
            </a>
          )}
          {matriculaUrl && (
            <a className="btn sm" href={matriculaUrl} target="_blank" rel="noopener noreferrer" download>
              Baixar a certidão do imóvel <span aria-hidden="true">↓</span>
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
          <strong>Isto não é um leilão.</strong>
          <span>
            Aqui não existe disputa, nem rodadas, nem leiloeiro — e por isso você
            não paga comissão de leiloeiro. Quem fecha primeiro leva. Leia a
            certidão do imóvel e as regras da Caixa antes de enviar sua proposta.
          </span>
        </div>
      )}
      <EditalFacts title="Sobre o imóvel" items={propertyFacts} />
      <EditalFacts title={isDirectSale ? 'Sobre a venda' : 'Sobre o leilão'} items={auctionFacts} />
      {!commissionExempt && <EditalFacts title="Quem conduz o leilão" items={auctioneerFacts} />}
      <EditalNotes title="Como e quando você paga" items={paymentNotes} />
      {(d.propertyDescription || e?.propertyDescription) && (
        <section className="edital-section">
          <h4 className="h3" style={{ marginBottom: 10 }}>Como o documento descreve o imóvel</h4>
          <p style={{ margin: 0, color: 'var(--fg-1)' }}>{d.propertyDescription || e.propertyDescription}</p>
        </section>
      )}
      {officialAlerts.length > 0 && (
        <section className="edital-section">
          <h4 className="h3" style={{ marginBottom: 10 }}>O que o documento oficial menciona</h4>
          <p style={{ margin: '0 0 12px', fontSize: 12.5, color: 'var(--fg-2)' }}>
            São trechos copiados do documento, sem alteração. Nós não classificamos
            a gravidade de nenhum deles.
          </p>
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
