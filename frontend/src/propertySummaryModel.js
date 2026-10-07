import { sfiAuctionPricing } from './auctionPricing.js';

// Presentation only: prices keep using the existing official-round resolver.
export function propertySummaryModel(p, schedule, isDirectSale) {
  const pricing = sfiAuctionPricing(p);
  const modality = String(p.modalidade || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const isSfi = modality.includes('leilao sfi');
  const stateLabel = round => {
    const state = schedule.rounds?.find(item => item.round === round)?.state;
    return state === 'ended' ? 'encerrada' : state === 'upcoming' ? 'se não vender' : 'vigente';
  };
  const currentPrice = isSfi ? pricing.current.price : (p.firstAuctionPrice || p.edital?.firstBidPrice || p.minBid);
  const other = pricing.upcoming || pricing.previous;
  const rounds = [{ round: isSfi ? pricing.current.round : null, label: isDirectSale ? 'Preço de venda' : isSfi ? `${pricing.current.round}ª rodada · ${stateLabel(pricing.current.round)}` : 'Valor inicial · rodada única', price: currentPrice, date: isSfi ? pricing.current.date : (p.edital?.firstBidDate || p.firstAuctionAt) }];
  if (isSfi) rounds.push({ round: other?.round, label: `${other?.round}ª rodada · ${stateLabel(other?.round)}`, price: other?.price, date: other?.date });
  const first = pricing.previous?.price || (pricing.current.round === 1 ? currentPrice : 0);
  const second = pricing.current.round === 2 ? currentPrice : pricing.upcoming?.price;
  const difference = isSfi && first > 0 && second > 0 ? second - first : null;
  return { isSfi, rounds, first, difference, appraisalMatch: rounds.find(round => round.price > 0 && Number(round.price) === Number(p.appraisal)) };
}
