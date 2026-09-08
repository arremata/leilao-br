import { useState, useEffect, useCallback } from 'react';
import { Routes, Route, NavLink, Link } from 'react-router-dom';
import Feed from './components/Feed';
import PropertyRoute from './components/PropertyRoute';
import Watchlist from './components/Watchlist';
import History from './components/History';
import NotFound from './components/NotFound';
import { fetchCatalog } from './api';

const isPreview = import.meta.env.VITE_DEPLOY_ENV === 'preview';
const previewCanWrite = import.meta.env.VITE_PREVIEW_WRITES === 'true';

function App() {
  const [watched, setWatched] = useState(() => {
    try {
      const stored = JSON.parse(localStorage.getItem('arremate_watched') || '[]');
      return Array.isArray(stored) ? stored : [];
    } catch { return []; }
  });
  const [properties, setProperties] = useState([]);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [history, setHistory] = useState(() => {
    try {
      const stored = JSON.parse(localStorage.getItem('arremate_history') || '[]');
      return Array.isArray(stored) ? stored : [];
    } catch { return []; }
  });

  // O catálogo é carregado uma vez e compartilhado pelas telas de lista. Ele
  // NÃO bloqueia mais a renderização: quem abre /imovel/{id} direto busca só
  // aquele imóvel e não espera os outros 500.
  useEffect(() => {
    let cancelled = false;
    fetchCatalog()
      .then(catalogData => {
        if (cancelled) return;
        if (Array.isArray(catalogData)) setProperties(catalogData);
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setCatalogLoading(false); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    localStorage.setItem('arremate_watched', JSON.stringify(watched));
  }, [watched]);

  useEffect(() => {
    localStorage.setItem('arremate_history', JSON.stringify(history));
  }, [history]);

  // Fade-in: observe .fade-in elements and add .is-visible
  useEffect(() => {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(e => {
        if (e.isIntersecting) {
          e.target.classList.add('is-visible');
          observer.unobserve(e.target);
        }
      });
    }, { threshold: 0.08, rootMargin: '0px 0px -20px 0px' });
    const observe = () => {
      document.querySelectorAll('.fade-in:not(.is-visible)').forEach(el => observer.observe(el));
    };
    observe();
    const mo = new MutationObserver(observe);
    mo.observe(document.getElementById('root'), { childList: true, subtree: true });
    return () => { observer.disconnect(); mo.disconnect(); };
  }, []);

  // Scroll: topbar solidify + progress bar (visual only)
  useEffect(() => {
    const el = document.querySelector('.app-shell');
    const bar = document.getElementById('argos-progress');
    const onScroll = () => {
      const y = window.scrollY || 0;
      if (el) el.classList.toggle('scrolled', y > 36);
      if (bar) {
        const max = document.documentElement.scrollHeight - window.innerHeight;
        bar.style.width = (max > 0 ? Math.min(100, (y / max) * 100) : 0) + '%';
      }
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const toggleWatch = useCallback((id) => {
    setWatched(w => w.includes(id) ? w.filter(x => x !== id) : [...w, id]);
  }, []);

  const clearHistory = useCallback(() => setHistory([]), []);

  const recordVisit = useCallback((prop) => {
    if (!prop?.id) return;
    const entry = {
      id: prop.id, ts: Date.now(),
      title: prop.title, address: prop.address,
      city: prop.city, neighborhood: prop.neighborhood,
      minBid: prop.minBid, appraisal: prop.appraisal,
      auctionDiscount: prop.auctionDiscount,
      market: prop.market, discount: prop.discount,
      type: prop.type, auctionType: prop.auctionType,
      modalidade: prop.modalidade, endsAt: prop.endsAt,
    };
    setHistory(prev => [entry, ...prev.filter(h => h.id !== prop.id)].slice(0, 50));
  }, []);

  return (
    <div className="app-shell">
      {isPreview && (
        <div className="preview-banner" role="status">
          Ambiente de validação · dados reais de produção
          {previewCanWrite ? ' · ações podem alterar produção' : ' · alterações não são salvas'}
        </div>
      )}
      <TopBar watchCount={watched.length} />
      <Routes>
        <Route path="/" element={
          <Feed
            watched={watched}
            toggleWatch={toggleWatch}
            properties={properties}
            loading={catalogLoading}
          />
        } />
        <Route path="/imovel/:id" element={
          <PropertyRoute
            properties={properties}
            watched={watched}
            toggleWatch={toggleWatch}
            onVisit={recordVisit}
          />
        } />
        <Route path="/salvos" element={
          <Watchlist watched={watched} toggleWatch={toggleWatch} properties={properties} />
        } />
        <Route path="/vistos" element={
          <History history={history} clearHistory={clearHistory} properties={properties} />
        } />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </div>
  );
}

function TopBar({ watchCount }) {
  return (
    <header className="topbar">
      <div id="argos-progress" style={{
        position: 'absolute', left: 0, bottom: 0, height: 2,
        width: 0, background: 'var(--accent)', transition: 'width .1s linear',
      }} />
      <div className="row gap-6" style={{ alignItems: 'center' }}>
        <Link className="brand" to="/">
          <span className="logo"></span>
          Argos
        </Link>
        <nav className="nav">
          <NavLink to="/" end className={({ isActive }) => (isActive ? 'active' : '')}>Imóveis</NavLink>
          <NavLink to="/salvos" className={({ isActive }) => (isActive ? 'active' : '')}>
            Salvos {watchCount > 0 && <span className="mono" style={{ color: 'var(--accent)', marginLeft: 4 }}>{watchCount}</span>}
          </NavLink>
          <NavLink to="/vistos" className={({ isActive }) => (isActive ? 'active' : '')}>Vistos</NavLink>
        </nav>
      </div>
    </header>
  );
}

export default App;
