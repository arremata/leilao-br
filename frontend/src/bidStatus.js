const SAO_PAULO = 'America/Sao_Paulo';

export function officialBidStatus(property) {
  if (String(property?.source || '').toLowerCase() !== 'caixa') return null;
  const raw = property?.editalData?.bid || property?.edital?.editalData?.bid;
  if (!raw || !['registered', 'none'].includes(raw.status)) return null;

  const count = Number(raw.count);
  const highestAmount = Number(raw.highestAmount);
  return {
    status: raw.status,
    count: Number.isInteger(count) && count >= 0 ? count : null,
    highestAmount: Number.isFinite(highestAmount) && highestAmount > 0
      ? highestAmount
      : null,
    fetchedAt: raw.fetchedAt || null,
    sourceLabel: raw.sourceLabel || 'Fonte oficial',
    sourceUrl: /^https?:\/\//i.test(raw.sourceUrl || '') ? raw.sourceUrl : null,
  };
}

export function formatBidCheckedAt(value) {
  if (!value) return '';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toLocaleString('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: SAO_PAULO,
  });
}
