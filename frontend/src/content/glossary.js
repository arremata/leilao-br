// Glossário: o que cada termo quer dizer, em uma ou duas frases.
//
// ESTE ARQUIVO É DE RESPONSABILIDADE EDITORIAL, NÃO DE ENGENHARIA.
//
// Aparece num balão quando a pessoa passa o mouse (ou toca, no celular) numa
// palavra sublinhada com pontinhos, e inteiro na página "Dicionário". Mesmas
// regras do guia "O que fazer agora":
//   - Uma ideia por frase. Frase curta.
//   - Segunda pessoa: "você paga", nunca "o arrematante deverá".
//   - Nunca recomendar. Explicar o que é, não o que fazer.
//   - Nunca "análise jurídica", "parecer", "assessoria/consultoria jurídica".
//
// RASCUNHO PARA REVISÃO: os textos descrevem as regras gerais das vendas da
// Caixa. Cada venda tem suas regras oficiais (o edital), que prevalecem.

/** Grupos do dicionário, na ordem em que aparecem na página. */
export const GLOSSARY_GROUPS = [
  { id: 'venda', title: 'Tipos de venda' },
  { id: 'rodadas', title: 'Valores e rodadas' },
  { id: 'situacao', title: 'Situação do imóvel' },
  { id: 'pagamento', title: 'Formas de pagamento' },
  { id: 'custos', title: 'Custos até a chave' },
  { id: 'documentos', title: 'Documentos e cartório' },
  { id: 'processo', title: 'Do lance à chave' },
];

