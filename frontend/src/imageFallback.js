export function imageSourceForAttempt(src, attempt) {
  if (!src || attempt >= 2) return '';
  if (attempt === 0) return src;

  const hashIndex = src.indexOf('#');
  const path = hashIndex >= 0 ? src.slice(0, hashIndex) : src;
  const hash = hashIndex >= 0 ? src.slice(hashIndex) : '';
  const separator = path.includes('?') ? '&' : '?';
  return `${path}${separator}argos_retry=1${hash}`;
}
