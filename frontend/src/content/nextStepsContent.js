// Texto do guia "O que fazer agora".
//
// ESTE ARQUIVO É DE RESPONSABILIDADE EDITORIAL, NÃO DE ENGENHARIA.
//
// Cada passo tem três campos:
//   label — o que a pessoa faz. Obrigatório. Verbo no infinitivo, sem jargão.
//   body  — a explicação: o que é, quanto custa, quanto tempo leva, o que
//           acontece se atrasar. OPCIONAL e PROPOSITALMENTE VAZIO até a revisão.
//   when  — o prazo. Vem dos documentos oficiais quando existir; nunca estimado
//           por analogia.
//   hasDeadline — true quando o processo REALMENTE tem um prazo para este passo.
//           Só nesses casos a ausência é uma lacuna, e a interface diz que o
//           prazo não foi informado. "Ver o imóvel por fora" não tem prazo: aí
//           não há nada faltando e nada é dito.
//
// Regras de escrita, do plano de comunicação:
//   - Uma ideia por frase. Frase curta.
//   - Sempre em segunda pessoa: "você vai precisar", nunca "o arrematante deverá".
//   - Nunca recomendar. Instrução de processo, não conselho.
//   - Proibido: "análise jurídica", "parecer", "assessoria jurídica",
//     "consultoria jurídica", "recomendamos", "vale a pena", "você deve".
//
// Enquanto `body` estiver vazio, a interface mostra apenas o rótulo e o prazo.
// Isso é intencional: descrever o que dá errado ao perder um prazo é afirmação
// de processo com consequência jurídica, e não pode ser texto provisório.

/** Passos anteriores à compra, para leilão e licitação. */
export const BEFORE_AUCTION_STEPS = [
  { id: 'read_rules', label: 'Ler as regras deste leilão', body: '' },
  { id: 'check_costs', label: 'Conferir quanto você vai pagar no total', body: '' },
  { id: 'visit', label: 'Ver o imóvel por fora e conhecer a região', body: '' },
  { id: 'check_occupancy', label: 'Descobrir se tem alguém morando no imóvel', body: '' },
  { id: 'credit', label: 'Conseguir o crédito aprovado, se for financiar', body: '' },
  { id: 'register', label: 'Fazer seu cadastro para poder dar lance', body: '', hasDeadline: true },
  { id: 'deposit', label: 'Depositar o valor exigido para participar', body: '', hasDeadline: true },
  { id: 'bid', label: 'Dar o lance', body: '', hasDeadline: true },
];

/** Passos anteriores à compra, para venda direta: não há disputa nem data. */
export const BEFORE_DIRECT_SALE_STEPS = [
  { id: 'read_rules', label: 'Ler as regras desta venda', body: '' },
  { id: 'check_costs', label: 'Conferir quanto você vai pagar no total', body: '' },
  { id: 'visit', label: 'Ver o imóvel por fora e conhecer a região', body: '' },
  { id: 'check_occupancy', label: 'Descobrir se tem alguém morando no imóvel', body: '' },
  { id: 'credit', label: 'Conseguir o crédito aprovado, se for financiar', body: '' },
  { id: 'proposal', label: 'Enviar sua proposta pelo site da Caixa', body: '' },
];

/** Passos posteriores à compra. É onde a dor é maior e ninguém acompanha. */
export const AFTER_PURCHASE_STEPS = {
  auction: [
    { id: 'pay', label: 'Pagar o valor e a comissão', body: '', when: null, hasDeadline: true },
    { id: 'doc', label: 'Receber o documento que prova que o imóvel é seu', body: '', when: null, hasDeadline: true },
    { id: 'itbi', label: 'Pagar o ITBI na prefeitura', body: '', when: null },
    { id: 'registry', label: 'Registrar o imóvel no cartório', body: '', when: null },
    { id: 'move_in', label: 'Entrar no imóvel', body: '', when: 'depende de haver alguém morando' },
  ],
  direct: [
    { id: 'pay', label: 'Pagar o valor combinado', body: '', when: null, hasDeadline: true },
    { id: 'contract', label: 'Assinar o contrato com a Caixa', body: '', when: null, hasDeadline: true },
    { id: 'itbi', label: 'Pagar o ITBI na prefeitura', body: '', when: null },
    { id: 'registry', label: 'Registrar o imóvel no cartório', body: '', when: null },
    { id: 'move_in', label: 'Entrar no imóvel', body: '', when: 'depende de haver alguém morando' },
  ],
};

function formatDate(value) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

/**
 * Monta os passos anteriores à compra e anexa somente os prazos que existem nos
 * documentos oficiais. Um prazo ausente permanece `null` — a interface diz que
 * não foi informado em vez de estimar.
 */
export function buildNextSteps({ property, editalData = {}, isDirectSale }) {
  const steps = isDirectSale ? BEFORE_DIRECT_SALE_STEPS : BEFORE_AUCTION_STEPS;
  const auctionDate = formatDate(property?.endsAt);

  return steps.map(step => {
    let when = null;
    if (step.id === 'bid' && auctionDate) when = auctionDate;
    if (step.id === 'pay' && editalData.cashPaymentDeadline) when = editalData.cashPaymentDeadline;
    return { ...step, when };
  });
}
