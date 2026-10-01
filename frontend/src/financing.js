// Simulação de financiamento imobiliário no modelo da Caixa (SBPE).
//
// É uma estimativa para a pessoa enxergar a própria situação: entrada, parcela,
// renda necessária e dinheiro no dia. Não é proposta de crédito — a aprovação,
// a taxa final, os seguros e a TR dependem da análise da Caixa.

/**
 * Referência das condições da Caixa. Atualização manual, com data e fonte:
 * quando mudar, muda aqui e a tela inteira acompanha.
 */
export const CAIXA_SBPE = {
  updatedAt: '30/09/2026',
  // Juros "a partir de" com relacionamento; sem relacionamento, 11,49% a.a.
  annualRate: 0.1119,
  annualRateNoRelationship: 0.1149,
  monthlyTr: 0.0017, // TR de set/2026, cerca de 0,17% ao mês
  maxQuota: { SAC: 0.8, PRICE: 0.7 },
  maxMonths: 420,
  minMonths: 60,
  maxIncomeShare: 0.3, // parcela de até 30% da renda bruta familiar
  sfhCeiling: 2_250_000,
  adminFee: 25, // tarifa mensal de administração, aproximada
  source: 'Condições divulgadas pela Caixa para o SBPE em 2026.',
};

function amount(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

/** Juros ao mês a partir da taxa anual nominal (divisão por 12, como a Caixa). */
export function monthlyRate(annualRate) {
  return amount(annualRate) / 12;
}

/** Maior valor que a Caixa financia: cota sobre o menor entre compra e avaliação. */
export function maxFinanced({ price, appraisal, system = 'SAC', rules = CAIXA_SBPE }) {
  const base = amount(appraisal) > 0 ? Math.min(amount(price), amount(appraisal)) : amount(price);
  return Math.floor(base * (rules.maxQuota[system] ?? rules.maxQuota.SAC));
}

/**
 * Parcelas sem TR, seguros e tarifa (somados à parte na tela).
 * SAC: amortização fixa, parcela cai todo mês. PRICE: parcela fixa.
 */
export function installments({ principal, months, annualRate, system = 'SAC' }) {
  const loan = amount(principal);
  const n = Math.max(1, Math.round(amount(months)) || 1);
  const i = monthlyRate(annualRate);
  if (!loan) return { first: 0, last: 0, totalPaid: 0, totalInterest: 0 };
  if (system === 'PRICE') {
    const payment = i > 0 ? (loan * i) / (1 - (1 + i) ** -n) : loan / n;
    return { first: payment, last: payment, totalPaid: payment * n, totalInterest: payment * n - loan };
  }
  const amortization = loan / n;
  const first = amortization + loan * i;
  const last = amortization + amortization * i;
  const totalInterest = loan * i * (n + 1) / 2;
  return { first, last, totalPaid: loan + totalInterest, totalInterest };
}

/**
 * A simulação completa para um lance.
 *
 * - `downPayment`: entrada escolhida (nunca abaixo do mínimo da cota).
 * - `fgts`: quanto do FGTS entra na entrada.
 * - `costs`: custos da compra fora do lance (ITBI, comissão, cartório,
 *   desocupação, reforma...). Não são financiados.
 */
export function simulateFinancing({
  price, appraisal, costs = 0, downPayment, fgts = 0, months, annualRate,
  system = 'SAC', income = 0, rules = CAIXA_SBPE,
}) {
  const value = amount(price);
  const cap = Math.min(maxFinanced({ price: value, appraisal, system, rules }), value);
  const minDown = value - cap;
  const down = Math.min(value, Math.max(minDown, amount(downPayment) || minDown));
  const principal = value - down;
  const fgtsUsed = Math.min(amount(fgts), down);
  const plan = installments({ principal, months, annualRate, system });
  const monthlyExtras = principal > 0 ? rules.adminFee : 0;
  const firstWithFee = plan.first + monthlyExtras;
  const minIncome = firstWithFee / rules.maxIncomeShare;
  const incomeValue = amount(income);
  return {
    price: value,
    minDown,
    down,
    principal,
    fgtsUsed,
    cashAtPurchase: down - fgtsUsed + amount(costs),
    ...plan,
    firstWithFee,
    minIncome,
    incomeShare: incomeValue ? firstWithFee / incomeValue : null,
    incomeFits: incomeValue ? firstWithFee <= incomeValue * rules.maxIncomeShare : null,
    aboveSfhCeiling: value > rules.sfhCeiling,
  };
}
