export function catalogSaleDetailVisibility(kind, pracaOptions, modalityOptions) {
  const isAuction = kind === 'auction';
  const showPraca = isAuction && pracaOptions.length > 1;
  const showModalidade = isAuction && modalityOptions.length > 2;

  return {
    showPraca,
    showModalidade,
    showGroup: showPraca || showModalidade,
  };
}
