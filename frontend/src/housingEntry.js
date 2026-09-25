export function shouldShowHousingOnboarding({
  isPreview,
  account,
  profile,
  appliedProfile,
  searchParamCount,
}) {
  if (isPreview) return false;
  return (!account || !profile) && !appliedProfile && searchParamCount === 0;
}

export function shouldUseAccountScreen({ pathname, isPreview, account, hasSearch }) {
  if (pathname === '/entrar' || pathname === '/preferencias') return true;
  if (pathname === '/perfil') return !account;
  return pathname === '/' && !isPreview && !account && !hasSearch;
}

export function housingPreferencesFlow(search = '') {
  const initialSetup = new URLSearchParams(search).get('origem') === 'cadastro';
  return initialSetup ? {
    successDestination: '/',
    finalLabel: 'Ver imóveis',
    cancelDestination: '/?busca=todos',
    cancelLabel: 'Agora não',
  } : {
    successDestination: '/perfil',
    finalLabel: 'Salvar preferências',
    cancelDestination: '/perfil',
    cancelLabel: 'Cancelar',
  };
}
