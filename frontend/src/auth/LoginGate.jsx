/**
 * Gate logic moved inside the app: /entrar and /perfil are public HousingLogin /
 * HousingQuestionnaire routes; HousingEntry decides feed-vs-login-vs-onboarding;
 * /imovel/{id} is a public product contract. AuthContext still owns Google-login
 * session state; this wrapper only exists so main.jsx can compose cleanly.
 */
export default function LoginGate({ children }) {
  return children;
}
