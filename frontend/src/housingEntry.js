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

export function shouldUseAccountScreen({ pathname, account }) {
  if (!account) return true;
  if (pathname === '/entrar' || pathname === '/preferencias') return true;
  return false;
}

export function accountDestination(value, fallback = '/') {
  const destination = typeof value === 'string' ? value.trim() : '';
  if (!destination.startsWith('/') || destination.startsWith('//')) return fallback;
  if (destination.split(/[?#]/)[0] === '/entrar') return fallback;
  return destination;
}

export function postSetupDestination(value) {
  const destination = accountDestination(value);
  const pathname = destination.split(/[?#]/)[0];
  return ['/perfil', '/preferencias'].includes(pathname) ? '/' : destination;
}

export function housingPreferencesFlow(search = '', afterSetupDestination = '/') {
  const initialSetup = new URLSearchParams(search).get('origem') === 'cadastro';
  return initialSetup ? {
    successDestination: postSetupDestination(afterSetupDestination),
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
