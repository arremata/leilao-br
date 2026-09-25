import { useState, useEffect, useCallback, useRef } from 'react';
import { Routes, Route, NavLink, Link, Navigate, Outlet, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import HousingFeed from './components/HousingFeed';
import HousingQuestionnaire from './components/HousingQuestionnaire';
import HousingLogin from './components/HousingLogin';
import AccountPage, { UserMark } from './components/AccountPage';
import { housingProfileForApi, housingProfileFromUser, isCompleteHousingProfile } from './housingProfile';
import {
  accountDestination,
  housingPreferencesFlow,
  postSetupDestination,
  shouldShowHousingOnboarding,
  shouldUseAccountScreen,
} from './housingEntry';
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
  const {
    user: authUser,
    authReady,
    isAuthed,
    logout: authLogout,
    updateHousingProfile,
  } = useAuth();
  // Salvos e Vistos pertencem à conta Google e chegam do servidor depois do
  // login (`argos:synced`). Só o preview, que não tem login, guarda as listas
  // neste navegador.
  const [watched, setWatched] = useState(() => (
    isPreview ? readStoredList('arremate_watched') : []
  ));
  const [history, setHistory] = useState(() => (
    isPreview ? readStoredList('arremate_history') : []
  ));
  const [properties, setProperties] = useState([]);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const cities = [...new Set(properties.map(p => p.city).filter(Boolean))].sort();
  const requestedDestination = accountDestination(location.state?.from);
  const afterSetupDestination = postSetupDestination(location.state?.from);
  const preferencesFlow = housingPreferencesFlow(location.search, location.state?.after);

  const effectiveAccount = authUser;
  const effectiveHousingProfile = housingProfileFromUser(authUser);
  const profileComplete = isCompleteHousingProfile(effectiveHousingProfile);
  const canOpenCatalog = isPreview || Boolean(effectiveAccount);

  const saveProfile = useCallback(async (profile) => {
    if (!isAuthed) throw new Error('Entre com o Google para salvar suas preferências.');
    const updatedUser = await updateHousingProfile(housingProfileForApi(profile));
    return housingProfileFromUser(updatedUser);
  }, [isAuthed, updateHousingProfile]);
  const signOut = useCallback(async () => {
    try {
      await authLogout();
      if (!isPreview) {
        setProperties([]);
        setCatalogLoading(true);
      }
      navigate('/entrar');
    } catch (error) {
      console.warn('Não foi possível encerrar a sessão:', error);
    }
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
    if (!canOpenCatalog) return undefined;
    let cancelled = false;
    fetchCatalog()
      .then(catalogData => {
        if (cancelled) return;
        if (Array.isArray(catalogData)) setProperties(catalogData);
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setCatalogLoading(false); });
    return () => { cancelled = true; };
  }, [canOpenCatalog]);

  // Com conta, gravar uma cópia local faria a lista de uma pessoa ser importada
  // na conta de quem entrar depois neste navegador.
  useEffect(() => {
    if (isPreview) writeStoredList('arremate_watched', watched);
  }, [watched]);

  useEffect(() => {
    if (isPreview) writeStoredList('arremate_history', history);
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

  const clearHistory = useCallback(() => {
    const previous = history;
    setHistory([]);
    if (isAuthed) {
      authApi.clearViewed().catch((err) => {
        console.warn('Não foi possível limpar os imóveis vistos:', err);
        setHistory(current => (current.length ? current : previous));
      });
    }
  }, [history, isAuthed]);

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

  if (!authReady && !isPreview) {
    return <main className="auth-session-loading" role="status">
      <span className="logo" aria-hidden="true" />
      <p>Verificando seu acesso…</p>
    </main>;
  }

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
              signedInDestination={requestedDestination}
              afterSetupDestination={afterSetupDestination}
              allowExplore={isPreview}
            />} />
        <Route element={<AccountGate account={effectiveAccount} allowPublic={isPreview} requireProfile={!isPreview} profileComplete={profileComplete} />}>
          <Route path="/" element={
            <HousingEntry
              profile={effectiveHousingProfile}
              account={effectiveAccount}
              onSave={saveProfile}
              cities={cities}
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
        </Route>
        <Route element={<AccountGate account={effectiveAccount} requireProfile profileComplete={profileComplete} />}>
          <Route path="/perfil" element={
            <AccountPage account={effectiveAccount} profile={effectiveHousingProfile} serverAccount={isAuthed} onSignOut={signOut} />
          } />
        </Route>
        <Route element={<AccountGate account={effectiveAccount} />}>
          <Route path="/preferencias" element={
            <HousingQuestionnaire
              key={JSON.stringify(effectiveHousingProfile)}
              initialProfile={effectiveHousingProfile}
              cities={cities}
              onSave={saveProfile}
              {...preferencesFlow}
              required={!profileComplete || preferencesFlow.required}
            />
          } />
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

function HousingEntry({ profile, account, onSave, ...catalogProps }) {
  const [params] = useSearchParams();
  // After login, the saved profile still decides whether first-time setup is
  // needed before the catalog. Shared searches no longer bypass the account.
  if (shouldShowHousingOnboarding({
    isPreview,
    account,
    profile,
    searchParamCount: params.size,
  })) {
    return <HousingQuestionnaire initialProfile={profile} cities={catalogProps.cities} onSave={onSave} required />;
  }
  return <HousingFeed {...catalogProps} />;
}

function AccountGate({ account, allowPublic = false, requireProfile = false, profileComplete = false }) {
  const location = useLocation();
  if (allowPublic) return <Outlet />;
  const from = `${location.pathname}${location.search}${location.hash}`;
  if (account && requireProfile && !profileComplete) {
    return <Navigate to="/preferencias?origem=cadastro" replace state={{ after: from }} />;
  }
  if (account) return <Outlet />;
  return <Navigate to="/entrar" replace state={{ from }} />;
}

function readStoredList(key) {
  try {
    const stored = JSON.parse(localStorage.getItem(key) || '[]');
    return Array.isArray(stored) ? stored : [];
  } catch { return []; }
}

function writeStoredList(key, list) {
  try { localStorage.setItem(key, JSON.stringify(list)); } catch { /* segue em memória */ }
}

export default App;
