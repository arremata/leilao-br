import { useId, useMemo, useState } from 'react';
import { exactCity, matchingCities } from '../cityAutocomplete';

export default function CityAutocomplete({ cities, value, onChange, label = 'Cidade' }) {
  const inputId = useId();
  const listId = useId();
  const [query, setQuery] = useState(value || '');
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const options = useMemo(() => matchingCities(cities, query), [cities, query]);

  function select(city) {
    setQuery(city);
    onChange(city);
    setOpen(false);
    setActiveIndex(0);
  }

  function commitTypedValue() {
    if (!query.trim()) {
      select('');
      return;
    }
    const exact = exactCity(cities, query);
    if (exact) select(exact);
    else setQuery(value || '');
  }

  function handleKeyDown(event) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setOpen(true);
      setActiveIndex(index => Math.min(index + 1, Math.max(options.length - 1, 0)));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex(index => Math.max(index - 1, 0));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      if (open && options[activeIndex]) select(options[activeIndex]);
      else commitTypedValue();
    } else if (event.key === 'Escape') {
      setOpen(false);
      setQuery(value || '');
    }
  }

  return <div className="housing-field housing-city-field">
    <label htmlFor={inputId}>{label}</label>
    <div
      className="city-autocomplete"
      onBlur={event => {
        if (event.currentTarget.contains(event.relatedTarget)) return;
        commitTypedValue();
        setOpen(false);
      }}
    >
      <div className="city-autocomplete-input">
      <span aria-hidden="true">⌕</span>
      <input
        id={inputId}
        type="text"
        role="combobox"
        aria-autocomplete="list"
        aria-controls={listId}
        aria-expanded={open}
        aria-activedescendant={open && options[activeIndex] ? `${listId}-${activeIndex}` : undefined}
        autoComplete="off"
        placeholder="Todas as cidades"
        value={query}
        onChange={event => {
          const next = event.target.value;
          setQuery(next);
          setOpen(true);
          setActiveIndex(0);
          if (!next) onChange('');
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKeyDown}
      />
      {query && <button type="button" onClick={() => select('')} aria-label="Limpar cidade">×</button>}
      </div>
      {open && <div className="city-autocomplete-menu" id={listId} role="listbox">
      {options.length > 0
        ? options.map((city, index) => <button
          type="button"
          role="option"
          aria-selected={city === value}
          className={index === activeIndex ? 'active' : ''}
          id={`${listId}-${index}`}
          key={city}
          onMouseDown={event => event.preventDefault()}
          onMouseEnter={() => setActiveIndex(index)}
          onClick={() => select(city)}
        >{city}</button>)
        : <p>Nenhuma cidade encontrada.</p>}
      </div>}
    </div>
  </div>;
}
