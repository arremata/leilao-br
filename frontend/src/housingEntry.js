import { isCompleteHousingProfile } from './housingProfile.js';

export function shouldShowHousingOnboarding({
  isPreview,
  account,
  profile,
}) {
  if (isPreview) return false;
  return !account || !isCompleteHousingProfile(profile);
}

export function shouldUseAccountScreen({ pathname, isPreview, account }) {
  if (pathname === '/entrar' || pathname === '/preferencias') return true;
  if (!account && (!isPreview || pathname === '/perfil')) return true;
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
    cancelDestination: null,
    cancelLabel: null,
    required: true,
  } : {
    successDestination: '/perfil',
    finalLabel: 'Salvar preferências',
    cancelDestination: '/perfil',
    cancelLabel: 'Cancelar',
    required: false,
  };
}
