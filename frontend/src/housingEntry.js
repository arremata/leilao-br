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