export const GLOSSARY = {
  // ---------- Tipos de venda ----------
  leiloes: {
    group: 'venda',
    term: 'Leilões',
    body: 'Vendas com disputa e data marcada. Aqui entram o Leilão SFI e a licitação aberta.',
  },
  leilao_sfi: {
    group: 'venda',
    term: 'Leilão SFI',
    body: 'Leilão de um imóvel que a Caixa retomou porque o financiamento não foi pago. Acontece em até duas rodadas, em datas marcadas.',
  },
  licitacao_aberta: {
    group: 'venda',
    term: 'Licitação aberta',
    body: 'Disputa pela internet numa data marcada. Todos veem os lances, e vence o maior. Tem uma rodada só.',
  },
  venda_direta: {
    group: 'venda',
    term: 'Venda direta',
    body: 'Compra pelo preço anunciado, sem disputa de lances. A primeira proposta válida fica com o imóvel.',
  },
  modalidade: {
    group: 'venda',
    term: 'Modalidade',
    body: 'O tipo de venda: Leilão SFI, licitação aberta ou venda direta. Cada um tem regras, prazos e custos diferentes.',
  },
  leiloeiro: {
    group: 'venda',
    term: 'Leiloeiro oficial',
    body: 'Profissional registrado na Junta Comercial que conduz o leilão. É ele quem recebe a comissão.',
  },
  imovel_retomado: {
    group: 'venda',
    term: 'Imóvel retomado',
    body: 'Imóvel que voltou para o banco porque o comprador anterior parou de pagar o financiamento.',
  },
  alienacao_fiduciaria: {
    group: 'venda',
    term: 'Alienação fiduciária',
    body: 'Forma de garantia do financiamento: o imóvel fica em nome do banco até a dívida ser paga. Se não for paga, o banco pode retomá-lo e levá-lo a leilão.',
  },

  // ---------- Valores e rodadas ----------
  valor_inicial: {
    group: 'rodadas',
    term: 'Valor inicial',
    body: 'O menor lance aceito nesta rodada. Você pode oferecer mais; ofertas abaixo dele não valem.',
  },
  valor_avaliacao: {
    group: 'rodadas',
    term: 'Valor de avaliação',
    body: 'Quanto a Caixa estimou que o imóvel vale, numa avaliação oficial. É uma referência, não o preço que ele tem no mercado.',
  },
  desconto: {
    group: 'rodadas',
    term: 'Desconto',
    body: 'Quanto o valor inicial está abaixo do valor de avaliação. Não inclui os custos que você paga à parte.',
  },
  imoveis_parecidos: {
    group: 'rodadas',
    term: 'Imóveis parecidos',
    body: 'Preço de anúncios de imóveis semelhantes na mesma região. Serve para comparar com o valor do leilão.',
  },
  confianca_estimativa: {
    group: 'rodadas',
    term: 'Confiança da estimativa',
    body: 'Quanto dá para confiar no preço de imóveis parecidos. Depende de quantos anúncios encontramos, de quão parecidos eles são e de quão próximos estão entre si.',
  },
  rodada: {
    group: 'rodadas',
    term: 'Rodada',
    body: 'Cada data de disputa do leilão. Se ninguém comprar na 1ª rodada, o imóvel vai para a 2ª, com outro valor mínimo.',
  },
  primeira_rodada: {
    group: 'rodadas',
    term: '1ª rodada',
    body: 'Primeira data do leilão. O lance mínimo costuma ser o valor de avaliação do imóvel.',
  },
  segunda_rodada: {
    group: 'rodadas',
    term: '2ª rodada',
    body: 'Acontece só se ninguém comprar na 1ª. O mínimo passa a ser a dívida do financiamento mais as despesas. Por isso costuma ser mais baixo, mas às vezes não é.',
  },
  rodada_unica: {
    group: 'rodadas',
    term: 'Rodada única',
    body: 'A venda tem uma data só de disputa. Não existe 2ª rodada com preço menor.',
  },
  lance: {
    group: 'rodadas',
    term: 'Lance',
    body: 'A oferta de preço que você faz na disputa. Desistir depois de vencer pode gerar multa, conforme as regras da venda.',
  },
  encerrado: {
    group: 'rodadas',
    term: 'Encerrado',
    body: 'A data da disputa já passou. O imóvel pode ter sido vendido ou voltar depois em outra venda.',
  },
  leiloes_anteriores: {
    group: 'rodadas',
    term: 'Leilões anteriores que não venderam',
    body: 'Quantas vezes este imóvel já foi a leilão sem que ninguém comprasse.',
  },

  // ---------- Situação do imóvel ----------
  ocupado: {
    group: 'situacao',
    term: 'Ocupado',
    body: 'A Caixa informa que há alguém morando no imóvel. Tirar quem mora lá, por acordo ou na Justiça, costuma ficar por conta de quem compra.',
  },
  desocupado: {
    group: 'situacao',
    term: 'Desocupado',
    body: 'A Caixa informa que não há ninguém morando no imóvel.',
  },
  ocupacao_nao_informada: {
    group: 'situacao',
    term: 'Ocupação não informada',
    body: 'A Caixa não disse se há alguém morando no imóvel.',
  },
  estado_em_que_se_encontra: {
    group: 'situacao',
    term: 'No estado em que se encontra',
    body: 'A Caixa vende o imóvel como ele está: sem reformar e sem garantir as condições de conservação.',
  },
  imissao_na_posse: {
    group: 'situacao',
    term: 'Imissão na posse',
    body: 'Processo na Justiça para quem comprou conseguir entrar num imóvel ocupado, quando não há acordo com quem mora lá.',
  },
  direito_preferencia: {
    group: 'situacao',
    term: 'Direito de preferência',
    body: 'No Leilão SFI, o antigo dono pode recomprar o imóvel até a data da 2ª rodada, pagando a dívida e as despesas.',
  },

  // ---------- Formas de pagamento ----------
  fgts: {
    group: 'pagamento',
    term: 'FGTS',
    body: 'Você pode usar o saldo do seu FGTS na compra, se você e o imóvel cumprirem as regras do fundo.',
  },
  sem_fgts: {
    group: 'pagamento',
    term: 'Não aceita FGTS',
    body: 'A Caixa não aceita o FGTS como forma de pagamento deste imóvel.',
  },
  financiamento: {
    group: 'pagamento',
    term: 'Financiamento',
    body: 'Você pode pagar parte do valor com crédito imobiliário da Caixa (SBPE), se o crédito for aprovado.',
  },
  sbpe: {
    group: 'pagamento',
    term: 'SBPE',
    body: 'Linha de crédito imobiliário feita com o dinheiro da poupança. É por ela que a Caixa financia imóveis de leilão.',
  },
  so_a_vista: {
    group: 'pagamento',
    term: 'Só à vista',
    body: 'O pagamento é todo com dinheiro seu. Não dá para usar FGTS nem financiamento.',
  },
  recursos_proprios: {
    group: 'pagamento',
    term: 'Recursos próprios',
    body: 'Dinheiro seu, sem FGTS e sem financiamento.',
  },
  prazo_a_vista: {
    group: 'pagamento',
    term: 'Prazo para pagar a parte à vista',
    body: 'Quantos dias você tem, depois de vencer, para pagar a parte que não vem do FGTS nem do financiamento.',
  },

  // ---------- Custos até a chave ----------
  total_ate_a_chave: {
    group: 'custos',
    term: 'Total até a chave',
    body: 'Tudo o que você paga até poder entrar no imóvel: lance, impostos, taxas, desocupação e reforma.',
  },
  itbi: {
    group: 'custos',
    term: 'ITBI',
    body: 'Imposto da prefeitura cobrado quando o imóvel passa para o seu nome. É um percentual do valor da compra.',
  },
  comissao_leiloeiro: {
    group: 'custos',
    term: 'Comissão do leiloeiro',
    body: 'Valor pago ao leiloeiro, em geral 5% do lance. É pago à parte, além do lance. Na venda direta, não existe.',
  },
  registro_cartorio: {
    group: 'custos',
    term: 'Registro em cartório',
    body: 'Taxa do cartório para registrar a compra e passar o imóvel oficialmente para o seu nome.',
  },
  emolumentos: {
    group: 'custos',
    term: 'Emolumentos',
    body: 'Nome oficial das taxas do cartório. O valor segue uma tabela de cada estado.',
  },
  desocupacao: {
    group: 'custos',
    term: 'Desocupação',
    body: 'Quanto você reserva para tirar quem mora no imóvel, por acordo ou por ação na Justiça.',
  },
  reforma: {
    group: 'custos',
    term: 'Reforma',
    body: 'Quanto você pretende gastar para deixar o imóvel pronto para morar. Ele é vendido no estado em que está.',
  },
  iptu: {
    group: 'custos',
    term: 'IPTU',
    body: 'Imposto anual da prefeitura sobre o imóvel. Depois da compra, passa a ser seu.',
  },
  condominio: {
    group: 'custos',
    term: 'Condomínio',
    body: 'Taxa mensal do prédio ou do condomínio. Quem paga as dívidas antigas está nas regras da venda.',
  },
  quem_paga_despesas: {
    group: 'custos',
    term: 'Quem paga cada despesa',
    body: 'Diz se as dívidas de condomínio e de impostos ficam com você ou com a Caixa. Está nas regras da venda.',
  },

  // ---------- Documentos e cartório ----------
  edital: {
    group: 'documentos',
    term: 'Edital (regras da venda)',
    body: 'Documento oficial com todas as regras: datas, valores, pagamento, prazos e quem paga cada despesa. Se algo divergir, vale o edital.',
  },
  matricula: {
    group: 'documentos',
    term: 'Matrícula',
    body: 'A "certidão de nascimento" do imóvel no cartório: mostra os donos e as dívidas registradas.',
  },
  cartorio_oficio: {
    group: 'documentos',
    term: 'Cartório / ofício',
    body: 'O Cartório de Registro de Imóveis onde está a matrícula. "Ofício" é o número desse cartório na cidade.',
  },
  inscricao_iptu: {
    group: 'documentos',
    term: 'Inscrição do IPTU',
    body: 'Número do imóvel no cadastro da prefeitura. É por ele que o IPTU é cobrado.',
  },
  numero_imovel: {
    group: 'documentos',
    term: 'Nº do imóvel',
    body: 'Código deste imóvel no site da Caixa.',
  },
  numero_licitacao: {
    group: 'documentos',
    term: 'Nº da licitação',
    body: 'Número desta venda na Caixa. Serve para achar as regras e acompanhar o resultado.',
  },
  item_lote: {
    group: 'documentos',
    term: 'Item / lote',
    body: 'Número que identifica este imóvel dentro da venda, que pode reunir vários imóveis.',
  },
  processo: {
    group: 'documentos',
    term: 'Processo',
    body: 'Número de um processo na Justiça ligado ao imóvel, quando existe.',
  },
  credor: {
    group: 'documentos',
    term: 'Quem está cobrando a dívida',
    body: 'O credor: quem tem a dívida a receber. Em geral, o banco que financiou o imóvel.',
  },
  antigo_dono: {
    group: 'documentos',
    term: 'Antigo dono',
    body: 'Quem tinha o imóvel e deixou de pagar o financiamento.',
  },

  // ---------- Do lance à chave ----------
  arrematar: {
    group: 'processo',
    term: 'Arrematar',
    body: 'Vencer a disputa: ter o maior lance aceito. Quem vence é chamado de arrematante.',
  },
  homologacao: {
    group: 'processo',
    term: 'Homologação',
    body: 'Quando a Caixa confirma oficialmente o resultado e quem venceu. Os prazos de pagamento costumam contar a partir dela.',
  },
  contrato_caixa: {
    group: 'processo',
    term: 'Contrato com a Caixa',
    body: 'O documento de compra e venda que você assina depois de pagar. É ele que vai para o cartório.',
  },
  prazo_documento_registrado: {
    group: 'processo',
    term: 'Prazo para receber o documento registrado',
    body: 'Tempo até o contrato voltar do cartório com o imóvel já no seu nome.',
  },
  pagamento_comissao: {
    group: 'processo',
    term: 'Pagamento da comissão',
    body: 'Quando e como você paga a comissão do leiloeiro. Costuma ser logo depois de vencer.',
  },
};

