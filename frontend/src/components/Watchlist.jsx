import { useState } from 'react';
import { Link } from 'react-router-dom';
import { PropertyCard, PropertyRow } from './shared';

export default function Watchlist({ watched, toggleWatch, properties }) {
  const watchedItems = properties.filter(p => watched.includes(p.id));
  const [view, setView] = useState('grid');

  return (
    <div className="page" style={{ maxWidth: 1480, margin: '0 auto', padding: '28px 28px 80px' }}>

      <div className="row between page-header fade-in" style={{ alignItems: 'flex-end', marginBottom: 28 }}>
        <div>
          <h1 className="h1">Salvos</h1>
          <p style={{ margin: '4px 0 0', color: 'var(--fg-2)', fontSize: 14 }}>
            {watchedItems.length === 0
              ? 'Nenhum imóvel salvo ainda.'
              : `${watchedItems.length} ${watchedItems.length === 1 ? 'imóvel salvo' : 'imóveis salvos'} neste navegador.`}
          </p>
        </div>
        {watchedItems.length > 0 && (
          <div className="row gap-2 page-actions">
            <ViewToggle value={view} onChange={setView} />
          </div>
        )}
      </div>

      {watchedItems.length === 0 ? (
        <div className="card" style={{ padding: 64, textAlign: 'center' }}>
          <div style={{ fontSize: 40, color: 'var(--fg-3)', marginBottom: 16 }}>☆</div>
          <h3 className="h3" style={{ marginBottom: 8 }}>Você ainda não salvou nenhum imóvel</h3>
          <p style={{ margin: '0 0 20px', color: 'var(--fg-2)', fontSize: 14, maxWidth: 420, marginInline: 'auto' }}>
            Toque na estrela (★) de um imóvel para guardá-lo aqui e acompanhar o preço e a data.
          </p>
          <Link className="btn primary" to="/">Ver imóveis</Link>
        </div>
      ) : view === 'grid' ? (
        <div className="property-grid" style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))',
          gap: 24,
        }}>
          {watchedItems.map((p, i) => (
            <PropertyCard
              key={p.id}
              p={p}
              watched
              onToggleWatch={toggleWatch}
              staggerIndex={i}
            />
          ))}
        </div>
      ) : (
        <div className="card responsive-table" style={{ overflow: 'hidden' }}>
          <div className="property-row table-head" style={{
            display: 'grid',
            gridTemplateColumns: '60px 1.6fr 1fr 1fr 1fr 1fr 32px',
            gap: 14, padding: '10px 18px',
            background: 'var(--bg-2)', fontSize: 10.5,
            textTransform: 'uppercase', letterSpacing: '0.08em',
            fontFamily: 'var(--f-mono)', color: 'var(--fg-3)',
          }}>
            <span>foto</span><span>imóvel</span>
            <span>valor inicial</span><span>avaliação</span><span>imóveis parecidos</span>
            <span>leilão em</span><span></span>
          </div>
          {watchedItems.map(p => (
            <PropertyRow
              key={p.id}
              p={p}
              watched
              onToggleWatch={toggleWatch}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ViewToggle({ value, onChange }) {
  return (
    <div style={{
      display: 'inline-flex', border: '1px solid var(--line-1)',
      borderRadius: 8, overflow: 'hidden', background: 'var(--bg-1)',
    }}>
      {[['grid', '▦', 'grid'], ['list', '≡', 'lista']].map(([v, icon, label]) => (
        <button
          key={v}
          onClick={() => onChange(v)}
          style={{
            height: 32, padding: '0 12px',
            background: value === v ? 'var(--bg-3)' : 'transparent',
            color: value === v ? 'var(--fg-0)' : 'var(--fg-2)',
            fontSize: 12, fontWeight: 500,
            borderLeft: v === 'list' ? '1px solid var(--line-1)' : 'none',
          }}
        >
          <span className="mono">{icon}</span> {label}
        </button>
      ))}
    </div>
  );
}
