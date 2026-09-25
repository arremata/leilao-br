import { useId, useMemo, useState } from 'react';
import { exactSearchOption, matchingSearchOptions } from '../searchableOptions';

export default function SearchableAutocomplete({
  label,
  options = [],
  value,
  onChange,
  placeholder,
  clearLabel,
  emptyMessage,
  disabled = false,
}) {
  const inputId = useId();
  const listId = useId();
  const [draft, setDraft] = useState(null);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const query = draft ?? value ?? '';
  const matches = useMemo(() => matchingSearchOptions(options, query), [options, query]);

  function select(option) {
    setDraft(null);
    onChange(option);
    setOpen(false);
    setActiveIndex(0);
  }

  function commitTypedValue() {
    if (disabled) return;
    if (!query.trim()) {
      select('');
      return;
    }
    const exact = exactSearchOption(options, query);
    if (exact) select(exact);
    else setDraft(null);
  }

  function handleKeyDown(event) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setOpen(true);
      setActiveIndex(index => Math.min(index + 1, Math.max(matches.length - 1, 0)));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex(index => Math.max(index - 1, 0));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      if (open && matches[activeIndex]) select(matches[activeIndex]);
      else commitTypedValue();
    } else if (event.key === 'Escape') {
      setOpen(false);
      setDraft(null);
    }
  }

  return <div className="housing-field housing-autocomplete-field">
    <label htmlFor={inputId}>{label}</label>
    <div
      className={`search-autocomplete${disabled ? ' disabled' : ''}`}
      onBlur={event => {
        if (event.currentTarget.contains(event.relatedTarget)) return;
        commitTypedValue();
        setOpen(false);
      }}
    >
      <div className="search-autocomplete-input">
        <span aria-hidden="true">⌕</span>
        <input
          id={inputId}
          type="text"
          role="combobox"
          aria-autocomplete="list"
          aria-controls={listId}
          aria-expanded={!disabled && open}
          aria-activedescendant={open && matches[activeIndex] ? `${listId}-${activeIndex}` : undefined}
          autoComplete="off"
          disabled={disabled}
          placeholder={placeholder}
          value={query}
          onChange={event => {
            const next = event.target.value;
            setDraft(next);
            setOpen(true);
            setActiveIndex(0);
            if (!next) onChange('');
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
        />
        {query && !disabled && <button type="button" onClick={() => select('')} aria-label={clearLabel}>×</button>}
      </div>
      {!disabled && open && <div className="search-autocomplete-menu" id={listId} role="listbox">
        {matches.length > 0
          ? matches.map((option, index) => <button
            type="button"
            role="option"
            aria-selected={option === value}
            className={index === activeIndex ? 'active' : ''}
            id={`${listId}-${index}`}
            key={option}
            onMouseDown={event => event.preventDefault()}
            onMouseEnter={() => setActiveIndex(index)}
            onClick={() => select(option)}
          >{option}</button>)
          : <p>{emptyMessage}</p>}
      </div>}
    </div>
  </div>;
}
