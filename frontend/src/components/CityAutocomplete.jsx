import SearchableAutocomplete from './SearchableAutocomplete';

export default function CityAutocomplete({ cities, value, onChange, label = 'Cidade' }) {
  return <SearchableAutocomplete
    label={label}
    options={cities}
    value={value}
    onChange={onChange}
    placeholder="Todas as cidades"
    clearLabel="Limpar cidade"
    emptyMessage="Nenhuma cidade encontrada."
  />;
}
