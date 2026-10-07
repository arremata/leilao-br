import { Countdown, ListingBadges, Photo } from './shared';
import { listingLocation, listingStreet } from '../listingPresentation';
import { propertySummaryModel, roundDateLabel, summaryMoney } from '../propertySummaryModel';
import { fmtBRL } from '../utils';

export function ActionIcon({ kind = 'external', filled = false }) {
  const paths = {
    external: <><path d="M7 17 17 7M7 7h10v10" /></>,
    download: <><path d="M12 3v12m-5-5 5 5 5-5M5 17v4h14v-4" /></>,
    plus: <path d="M12 5v14M5 12h14" />,
    back: <path d="m10 5-7 7 7 7M3 12h18" />,
    star: <path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9Z" />,
    pin: <><path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21Z" /><circle cx="12" cy="9.5" r="2.5" /></>,
  };
  return <svg viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[kind]}</svg>;
}

const ROUND_STATE = { current: 'atual', upcoming: 'se não vender', ended: 'encerrada' };

function roundBadge(round, isDirectSale, isSfi) {
  if (isDirectSale) return 'Compra direta';
  if (!isSfi) return round.state === 'ended' ? 'Rodada única · encerrada' : 'Rodada única · atual';
  return `${round.round}ª rodada · ${ROUND_STATE[round.state]}`;
}

function AppraisalGap({ gap }) {
  if (!gap) return null;
  if (gap.tone === 'equal') return <span className="property_round-gap">Sem desconto · igual à avaliação</span>;
  return <span className={`property_round-gap is-${gap.tone}`}>{gap.percent}% {gap.tone === 'less' ? 'abaixo' : 'acima'} da avaliação</span>;
}

/** Comparação da 2ª com a 1ª rodada, no quadro da 2ª. */
function FirstRoundComparison({ difference }) {
  if (difference === null || difference === 0) return null;
  return difference < 0
    ? <span className="property_round-saving">Economia de {summaryMoney(-difference)} sobre a 1ª rodada</span>
    : <span className="property_round-saving is-more">{summaryMoney(difference)} a mais que a 1ª rodada. Na 2ª rodada, o mínimo é a dívida com as despesas e pode superar o valor da 1ª.</span>;
}

function RoundCard({ round, model, schedule, isDirectSale, p }) {
  const isCurrent = round.state === 'current';
  const showClock = isCurrent || (!model.isSfi && round.state === 'ended');
  const gap = round.appraisalGap;
  return <article className={`property_round is-${round.state}`} aria-label={roundBadge(round, isDirectSale, model.isSfi)}>
    <span className="property_round-badge">{roundBadge(round, isDirectSale, model.isSfi)}</span>
    <div className="property_round-price-row">
      <strong className="property_round-price" title={round.price > 0 ? `R$ ${fmtBRL(Number(round.price))}` : undefined}>{summaryMoney(round.price)}</strong>
      {gap?.tone === 'less' && <span className="property_round-discount" aria-hidden="true">−{gap.percent}%</span>}
    </div>
    <div className="property_round-notes">
      <AppraisalGap gap={gap} />
      {round.round === 2 && <FirstRoundComparison difference={model.difference} />}
    </div>
    <div className="property_round-meta">
      <span>{roundDateLabel(round.date) || (isDirectSale ? 'Sujeito à disponibilidade na Caixa' : 'Data não informada')}</span>
      {showClock && (isDirectSale && !p.endsAt
        ? <span>Sem prazo divulgado</span>
        : <Countdown until={schedule.headline.until} words="Encerra em" dark endedLabel={schedule.headline.short || 'Encerrado'} />)}
    </div>
  </article>;
}

