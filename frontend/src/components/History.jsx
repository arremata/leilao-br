import { useMemo } from 'react';
import { fmtBRL } from '../utils';

export default function History({ go, history, clearHistory, properties }) {
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
            Quando você abrir um imóvel, ele aparecerá aqui.
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
                  const live = properties.find(p => p.id === entry.id);
                  return (
                    <HistoryRow
                      key={entry.id + entry.ts}
                      entry={entry}
                      live={!!live}
                      last={i === group.entries.length - 1}
                      onClick={() => live && go('detail', live)}
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

function HistoryRow({ entry, live, last, onClick }) {
  const ts = new Date(entry.ts);
  const timeStr = ts.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const dateStr = ts.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });

  return (
    <div
      className="history-row"
      onClick={live ? onClick : undefined}
      style={{
        display: 'grid',
        gridTemplateColumns: '1.8fr 1fr 0.7fr 0.7fr 80px 72px',
        gap: 14, padding: '14px 18px',
        borderBottom: last ? 'none' : '1px solid var(--line-1)',
        alignItems: 'center',
        cursor: live ? 'pointer' : 'default',
        opacity: live ? 1 : 0.55,
        transition: 'background .15s',
      }}
      onMouseEnter={e => { if (live) e.currentTarget.style.background = 'var(--bg-2)'; }}
      onMouseLeave={e => { if (live) e.currentTarget.style.background = ''; }}
    >
      <div>
        <div style={{ fontSize: 14, fontWeight: 500, lineHeight: 1.25 }}>{entry.title}</div>
        <div style={{ fontSize: 11.5, color: 'var(--fg-2)', marginTop: 2 }}>
          {entry.neighborhood}, {entry.city} · {entry.type} · {entry.auctionType}
        </div>
      </div>

      <div>
        <div className="num-sm" style={{ color: 'var(--fg-0)' }}>R$ {fmtBRL(entry.minBid)}</div>
        <div className="mono" style={{ fontSize: 11, color: 'var(--fg-2)' }}>lance mín.</div>
      </div>

      <div>
        <div className="num-sm" style={{ color: entry.discount > 0 ? 'var(--good)' : 'var(--bad)' }}>
          {entry.discount >= 0 ? `−${entry.discount}%` : `+${Math.abs(entry.discount).toFixed(1)}%`}
        </div>
        <div className="mono" style={{ fontSize: 11, color: 'var(--fg-2)' }}>desconto</div>
      </div>

      <div>
        <div className="num-sm" style={{ color: entry.roi > 0 ? 'var(--good)' : entry.roi < 0 ? 'var(--bad)' : 'var(--fg-2)' }}>
          {entry.roi >= 0 ? `+${entry.roi}%` : `${entry.roi}%`}
        </div>
        <div className="mono" style={{ fontSize: 11, color: 'var(--fg-2)' }}>ROI</div>
      </div>

      <div className="mono" style={{ fontSize: 11, color: 'var(--fg-3)', textAlign: 'right' }}>
        <div>{timeStr}</div>
        <div style={{ marginTop: 2 }}>{dateStr}</div>
      </div>

      <div style={{ textAlign: 'right' }}>
        {live
          ? <span className="mono" style={{ fontSize: 12, color: 'var(--accent)' }}>Ver →</span>
          : <span className="mono" style={{ fontSize: 11, color: 'var(--fg-3)' }}>indisponível</span>
        }
      </div>
    </div>
  );
}
