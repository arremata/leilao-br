import { useState, useEffect, useCallback } from 'react';
import Home from './components/Home';
import Feed from './components/Feed';
import PropertyDetail from './components/PropertyDetail';
import Watchlist from './components/Watchlist';
import History from './components/History';
import { fetchCatalog, fetchDashboard } from './api';

function App() {
  const [screen, setScreen] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    const requestedScreen = params.get('screen');
    if (['home', 'feed', 'detail', 'watchlist', 'history'].includes(requestedScreen)) return requestedScreen;
    return 'home';
  });
  const [selected, setSelected] = useState(null);
  const [watched, setWatched] = useState(() => {
    try {
      const stored = JSON.parse(localStorage.getItem('arremate_watched') || '[]');
      return Array.isArray(stored) ? stored : [];
    } catch { return []; }
  });
  const [properties, setProperties] = useState([]);
  const [dashboard, setDashboard] = useState(null);
  const [initialLoading, setInitialLoading] = useState(true);
  const [history, setHistory] = useState(() => {
    try {
      const stored = JSON.parse(localStorage.getItem('arremate_history') || '[]');
      return Array.isArray(stored) ? stored : [];
    } catch { return []; }
  });
  const [feedSearch, setFeedSearch] = useState({ address: '', filters: null });
  const [feedKey, setFeedKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    Promise.allSettled([fetchCatalog(), fetchDashboard()])
      .then(([catalogResult, dashboardResult]) => {
        if (cancelled) return;
        const catalogData = catalogResult.status === 'fulfilled' ? catalogResult.value : [];
        const dashboardData = dashboardResult.status === 'fulfilled' ? dashboardResult.value : null;
        if (Array.isArray(catalogData)) setProperties(catalogData);
        if (dashboardData) setDashboard(dashboardData);
      })
      .finally(() => { if (!cancelled) setInitialLoading(false); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [screen]);

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
    // Re-observe on screen changes
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

  const go = (s, prop) => {
    if (prop) {
      setSelected(prop);
      if (s === 'detail') {
        const entry = {
          id: prop.id, ts: Date.now(),
          title: prop.title, address: prop.address,
          city: prop.city, neighborhood: prop.neighborhood,
          risk: prop.risk, minBid: prop.minBid,
          appraisal: prop.appraisal, auctionDiscount: prop.auctionDiscount,
          market: prop.market, discount: prop.discount, roi: prop.roi,
          type: prop.type, auctionType: prop.auctionType,
          modalidade: prop.modalidade, endsAt: prop.endsAt,
        };
        setHistory(prev => [entry, ...prev.filter(h => h.id !== prop.id)].slice(0, 50));
      }
    }
    setScreen(s);
  };

  const toggleWatch = (id) => {
    setWatched(w => w.includes(id) ? w.filter(x => x !== id) : [...w, id]);
  };

  const clearHistory = useCallback(() => setHistory([]), []);

  const handleSearch = useCallback((address, filters) => {
    setFeedSearch({ address, filters });
    setFeedKey(k => k + 1);
    setScreen('feed');
  }, []);

  const screenLabel =
    screen === 'home' ? '01 Dashboard' :
    screen === 'feed' ? '02 Feed' :
    screen === 'watchlist' ? '03 Watchlist' :
    screen === 'history' ? '04 Histórico' :
    '05 Detalhe do Imóvel';

  return (
    <div className="app-shell" data-screen-label={screenLabel}>
      <TopBar screen={screen} go={go} watchCount={watched.length} />
      {initialLoading ? (
        <InitialLoading />
      ) : (<>
        {screen === 'home' && <Home go={go} watched={watched} toggleWatch={toggleWatch} properties={properties} dashboard={dashboard} onSearch={handleSearch} history={history} />}
        {screen === 'feed' && <Feed key={feedKey} initialAddress={feedSearch.address} initialFilters={feedSearch.filters} go={go} watched={watched} toggleWatch={toggleWatch} properties={properties} />}
        {screen === 'watchlist' && <Watchlist go={go} watched={watched} toggleWatch={toggleWatch} properties={properties} />}
        {screen === 'history' && <History go={go} history={history} clearHistory={clearHistory} properties={properties} />}
        {screen === 'detail' && <PropertyDetail key={selected?.id} property={selected} go={go} watched={watched} toggleWatch={toggleWatch} />}
      </>)}
    </div>
  );
}

function InitialLoading() {
  return (
    <main className="page" style={{ maxWidth: 1480, margin: '0 auto', padding: '72px 28px', minHeight: '65vh', display: 'grid', placeItems: 'center' }}>
      <div style={{ textAlign: 'center' }}>
        <span className="countdown" style={{ justifyContent: 'center', color: 'var(--fg-2)' }}>
          <span className="dot" style={{ background: 'var(--accent)' }}></span>
          <span className="mono">Carregando oportunidades…</span>
        </span>
      </div>
    </main>
  );
}

function TopBar({ screen, go, watchCount }) {
  return (
    <header className="topbar">
      <div id="argos-progress" style={{
        position: 'absolute', left: 0, bottom: 0, height: 2,
        width: 0, background: 'var(--accent)', transition: 'width .1s linear',
      }} />
      <div className="row gap-6" style={{ alignItems: 'center' }}>
        <button className="brand" onClick={() => go('home')}>
          <span className="logo"></span>
          Argos
        </button>
        <nav className="nav">
          <a className={screen === 'home' ? 'active' : ''} onClick={() => go('home')}>Dashboard</a>
          <a className={screen === 'feed' ? 'active' : ''} onClick={() => go('feed')}>Feed</a>
          <a className={screen === 'watchlist' ? 'active' : ''} onClick={() => go('watchlist')}>
            Watchlist {watchCount > 0 && <span className="mono" style={{ color: 'var(--accent)', marginLeft: 4 }}>{watchCount}</span>}
          </a>
          <a className={screen === 'history' ? 'active' : ''} onClick={() => go('history')}>Histórico</a>
        </nav>
      </div>

    </header>
  );
}

export default App;
