import { useState, useEffect, useCallback } from 'react';
import Home from './components/Home';
import Feed from './components/Feed';
import PropertyDetail from './components/PropertyDetail';
import Watchlist from './components/Watchlist';
import History from './components/History';
import { analyzeUrl, fetchCatalog, fetchDashboard } from './api';
import { LiveCardProgress } from './components/LiveCard';

function App() {
  const [screen, setScreen] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    const requestedScreen = params.get('screen');
    if (['home', 'feed', 'detail', 'watchlist', 'history'].includes(requestedScreen)) return requestedScreen;
    return localStorage.getItem('arremate_screen') || 'home';
  });
  const [selected, setSelected] = useState(null);
  const [watched, setWatched] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('arremate_watched') || '[]');
    } catch { return []; }
  });
  const [properties, setProperties] = useState([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState(null);
  const [dashboard, setDashboard] = useState(null);
  const [history, setHistory] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('arremate_history') || '[]');
    } catch { return []; }
  });
  const [feedSearch, setFeedSearch] = useState({ address: '', filters: null });
  const [feedKey, setFeedKey] = useState(0);

  useEffect(() => {
    fetchCatalog().then(data => {
      if (Array.isArray(data)) {
        setProperties(data);
        // Prune watchlist IDs that no longer exist (e.g. legacy "p1"/"p3" fallback).
        const validIds = new Set(data.map(p => p.id));
        setWatched(prev => {
          const next = prev.filter(id => validIds.has(id));
          return next.length === prev.length ? prev : next;
        });
      }
    }).catch(() => {});
    fetchDashboard().then(data => {
      if (data) setDashboard(data);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    localStorage.setItem('arremate_screen', screen);
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
          discount: prop.discount, roi: prop.roi,
          type: prop.type, auctionType: prop.auctionType,
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

  const handleAnalyze = useCallback(async (url) => {
    if (!url || !url.trim()) return;
    setAnalyzing(true);
    setAnalysisError(null);
    try {
      const result = await analyzeUrl(url);
      setProperties(prev => {
        if (prev.some(p => p.id === result.id)) return prev;
        return [result, ...prev];
      });
      setSelected(result);
      setScreen('detail');
    } catch (err) {
      setAnalysisError(err.message);
    } finally {
      setAnalyzing(false);
    }
  }, []);

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
      <TopBar screen={screen} go={go} watchCount={watched.length} onAnalyze={handleAnalyze} analyzing={analyzing} analysisError={analysisError} />
      {analyzing && (
        <div className="page" style={{ maxWidth: 1480, margin: '0 auto', padding: '28px 28px 0' }}>
          <LiveCardProgress analyzing={analyzing} />
        </div>
      )}
      {screen === 'home' && <Home go={go} watched={watched} toggleWatch={toggleWatch} properties={properties} dashboard={dashboard} onSearch={handleSearch} history={history} />}
      {screen === 'feed' && <Feed key={feedKey} initialAddress={feedSearch.address} initialFilters={feedSearch.filters} go={go} watched={watched} toggleWatch={toggleWatch} properties={properties} />}
      {screen === 'watchlist' && <Watchlist go={go} watched={watched} toggleWatch={toggleWatch} properties={properties} />}
      {screen === 'history' && <History go={go} history={history} clearHistory={clearHistory} properties={properties} />}
      {screen === 'detail' && <PropertyDetail key={selected?.id} property={selected} go={go} watched={watched} toggleWatch={toggleWatch} />}
    </div>
  );
}

function TopBar({ screen, go, watchCount, onAnalyze, analyzing, analysisError }) {
  const [url, setUrl] = useState('');
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    onAnalyze(url);
  };

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

      <form className="search topbar-search" onSubmit={handleSubmit}>
        <span className="mono" style={{ color: 'var(--fg-2)' }}>⌕</span>
        <input
          placeholder="Cole a URL do leilão para analisar..."
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          disabled={analyzing}
        />
        <button type="submit" className="btn sm primary" disabled={analyzing || !url.trim()} style={{ whiteSpace: 'nowrap' }}>
          {analyzing ? 'Analisando...' : 'Analisar'}
        </button>
      </form>

      {analysisError && (
        <div style={{
          position: 'absolute', top: '100%', left: '50%', transform: 'translateX(-50%)',
          background: 'var(--bad-soft)', color: 'var(--bad)', padding: '6px 14px',
          borderRadius: 6, fontSize: 12, zIndex: 50, marginTop: 4,
        }}>
          {analysisError}
        </div>
      )}

      <div style={{ position: 'relative' }}>
        <button
          onClick={() => setUserMenuOpen(!userMenuOpen)}
          style={{
            width: 32, height: 32, borderRadius: '50%',
            background: 'var(--bg-3)',
            display: 'grid', placeItems: 'center',
            fontSize: 12, color: 'var(--fg-0)',
            fontWeight: 600,
            border: '1px solid var(--line-1)',
            cursor: 'pointer',
          }}
        >
          GD
        </button>
        {userMenuOpen && (
          <>
            <div onClick={() => setUserMenuOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 90 }} />
            <div style={{
              position: 'absolute', top: 'calc(100% + 8px)', right: 0,
              minWidth: 200, padding: 6,
              background: 'var(--bg-0)', border: '1px solid var(--line-1)',
              borderRadius: 10, zIndex: 91,
              boxShadow: '0 10px 28px rgba(17,24,39,0.1)',
            }}>
              <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--line-1)' }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--fg-0)' }}>Gustavo D.</div>
                <div style={{ fontSize: 11.5, color: 'var(--fg-2)', marginTop: 2 }}>gustavo@arremate.com</div>
              </div>
              <button
                onClick={() => { setUserMenuOpen(false); go('home'); }}
                style={{
                  display: 'block', width: '100%', textAlign: 'left',
                  padding: '8px 12px', borderRadius: 6,
                  fontSize: 12.5, color: 'var(--fg-1)',
                  marginTop: 4,
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-2)'}
                onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
              >
                Minha conta
              </button>
              <button
                onClick={() => setUserMenuOpen(false)}
                style={{
                  display: 'block', width: '100%', textAlign: 'left',
                  padding: '8px 12px', borderRadius: 6,
                  fontSize: 12.5, color: 'var(--bad)',
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-2)'}
                onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
              >
                Sair
              </button>
            </div>
          </>
        )}
      </div>

      <form className="search mobile-search" onSubmit={handleSubmit}>
        <span className="mono" style={{ color: 'var(--fg-2)' }}>⌕</span>
        <input
          placeholder="Cole a URL do leilão para analisar..."
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          disabled={analyzing}
        />
        <button type="submit" className="btn sm primary" disabled={analyzing || !url.trim()}>
          {analyzing ? '...' : 'Analisar'}
        </button>
      </form>
    </header>
  );
}

export default App;
