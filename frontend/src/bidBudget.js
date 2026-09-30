// Do orçamento total da pessoa ao maior lance que cabe nele.
//
// O total até a chave é o lance mais os custos. Parte deles cresce com o lance
// (ITBI, comissão, cartório — cada um um percentual arredondado em reais) e
// parte é fixa (desocupação, reforma, gastos que a pessoa adicionou). Invertendo
// essa conta, o orçamento diz até onde o lance pode ir sem estourar o total.

function amount(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

/** Total até a chave para um lance, com o mesmo arredondamento da tabela. */
export function totalForBid({ rates = [], fixed = 0 }, bid) {
  const value = amount(bid);
  return value + rates.reduce((sum, rate) => sum + Math.round(value * rate), 0) + amount(fixed);
}

/** Maior lance, em reais inteiros, cujo total não passa do orçamento. */
export function maxBidForBudget(model, budget) {
  const limit = amount(budget);
  const rateSum = (model.rates || []).reduce((sum, rate) => sum + rate, 0);
  let bid = Math.floor((limit - amount(model.fixed)) / (1 + rateSum));
  if (bid <= 0) return 0;
  // O arredondamento de cada custo desloca o total em alguns reais para um lado
  // ou para o outro: acerta o último real nos dois sentidos.
  while (bid > 0 && totalForBid(model, bid) > limit) bid -= 1;
  while (totalForBid(model, bid + 1) <= limit) bid += 1;
  return bid;
}

/**
 * Resumo para a tela.
 *
 * - `minTotal`: total até a chave dando o valor inicial.
 * - `maxBid`: maior lance que cabe no orçamento.
 * - `headroom`: quanto dá para subir acima do valor inicial (0 se não cabe).
 * - `shortfall`: quanto falta para cobrir o valor inicial e os custos.
 * - `total` / `leftover`: total e sobra do orçamento para o lance simulado.
 */
export function budgetPlan({ model, budget, minBid, bid }) {
  const floor = amount(minBid);
  const current = amount(bid) || floor;
  const minTotal = totalForBid(model, floor);
  const total = totalForBid(model, current);
  const limit = amount(budget);
  if (!limit) {
    return { hasBudget: false, minTotal, total, costs: total - current };
  }
  const maxBid = maxBidForBudget(model, limit);
  return {
    hasBudget: true,
    minTotal,
    total,
    costs: total - current,
    maxBid,
    fits: minTotal <= limit,
    headroom: Math.max(0, maxBid - floor),
    shortfall: Math.max(0, minTotal - limit),
    leftover: limit - total,
  };
}
