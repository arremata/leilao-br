import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import Feed from './Feed';
import { HousingFields } from './HousingQuestionnaire';
import { emptyHousingProfile, filterHousingProperties, validateHousingProfile } from '../housingProfile';
import { fmtBRL } from '../utils';

export default function HousingFeed({ profile, onSave, cities, appliedProfile, onApply, ...feedProps }) {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const all = params.get('busca') === 'todos' || (!profile && !appliedProfile && params.size > 0);
  const [draft, setDraft] = useState(() => ({ ...emptyHousingProfile, ...(appliedProfile || profile) }));
  const [open, setOpen] = useState(() => window.innerWidth > 1100);
  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState(false);
  const [step, setStep] = useState(0);
  const current = appliedProfile || profile;
  const visibleProperties = all ? feedProps.properties : filterHousingProperties(feedProps.properties, current);
  const update = (key, value) => setDraft(p => ({ ...p, [key]: value }));
  const setMode = value => setParams(value === 'all' ? { busca: 'todos' } : {});
  async function apply(save) {
    const valid = validateHousingProfile(draft);
    if (!valid) { setNotice('Confira os valores do orçamento.'); return; }
    setSaving(true);
    try {
      if (save) await onSave(valid);
      onApply(valid); setMode('personal');
      setNotice(save ? 'Perfil de moradia salvo.' : 'Busca ajustada. Seu perfil salvo continua igual.');
      if (window.innerWidth <= 1100) setOpen(false);
    } catch { setNotice('Não foi possível salvar. Tente novamente.'); }
    finally { setSaving(false); }
  }
  return <div className="housing-dashboard">
    <section className="housing-dashboard-heading"><div><span className="housing-eyebrow">COMPRAR PARA MORAR</span><h1>{all ? 'Explore novas possibilidades.' : 'Seu próximo lar pode estar aqui.'}</h1><p>Compare oportunidades, entenda os custos e escolha seu próximo passo.</p></div><button className="btn ghost" onClick={() => setOpen(!open)} aria-expanded={open} aria-controls="housing-search">☷ {open ? 'Ocultar' : 'Ajustar'} minha busca</button></section>
    <div className="housing-modes" aria-label="Busca de moradia"><button aria-pressed={!all} onClick={() => current ? setMode('personal') : navigate('/perfil')}>Para você</button><button aria-pressed={all} onClick={() => setMode('all')}>Todos os imóveis</button></div>
    <div className="housing-dashboard-layout">
      {open && <aside className="housing-search" id="housing-search" aria-label="Meu perfil de busca"><h2>Minha busca</h2><p className="housing-help">Aplique para explorar agora. Salve no perfil para os próximos acessos.</p><div className="housing-mini-tabs" role="tablist" aria-label="Preferências">{['Região', 'Imóvel', 'Orçamento', 'Rotina'].map((s, i) => <button key={s} role="tab" aria-selected={step === i} onClick={() => setStep(i)}>{s}</button>)}</div><HousingFields step={step} profile={draft} onChange={update} cities={cities} idPrefix="sidebar" /><button className="btn primary" disabled={saving} onClick={() => apply(false)}>Aplicar nesta busca</button><button className="btn ghost" disabled={saving} onClick={() => apply(true)}>{saving ? 'Salvando…' : 'Salvar como meu perfil'}</button><button className="housing-text-button" onClick={() => { setDraft({ ...emptyHousingProfile, ...profile }); onApply(null); setMode('personal'); setNotice('Perfil salvo restaurado.'); }}>Restaurar perfil salvo</button><Link className="housing-text-button" to="/perfil">Rever o questionário completo →</Link></aside>}
      <section className="housing-feed-main">
        {notice && <p role="status" className="housing-notice">{notice}</p>}
        <div className="housing-summary">{all ? <span>Exploração livre · seu perfil permanece salvo</span> : <><span>⌖ {current?.city || 'Todas as cidades'}{current?.neighborhood ? ` · ${current.neighborhood}` : ''}</span><span>{current?.propertyType === 'Todos' || !current?.propertyType ? 'Casa ou apartamento' : current.propertyType}</span>{Number(current?.budget) > 0 && <span>Aquisição até R$ {fmtBRL(Number(current.budget))}</span>}</>}</div>
        {!all && <div className="housing-budget-note"><b>O preço de compra é só o começo.</b><p>{current?.reserve !== '' && current?.reserve != null ? `Nesta busca, somamos sua reserva de R$ ${fmtBRL(Number(current.reserve))} ao preço inicial para conferir o orçamento. Isso não confirma que todas as despesas estão cobertas.` : 'Informe uma reserva para incluir os extras na triagem de orçamento. Sem esse valor, o orçamento não restringe os resultados.'} Confira taxas, ocupação e condições de pagamento no detalhe de cada imóvel.</p></div>}
        <Feed {...feedProps} properties={visibleProperties} embedded />
        {!all && !feedProps.loading && !visibleProperties.length && <div className="housing-no-results"><p>Nenhum imóvel com esses requisitos no catálogo disponível. Tente ampliar a região ou ajustar os requisitos. Seu perfil não muda automaticamente.</p><button className="btn primary" onClick={() => setMode('all')}>Explorar todos os imóveis</button></div>}
        <div className="housing-future-grid"><article><span className="housing-eyebrow">PRÓXIMA EVOLUÇÃO</span><h3>Alugar ou comprar para morar?</h3><p>Comparar aluguel, entrada, despesas e financiamento com premissas claras. Economia e valorização dependem do cenário.</p>{current?.rent && <small>Aluguel informado: R$ {fmtBRL(Number(current.rent))}</small>}</article><article><span className="housing-eyebrow">SUA ROTINA</span><h3>Mais perto do que importa.</h3><p>{current?.work ? `${current.work} · ${current.transport} · preferência de até ${current.commute} minutos.` : 'Informe trabalho ou outro ponto de referência, se quiser.'} Trajetos ainda não calculados; esta preferência não filtra os imóveis.</p></article></div>
      </section>
    </div>
  </div>;
}
