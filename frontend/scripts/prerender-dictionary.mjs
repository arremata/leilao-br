// Gera o HTML do dicionário público depois do `vite build`.
//
// O app é montado no navegador: sem isto, o buscador recebe uma página vazia
// em /dicionario. Para cada página o script grava um index.html com título,
// descrição, endereço canônico, dados estruturados e o texto dos verbetes já
// dentro de #root. Quando o JavaScript carrega, o React assume a página.
//
// Também grava sitemap.xml e robots.txt.

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { glossaryByGroup } from '../src/content/glossary.js';
import {
  DICTIONARY_PATH,
  SITE_URL,
  dictionaryEntry,
  dictionaryJsonLd,
  dictionaryMeta,
  dictionarySitemapPaths,
  groupTitle,
  relatedEntries,
  termPath,
} from '../src/dictionarySeo.js';

const dist = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist');
const siteUrl = (process.env.SITE_URL || SITE_URL).replace(/\/$/, '');

const escapeHtml = (value) => String(value)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// `</script>` dentro do JSON fecharia a tag antes da hora.
const jsonForHtml = (value) => JSON.stringify(value).replace(/</g, '\\u003c');

const NOTE = '<p class="dictionary-note">Os textos descrevem as regras gerais das vendas da Caixa. '
  + 'Cada venda tem suas regras oficiais (o edital), que valem sobre qualquer explicação daqui.</p>';
const CTA = '<aside class="dictionary-cta"><p><b>Veja estes termos num imóvel de verdade.</b> '
  + 'No Argos, cada imóvel da Caixa mostra a rodada, a ocupação e quanto você paga até receber a chave.</p>'
  + '<a class="btn primary" href="/">Ver os imóveis</a></aside>';

const INTRO = '<aside class="dictionary-intro"><span class="logo" aria-hidden="true"></span>'
  + '<p><b>Argos</b> reúne os imóveis da Caixa em leilão e venda direta, com a conta de quanto você paga até receber a chave.</p>'
  + '<a class="btn primary sm" href="/">Ver os imóveis</a></aside>';
const STICKY = '<div class="dictionary-sticky"><span>Imóveis da Caixa com a conta completa</span>'
  + '<a class="btn primary sm" href="/">Ver os imóveis</a></div>';

function hubBody() {
  const groups = glossaryByGroup();
  const index = groups.map(group => `<a href="#${group.id}">${escapeHtml(group.title)}</a>`).join('');
  const sections = groups.map(group => {
    const entries = group.entries.map(entry => (
      `<div id="${entry.key}" class="dictionary-entry"><dt><a href="${termPath(entry.key)}">${escapeHtml(entry.term)}</a></dt>`
      + `<dd>${escapeHtml(entry.body)}</dd></div>`
    )).join('');
    return `<section id="${group.id}" class="dictionary-group"><h2 class="h2">${escapeHtml(group.title)}</h2><dl>${entries}</dl></section>`;
  }).join('');
  return `<main class="page dictionary-page">${INTRO}<header class="dictionary-head">`
    + '<h1 class="h1">Dicionário do leilão de imóveis</h1>'
    + '<p>As palavras que aparecem nos leilões e na venda direta da Caixa, explicadas sem juridiquês.</p>'
    + `</header><nav class="dictionary-index" aria-label="Assuntos">${index}</nav>${sections}${CTA}${NOTE}${STICKY}</main>`;
}

function termBody(key) {
  const entry = dictionaryEntry(key);
  const group = groupTitle(entry.group);
  const detail = entry.detail.map(paragraph => `<p>${escapeHtml(paragraph)}</p>`).join('');
  const related = relatedEntries(key)
    .map(item => `<li><a href="${item.path}">${escapeHtml(item.term)}</a></li>`).join('');
  return `<main class="page dictionary-page dictionary-term-page">${INTRO}`
    + `<nav class="dictionary-crumbs" aria-label="Você está em"><a href="${DICTIONARY_PATH}">Dicionário</a>`
    + `<span aria-hidden="true">›</span><a href="${DICTIONARY_PATH}#${entry.group}">${escapeHtml(group)}</a></nav>`
    + `<article><h1 class="h1">${escapeHtml(entry.term)}</h1><p class="dictionary-term-lead">${escapeHtml(entry.body)}</p>${detail}`
    + '<a class="dictionary-term-cta" href="/">Ver imóveis da Caixa à venda agora →</a></article>'
    + (related ? `<section class="dictionary-related"><h2 class="h2">Outros termos de ${escapeHtml(group.toLowerCase())}</h2><ul>${related}</ul>`
      + `<a class="dictionary-all" href="${DICTIONARY_PATH}">Ver o dicionário completo</a></section>` : '')
    + `${CTA}${NOTE}${STICKY}</main>`;
}

function renderPage(shell, key) {
  const meta = dictionaryMeta(key, siteUrl);
  const head = [
    `<link rel="canonical" href="${meta.canonical}" />`,
    `<meta name="robots" content="${meta.index ? 'index, follow' : 'noindex, follow'}" />`,
    '<meta property="og:type" content="article" />',
    '<meta property="og:locale" content="pt_BR" />',
    '<meta property="og:site_name" content="Argos" />',
    `<meta property="og:title" content="${escapeHtml(meta.title)}" />`,
    `<meta property="og:description" content="${escapeHtml(meta.description)}" />`,
    `<meta property="og:url" content="${meta.canonical}" />`,
    ...dictionaryJsonLd(key, siteUrl).map(data => `<script type="application/ld+json">${jsonForHtml(data)}</script>`),
  ].join('\n    ');

  const html = shell
    .replace(/<title>[^<]*<\/title>/, `<title>${escapeHtml(meta.title)}</title>`)
    .replace(/<meta name="description" content="[^"]*" \/>/, `<meta name="description" content="${escapeHtml(meta.description)}" />`)
    .replace('</head>', `  ${head}\n  </head>`)
    .replace('<div id="root"></div>', `<div id="root">${key ? termBody(key) : hubBody()}</div>`);
  const description = html.match(/<meta name="description" content="([^"]*)"/)?.[1];
  if (description !== escapeHtml(meta.description) || html.includes('<div id="root"></div>')) {
    throw new Error('index.html mudou de formato: o dicionário não foi gerado.');
  }
  return html;
}

async function write(path, content) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content);
}

const shell = await readFile(join(dist, 'index.html'), 'utf8');
await write(join(dist, 'dicionario', 'index.html'), renderPage(shell, null));
const keys = glossaryByGroup().flatMap(group => group.entries.map(entry => entry.key));
for (const key of keys) {
  await write(join(dist, 'dicionario', dictionaryEntry(key).slug, 'index.html'), renderPage(shell, key));
}

const urls = dictionarySitemapPaths()
  .map(path => `  <url><loc>${siteUrl}${path}</loc></url>`).join('\n');
await write(join(dist, 'sitemap.xml'),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`);
await write(join(dist, 'robots.txt'),
  `User-agent: *\nDisallow: /api/\n\nSitemap: ${siteUrl}/sitemap.xml\n`);

console.log(`dicionário: ${keys.length + 1} páginas, ${dictionarySitemapPaths().length} no sitemap`);
