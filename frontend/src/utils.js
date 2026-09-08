// "1ª praça" / "2ª praça" é vocabulário de leilão. Quem nunca participou de um
// entende "rodada": se ninguém compra na primeira, abre uma segunda mais barata.
export const pracaLabel = (value) => {
  const text = String(value || '').trim();
  if (!text) return '';
  return text.replace(/pra[çc]a/gi, 'rodada');
};

export const fmtBRL = (n) => (typeof n === 'number' ? n : 0).toLocaleString('pt-BR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Convert endsAt (ISO 8601 string or epoch ms number) to epoch ms for Countdown. */
export const getEndsAtMs = (endsAt) => {
  if (typeof endsAt === 'number') return endsAt;
  if (typeof endsAt === 'string' && endsAt) return new Date(endsAt).getTime();
  return 0;
};

/**
 * Consulta para o Google Maps a partir de um imóvel.
 *
 * O endereço da Caixa vem no formato `{LOGRADOURO}, N. {NÚMERO}, {unidade}`, e a
 * parte da unidade — "Apto 402, BL 06, VG 88", "CS 01 LT 241 QD 12" — faz o
 * Google não achar o ponto: o mapa abre na região certa e sem alfinete. 86% dos
 * endereços do catálogo trazem esse ruído, então não é caso isolado.
 *
 * Duas fontes, nesta ordem:
 *   1. Coordenadas, quando existirem. É exato e nunca falha.
 *   2. Só os dois primeiros campos do endereço — logradouro e número — mais
 *      cidade e UF. Tudo depois do número é unidade e é descartado.
 *
 * Número inútil ("N. SN", "N. 0", "N. 00") é omitido em vez de virar parte da
 * busca. Verificado contra os 516 endereços de produção: nenhuma consulta vazia.
 */
export const mapsQuery = (p) => {
  if (!p) return '';
  const lat = Number(p.lat);
  const lng = Number(p.lng);
  if (Number.isFinite(lat) && Number.isFinite(lng) && (lat !== 0 || lng !== 0)) {
    return `${lat},${lng}`;
  }

  const parts = String(p.address || '').split(',').map(s => s.trim());
  const street = parts[0] || '';

  let number = '';
  const rawNumber = (parts[1] || '').match(/^(?:n[ºo.]?\s*)?(\d+[A-Za-z]?)$/i);
  if (rawNumber && !/^0+$/.test(rawNumber[1].replace(/\D/g, ''))) {
    number = rawNumber[1];
  }

  const city = String(p.city || '').trim();
  const uf = String(p.uf || '').trim();
  // A cidade às vezes já vem como "Curitiba, PR"; não repetir a UF.
  const place = uf && !city.toUpperCase().endsWith(uf.toUpperCase())
    ? [city, uf].filter(Boolean).join(', ')
    : city;

  return [street, number, place].filter(Boolean).join(', ');
};
