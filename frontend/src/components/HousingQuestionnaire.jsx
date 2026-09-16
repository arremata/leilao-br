import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { emptyHousingProfile, validateHousingProfile } from '../housingProfile';
import './housing.css';

const housingSteps = ['Sua região', 'Seu jeito de morar', 'Seu orçamento', 'Sua rotina'];

export function HousingFields({ step, profile, onChange, cities = [], idPrefix = 'housing' }) {
  const field = (key, label, { type = 'text', hint = '', required = false } = {}) => <label className="housing-field" key={key}>
    <span>{label}</span><input name={key} type={type} min={type === 'number' ? 0 : undefined} step={type === 'number' ? 'any' : undefined} maxLength={type === 'text' ? 300 : undefined} required={required} value={profile[key]} onChange={e => onChange(key, e.target.value)} list={key === 'city' ? `${idPrefix}-cities` : undefined} />{hint && <small>{hint}</small>}
  </label>;
  const select = (key, label, options) => <label className="housing-field" key={key}><span>{label}</span><select name={key} value={profile[key]} onChange={e => onChange(key, e.target.value)}>{options.map(([value, text]) => <option key={value} value={value}>{text}</option>)}</select></label>;
  if (step === 0) return <div className="housing-fields">{field('city', 'Cidade onde gostaria de morar', { hint: 'Você também pode informar uma cidade que ainda não aparece no catálogo.' })}<datalist id={`${idPrefix}-cities`}>{cities.map(c => <option key={c} value={c} />)}</datalist>{field('neighborhood', 'Bairro desejado · opcional', { hint: 'Deixe em branco para considerar a cidade inteira.' })}</div>;
  if (step === 1) return <div className="housing-fields">{select('propertyType', 'Tipo de imóvel', [['Todos', 'Casa ou apartamento'], ['Casa', 'Casa'], ['Apartamento', 'Apartamento']])}<div className="housing-paired">{select('beds', 'Quartos essenciais', [['0', 'Sem exigência'], ['1', 'Pelo menos 1'], ['2', 'Pelo menos 2'], ['3', 'Pelo menos 3']])}{select('parking', 'Vagas essenciais', [['0', 'Sem exigência'], ['1', 'Pelo menos 1'], ['2', 'Pelo menos 2']])}</div>{select('timing', 'Quando precisa se mudar?', ['Ainda não defini', 'Posso esperar', 'Nos próximos meses'].map(s => [s, s]))}<p className="housing-help">Quartos e vagas são requisitos da busca: imóveis sem esses dados não aparecem quando você exige uma quantidade. O prazo de mudança fica como preferência; a disponibilidade depende de verificar a ocupação.</p></div>;
  if (step === 2) return <div className="housing-fields">{field('budget', 'Orçamento total de aquisição · R$', { type: 'number', hint: 'Compra e despesas extras, sem juros futuros do financiamento.' })}{field('reserve', 'Quanto quer reservar para os extras? · R$', { type: 'number', hint: 'Uma premissa sua para taxas, eventual desocupação, reforma e imprevistos. Em branco, não filtramos por orçamento.' })}{select('payment', 'Como pretende pagar?', ['Ainda estou avaliando', 'À vista', 'Com financiamento'].map(s => [s, s]))}<div className="housing-paired">{field('cash', 'Recursos disponíveis · R$', { type: 'number' })}{field('monthly', 'Gasto mensal confortável · R$', { type: 'number' })}</div>{profile.payment === 'Com financiamento' && <>{select('credit', 'Já consultou o banco?', ['Ainda não consultei', 'Estou em análise', 'Tenho crédito aprovado'].map(s => [s, s]))}{select('fgts', 'Pretende utilizar FGTS?', ['Ainda não sei', 'Sim, se for permitido', 'Não'].map(s => [s, s]))}</>}<p className="housing-help">Recursos, gasto mensal e forma de pagamento ficam no perfil. Esta busca não simula crédito nem garante que os extras estejam cobertos.</p></div>;
  return <div className="housing-fields">{field('work', 'Trabalho ou ponto de referência · opcional', { hint: 'Pode ser um bairro ou região aproximada. Não precisa informar seu endereço exato.' })}<div className="housing-paired">{select('transport', 'Como se desloca?', ['Carro', 'Transporte público', 'Bicicleta', 'A pé'].map(s => [s, s]))}{select('commute', 'Tempo de trajeto desejado', ['15', '30', '45', '60'].map(s => [s, `Até ${s} minutos`]))}</div>{field('rent', 'Aluguel atual · R$ · opcional', { type: 'number' })}<p className="housing-help">Trajetos e comparação aluguel × financiamento serão evoluções futuras. Por enquanto, essas informações ficam como preferências, sem mudar os resultados.</p></div>;
}

