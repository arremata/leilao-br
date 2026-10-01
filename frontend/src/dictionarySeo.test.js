import test from 'node:test';
import assert from 'node:assert/strict';
import { GLOSSARY } from './content/glossary.js';
import {
  dictionaryJsonLd,
  dictionaryMeta,
  dictionarySitemapPaths,
  isIndexableTerm,
  relatedEntries,
  termKeyFromSlug,
  termPath,
  termSlug,
} from './dictionarySeo.js';

test('every entry has a readable, reversible address', () => {
  for (const key of Object.keys(GLOSSARY)) {
    assert.match(termSlug(key), /^[a-z0-9]+(-[a-z0-9]+)*$/);
    assert.equal(termKeyFromSlug(termSlug(key)), key);
  }
  assert.equal(termPath('leilao_sfi'), '/dicionario/leilao-sfi');
  assert.equal(termKeyFromSlug('nao-existe'), null);
  assert.equal(termKeyFromSlug('constructor'), null);
});

test('the dictionary page is indexable with its own canonical address', () => {
  const meta = dictionaryMeta();
  assert.equal(meta.canonical, 'https://www.argosleiloes.com.br/dicionario');
  assert.equal(meta.index, true);
  assert.ok(meta.description.length <= 170);
  assert.deepEqual(dictionarySitemapPaths()[0], '/dicionario');
});

test('a term page without extra text stays out of search results', () => {
  const key = Object.keys(GLOSSARY).find(item => !isIndexableTerm(item));
  const meta = dictionaryMeta(key);
  assert.equal(meta.index, false);
  assert.ok(!dictionarySitemapPaths().includes(termPath(key)));
  assert.match(meta.title, new RegExp(GLOSSARY[key].term));
  assert.ok(meta.description.length <= 158);
});

test('structured data lists every term once', () => {
  const [set] = dictionaryJsonLd();
  assert.equal(set['@type'], 'DefinedTermSet');
  assert.equal(set.hasDefinedTerm.length, Object.keys(GLOSSARY).length);
  const [term, breadcrumb] = dictionaryJsonLd('itbi');
  assert.equal(term['@type'], 'DefinedTerm');
  assert.equal(term.url, 'https://www.argosleiloes.com.br/dicionario/itbi');
  assert.equal(breadcrumb.itemListElement.length, 2);
});

test('related terms come from the same topic and exclude the term itself', () => {
  const related = relatedEntries('leilao_sfi');
  assert.ok(related.length > 0);
  assert.ok(related.every(item => item.group === GLOSSARY.leilao_sfi.group && item.key !== 'leilao_sfi'));
});
