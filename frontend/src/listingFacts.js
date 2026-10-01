// Ocupação e formas de pagamento como a Caixa publica na ficha do imóvel.
//
// A API já entrega `occupancy`, `acceptsFgts` e `acceptsFinancing` prontos. O
// texto de `editalData` só é lido quando o campo pronto não veio — um backend
// antigo ou uma análise gravada antes dele.

function normalized(value) {
  return String(value || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

const OCCUPANCY_VALUES = new Set(['occupied', 'vacant', 'unknown']);

/** 'vacant' e 'occupied' só quando a Caixa afirma; o resto é 'unknown'. */
export function occupancyStatus(property) {
  const p = property || {};
  if (OCCUPANCY_VALUES.has(p.occupancy)) return p.occupancy;
  const text = normalized(p.editalData?.occupancy || p.edital?.editalData?.occupancy);
  // "desocupado" contém "ocupado": a ordem importa.
  if (text.includes('desocupad')) return 'vacant';
  if (text.includes('ocupad')) return 'occupied';
  return 'unknown';
}

/** FGTS e financiamento aceitos; `null` quando a Caixa não publicou a lista. */
export function paymentFacts(property) {
  const p = property || {};
  if (typeof p.acceptsFgts === 'boolean' || typeof p.acceptsFinancing === 'boolean') {
    return {
      fgts: typeof p.acceptsFgts === 'boolean' ? p.acceptsFgts : null,
      financing: typeof p.acceptsFinancing === 'boolean' ? p.acceptsFinancing : null,
    };
  }
  const text = normalized(p.editalData?.paymentMethods || p.edital?.editalData?.paymentMethods);
  if (!text) return { fgts: null, financing: null };
  return {
    fgts: text.includes('fgts') && !text.includes('nao permite utilizacao de fgts'),
    financing: text.includes('permite financiamento') && !text.includes('nao permite financiamento'),
  };
}

const OCCUPANCY_BADGES = {
  vacant: { label: 'Desocupado', tone: 'good', title: 'A Caixa informa que não há ninguém morando no imóvel.' },
  occupied: { label: 'Ocupado', tone: 'warn', title: 'A Caixa informa que há alguém morando no imóvel. Pode ser preciso desocupar depois da compra.' },
  unknown: { label: 'Ocupação não informada', tone: 'neutral', title: 'A Caixa não informou se há alguém morando no imóvel.' },
};

/**
 * Selos do card, na ordem de leitura: quem mora lá, FGTS, financiamento.
 * FGTS sempre aparece (sim, não ou não informado); financiamento só quando é
 * aceito, e "Só à vista" quando a Caixa exige pagamento integral.
 */
export function listingBadges(property) {
  const badges = [{ key: 'occupancy', ...OCCUPANCY_BADGES[occupancyStatus(property)] }];
  const { fgts, financing } = paymentFacts(property);
  if (fgts === true) {
    badges.push({ key: 'fgts', label: 'Aceita FGTS', tone: 'good', title: 'A Caixa permite usar o FGTS nesta compra, conforme as regras do fundo.' });
  } else if (fgts === false) {
    badges.push({ key: 'fgts', label: 'Não aceita FGTS', tone: 'muted', title: 'A Caixa não lista o FGTS entre as formas de pagamento deste imóvel.' });
  } else {
    badges.push({ key: 'fgts', label: 'FGTS não informado', tone: 'neutral', title: 'A Caixa não publicou as formas de pagamento deste imóvel.' });
  }
  if (financing === true) {
    badges.push({ key: 'financing', label: 'Aceita financiamento', tone: 'good', title: 'A Caixa permite financiar esta compra (SBPE), sujeito a aprovação de crédito.' });
  } else if (fgts === false && financing === false) {
    badges.push({ key: 'financing', label: 'Só à vista', tone: 'muted', title: 'A Caixa exige pagamento com recursos próprios, sem FGTS nem financiamento.' });
  }
  return badges;
}
