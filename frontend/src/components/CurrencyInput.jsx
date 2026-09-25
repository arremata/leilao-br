import { currencyInputValue, formatBRLCurrencyInput } from '../currencyInput';

export default function CurrencyInput({ label, value, onChange }) {
  return <label className="housing-field housing-currency-field">
    <span>{label}</span>
    <input
      type="text"
      inputMode="numeric"
      autoComplete="off"
      maxLength={22}
      placeholder="Sem limite"
      aria-label={label}
      value={formatBRLCurrencyInput(value)}
      onChange={event => onChange(currencyInputValue(event.target.value))}
    />
  </label>;
}
