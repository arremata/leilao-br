import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/useAuth';
import './housing.css';

export default function HousingLogin({
  onSignUp,
  onSignIn,
  initialMode = 'signup',
  signedInDestination = '/',
  afterSetupDestination = '/',
  allowExplore = false,
}) {
  const [mode, setMode] = useState(initialMode);
  const [form, setForm] = useState({ name: '', email: '', password: '', confirmPassword: '', acceptedTerms: false });
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const { loginWithGoogle } = useAuth();
  const googleButtonRef = useRef(null);
  const creating = mode === 'signup';
  const update = (key, value) => setForm(current => ({ ...current, [key]: value }));

  function changeMode(nextMode) {
    setMode(nextMode);
    setError('');
    setForm(current => ({ ...current, password: '', confirmPassword: '' }));
  }

  // Render the Google Identity Services button on top of the Housing UI. After
  // a successful Google login the user is authed via AuthContext; the parent
  // (App.jsx) treats `authUser` as present across routes and forward navigation
  // happens when the component unmounts/re-renders.
  useEffect(() => {
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
    if (!clientId || !window.google?.accounts?.id || !googleButtonRef.current) return undefined;

    window.google.accounts.id.initialize({
      client_id: clientId,
      callback: async ({ credential }) => {
        try {
          setBusy(true);
          setError('');
          const signedInUser = await loginWithGoogle(credential);
          const needsSetup = creating || !signedInUser.housing_profile;
          navigate(
            needsSetup ? '/preferencias?origem=cadastro' : signedInDestination,
            needsSetup ? { replace: true, state: { after: afterSetupDestination } } : { replace: true },
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
      text: creating ? 'signup_with' : 'signin_with',
      shape: 'pill',
      width: 320,
    });
    return () => window.google.accounts.id.cancel();
  }, [loginWithGoogle, navigate, creating, signedInDestination, afterSetupDestination]);

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      if (creating) {
        if (form.password !== form.confirmPassword) throw new Error('As senhas precisam ser iguais.');
        await onSignUp(form);
        navigate('/preferencias?origem=cadastro', {
          replace: true,
          state: { after: afterSetupDestination },
        });
      } else {
        await onSignIn({ email: form.email, password: form.password });
        navigate(signedInDestination, { replace: true });
      }
    } catch (err) {
      setError(err.message || 'Não foi possível continuar. Confira seus dados.');
    } finally {
      setBusy(false);
    }
  }

  return <main className="auth-shell">
    <section className="auth-story">
      <Link className="auth-brand" to="/entrar"><span className="logo" />Argos</Link>
      <div><span className="housing-eyebrow">UM CAMINHO MAIS CLARO ATÉ SEU LAR</span><h1>Encontre uma oportunidade que caiba na sua vida.</h1><p>Organize sua busca, compare imóveis e entenda os custos antes de decidir.</p></div>
      <ul><li><b>01</b> Seu perfil de moradia salvo</li><li><b>02</b> Filtros de busca sob seu controle</li><li><b>03</b> Próximos passos depois da arrematação</li></ul>
    </section>
    <section className="auth-panel" aria-labelledby="auth-title">
      <div className="auth-card">
        <div className="auth-tabs" aria-label="Acesso à conta"><button type="button" aria-pressed={creating} onClick={() => changeMode('signup')}>Criar conta</button><button type="button" aria-pressed={!creating} onClick={() => changeMode('signin')}>Entrar</button></div>
        <span className="housing-eyebrow">{creating ? 'COMECE SUA BUSCA' : 'BEM-VINDO DE VOLTA'}</span>
        <h2 id="auth-title">{creating ? 'Crie sua conta' : 'Acesse sua conta'}</h2>
        <p className="housing-muted">{creating ? 'Depois, vamos entender onde e como você quer morar.' : 'Continue sua busca e reveja seus imóveis.'}</p>
        <form onSubmit={submit}>
          <div className="housing-fields">
            {creating && <label className="housing-field"><span>Nome completo</span><input type="text" value={form.name} onChange={event => update('name', event.target.value)} required minLength={3} maxLength={120} autoComplete="name" placeholder="Como podemos chamar você?" /></label>}
            <label className="housing-field"><span>E-mail</span><input type="email" value={form.email} onChange={event => update('email', event.target.value)} required maxLength={200} autoComplete="email" placeholder="voce@exemplo.com" /></label>
            <label className="housing-field"><span>Senha</span><div className="auth-password"><input type={showPassword ? 'text' : 'password'} value={form.password} onChange={event => update('password', event.target.value)} required minLength={8} maxLength={128} autoComplete={creating ? 'new-password' : 'current-password'} placeholder={creating ? 'Mínimo de 8 caracteres' : 'Digite sua senha'} /><button type="button" onClick={() => setShowPassword(value => !value)} aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}>{showPassword ? 'Ocultar' : 'Mostrar'}</button></div></label>
            {creating && <label className="housing-field"><span>Confirmar senha</span><input type={showPassword ? 'text' : 'password'} value={form.confirmPassword} onChange={event => update('confirmPassword', event.target.value)} required minLength={8} maxLength={128} autoComplete="new-password" placeholder="Repita sua senha" /></label>}
            {creating && <label className="auth-consent"><input type="checkbox" checked={form.acceptedTerms} onChange={event => update('acceptedTerms', event.target.checked)} required /><span>Li e concordo com os Termos de uso e a Política de privacidade.</span></label>}
          </div>
          {error && <p role="alert" className="housing-error">{error}</p>}
          <button className="btn primary auth-submit" disabled={busy}>{busy ? 'Aguarde…' : creating ? 'Criar minha conta →' : 'Entrar →'}</button>
        </form>
        <div className="auth-divider">ou</div>
        <div className="auth-google" ref={googleButtonRef} aria-label={creating ? 'Criar conta com Google' : 'Entrar com Google'} />
        <p className="auth-switch">{creating ? 'Já tem uma conta?' : 'Ainda não tem uma conta?'} <button type="button" onClick={() => changeMode(creating ? 'signin' : 'signup')}>{creating ? 'Entrar' : 'Criar conta'}</button></p>
        {allowExplore
          ? <Link className="auth-explore" to="/?busca=todos">Explorar imóveis antes de criar a conta</Link>
          : <p className="auth-required-note">Crie sua conta ou entre para acessar o catálogo e manter suas escolhas organizadas.</p>}
      </div>
    </section>
  </main>;
}