// Rótulos que ganham sublinhado e balão pelo app → termo do glossário.
// Só os termos mais importantes para decidir: sublinhar tudo vira ruído. Os
// demais verbetes existem apenas na página "Dicionário". A comparação ignora
// maiúsculas, acentos e o que vem depois de "(" ou "·".
const LABEL_TO_KEY = {
  'leilao sfi': 'leilao_sfi',
  leilao: 'leilao_sfi',
  '1a rodada': 'primeira_rodada',
  '2a rodada': 'segunda_rodada',
  'rodada unica': 'rodada_unica',
  'licitacao aberta': 'licitacao_aberta',
  'venda direta online': 'venda_direta',
  'venda direta': 'venda_direta',
  'valor inicial': 'valor_inicial',
  'valor de avaliacao': 'valor_avaliacao',
  'imoveis parecidos': 'imoveis_parecidos',
  ocupado: 'ocupado',
  desocupado: 'desocupado',
  'ocupacao nao informada': 'ocupacao_nao_informada',
  'aceita fgts': 'fgts',
  'nao aceita fgts': 'sem_fgts',
  'fgts nao informado': 'fgts',
  'aceita financiamento': 'financiamento',
  'so a vista': 'so_a_vista',
  itbi: 'itbi',
  'itbi estimado': 'itbi',
  'comissao do leiloeiro': 'comissao_leiloeiro',
  'registro em cartorio': 'registro_cartorio',
  desocupacao: 'desocupacao',
  'total ate a chave': 'total_ate_a_chave',
};

function normalize(label) {
  return String(label || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[ºª]/g, (ch, offset, text) => (/\d/.test(text[offset - 1] || '') ? 'a' : 'o'))
    .toLowerCase()
    .split(/[(·]/)[0]
    .trim();
}

/** Chave do glossário para um rótulo da tela, ou null. */
export function glossaryKeyFor(label) {
  return LABEL_TO_KEY[normalize(label)] || null;
}

/** Verbetes de um grupo, em ordem alfabética. */
export function glossaryByGroup() {
  return GLOSSARY_GROUPS.map(group => ({
    ...group,
    entries: Object.entries(GLOSSARY)
      .filter(([, entry]) => entry.group === group.id)
      .map(([key, entry]) => ({ key, ...entry }))
      .sort((a, b) => a.term.localeCompare(b.term, 'pt-BR')),
  }));
}
