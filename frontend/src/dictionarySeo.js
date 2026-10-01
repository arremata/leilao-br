// Endereços, títulos e dados estruturados do dicionário público.
//
// Usado pelo app (ao navegar) e pelo script que gera o HTML de cada página no
// build (`scripts/prerender-dictionary.mjs`), para o buscador ler a mesma coisa
// que a pessoa vê. Sem JSX e sem dependência de navegador.

import { GLOSSARY, GLOSSARY_GROUPS, glossaryByGroup } from './content/glossary.js';

export const SITE_URL = 'https://www.argosleiloes.com.br';
export const DICTIONARY_PATH = '/dicionario';

const SITE_NAME = 'Argos';
const DICTIONARY_TITLE = 'Dicionário do leilão de imóveis da Caixa';
const DICTIONARY_DESCRIPTION = 'O que quer dizer cada palavra dos leilões e da venda direta da Caixa: '
  + 'rodadas, valor de avaliação, imóvel ocupado, ITBI, matrícula e outros termos, sem juridiquês.';

/** `leilao_sfi` → `leilao-sfi`. */
export function termSlug(key) {
  return key.replace(/_/g, '-');
}

/** `leilao-sfi` → `leilao_sfi`, ou null quando o verbete não existe. */
export function termKeyFromSlug(slug) {
  const key = String(slug || '').toLowerCase().replace(/-/g, '_');
  return Object.hasOwn(GLOSSARY, key) ? key : null;
}

export function termPath(key) {
  return `${DICTIONARY_PATH}/${termSlug(key)}`;
}

export function groupTitle(groupId) {
  return GLOSSARY_GROUPS.find(group => group.id === groupId)?.title || '';
}

/** Verbete com chave e endereço, ou null. */
export function dictionaryEntry(key) {
  const entry = GLOSSARY[key];
  if (!entry) return null;
  return { key, ...entry, slug: termSlug(key), path: termPath(key), detail: entry.detail || [] };
}

/** Os outros verbetes do mesmo assunto, para seguir lendo. */
export function relatedEntries(key, limit = 6) {
  const entry = GLOSSARY[key];
  if (!entry) return [];
  const group = glossaryByGroup().find(item => item.id === entry.group);
  return (group?.entries || [])
    .filter(item => item.key !== key)
    .slice(0, limit)
    .map(item => dictionaryEntry(item.key));
}

/**
 * Página própria vai para a busca só quando tem texto além da definição curta
 * (`detail` no glossário). Uma página com duas frases concorre com o próprio
 * dicionário e tende a ser tratada como conteúdo raso.
 */
export function isIndexableTerm(key) {
  return (GLOSSARY[key]?.detail || []).length > 0;
}

function clip(text, max = 158) {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).replace(/\s+\S*$/, '')}…`;
}

/** Título, descrição, endereço canônico e indexação de uma página do dicionário. */
export function dictionaryMeta(key = null, siteUrl = SITE_URL) {
  if (!key) {
    return {
      title: `${DICTIONARY_TITLE} | ${SITE_NAME}`,
      description: DICTIONARY_DESCRIPTION,
      canonical: `${siteUrl}${DICTIONARY_PATH}`,
      index: true,
    };
  }
  const entry = dictionaryEntry(key);
  return {
    title: `${entry.term}: o que é no leilão da Caixa | ${SITE_NAME}`,
    description: clip(entry.body),
    canonical: `${siteUrl}${entry.path}`,
    index: isIndexableTerm(key),
  };
}

/** Dados estruturados (schema.org) da página: o conjunto de termos ou um termo. */
export function dictionaryJsonLd(key = null, siteUrl = SITE_URL) {
  const setUrl = `${siteUrl}${DICTIONARY_PATH}`;
  const termSet = { '@type': 'DefinedTermSet', '@id': `${setUrl}#dicionario`, name: DICTIONARY_TITLE, url: setUrl };
  const definedTerm = (entry) => ({
    '@type': 'DefinedTerm',
    '@id': `${siteUrl}${entry.path}#termo`,
    name: entry.term,
    description: entry.body,
    url: `${siteUrl}${entry.path}`,
    inDefinedTermSet: `${setUrl}#dicionario`,
  });

  if (!key) {
    return [{
      '@context': 'https://schema.org',
      ...termSet,
      description: DICTIONARY_DESCRIPTION,
      inLanguage: 'pt-BR',
      hasDefinedTerm: Object.keys(GLOSSARY).map(item => definedTerm(dictionaryEntry(item))),
    }];
  }

  const entry = dictionaryEntry(key);
  return [
    { '@context': 'https://schema.org', ...definedTerm(entry), inDefinedTermSet: termSet },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Dicionário', item: setUrl },
        { '@type': 'ListItem', position: 2, name: entry.term, item: `${siteUrl}${entry.path}` },
      ],
    },
  ];
}

/** Endereços que entram no sitemap. */
export function dictionarySitemapPaths() {
  return [
    DICTIONARY_PATH,
    ...Object.keys(GLOSSARY).filter(isIndexableTerm).map(termPath),
  ];
}
