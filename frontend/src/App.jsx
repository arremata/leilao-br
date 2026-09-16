import { useState, useEffect, useCallback } from 'react';
import { Routes, Route, NavLink, Link, useLocation, useSearchParams } from 'react-router-dom';
import HousingFeed from './components/HousingFeed';
import HousingQuestionnaire from './components/HousingQuestionnaire';
import HousingLogin from './components/HousingLogin';
import { readHousingProfile, saveHousingProfile } from './housingStorage';
import { createLocalAccount, readLocalSession, signInLocal, signOutLocal } from './localAuth';
import PropertyRoute from './components/PropertyRoute';
import Watchlist from './components/Watchlist';
import History from './components/History';
import NotFound from './components/NotFound';
import { fetchCatalog } from './api';

const isPreview = import.meta.env.VITE_DEPLOY_ENV === 'preview';
const previewCanWrite = import.meta.env.VITE_PREVIEW_WRITES === 'true';

function App() {
  const location = useLocation();
  const [account, setAccount] = useState(() => {
    try { return readLocalSession(); } catch { return null; }
  });
  const [housingProfile, setHousingProfile] = useState(() => {
    try { return readHousingProfile(); } catch { return null; }
  });
  const [housingSearch, setHousingSearch] = useState(null);
  const [watched, setWatched] = useState(() => {
    try {
      const stored = JSON.parse(localStorage.getItem('arremate_watched') || '[]');
      return Array.isArray(stored) ? stored : [];
    } catch { return []; }
  });
  const [properties, setProperties] = useState([]);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const cities = [...new Set(properties.map(p => p.city).filter(Boolean))].sort();
  const saveProfile = useCallback(async (profile) => {
    const saved = saveHousingProfile(profile);
    setHousingProfile(saved);
    setHousingSearch(null);
  }, []);
  const signUp = useCallback(async (input) => {
    const user = await createLocalAccount(input);
    setAccount(user);
    return user;
  }, []);
  const signIn = useCallback(async (input) => {
    const user = await signInLocal(input);
    setAccount(user);
    return user;
  }, []);
  const signOut = useCallback(() => {
    signOutLocal();
    setAccount(null);
    setHousingSearch(null);
  }, []);
  const [history, setHistory] = useState(() => {
    try {
      const stored = JSON.parse(localStorage.getItem('arremate_history') || '[]');
      return Array.isArray(stored) ? stored : [];
    } catch { return []; }
  });
  const accountScreen = location.pathname === '/entrar'
    || location.pathname === '/perfil'
    || (location.pathname === '/' && !account && !housingProfile && !location.search);

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
    <div className={`app-shell${accountScreen ? ' account-screen' : ''}${isPreview ? ' preview-env' : ''}`}>
      {isPreview && !accountScreen && (
        <div className="preview-banner" role="status">
          Preview · dados reais
          {previewCanWrite ? ' · ações podem alterar produção' : ' · alterações não são salvas'}
        </div>
      )}
      {!accountScreen && <TopBar watchCount={watched.length} account={account} onSignOut={signOut} />}
      <Routes>
        <Route path="/" element={
          <HousingEntry
            profile={housingProfile}
            account={account}
            onSignUp={signUp}
            onSignIn={signIn}
            onSave={saveProfile}
            appliedProfile={housingSearch}
            onApply={setHousingSearch}
            cities={cities}
            watched={watched}
            toggleWatch={toggleWatch}
            properties={properties}
            loading={catalogLoading}
          />
        } />
        <Route path="/entrar" element={<HousingLogin onSignUp={signUp} onSignIn={signIn} initialMode={account ? 'signin' : 'signup'} signedInDestination={housingProfile ? '/' : '/perfil'} />} />
        <Route path="/perfil" element={account ? <HousingQuestionnaire key={JSON.stringify(housingProfile)} initialProfile={housingProfile} cities={cities} onSave={saveProfile} /> : <HousingLogin onSignUp={signUp} onSignIn={signIn} signedInDestination="/perfil" />} />
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

function TopBar({ watchCount, account, onSignOut }) {
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
      <div className="housing-account">{account ? <><Link to="/perfil">{account.name.split(' ')[0]} · Meu perfil</Link><button type="button" className="btn ghost sm" onClick={onSignOut}>Sair</button></> : <><Link to="/entrar">Entrar</Link><Link className="btn primary sm" to="/entrar">Criar conta</Link></>}</div>
    </header>
  );
}

function HousingEntry(props) {
  const [params] = useSearchParams();
  // Existing shared feed URLs and public property URLs stay accessible.
  if ((!props.account || !props.profile) && !props.appliedProfile && params.size === 0) {
    if (!props.account) return <HousingLogin onSignUp={props.onSignUp} onSignIn={props.onSignIn} signedInDestination={props.profile ? '/' : '/perfil'} />;
    return <HousingQuestionnaire initialProfile={props.profile} cities={props.cities} onSave={props.onSave} />;
  }
  return <HousingFeed {...props} />;
}

export default App;
