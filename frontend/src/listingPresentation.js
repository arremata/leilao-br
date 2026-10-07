// Listings use structured facts; source titles can contain the full address.
export function listingTitle(property) {
  const type = property.type || 'Imóvel';
  const area = Number(property.area);
  return Number.isFinite(area) && area > 0
    ? `${type} de ${area.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} m²`
    : type;
}

export function listingLocation(property) {
  const formatPlace = value => value?.trim().toLocaleLowerCase('pt-BR')
    .replace(/(^|[\s-])\p{L}/gu, word => word.toLocaleUpperCase('pt-BR'))
    .replace(/\b(?:De|Da|Do|Das|Dos|E)\b/g, word => word.toLocaleLowerCase('pt-BR'));
  const uf = property.uf?.trim().toLocaleUpperCase('pt-BR');
  // Some sources append the state to the city ("SAO JOSE DOS PINHAIS, PR").
  const city = uf ? property.city?.replace(new RegExp(`\\s*[,/-]\\s*${uf}\\s*$`, 'i'), '') : property.city;
  return [formatPlace(property.neighborhood), formatPlace(city), uf].filter(Boolean).join(' · ') || 'Cidade não informada';
}

// The Caixa publishes streets in capitals. Only full words change case;
// abbreviations such as "BL", "AP" or "N." stay exactly as published.
export function listingStreet(address) {
  return String(address || '').trim().replace(/\p{L}+/gu, word => {
    const lower = word.toLocaleLowerCase('pt-BR');
    if (['de', 'da', 'do', 'das', 'dos', 'e'].includes(lower)) return lower;
    if (word.length < 3 || word !== word.toLocaleUpperCase('pt-BR')) return word;
    return lower.charAt(0).toLocaleUpperCase('pt-BR') + lower.slice(1);
  }).replace(/^\p{L}/u, letter => letter.toLocaleUpperCase('pt-BR'));
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
