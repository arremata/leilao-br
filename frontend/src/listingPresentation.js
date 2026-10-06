// Listings use structured facts; source titles can contain the full address.
export function listingTitle(property) {
  const type = property.type || 'Imóvel';
  const area = Number(property.area);
  return Number.isFinite(area) && area > 0
    ? `${type} de ${area.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} m²`
    : type;
}

export function listingLocation(property) {
  const city = property.city?.trim().toLocaleLowerCase('pt-BR')
    .replace(/(^|[\s-])\p{L}/gu, word => word.toLocaleUpperCase('pt-BR'))
    .replace(/\b(?:De|Da|Do|Das|Dos|E)\b/g, word => word.toLocaleLowerCase('pt-BR'));
  return [city, property.uf?.trim().toLocaleUpperCase('pt-BR')].filter(Boolean).join(' · ') || 'Cidade não informada';
}

export function listingPrice(property, schedule) {
  return schedule.current?.price ?? property.minBid;
}

export function roundDifference(schedule) {
  if (schedule.kind !== 'rounds') return null;
  const [first, second] = schedule.rounds;
  if (!(first?.price > 0) || !(second?.price > 0)) return null;
  const amount = second.price - first.price;
  return {
    amount,
    tone: amount < 0 ? 'less' : amount > 0 ? 'more' : 'equal',
    percentage: `${amount < 0 ? '−' : amount > 0 ? '+' : ''}${(Math.abs(amount) / first.price * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`,
  };
}

export function listingMoney(value) {
  return Number.isFinite(value) && value > 0
    ? `R$ ${value.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}`
    : 'A publicar';
}
