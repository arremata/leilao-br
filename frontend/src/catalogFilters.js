const normalize = (value) => String(value || '')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .trim().toUpperCase();

export const isDirectSaleModality = (value) => normalize(value).includes('VENDA DIRETA');

// O catálogo abre com leilões e compra direta juntos; o tipo de venda é um
// filtro que a pessoa escolhe depois. `aba=leiloes` e `aba=direta` continuam
// valendo para links antigos.
export function saleKindFromParam(value) {
  if (value === 'leiloes') return 'auction';
  if (value === 'direta') return 'direct';
  return 'all';
}

export function saleKindToParam(kind) {
  if (kind === 'auction') return 'leiloes';
  if (kind === 'direct') return 'direta';
  return 'todos';
}

export function filterBySaleKind(properties, kind) {
  if (kind !== 'auction' && kind !== 'direct') return properties;
  return properties.filter(property => isDirectSaleModality(property.modalidade) === (kind === 'direct'));
}

// Na relevância, leilão com data vem antes de tudo o que não tem data, e a
// compra direta quase nunca tem. Misturados, todos os leilões passariam na
// frente e a compra direta só apareceria depois de várias páginas. Intercalar
// mantém a ordem própria de cada tipo e mostra os dois desde o topo.
export function interleaveBySaleKind(sorted) {
  const auctions = sorted.filter(property => !isDirectSaleModality(property.modalidade));
  const direct = sorted.filter(property => isDirectSaleModality(property.modalidade));
  const result = [];
  for (let i = 0; i < Math.max(auctions.length, direct.length); i += 1) {
    if (i < auctions.length) result.push(auctions[i]);
    if (i < direct.length) result.push(direct[i]);
  }
  return result;
}

export function catalogSaleDetailVisibility(kind, pracaOptions, modalityOptions) {
  // Rodada e modalidade são opções de leilão; somem só quando a pessoa escolhe
  // ver apenas compra direta.
  const showsAuctions = kind !== 'direct';
  const showPraca = showsAuctions && pracaOptions.length > 1;
  const showModalidade = showsAuctions && modalityOptions.length > 2;

  return {
    showPraca,
    showModalidade,
    showGroup: showPraca || showModalidade,
  };
}
