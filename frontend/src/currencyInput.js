const MAX_REAIS_DIGITS = 15;

export function currencyInputValue(value) {
  const raw = String(value ?? '').trim();
  const integerPart = raw.includes(',') ? raw.split(',')[0] : raw;
  const digits = integerPart.replace(/\D/g, '').replace(/^0+/, '').slice(0, MAX_REAIS_DIGITS);
  return digits || '';
}

export function formatBRLCurrencyInput(value) {
  const digits = currencyInputValue(value);
  return digits ? `R$ ${Number(digits).toLocaleString('pt-BR')}` : '';
}
