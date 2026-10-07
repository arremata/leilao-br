import { useId, useState } from 'react';
import { Countdown, ListingBadges, Photo } from './shared';
import { listingTitle } from '../listingPresentation';
import { propertySummaryModel } from '../propertySummaryModel';
import { saleTagLabel } from '../auctionRounds';
import { fmtBRL } from '../utils';

export function ActionIcon({ kind = 'external', filled = false }) {
  const paths = {
    external: <><path d="M7 17 17 7M7 7h10v10" /></>,
    download: <><path d="M12 3v12m-5-5 5 5 5-5M5 17v4h14v-4" /></>,
    plus: <path d="M12 5v14M5 12h14" />,
    back: <path d="m10 5-7 7 7 7M3 12h18" />,
    star: <path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9Z" />,
  };
  return <svg viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[kind]}</svg>;
}

export default function PropertySummary({ p, schedule, isDirectSale, formatDate, bidNotice }) {
  const [expanded, setExpanded] = useState(null);
  const extraId = useId();
  const { isSfi, rounds, first, difference } = propertySummaryModel(p, schedule, isDirectSale);
  const specs = [p.area > 0 && `${Number(p.area).toLocaleString('pt-BR')} m²`, p.beds > 0 && `${p.beds} ${p.beds === 1 ? 'dormitório' : 'dormitórios'}`, p.baths > 0 && `${p.baths} ${p.baths === 1 ? 'banheiro' : 'banheiros'}`, p.parking > 0 && `${p.parking} ${p.parking === 1 ? 'vaga' : 'vagas'}`, p.floor && `Andar ${p.floor}`].filter(Boolean);
  return <section className="property_summary" aria-labelledby="property-summary-title">
    <div className="property_summary-gallery">
      <Photo label={p.photoLabel} photoUrl={p.photoUrl} ratio="4/3" showLabel={false} />
      <span className="ui-tag property_summary-photo-label">Fachada</span>
    </div>
    <div className="property_summary-panel">
      <div className="property_summary-tags"><span className="ui-tag is-brand">{saleTagLabel(p, schedule)}</span><span className="ui-tag">{p.type}</span></div>
      <h1 id="property-summary-title">{listingTitle(p)}</h1>
      <p className="property_summary-address">{[p.address, p.neighborhood, p.city].filter(Boolean).join(' · ')}</p>
      <ul className="property_summary-specs" aria-label="Características principais">{specs.map(spec => <li key={spec}>{spec}</li>)}</ul>
      <ListingBadges p={p} size="lg" />
      <div className="property_summary-deadline">
        <span className="property_summary-label">{isDirectSale ? 'Disponibilidade' : schedule.headline.label}</span>
        {isDirectSale && !p.endsAt ? <span>Sem prazo divulgado</span> : <Countdown until={schedule.headline.until} dark endedLabel={schedule.headline.short || 'Encerrado'} />}
      </div>
      {bidNotice}
      <div className="property_summary-prices" aria-label="Datas e preços das rodadas">
        {rounds.map(round => <div className="property_summary-round" key={round.label}>
          <span className="property_summary-label">{round.label}</span>
          <strong className="property_summary-price">{round.price > 0 ? `R$ ${fmtBRL(round.price)}` : 'A publicar'}</strong>
          <span className="property_summary-date">{formatDate(round.date) || 'Data não informada'}</span>
        </div>)}
      </div>
      {isSfi && difference !== null && <p className={`property_summary-difference ${difference > 0 ? 'is-more' : 'is-less'}`}>
        {difference === 0 ? 'Mesmo preço nas duas rodadas.' : <>{difference > 0 ? '+' : '−'}{(Math.abs(difference) / first * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}% · R$ {fmtBRL(Math.abs(difference))} a {difference > 0 ? 'mais' : 'menos'} na 2ª rodada em relação à 1ª.</>}
        {difference > 0 && ' Na 2ª rodada, o mínimo é a dívida com as despesas e pode superar o valor da 1ª.'}
      </p>}
      <div className="property_summary-appraisal"><span>Valor de avaliação</span><strong>{p.appraisal > 0 ? `R$ ${fmtBRL(p.appraisal)}` : 'Não informado pela Caixa'}</strong></div>
      <div className="property_summary-more">
        <button className={`ui-button is-sm is-secondary${expanded === 'description' ? ' is-selected' : ''}`} aria-expanded={expanded === 'description'} aria-controls={extraId} onClick={() => setExpanded(expanded === 'description' ? null : 'description')}>Descrição <span aria-hidden="true">{expanded === 'description' ? '−' : '+'}</span></button>
        <button className={`ui-button is-sm is-secondary${expanded === 'features' ? ' is-selected' : ''}`} aria-expanded={expanded === 'features'} aria-controls={extraId} onClick={() => setExpanded(expanded === 'features' ? null : 'features')}>Características <span aria-hidden="true">{expanded === 'features' ? '−' : '+'}</span></button>
      </div>
    </div>
    <div id={extraId} hidden={!expanded} className="property_summary-expanded" role="region" aria-label={expanded === 'description' ? 'Descrição do imóvel' : 'Características'}>
      {expanded === 'description' && <p>{p.viability?.description || 'Descrição não disponível.'}</p>}
      {expanded === 'features' && (p.viability?.features ? <dl>{Object.entries(p.viability.features).map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{String(value)}</dd></div>)}</dl> : <p>Dados não disponíveis.</p>)}
    </div>
  </section>;
}
