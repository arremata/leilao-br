export function shouldShowHousingOnboarding({
  isPreview,
  account,
  profile,
  searchParamCount,
}) {
  if (isPreview) return false;
  return (!account || !profile) && searchParamCount === 0;
}

export function shouldUseAccountScreen({ pathname, isPreview, account, hasSearch }) {
  if (pathname === '/entrar' || pathname === '/perfil') return true;
  return pathname === '/' && !isPreview && !account && !hasSearch;
}