export default function HousingQuestionnaire({ initialProfile, cities, onSave }) {
  const [profile, setProfile] = useState(() => ({ ...emptyHousingProfile, ...initialProfile }));
  const [step, setStep] = useState(0);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const navigate = useNavigate();
  const update = (key, value) => setProfile(p => ({ ...p, [key]: value }));
  async function next(e) {
    e.preventDefault();
    const valid = validateHousingProfile(profile);
    if (!valid) { setError('Confira os valores: use números iguais ou maiores que zero.'); return; }
    setError('');
    if (step < 3) { setStep(step + 1); window.scrollTo({ top: 0 }); return; }
    setSaving(true);
    try { await onSave(valid); navigate('/', { replace: true }); }
    catch { setError('Não foi possível salvar o perfil. Tente novamente.'); }
    finally { setSaving(false); }
  }
  return <main className="housing-onboarding">
    <aside className="housing-welcome"><span className="housing-eyebrow">SEU PRÓXIMO LAR COMEÇA AQUI</span><h1>Um imóvel que cabe<br /> na sua vida.<br /> <em>E no seu bolso.</em></h1><p>Conte o que você procura. Vamos organizar as oportunidades de leilão e compra direta em torno da sua rotina.</p>{['Onde você quer viver', 'Seu orçamento, com os extras', 'Seu caminho até a mudança'].map((s, i) => <div className="housing-benefit" key={s}><b>0{i + 1}</b><span>{s}</span></div>)}<p className="housing-welcome-note">Você pode ajustar tudo depois.<br />O endereço de trabalho é opcional.</p></aside>
    <form className="housing-questionnaire" onSubmit={next}><div className="housing-step-top"><span>SEU PERFIL DE MORADIA</span><span>{step + 1} de 4</span></div><div className="housing-step-bars">{housingSteps.map((s, i) => <span key={s} className={i <= step ? 'filled' : ''} />)}</div><h2>{['Onde você gostaria de morar?', 'O que faz um imóvel ser seu lar?', 'Vamos pensar além do preço?', 'Como é a sua rotina?'][step]}</h2><p className="housing-muted">{['Escolha uma região para começar a busca.', 'Defina o que é essencial para você.', 'Pense na compra e nas despesas até a mudança.', 'A proximidade de um endereço pode ajudar na sua escolha.'][step]}</p><HousingFields step={step} profile={profile} onChange={update} cities={cities} />{error && <p role="alert" className="housing-error">{error}</p>}<footer className="housing-form-footer">{step > 0 ? <button type="button" onClick={() => { setStep(step - 1); setError(''); }}>← Voltar</button> : <button type="button" onClick={() => navigate('/?busca=todos')}>Explorar sem configurar</button>}<button className="btn primary" disabled={saving}>{saving ? 'Salvando…' : step < 3 ? 'Continuar →' : 'Encontrar meu próximo lar →'}</button></footer><p className="housing-help">Preferências salvas apenas neste navegador. Nenhuma conta é criada.</p></form>
  </main>;
}
