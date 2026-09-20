import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from './AuthContext';

const PUBLIC_PATH = /^\/imovel\/[^/]+$/;

export default function LoginGate({ children }) {
  const { isAuthed, sessionExpired } = useAuth();
  const location = useLocation();
  const isPublic = PUBLIC_PATH.test(location.pathname);

  if (isAuthed || isPublic) return children;
  return <LoginScreen sessionExpired={sessionExpired} />;
}

function LoginScreen({ sessionExpired }) {
  const { loginWithGoogle } = useAuth();
  const buttonRef = useRef(null);

  useEffect(() => {
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
    if (!clientId || !window.google?.accounts?.id) return undefined;

    window.google.accounts.id.initialize({
      client_id: clientId,
      callback: async ({ credential }) => {
        try { await loginWithGoogle(credential); } catch { /* screen stays visible */ }
      },
    });
    window.google.accounts.id.renderButton(buttonRef.current, {
      theme: 'outline', size: 'large', text: 'continue_with', shape: 'pill', width: 320,
    });
    window.google.accounts.id.prompt();
    return () => window.google.accounts.id.cancel();
  }, [loginWithGoogle]);

  return (
    <div style={{
      minHeight: '100dvh', display: 'grid', placeItems: 'center',
      background: 'var(--bg-0)', padding: '24px',
    }}>
      <div className="card" style={{ maxWidth: 420, padding: '40px 36px', textAlign: 'center' }}>
        <div className="brand" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8, marginBottom: 18 }}>
          <span className="logo" />
          <span style={{ fontWeight: 600, fontSize: 18 }}>Argos</span>
        </div>
        <h1 className="h1" style={{ marginBottom: 10 }}>Quero encontrar meu lugar.</h1>
        <p style={{ color: 'var(--fg-2)', marginBottom: 24, fontSize: 14, lineHeight: 1.55 }}>
          Imóveis da Caixa com a conta de quanto você pagaria até receber a chave.
          Entre para salvar imóveis e continuar de onde parou.
        </p>
        {sessionExpired && (
          <p role="status" style={{ color: 'var(--danger, #b91c1c)', marginBottom: 16, fontSize: 13 }}>
            Sua sessão expirou. Entre de novo.
          </p>
        )}
        <div ref={buttonRef} style={{ display: 'flex', justifyContent: 'center', minHeight: 44 }} />
        <p style={{ color: 'var(--fg-3)', fontSize: 12, marginTop: 20 }}>
          Ao entrar, você concorda com os termos da Argos.
        </p>
      </div>
    </div>
  );
}
