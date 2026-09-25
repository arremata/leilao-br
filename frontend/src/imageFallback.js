const CAIXA_PHOTO_ORIGIN = 'https://venda-imoveis.caixa.gov.br';
const CAIXA_PHOTO_PREFIX = '/fotos/';

export function propertyImageUrl(src) {
  if (!src) return '';
  try {
    const url = new URL(src);
    if (url.origin !== CAIXA_PHOTO_ORIGIN || !url.pathname.startsWith(CAIXA_PHOTO_PREFIX)) {
      return src;
    }
    const filename = url.pathname.slice(CAIXA_PHOTO_PREFIX.length);
    if (!filename || filename.includes('/')) return src;
    return `/api/photos/caixa/${filename}${url.search}${url.hash}`;
  } catch {
    return src;
  }
}

export function imageSourceForAttempt(src, attempt) {
  if (!src || attempt >= 2) return '';
  const imageUrl = propertyImageUrl(src);
  if (attempt === 0) return imageUrl;

  const hashIndex = imageUrl.indexOf('#');
  const path = hashIndex >= 0 ? imageUrl.slice(0, hashIndex) : imageUrl;
  const hash = hashIndex >= 0 ? imageUrl.slice(hashIndex) : '';
  const separator = path.includes('?') ? '&' : '?';
  return `${path}${separator}argos_retry=1${hash}`;
}
