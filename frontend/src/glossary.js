// Balões do dicionário: quais rótulos da tela explicam um verbete.
//
// Só os termos que pesam na decisão ganham balão; marcar toda palavra vira
// ruído. Os textos vêm do dicionário público (ver scripts/sync-glossary.mjs).
import { GLOSSARY } from './content/glossary.generated.js';

export const DICTIONARY_URL = 'https://www.argosleiloes.com.br/dicionario';

// Rótulo da tela → verbete. A comparação ignora maiúsculas, acentos, ponto
// final e o que vem depois de "(" ou "·".
const LABEL_TO_KEY = {
  leilao: 'leilao_sfi',
  'leilao sfi': 'leilao_sfi',
  'licitacao aberta': 'licitacao_aberta',
  'venda direta': 'venda_direta',
  'venda direta online': 'venda_direta',
  '1a rodada': 'primeira_rodada',
  '2a rodada': 'segunda_rodada',
  'rodada unica': 'rodada_unica',
  'valor inicial': 'valor_inicial',
  'valor de avaliacao': 'valor_avaliacao',
  'imoveis parecidos': 'imoveis_parecidos',
  ocupado: 'ocupado',
  desocupado: 'desocupado',
  'ocupacao nao informada': 'ocupacao_nao_informada',
  'aceita fgts': 'fgts',
  'fgts nao informado': 'fgts',
  'nao aceita fgts': 'sem_fgts',
  'aceita financiamento': 'financiamento',
  'so a vista': 'so_a_vista',
  itbi: 'itbi',
  'comissao do leiloeiro': 'comissao_leiloeiro',
  'registro em cartorio': 'registro_cartorio',
  desocupacao: 'desocupacao',
  'total ate a chave': 'total_ate_a_chave',
};

function normalize(label) {
  return String(label || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    // "1ª" vira "1a"; "nº" vira "no".
    .replace(/[ºª]/g, (ch, offset, text) => (/\d/.test(text[offset - 1] || '') ? 'a' : 'o'))
    .toLowerCase()
    .split(/[(·]/)[0]
    .replace(/[.:]+$/, '')
    .trim();
}

/** Verbete de um rótulo da tela, ou null quando não há balão para ele. */
export function glossaryKeyFor(label) {
  return LABEL_TO_KEY[normalize(label)] || null;
}

/** `{ key, term, body, url }` do verbete, ou null. */
export function glossaryEntry(key) {
  const entry = key ? GLOSSARY[key] : null;
  if (!entry) return null;
  return { key, ...entry, url: `${DICTIONARY_URL}/${key.replaceAll('_', '-')}` };
}
