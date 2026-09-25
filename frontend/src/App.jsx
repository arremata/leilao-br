import { useState, useEffect, useCallback, useRef } from 'react';
import { Routes, Route, NavLink, Link, Navigate, Outlet, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import HousingFeed from './components/HousingFeed';
import HousingQuestionnaire from './components/HousingQuestionnaire';
import HousingLogin from './components/HousingLogin';
import AccountPage, { UserMark } from './components/AccountPage';
import { readHousingProfile, saveHousingProfile } from './housingStorage';
import {
  accountDestination,
  housingPreferencesFlow,
  postSetupDestination,
  shouldShowHousingOnboarding,
  shouldUseAccountScreen,
} from './housingEntry';
import { createLocalAccount, readLocalSession, signInLocal, signOutLocal } from './localAuth';
import PropertyRoute from './components/PropertyRoute';
import Watchlist from './components/Watchlist';
import History from './components/History';
import NotFound from './components/NotFound';
import { fetchCatalog } from './api';
import { useAuth } from './auth/useAuth';
import { authApi } from './auth';

const isPreview = import.meta.env.VITE_DEPLOY_ENV === 'preview';
const previewCanWrite = import.meta.env.VITE_PREVIEW_WRITES === 'true';

function App() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user: authUser, isAuthed, logout: authLogout } = useAuth();
  // Local email/password account is their prototype layer; the real session is
  // AuthContext. When a Google login lands, AuthContext's user takes over.
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
  const [history, setHistory] = useState(() => {
    try {
      const stored = JSON.parse(localStorage.getItem('arremate_history') || '[]');
      return Array.isArray(stored) ? stored : [];
    } catch { return []; }
  });
  const [properties, setProperties] = useState([]);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const cities = [...new Set(properties.map(p => p.city).filter(Boolean))].sort();
  const requestedDestination = accountDestination(location.state?.from);
  const afterSetupDestination = postSetupDestination(location.state?.from);
  const preferencesFlow = housingPreferencesFlow(location.search, location.state?.after);

  // Two user sources: Google (authUser) wins over local email/password (account).
  // This lets the HousingLogin screen serve both mechanisms: "Entrar com Google"
  // hits the real backend; the email/password form stays as the local prototype.
  const effectiveAccount = authUser || account;
  const hasAccount = Boolean(effectiveAccount);

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
    authLogout();
    setAccount(null);
    setHousingSearch(null);
    setProperties([]);
    setCatalogLoading(true);
    navigate('/entrar');
  }, [navigate, authLogout]);

  const accountScreen = shouldUseAccountScreen({
    pathname: location.pathname,
    isPreview,
    account: effectiveAccount,
    hasSearch: Boolean(location.search),
  });

  // O catálogo é carregado uma vez e compartilhado pelas telas de lista. Ele
  // NÃO bloqueia mais a renderização: quem abre /imovel/{id} direto busca só
  // aquele imóvel e não espera os outros 500.
  useEffect(() => {
    if (!hasAccount) return undefined;
    let cancelled = false;
    fetchCatalog()
      .then(catalogData => {
        if (cancelled) return;
        if (Array.isArray(catalogData)) setProperties(catalogData);
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setCatalogLoading(false); });
    return () => { cancelled = true; };
  }, [hasAccount]);

  // Local persistence always-on; server sync layers on top when authed.
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

  // Auth: adopt server-backed saved/viewed lists once /me sync lands. The
  // AuthContext effect emits `argos:synced` with `{ user, saved, viewed }`.
  // Register unconditionally on mount — AuthContext may dispatch the event in
  // the same tick it flips `synced`, before a gated effect would re-run.
  useEffect(() => {
    const onSynced = (event) => {
      const data = event.detail || {};
      setWatched(Array.isArray(data.saved) ? data.saved : []);
      setHistory(
        Array.isArray(data.viewed)
          ? data.viewed.map(e => e && e.snapshot).filter(Boolean)
          : [],
      );
    };
    window.addEventListener('argos:synced', onSynced);
    return () => window.removeEventListener('argos:synced', onSynced);
  }, []);

  // On logout, drop the previous session's local lists so they don't leak
  // into the next (anonymous or different-user) session.
  const wasAuthedRef = useRef(isAuthed);
  useEffect(() => {
    if (wasAuthedRef.current && !isAuthed) {
      setWatched([]);
      setHistory([]);
    }
    wasAuthedRef.current = isAuthed;
  }, [isAuthed]);

  const toggleWatch = useCallback((id) => {
    setWatched(current => {
      const willSave = !current.includes(id);
      const next = willSave ? [...current, id] : current.filter(x => x !== id);
      if (isAuthed) {
        authApi.setSaved(id, willSave).catch(() => {
          // Roll the optimistic toggle back if the server write failed.
          setWatched(now => (willSave
            ? now.filter(x => x !== id)
            : [...now, id]));
        });
      }
      return next;
    });
  }, [isAuthed]);

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
    if (isAuthed) {
      authApi.recordViewed(prop.id, entry).catch((err) => {
        console.warn('Falha ao registrar visita no servidor:', err);
      });
    }
  }, [isAuthed]);

  return (
    <div className={`app-shell${accountScreen ? ' account-screen' : ''}${isPreview ? ' preview-env' : ''}`}>
      {isPreview && !accountScreen && (
        <div className="preview-banner" role="status">
          Preview · dados reais
          {previewCanWrite ? ' · ações podem alterar produção' : ' · alterações não são salvas'}
        </div>
      )}
      {!accountScreen && <TopBar watchCount={watched.length} account={effectiveAccount} />}
      <Routes>
        <Route path="/entrar" element={effectiveAccount
          ? <Navigate to={requestedDestination} replace />
          : <HousingLogin
              onSignUp={signUp}
              onSignIn={signIn}
              signedInDestination={requestedDestination}
              afterSetupDestination={afterSetupDestination}
            />} />
        <Route element={<AccountGate account={effectiveAccount} />}>
          <Route path="/" element={
            <HousingEntry
              profile={housingProfile}
              account={effectiveAccount}
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
          <Route path="/perfil" element={
            <AccountPage account={effectiveAccount} profile={housingProfile} serverAccount={isAuthed} onSignOut={signOut} />
          } />
          <Route path="/preferencias" element={
            <HousingQuestionnaire
              key={JSON.stringify(housingProfile)}
              initialProfile={housingProfile}
              cities={cities}
              onSave={saveProfile}
              {...preferencesFlow}
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
        </Route>
      </Routes>
    </div>
  );
}

function TopBar({ watchCount, account }) {
  return (
    <header className="topbar">
      <div id="argos-progress" style={{
        position: 'absolute', left: 0, bottom: 0, height: 2,
        width: 0, background: 'var(--accent)', transition: 'width .1s linear',
      }} />
      <div className="topbar-primary">
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
        <div className="housing-account">
          {account ? (
            <Link className="account-trigger" to="/perfil" aria-label="Abrir minha conta">
              <UserMark />
              <span><b>{account.name?.split(' ')[0] || 'Minha conta'}</b><small>Minha conta</small></span>
              <span className="account-trigger-arrow" aria-hidden="true">›</span>
            </Link>
          ) : (
            <>
              <Link to="/entrar">Entrar</Link>
              <Link className="btn primary sm" to="/entrar">Criar conta</Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

function HousingEntry(props) {
  const [params] = useSearchParams();
  // After login, the saved profile still decides whether first-time setup is
  // needed before the catalog. Shared searches no longer bypass the account.
  if (shouldShowHousingOnboarding({
    isPreview,
    account: props.account,
    profile: props.profile,
    appliedProfile: props.appliedProfile,
    searchParamCount: params.size,
  })) {
    return <HousingQuestionnaire initialProfile={props.profile} cities={props.cities} onSave={props.onSave} />;
  }
  return <HousingFeed {...props} />;
}

function AccountGate({ account }) {
  const location = useLocation();
  if (account) return <Outlet />;
  const from = `${location.pathname}${location.search}${location.hash}`;
  return <Navigate to="/entrar" replace state={{ from }} />;
}

export default App;
