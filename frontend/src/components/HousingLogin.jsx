import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/useAuth';
import { housingProfileFromUser, isCompleteHousingProfile } from '../housingProfile';
import './housing.css';

export default function HousingLogin({
  signedInDestination = '/',
  afterSetupDestination = '/',
  allowExplore = false,
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const { loginWithGoogle } = useAuth();
  const googleButtonRef = useRef(null);
  const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
  const googleEnabled = Boolean(googleClientId) && !allowExplore;

  useEffect(() => {
    if (!googleEnabled || !googleButtonRef.current) return undefined;
    let cancelled = false;
    let initialized = false;
    let retryTimer;

    const renderGoogleButton = () => {
      if (cancelled) return;
      if (!window.google?.accounts?.id) {
        retryTimer = window.setTimeout(renderGoogleButton, 100);
        return;
      }
      window.google.accounts.id.initialize({
        client_id: googleClientId,
        callback: async ({ credential }) => {
          try {
            setBusy(true);
            setError('');
            const signedInUser = await loginWithGoogle(credential);
            const needsSetup = !isCompleteHousingProfile(housingProfileFromUser(signedInUser));
            navigate(
              needsSetup ? '/preferencias?origem=cadastro' : signedInDestination,
              needsSetup
                ? { replace: true, state: { after: afterSetupDestination } }
                : { replace: true },
            );
          } catch (err) {
            setError(err.message || 'Não foi possível entrar com o Google. Tente de novo.');
          } finally {
            setBusy(false);
          }
        },
      });
      window.google.accounts.id.renderButton(googleButtonRef.current, {
        theme: 'outline',
        size: 'large',
        text: 'continue_with',
        shape: 'pill',
        width: 320,
      });
      initialized = true;
    };

    renderGoogleButton();
    return () => {
      cancelled = true;
      window.clearTimeout(retryTimer);
      if (initialized) window.google?.accounts?.id.cancel();
    };
  }, [
    loginWithGoogle, navigate, signedInDestination, afterSetupDestination,
    googleClientId, googleEnabled,
  ]);

  return <main className="auth-shell">
    <section className="auth-story">
      <Link className="auth-brand" to="/entrar"><span className="logo" />Argos</Link>
      <div><span className="housing-eyebrow">UM CAMINHO MAIS CLARO ATÉ SEU LAR</span><h1>Encontre uma oportunidade que caiba na sua vida.</h1><p>Organize sua busca, compare imóveis e entenda os custos antes de decidir.</p></div>
      <ul><li><b>01</b> Seu perfil de moradia salvo</li><li><b>02</b> Filtros de busca sob seu controle</li><li><b>03</b> Próximos passos depois da arrematação</li></ul>
    </section>
    <section className="auth-panel" aria-labelledby="auth-title">
      <div className="auth-card auth-card-google-only">
        <span className="housing-eyebrow">ACESSO SEGURO</span>
        <h2 id="auth-title">Entre ou crie sua conta</h2>
        <p className="housing-muted">Use sua conta Google. No primeiro acesso, sua conta Argos é criada automaticamente.</p>
        {googleEnabled
          ? <div className="auth-google-primary" aria-busy={busy}>
              <div className="auth-google" ref={googleButtonRef} aria-label="Continuar com Google" />
              {busy && <p className="housing-muted" role="status">Confirmando seu acesso…</p>}
            </div>
          : <p className="auth-preview-login-note">O login Google fica disponível no ambiente oficial. Este preview mantém o catálogo aberto para validação.</p>}
        {error && <p role="alert" className="housing-error">{error}</p>}
        <p className="auth-security-note">Sua senha do Google nunca é compartilhada com o Argos.</p>
        {allowExplore
          ? <Link className="auth-explore" to="/?busca=todos">Voltar aos imóveis do preview</Link>
          : <p className="auth-required-note">É necessário entrar com o Google para acessar a plataforma.</p>}
      </div>
    </section>
  </main>;
}
