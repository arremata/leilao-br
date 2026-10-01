import { useMemo, useState } from 'react';
import { glossaryByGroup } from '../content/glossary';

function normalize(value) {
  return String(value || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

/**
 * Dicionário do leilão: todos os verbetes do glossário numa página, por
 * assunto, com busca. Os mesmos textos aparecem nos balões pelo app.
 */
export default function Dictionary() {
  const [query, setQuery] = useState('');
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
        <h1 className="h1">Dicionário do leilão</h1>
        <p>
          As palavras que aparecem nos leilões da Caixa, explicadas sem juridiquês.
          Pelo app, elas aparecem sublinhadas com pontinhos: passe o mouse ou toque
          para ver o que querem dizer.
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
              <div key={entry.key} className="dictionary-entry">
                <dt>{entry.term}</dt>
                <dd>{entry.body}</dd>
              </div>
            ))}
          </dl>
        </section>
      ))}

      <p className="dictionary-note">
        Os textos descrevem as regras gerais das vendas da Caixa. Cada venda tem suas
        regras oficiais (o edital), que valem sobre qualquer explicação daqui.
      </p>
    </main>
  );
}
