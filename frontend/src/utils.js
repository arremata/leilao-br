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
