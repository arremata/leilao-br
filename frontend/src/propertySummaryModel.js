import { sfiAuctionPricing } from './auctionPricing.js';

const SAO_PAULO = 'America/Sao_Paulo';

// Presentation only: prices keep using the existing official-round resolver.
export function propertySummaryModel(p, schedule, isDirectSale) {
  const pricing = sfiAuctionPricing(p);
  const modality = String(p.modalidade || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const isSfi = modality.includes('leilao sfi');
  const roundState = round => schedule.rounds?.find(item => item.round === round)?.state;
  const stateLabel = round => {
    const state = roundState(round);
    return state === 'ended' ? 'encerrada' : state === 'upcoming' ? 'se não vender' : 'vigente';
  };
  const currentPrice = isSfi ? pricing.current.price : (p.firstAuctionPrice || p.edital?.firstBidPrice || p.minBid);
  const other = pricing.upcoming || pricing.previous;
  const singleEnded = !isSfi && !isDirectSale && schedule.ended === true;
  const rounds = [{
    round: isSfi ? pricing.current.round : null,
    state: isSfi ? (roundState(pricing.current.round) || 'current') : singleEnded ? 'ended' : 'current',
    label: isDirectSale ? 'Preço de venda' : isSfi ? `${pricing.current.round}ª rodada · ${stateLabel(pricing.current.round)}` : 'Valor inicial · rodada única',
    price: currentPrice,
    date: isSfi ? pricing.current.date : (p.edital?.firstBidDate || p.firstAuctionAt),
  }];
  if (isSfi) rounds.push({ round: other?.round, state: roundState(other?.round) || (pricing.upcoming ? 'upcoming' : 'ended'), label: `${other?.round}ª rodada · ${stateLabel(other?.round)}`, price: other?.price, date: other?.date });
  const first = pricing.previous?.price || (pricing.current.round === 1 ? currentPrice : 0);
  const second = pricing.current.round === 2 ? currentPrice : pricing.upcoming?.price;
  const difference = isSfi && first > 0 && second > 0 ? second - first : null;
  const appraisal = Number(p.appraisal) > 0 ? Number(p.appraisal) : null;
  for (const round of rounds) round.appraisalGap = appraisalGap(round.price, appraisal);
  return {
    isSfi, rounds, first, difference, appraisal,
    current: rounds.find(round => round.state === 'current') || null,
    appraisalMatch: rounds.find(round => round.price > 0 && Number(round.price) === Number(p.appraisal)),
  };
}

/** Compara um preço com a avaliação da Caixa; `null` quando falta um dos dois. */
export function appraisalGap(price, appraisal) {
  const value = Number(price);
  if (!(value > 0) || !(appraisal > 0)) return null;
  const amount = value - appraisal;
  const percent = Math.abs(amount) / appraisal * 100;
  return {
    amount,
    tone: amount < 0 ? 'less' : amount > 0 ? 'more' : 'equal',
    percent: percent.toLocaleString('pt-BR', { maximumFractionDigits: percent < 10 ? 1 : 0 }),
  };
}

/** "R$ 230.000" para valores inteiros; centavos só aparecem quando existem. */
export function summaryMoney(value) {
  const number = Number(value);
  if (!(number > 0)) return 'A publicar';
  const cents = Math.round(number * 100) % 100 !== 0;
  return `R$ ${number.toLocaleString('pt-BR', { minimumFractionDigits: cents ? 2 : 0, maximumFractionDigits: cents ? 2 : 0 })}`;
}

/** "08 out. · 10:00", sempre no horário de Brasília, como a Caixa publica. */
export function roundDateLabel(value) {
  if (!value) return '';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return String(value);
  const day = parsed.toLocaleDateString('pt-BR', { day: '2-digit', timeZone: SAO_PAULO });
  const month = parsed.toLocaleDateString('pt-BR', { month: 'short', timeZone: SAO_PAULO }).replace(/\.?$/, '.');
  const time = parsed.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: SAO_PAULO });
  return `${day} ${month} · ${time}`;
}
