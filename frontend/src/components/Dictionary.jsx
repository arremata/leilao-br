import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { glossaryByGroup } from '../content/glossary';
import {
  DICTIONARY_PATH,
  dictionaryEntry,
  dictionaryMeta,
  groupTitle,
  relatedEntries,
  termKeyFromSlug,
  termPath,
} from '../dictionarySeo';
import NotFound from './NotFound';

function normalize(value) {
  return String(value || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

function setHeadTag(selector, create, value) {
  let el = document.head.querySelector(selector);
  if (!el) {
    el = create();
    document.head.appendChild(el);
  }
  el.setAttribute(el.tagName === 'LINK' ? 'href' : 'content', value);
  return el;
}

/**
 * Título, descrição e endereço canônico ao navegar dentro do app. Quem chega
 * pelo buscador já recebe tudo no HTML gerado no build; aqui só se mantém o
 * mesmo ao trocar de verbete sem recarregar.
 */
function usePageMeta(meta) {
  useEffect(() => {
    const previousTitle = document.title;
    const description = document.head.querySelector('meta[name="description"]');
    const previousDescription = description?.getAttribute('content');
    document.title = meta.title;
    setHeadTag('meta[name="description"]', () => Object.assign(document.createElement('meta'), { name: 'description' }), meta.description);
    const canonical = setHeadTag('link[rel="canonical"]', () => Object.assign(document.createElement('link'), { rel: 'canonical' }), meta.canonical);
    const robots = setHeadTag('meta[name="robots"]', () => Object.assign(document.createElement('meta'), { name: 'robots' }), meta.index ? 'index, follow' : 'noindex, follow');
    return () => {
      document.title = previousTitle;
      if (previousDescription != null) description.setAttribute('content', previousDescription);
      canonical.remove();
      robots.remove();
    };
  }, [meta.title, meta.description, meta.canonical, meta.index]);
}

function DictionaryNote() {
  return (
    <p className="dictionary-note">
      Os textos descrevem as regras gerais das vendas da Caixa. Cada venda tem suas
      regras oficiais (o edital), que valem sobre qualquer explicação daqui.
    </p>
  );
}

function CatalogInvite() {
  return (
    <aside className="dictionary-cta">
      <p>
        <b>Veja estes termos num imóvel de verdade.</b> No Argos, cada imóvel da Caixa
        mostra a rodada, a ocupação e quanto você paga até receber a chave.
      </p>
      <Link className="btn primary" to="/">Ver os imóveis</Link>
    </aside>
  );
}

/**
 * Dicionário do leilão: todos os verbetes do glossário numa página, por
 * assunto, com busca. Aberto sem login, para quem chega pelo buscador.
 */
export default function Dictionary() {
  usePageMeta(dictionaryMeta());
  const { hash } = useLocation();
  const [query, setQuery] = useState('');
  // Vindo de um verbete ("Dicionário › Assunto"), abre já no assunto.
  useEffect(() => {
    if (hash) document.getElementById(decodeURIComponent(hash.slice(1)))?.scrollIntoView();
  }, [hash]);
  const groups = useMemo(() => {
    const needle = normalize(query.trim());
    return glossaryByGroup()
      .map(group => ({
        ...group,
        entries: needle
          ? group.entries.filter(entry => normalize(`${entry.term} ${entry.body}`).includes(needle))
          : group.entries,
      }))
      .filter(group => group.entries.length > 0);
  }, [query]);
  const total = groups.reduce((sum, group) => sum + group.entries.length, 0);

  return (
    <main className="page dictionary-page">
      <header className="dictionary-head">
        <h1 className="h1">Dicionário do leilão de imóveis</h1>
        <p>
          As palavras que aparecem nos leilões e na venda direta da Caixa, explicadas
          sem juridiquês.
        </p>
        <label className="dictionary-search">
          <span aria-hidden="true">⌕</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Procure uma palavra: ITBI, matrícula, 2ª rodada…"
            aria-label="Procurar no dicionário"
          />
        </label>
        {query && (
          <p className="dictionary-count">
            {total === 0 ? 'Nenhuma palavra encontrada.' : `${total} ${total === 1 ? 'palavra' : 'palavras'}`}
          </p>
        )}
      </header>

      {!query && (
        <nav className="dictionary-index" aria-label="Assuntos">
          {groups.map(group => (
            <a key={group.id} href={`#${group.id}`}>{group.title}</a>
          ))}
        </nav>
      )}

      {groups.map(group => (
        <section key={group.id} id={group.id} className="dictionary-group">
          <h2 className="h2">{group.title}</h2>
          <dl>
            {group.entries.map(entry => (
              <div key={entry.key} id={entry.key} className="dictionary-entry">
                <dt><Link to={termPath(entry.key)}>{entry.term}</Link></dt>
                <dd>{entry.body}</dd>
              </div>
            ))}
          </dl>
        </section>
      ))}

      <CatalogInvite />
      <DictionaryNote />
    </main>
  );
}

/** Um verbete por página: `/dicionario/{termo}`. */
export function DictionaryTerm() {
  const { termo } = useParams();
  const key = termKeyFromSlug(termo);
  if (!key) return <NotFound />;
  return <DictionaryTermPage key={key} termKey={key} />;
}

function DictionaryTermPage({ termKey }) {
  const entry = dictionaryEntry(termKey);
  usePageMeta(dictionaryMeta(termKey));
  const related = relatedEntries(termKey);

  return (
    <main className="page dictionary-page dictionary-term-page">
      <nav className="dictionary-crumbs" aria-label="Você está em">
        <Link to={DICTIONARY_PATH}>Dicionário</Link>
        <span aria-hidden="true">›</span>
        <Link to={`${DICTIONARY_PATH}#${entry.group}`}>{groupTitle(entry.group)}</Link>
      </nav>
      <article>
        <h1 className="h1">{entry.term}</h1>
        <p className="dictionary-term-lead">{entry.body}</p>
        {entry.detail.map(paragraph => <p key={paragraph}>{paragraph}</p>)}
      </article>

      {related.length > 0 && (
        <section className="dictionary-related">
          <h2 className="h2">Outros termos de {groupTitle(entry.group).toLowerCase()}</h2>
          <ul>
            {related.map(item => (
              <li key={item.key}><Link to={item.path}>{item.term}</Link></li>
            ))}
          </ul>
          <Link className="dictionary-all" to={DICTIONARY_PATH}>Ver o dicionário completo</Link>
        </section>
      )}

      <CatalogInvite />
      <DictionaryNote />
    </main>
  );
}