export default function PropertySummary({ p, schedule, isDirectSale, bidNotice, editalUrl, matriculaUrl, saleRulesUrl }) {
  const model = propertySummaryModel(p, schedule, isDirectSale);
  const photos = [...new Set([p.photoUrl, ...(Array.isArray(p.photoUrls) ? p.photoUrls : [])].filter(url => typeof url === 'string' && url.trim()))].slice(0, 5);
  const location = listingLocation(p);
  const street = listingStreet(p.address);
  const specs = [
    p.area > 0 && `${Number(p.area).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} m²`,
    p.beds > 0 && `${p.beds} ${Number(p.beds) === 1 ? 'quarto' : 'quartos'}`,
    p.baths > 0 && `${p.baths} ${Number(p.baths) === 1 ? 'banheiro' : 'banheiros'}`,
    p.parking > 0 && `${p.parking} ${Number(p.parking) === 1 ? 'vaga' : 'vagas'}`,
    p.floor && `Andar ${p.floor}`,
  ].filter(Boolean);
  const saleType = p.modalidade || p.auctionType;
  const documents = [
    editalUrl && { href: editalUrl, label: 'Baixar as regras', download: true },
    matriculaUrl && { href: matriculaUrl, label: 'Baixar a certidão do imóvel', download: true },
    saleRulesUrl && { href: saleRulesUrl, label: 'Regras da venda', download: false },
  ].filter(Boolean);
  return <section className="property_summary" aria-labelledby="property-summary-title">
    <div className={`property_summary-gallery${photos.length > 1 ? ' is-multiple' : ''}`} style={photos.length > 1 ? { gridTemplateRows: `repeat(${photos.length - 1},minmax(0,1fr))` } : undefined} aria-label="Fotos do imóvel">
      {(photos.length ? photos : [null]).map((url, index) => <div className={`property_summary-photo${index === 0 ? ' is-main' : ''}`} key={url || 'missing'}>
        <Photo label={index === 0 ? (p.photoLabel || 'Foto principal do imóvel') : `Foto ${index + 1} do imóvel`} photoUrl={url} ratio="auto" showLabel={false} style={{ height: '100%' }} />
      </div>)}
    </div>

    <div className="property_summary-panel">
      <header className="property_summary-header">
        {saleType && <span className="property_summary-eyebrow">{saleType}</span>}
        <h1 id="property-summary-title">{p.type || 'Imóvel'}</h1>
        <p className="property_summary-address">
          <ActionIcon kind="pin" />
          <span>{[street, location !== 'Cidade não informada' && location].filter(Boolean).join(' · ') || 'Endereço não informado'}</span>
        </p>
        <ul className="property_summary-chips" aria-label="Características e situação">
          {specs.map(spec => <li key={spec} className="property_summary-chip">{spec}</li>)}
          <li className="property_summary-chip-group"><ListingBadges p={p} size="lg" /></li>
        </ul>
      </header>

      <div className="property_summary-pricing">
        <p className="property_summary-appraisal">
          Avaliação Caixa: <strong>{model.appraisal ? summaryMoney(model.appraisal) : 'não informada'}</strong>
        </p>
        <div className={`property_summary-rounds${model.rounds.length === 1 ? ' is-single' : ''}`} aria-label="Preços e datas das rodadas">
          {model.rounds.map(round => <RoundCard key={round.label} round={round} model={model} schedule={schedule} isDirectSale={isDirectSale} p={p} />)}
        </div>
        {model.isSfi && !model.current && schedule.headline?.label && (
          <p className="property_summary-status">{schedule.headline.label}{schedule.headline.note ? ` · ${schedule.headline.note}` : ''}</p>
        )}
        {bidNotice}
      </div>
      {documents.length > 0 && <div className="property_summary-documents">
        <h2 className="property_summary-documents-title">Documentos</h2>
        <div className="property_summary-documents-links">
          {documents.map(doc => <a key={doc.label} className="ui-button is-sm is-secondary" href={doc.href} target="_blank" rel="noopener noreferrer" download={doc.download || undefined}>
            <ActionIcon kind={doc.download ? 'download' : 'external'} />{doc.label}
          </a>)}
        </div>
      </div>}
    </div>
  </section>;
}
