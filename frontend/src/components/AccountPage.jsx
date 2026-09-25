import { Link, useSearchParams } from 'react-router-dom';
import { emptyHousingProfile, housingBudgetLabel } from '../housingProfile';
import './housing.css';

const profileTypeLabels = {
  Todos: 'Casa ou apartamento',
  Casa: 'Casa',
  Apartamento: 'Apartamento',
};

function AccountIcon({ name, size = 20 }) {
  const paths = {
    user: <><circle cx="12" cy="8" r="3.25" /><path d="M5.75 19c.45-3.25 2.55-5 6.25-5s5.8 1.75 6.25 5" /></>,
    mail: <><rect x="3.5" y="5.5" width="17" height="13" rx="2.5" /><path d="m5 7 7 5.25L19 7" /></>,
    pin: <><path d="M19 10c0 5-7 10-7 10S5 15 5 10a7 7 0 1 1 14 0Z" /><circle cx="12" cy="10" r="2.25" /></>,
    home: <><path d="m3.5 11 8.5-7 8.5 7" /><path d="M5.5 9.5V20h13V9.5M9.5 20v-6h5v6" /></>,
    wallet: <><path d="M4 6.5h13.5a2.5 2.5 0 0 1 2.5 2.5v9.5H5.5A2.5 2.5 0 0 1 3 16V6a2.5 2.5 0 0 1 2.5-2.5H17" /><path d="M15.5 11.5H20" /><circle cx="15.5" cy="11.5" r=".6" fill="currentColor" stroke="none" /></>,
    cloud: <><path d="M7.5 18.5H17a4 4 0 0 0 .45-7.98A6 6 0 0 0 6 9.5v.22a4.5 4.5 0 0 0 1.5 8.78Z" /><path d="m9.5 14 2 2 4-4" /></>,
    device: <><rect x="5.5" y="2.5" width="13" height="19" rx="2.5" /><path d="M10 18.5h4" /></>,
    spark: <><path d="m12 2 1.45 5.05L18.5 8.5l-5.05 1.45L12 15l-1.45-5.05L5.5 8.5l5.05-1.45L12 2Z" /><path d="m18 14 .72 2.28L21 17l-2.28.72L18 20l-.72-2.28L15 17l2.28-.72L18 14Z" /></>,
  };
  return <svg aria-hidden="true" className="account-icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}

export function UserMark({ size = 'normal' }) {
  return <span className={`user-mark user-mark--${size}`} aria-hidden="true"><AccountIcon name="user" size={size === 'large' ? 30 : 19} /></span>;
}

function PreferenceCard({ icon, label, value, detail }) {
  return <article className="account-preference-card">
    <span className="account-preference-icon"><AccountIcon name={icon} /></span>
    <div>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </div>
  </article>;
}

export default function AccountPage({ account, profile, serverAccount, onSignOut }) {
  const [params] = useSearchParams();
  const activeTab = params.get('aba') === 'assinatura' ? 'subscription' : 'profile';
  const savedProfile = { ...emptyHousingProfile, ...profile };
  const displayName = account?.name?.trim() || 'Sua conta';
  const firstName = displayName.split(/\s+/)[0];
  const email = account?.email || 'E-mail não disponível';
  const hasPreferences = Boolean(profile);

  return <main className="account-page">
    <header className="account-heading">
      <div>
        <span className="housing-eyebrow">SUA CONTA ARGOS</span>
        <h1>Olá, {firstName}.</h1>
        <p>Confira seus dados e mantenha sua busca por um imóvel do seu jeito.</p>
      </div>
      <UserMark size="large" />
    </header>

    <nav className="account-tabs" aria-label="Seções da conta">
      <Link
        to="/perfil"
        className={activeTab === 'profile' ? 'active' : ''}
        aria-current={activeTab === 'profile' ? 'page' : undefined}
      >
        <AccountIcon name="user" />
        <span><b>Perfil</b><small>Dados e preferências</small></span>
      </Link>
      <Link
        to="/perfil?aba=assinatura"
        className={activeTab === 'subscription' ? 'active' : ''}
        aria-current={activeTab === 'subscription' ? 'page' : undefined}
      >
        <AccountIcon name="spark" />
        <span><b>Assinatura</b><small>Planos Argos</small></span>
        <em>Em breve</em>
      </Link>
    </nav>

    {activeTab === 'profile' ? <div className="account-profile-layout">
      <section className="account-panel account-identity" aria-labelledby="account-identity-title">
        <div className="account-panel-heading">
          <div>
            <span className="account-section-kicker">SEUS DADOS</span>
            <h2 id="account-identity-title">Informações da conta</h2>
          </div>
          <span className="account-data-status">
            <AccountIcon name={serverAccount ? 'cloud' : 'device'} size={16} />
            {serverAccount ? 'Sincronizada' : 'Neste navegador'}
          </span>
        </div>

        <div className="account-person">
          <UserMark size="large" />
          <div><strong>{displayName}</strong><span>{email}</span></div>
        </div>

        <dl className="account-facts">
          <div><dt>Nome</dt><dd>{displayName}</dd></div>
          <div><dt>E-mail</dt><dd><AccountIcon name="mail" size={17} />{email}</dd></div>
          <div className="account-storage-fact">
            <dt>Onde seus dados ficam</dt>
            <dd>{serverAccount
              ? 'Sua conta Google mantém Salvos e Vistos sincronizados entre dispositivos.'
              : 'Este acesso e suas preferências ficam salvos somente neste navegador.'}</dd>
          </div>
        </dl>

        <button type="button" className="account-signout" onClick={onSignOut}>Sair da conta</button>
      </section>

      <section className="account-panel account-preferences" aria-labelledby="account-preferences-title">
        <div className="account-panel-heading">
          <div>
            <span className="account-section-kicker">SEU PLANO DE MORADIA</span>
            <h2 id="account-preferences-title">O que você procura</h2>
            <p>Essas escolhas ajudam a organizar o catálogo para você.</p>
          </div>
          <Link className="btn account-edit-preferences" to="/preferencias">
            {hasPreferences ? 'Alterar preferências' : 'Definir preferências'}
          </Link>
        </div>

        <div className="account-preferences-grid">
          <PreferenceCard
            icon="pin"
            label="Cidade"
            value={savedProfile.city || 'Qualquer cidade'}
            detail={savedProfile.city ? 'Sua região de interesse' : 'Mostrando todas as cidades'}
          />
          <PreferenceCard
            icon="home"
            label="Tipo de imóvel"
            value={profileTypeLabels[savedProfile.propertyType] || 'Casa ou apartamento'}
            detail="Usado para organizar os resultados"
          />
          <PreferenceCard
            icon="wallet"
            label="Preço inicial"
            value={housingBudgetLabel(savedProfile.budget)}
            detail="Custos adicionais aparecem em cada imóvel"
          />
        </div>

        <div className="account-preferences-note">
          <span aria-hidden="true">i</span>
          <p>Você pode mudar essas escolhas quando quiser. Elas não limitam sua conta nem escondem permanentemente outros imóveis.</p>
        </div>
      </section>
    </div> : <section className="account-panel account-subscription" aria-labelledby="account-subscription-title">
      <div className="account-subscription-art" aria-hidden="true">
        <span><AccountIcon name="spark" size={34} /></span>
        <i />
        <i />
      </div>
      <span className="account-coming-soon">EM BREVE</span>
      <h2 id="account-subscription-title">Assinatura Argos</h2>
      <p>Quando os planos estiverem disponíveis, você poderá comparar as opções e administrar tudo por aqui.</p>
      <div className="account-no-charge"><span>✓</span><b>Não há assinatura ou cobrança ativa na sua conta.</b></div>
      <Link to="/" className="btn primary">Continuar vendo imóveis</Link>
    </section>}
  </main>;
}
