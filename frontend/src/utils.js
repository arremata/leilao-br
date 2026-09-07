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
