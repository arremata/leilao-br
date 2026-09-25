import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  emptyHousingProfile,
  housingBudgetOptions,
  validateHousingProfile,
} from '../housingProfile';
import CityAutocomplete from './CityAutocomplete';
import './housing.css';

const housingSteps = ['Localização', 'Tipo de imóvel', 'Orçamento'];
const stepTitles = [
  'Onde você quer morar?',
  'Que tipo de imóvel combina com você?',
  'Qual faixa cabe no seu plano?',
];
const stepDescriptions = [
  'Conte onde pretende procurar. Essa resposta fica no seu perfil e não filtra o catálogo.',
  'Essa informação nos ajuda a entender sua necessidade, sem limitar os imóveis exibidos.',
  'Registre o maior valor que pretende pagar. Você continuará vendo o catálogo completo.',
];

const propertyTypeOptions = [
  { value: 'Todos', icon: '⌂', label: 'Casa ou apartamento' },
  { value: 'Casa', icon: '⌂', label: 'Casa' },
  { value: 'Apartamento', icon: '▦', label: 'Apartamento' },
];

function ChoiceGroup({ name, value, options, onChange, columns = 3 }) {
  return <div className={`housing-choice-grid columns-${columns}`} role="group" aria-label={name}>
    {options.map(option => <button
      className="housing-choice"
      type="button"
      key={option.value || 'empty'}
      aria-pressed={String(value) === option.value}
      onClick={() => onChange(option.value)}
    >
      {option.icon && <span className="housing-choice-icon" aria-hidden="true">{option.icon}</span>}
      <b>{option.label}</b>
      <span className="housing-choice-check" aria-hidden="true">✓</span>
    </button>)}
  </div>;
}

export function HousingFields({
  step,
  profile,
  onChange,
  cities = [],
  variant = 'filters',
}) {
  const field = (key, label, { hint = '' } = {}) => <label className="housing-field" key={key}>
    <span>{label}</span>
    <input
      name={key}
      type="text"
      maxLength={300}
      value={profile[key]}
      onChange={event => onChange(key, event.target.value)}
    />
    {hint && <small>{hint}</small>}
  </label>;
  if (step === 0) {
    const availableCities = [...new Set([profile.city, ...cities].filter(Boolean))].sort();
    return <div className="housing-fields">
      <CityAutocomplete
        key={profile.city}
        cities={availableCities}
        value={profile.city}
        onChange={value => onChange('city', value)}
      />
      {variant === 'filters' && field('neighborhood', 'Bairro · opcional', { hint: 'Deixe em branco para considerar a cidade inteira.' })}
    </div>;
  }

  if (step === 1) return <div className="housing-fields">
    <ChoiceGroup
      name="Tipo de imóvel"
      value={profile.propertyType}
      options={propertyTypeOptions}
      onChange={value => onChange('propertyType', value)}
    />
  </div>;

  return <div className="housing-fields">
    <ChoiceGroup
      name="Faixa de preço"
      value={profile.budget}
      options={housingBudgetOptions}
      onChange={value => onChange('budget', value)}
      columns={2}
    />
    <p className="housing-help">A faixa considera somente o valor inicial do imóvel. Taxas, reforma e outras despesas aparecem no detalhe.</p>
  </div>;
}

export default function HousingQuestionnaire({ initialProfile, cities, onSave }) {
  const [profile, setProfile] = useState(() => ({ ...emptyHousingProfile, ...initialProfile }));
  const [step, setStep] = useState(0);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const navigate = useNavigate();
  const update = (key, value) => setProfile(current => ({ ...current, [key]: value }));

  async function next(event) {
    event.preventDefault();
    const valid = validateHousingProfile(profile);
    if (!valid) {
      setError('Não foi possível salvar essa escolha. Tente novamente.');
      return;
    }
    setError('');
    if (step < housingSteps.length - 1) {
      setStep(current => current + 1);
      return;
    }
    setSaving(true);
    try {
      await onSave(valid);
      navigate('/', { replace: true });
    } catch {
      setError('Não foi possível salvar o perfil. Tente novamente.');
    } finally {
      setSaving(false);
    }
  }

  return <main className="housing-onboarding">
    <form className="housing-questionnaire" onSubmit={next}>
      <header className="housing-questionnaire-header">
        <Link className="auth-brand" to="/?busca=todos"><span className="logo" />Argos</Link>
        <div className="housing-step-top"><span>SEU PERFIL DE MORADIA</span><span>{step + 1} de {housingSteps.length}</span></div>
        <div className="housing-step-bars" aria-label={`Etapa ${step + 1} de ${housingSteps.length}`}>
          {housingSteps.map((label, index) => <span key={label} className={index <= step ? 'filled' : ''} />)}
        </div>
      </header>
      <section className="housing-question-body">
        <span className="housing-eyebrow">{housingSteps[step]}</span>
        <h1>{stepTitles[step]}</h1>
        <p className="housing-muted">{stepDescriptions[step]}</p>
        <HousingFields
          step={step}
          profile={profile}
          onChange={update}
          cities={cities}
          variant="onboarding"
        />
        {error && <p role="alert" className="housing-error">{error}</p>}
      </section>
      <footer className="housing-form-footer">
        {step > 0
          ? <button className="housing-back" type="button" onClick={() => { setStep(current => current - 1); setError(''); }}><span aria-hidden="true">←</span><b>Voltar</b></button>
          : <button className="housing-skip" type="button" onClick={() => navigate('/?busca=todos')}>Agora não</button>}
        <button className="housing-next" disabled={saving}>
          <b>{saving ? 'Salvando…' : step < housingSteps.length - 1 ? 'Continuar' : 'Salvar e ver imóveis'}</b>
          <span aria-hidden="true">→</span>
        </button>
      </footer>
    </form>
  </main>;
}
