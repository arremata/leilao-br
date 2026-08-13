import { useEffect, useMemo, useState } from 'react';
import { fmtBRL } from '../utils';
import { fetchCatalogItem } from '../api';

export default function History({ go, history, clearHistory, properties }) {
  const [detailCache, setDetailCache] = useState({});
  const grouped = useMemo(() => {
    const today = new Date().setHours(0, 0, 0, 0);
    const yesterday = today - 86400000;
    const groups = [
      { label: 'Hoje', entries: [] },
      { label: 'Ontem', entries: [] },
      { label: 'Anteriores', entries: [] },
    ];
    history.forEach(entry => {
      if (entry.ts >= today) groups[0].entries.push(entry);
      else if (entry.ts >= yesterday) groups[1].entries.push(entry);
      else groups[2].entries.push(entry);
    });
    return groups.filter(g => g.entries.length > 0);
  }, [history]);

  useEffect(() => {
    let cancelled = false;
    const liveIds = [...new Set(
      history
        .map(entry => entry.id)
        .filter(id => properties.some(property => property.id === id)),
    )];
    Promise.all(liveIds.map(async id => [id, await fetchCatalogItem(id)]))
      .then(entries => {
        if (!cancelled) setDetailCache(Object.fromEntries(entries));
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [history, properties]);

  return (
    <div className="page" style={{ maxWidth: 1480, margin: '0 auto', padding: '28px 28px 80px' }}>

      <div className="row between page-header fade-in" style={{ alignItems: 'flex-end', marginBottom: 32 }}>
        <div>
          <div className="eyebrow" style={{ marginBottom: 6 }}>
            <span className="ix">§ histórico</span>
            <span>imóveis visualizados</span>
          </div>
          <h1 className="h1">Histórico</h1>
          <p style={{ margin: '4px 0 0', color: 'var(--fg-2)', fontSize: 14 }}>
            {history.length === 0
              ? 'Nenhuma visita registrada.'
              : `${history.length} ${history.length === 1 ? 'imóvel visitado' : 'imóveis visitados'}.`}
          </p>
        </div>
        {history.length > 0 && (
          <div className="row gap-2 page-actions">
            <button className="btn ghost sm" onClick={clearHistory} style={{ color: 'var(--bad)' }}>
              Limpar histórico
            </button>
          </div>
        )}
      </div>

      {history.length === 0 ? (
        <div className="card" style={{ padding: 64, textAlign: 'center' }}>
          <div style={{ fontSize: 40, color: 'var(--fg-3)', marginBottom: 16 }}>◷</div>
          <h3 className="h3" style={{ marginBottom: 8 }}>Nenhuma visita registrada</h3>
          <p style={{ margin: '0 0 20px', color: 'var(--fg-2)', fontSize: 14 }}>
            Imóveis abertos aparecem aqui automaticamente.
          </p>
          <button className="btn" onClick={() => go('feed')}>Explorar feed</button>
        </div>
      ) : (
        <div className="col gap-8">
          {grouped.map(group => (
            <section key={group.label} className="fade-in">
              <div className="uppy" style={{ color: 'var(--fg-3)', marginBottom: 12, paddingLeft: 4 }}>
                {group.label}
              </div>
              <div className="card" style={{ overflow: 'hidden' }}>
                {group.entries.map((entry, i) => {
                  const liveProperty = properties.find(p => p.id === entry.id);
                  return (
                    <HistoryRow
                      key={entry.id + entry.ts}
                      entry={entry}
                      liveProperty={liveProperty}
                      detail={detailCache[entry.id]}
                      last={i === group.entries.length - 1}
                      onClick={() => liveProperty && go('detail', liveProperty)}
                    />
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function HistoryRow({ entry, liveProperty, detail, last, onClick }) {
  const live = !!liveProperty;
  const enrichment = detail?.enrichment;
  const property = liveProperty
    ? { ...entry, ...liveProperty, ...detail, ...(enrichment || {}), ts: entry.ts }
    : entry;
  const hasAnalysis = !!enrichment;
  const ts = new Date(entry.ts);
  const timeStr = ts.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const dateStr = ts.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });

  return (
    <div
      className={`history-row${live ? ' is-clickable' : ''}`}
      onClick={live ? onClick : undefined}
      style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(280px, 1.55fr) minmax(190px, .75fr) minmax(210px, .85fr) minmax(245px, 1fr) 72px',
        gap: 24, padding: '18px 22px',
        borderBottom: last ? 'none' : '1px solid var(--line-1)',
        alignItems: 'center',
        cursor: live ? 'pointer' : 'default',
        opacity: live ? 1 : 0.55,
        transition: 'background .15s',
      }}
      role={live ? 'button' : undefined}
      aria-label={live ? `Abrir detalhes de ${property.title || property.address || 'imóvel'}` : undefined}
      title={live ? 'Abrir detalhes do imóvel' : undefined}
      tabIndex={live ? 0 : undefined}
      onKeyDown={e => { if (live && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onClick(); } }}
    >
      <div>
        <div style={{ fontSize: 14, fontWeight: 500, lineHeight: 1.25 }}>{property.title || property.address || 'Imóvel sem título'}</div>
        <div style={{ fontSize: 11.5, color: 'var(--fg-2)', marginTop: 2 }}>
          {[property.neighborhood, property.city, property.type, property.modalidade || property.auctionType].filter(Boolean).join(' · ') || 'Informações não disponíveis'}
        </div>
        <div className="history-mobile-time mono" style={{ fontSize: 10.5, color: 'var(--fg-3)', marginTop: 5 }}>{dateStr} · {timeStr}</div>
      </div>

      <div className="history-money-cell">
        <div className="num-sm" style={{ color: 'var(--fg-0)' }}>{property.minBid > 0 ? `R$ ${fmtBRL(property.minBid)}` : '—'}</div>
        <div className="mono" style={{ fontSize: 11, color: 'var(--fg-2)' }}>lance mín.</div>
      </div>

      <div className="history-money-cell">
        <div className="num-sm" style={{ color: 'var(--fg-1)' }}>{property.appraisal > 0 ? `R$ ${fmtBRL(property.appraisal)}` : '—'}</div>
        <div className="mono" style={{ fontSize: 11, color: 'var(--fg-2)' }}>
          {Number.isFinite(property.auctionDiscount) ? `${property.auctionDiscount.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}% oficial` : 'avaliação'}
        </div>
      </div>

      <div className="history-money-cell">
        <div className="num-sm" style={{ color: 'var(--fg-0)' }}>{property.market > 0 ? `R$ ${fmtBRL(property.market)}` : '—'}</div>
        <div className="mono" style={{ fontSize: 11, color: 'var(--fg-2)' }}>
          {property.market > 0 && Number.isFinite(property.discount)
            ? `${property.discount.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}% estimado`
            : hasAnalysis
              ? 'sem referência de mercado'
              : 'análise pendente'}
        </div>
      </div>

      <div className="mono" style={{ fontSize: 11, color: 'var(--fg-3)', textAlign: 'right' }}>
        <div>{timeStr}</div>
        <div style={{ marginTop: 2 }}>{dateStr}</div>
      </div>

    </div>
  );
}
