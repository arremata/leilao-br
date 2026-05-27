import { useState, useEffect, useCallback } from 'react';
import Home from './components/Home';
import Feed from './components/Feed';
import PropertyDetail from './components/PropertyDetail';
import { analyzeUrl, fetchProperties, fetchDashboard } from './api';

function App() {
  const [screen, setScreen] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    const requestedScreen = params.get('screen');
    if (['home', 'feed', 'detail'].includes(requestedScreen)) return requestedScreen;
    return localStorage.getItem('arremate_screen') || 'home';
  });
  const [selected, setSelected] = useState(null);
  const [watched, setWatched] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('arremate_watched') || '["p1","p3"]');
    } catch { return ['p1', 'p3']; }
  });
  const [properties, setProperties] = useState([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState(null);
  const [dashboard, setDashboard] = useState(null);
  const [feedSearch, setFeedSearch] = useState({ address: '', filters: null });
  const [feedKey, setFeedKey] = useState(0);

  useEffect(() => {
    fetchProperties().then(data => {
      if (Array.isArray(data)) setProperties(data);
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

  const go = (s, prop) => {
    if (prop) setSelected(prop);
    setScreen(s);
  };

  const toggleWatch = (id) => {
    setWatched(w => w.includes(id) ? w.filter(x => x !== id) : [...w, id]);
  };

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
    '03 Detalhe do Imóvel';

  return (
    <div className="app-shell" data-screen-label={screenLabel}>
      <TopBar screen={screen} go={go} watchCount={watched.length} onAnalyze={handleAnalyze} analyzing={analyzing} analysisError={analysisError} />
      {screen === 'home' && <Home go={go} watched={watched} toggleWatch={toggleWatch} properties={properties} dashboard={dashboard} onSearch={handleSearch} />}
      {screen === 'feed' && <Feed key={feedKey} initialAddress={feedSearch.address} initialFilters={feedSearch.filters} go={go} watched={watched} toggleWatch={toggleWatch} properties={properties} />}
      {screen === 'detail' && <PropertyDetail property={selected} go={go} watched={watched} toggleWatch={toggleWatch} />}
    </div>
  );
}

function TopBar({ screen, go, watchCount, onAnalyze, analyzing, analysisError }) {
  const [url, setUrl] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    onAnalyze(url);
  };

  return (
    <header className="topbar">
      <div className="row gap-6" style={{ alignItems: 'center' }}>
        <button className="brand" onClick={() => go('home')}>
          <span className="logo"></span>
          Arremate
        </button>
        <nav className="nav">
          <a className={screen === 'home' ? 'active' : ''} onClick={() => go('home')}>Dashboard</a>
          <a className={screen === 'feed' ? 'active' : ''} onClick={() => go('feed')}>Feed</a>
          <a>Watchlist {watchCount > 0 && <span className="mono" style={{ color: 'var(--accent)', marginLeft: 4 }}>{watchCount}</span>}</a>
          <a>Histórico</a>
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

      <div className="row gap-2">
        <div style={{
          width: 32, height: 32, borderRadius: '50%',
          background: 'oklch(0.75 0.06 60)',
          display: 'grid', placeItems: 'center',
          fontSize: 12, color: 'var(--fg-0)',
          fontWeight: 600,
          border: '1px solid var(--line-1)',
        }}>
          FG
        </div>
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
