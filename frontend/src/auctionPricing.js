function positiveNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function publishedPrice(primary, fallback) {
  return positiveNumber(primary) ?? positiveNumber(fallback);
}

/**
 * Organiza os fatos publicados de um Leilão SFI em torno da rodada vigente.
 *
 * `minBid` representa o preço mínimo vigente normalizado pela API. Os campos
 * específicos de rodada preservam o histórico publicado pela Caixa. Quando a
 * primeira rodada já passou, usar sempre o primeiro preço ao lado de
 * `praca: 2ª praça` mistura dois eventos diferentes.
 */
export function sfiAuctionPricing(property) {
  const p = property || {};
  const currentRound = /2/.test(String(p.praca || '')) ? 2 : 1;
  const firstPublishedPrice = publishedPrice(
    p.firstAuctionPrice,
    p.edital?.firstBidPrice,
  );
  const secondPublishedPrice = publishedPrice(
    p.secondAuctionPrice,
    p.edital?.secondBidPrice,
  );
  const currentMinimum = positiveNumber(p.minBid);
  const first = {
    round: 1,
    price: firstPublishedPrice ?? (currentRound === 1 ? currentMinimum : null),
    date: p.edital?.firstBidDate || p.firstAuctionAt || null,
  };
  const second = {
    round: 2,
    price: secondPublishedPrice ?? (currentRound === 2 ? currentMinimum : null),
    date: p.edital?.secondBidDate || p.secondAuctionAt || null,
  };

  return currentRound === 2
    ? { current: second, previous: first, upcoming: null }
    : { current: first, previous: null, upcoming: second };
}

/**
 * `null` from the current catalog is meaningful: it says there is no verified
 * current deadline. Only fall back when talking to an older API that omitted
 * the field entirely.
 */
export function catalogDeadline(catalogProperty, enrichment) {
  const catalog = catalogProperty || {};
  if (Object.prototype.hasOwnProperty.call(catalog, 'endsAt')) {
    return catalog.endsAt ?? null;
  }
  return enrichment?.endsAt ?? null;
}

/** Historical auction dates do not describe the current direct-sale price. */
export function currentPriceDate(property) {
  const p = property || {};
  if (String(p.modalidade || '').toLowerCase().includes('venda direta')) {
    return null;
  }
  return p.edital?.firstBidDate || p.firstAuctionAt || null;
}
