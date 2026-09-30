// Em que ponto do leilão o imóvel está, rodada por rodada.
//
// "Encerrado", sozinho, não dizia qual rodada tinha acabado: num Leilão SFI a
// primeira rodada pode ter passado enquanto a segunda, mais barata, ainda está
// aberta. O estado de cada rodada sai da data dela contra o relógio de quem está
// olhando, e não de `praca`, que a API calcula no momento da consulta.

const SAO_PAULO = 'America/Sao_Paulo';

export const OPEN_TENDER_NOTE = 'Licitação aberta tem uma rodada só: não existe 2ª rodada com preço menor. Vence o maior lance nesta data.';

function toMs(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (!value) return null;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : null;
}

function positive(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function normalized(value) {
  return String(value || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

/** "28 de set. · 10:00", sempre no horário de Brasília. */
export function formatDayTime(value) {
  const ms = toMs(value);
  if (ms == null) return '';
  const date = new Date(ms);
  const day = date.toLocaleDateString('pt-BR', { day: 'numeric', month: 'short', timeZone: SAO_PAULO });
  const time = date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: SAO_PAULO });
  return `${day} · ${time}`;
}

/** "28 de set.", para frases em que a hora não importa. */
export function formatDay(value) {
  const ms = toMs(value);
  if (ms == null) return '';
  return new Date(ms).toLocaleDateString('pt-BR', { day: 'numeric', month: 'short', timeZone: SAO_PAULO });
}

/**
 * Linha do tempo do leilão.
 *
 * - `kind: 'rounds'`: Leilão SFI, com 1ª e 2ª rodada. Cada rodada tem
 *   `state` = 'ended' | 'current' | 'upcoming'.
 * - `kind: 'single'`: um único evento com data (licitação aberta).
 * - `kind: 'none'`: sem data de encerramento (venda direta).
 *
 * `headline` é o que o topo do card e da página mostram: o rótulo do contador,
 * a data que ele conta e uma nota curta dizendo qual rodada já passou.
 */
export function auctionSchedule(property, now = Date.now()) {
  const p = property || {};
  const modality = normalized(p.modalidade);
  const isDirectSale = modality.includes('venda direta');
  const firstAt = toMs(p.firstAuctionAt || p.edital?.firstBidDate);
  const secondAt = toMs(p.secondAuctionAt || p.edital?.secondBidDate);
  const isRounds = !isDirectSale && (
    modality.includes('leilao sfi') || (Boolean(p.praca) && (firstAt != null || secondAt != null))
  );

  if (isRounds && (firstAt != null || secondAt != null)) {
    const currentRoundByApi = /2/.test(String(p.praca || '')) ? 2 : 1;
    const rounds = [
      {
        round: 1,
        at: firstAt,
        price: positive(p.firstAuctionPrice) ?? positive(p.edital?.firstBidPrice)
          ?? (currentRoundByApi === 1 ? positive(p.minBid) : null),
      },
      {
        round: 2,
        at: secondAt,
        price: positive(p.secondAuctionPrice) ?? positive(p.edital?.secondBidPrice)
          ?? (currentRoundByApi === 2 ? positive(p.minBid) : null),
      },
    ];
    let currentFound = false;
    for (const round of rounds) {
      if (round.at != null && round.at <= now) {
        round.state = 'ended';
      } else if (round.at == null) {
        // Sem data publicada não há contagem: a rodada ainda não está valendo.
        round.state = 'upcoming';
      } else if (!currentFound) {
        round.state = 'current';
        currentFound = true;
      } else {
        round.state = 'upcoming';
      }
    }
    const [first, second] = rounds;
    const current = rounds.find(round => round.state === 'current') || null;
    const ended = !current;

    let headline;
    if (current?.round === 1) {
      headline = {
        label: '1ª rodada termina em',
        short: '1ª rodada',
        until: first.at,
        note: second.at != null
          ? `Se não vender, 2ª rodada em ${formatDay(second.at)}`
          : '',
      };
    } else if (current?.round === 2) {
      headline = {
        label: '2ª rodada termina em',
        short: '2ª rodada',
        until: second.at,
        note: first.at != null ? `1ª rodada encerrada em ${formatDay(first.at)}` : '1ª rodada encerrada',
      };
    } else if (second.at != null) {
      headline = {
        label: 'Leilão encerrado',
        short: '2ª rodada encerrada',
        until: second.at,
        note: first.at != null
          ? `1ª rodada em ${formatDay(first.at)} e 2ª rodada em ${formatDay(second.at)} já aconteceram`
          : `2ª rodada encerrada em ${formatDay(second.at)}`,
      };
    } else {
      headline = {
        label: '1ª rodada encerrada',
        short: '1ª rodada encerrada',
        until: first.at,
        note: 'A data da 2ª rodada ainda não foi publicada',
      };
    }
    return { kind: 'rounds', rounds, current, ended, headline };
  }

  const endsAt = toMs(p.endsAt) ?? firstAt;
  if (!isDirectSale && endsAt != null) {
    const ended = endsAt <= now;
    // Licitação aberta é um evento só. Quem vem do Leilão SFI espera uma 2ª
    // rodada mais barata; aqui ela não existe, e isso precisa estar escrito.
    const isOpenTender = modality.includes('licitacao');
    const singleLabel = isOpenTender ? 'Rodada única' : '';
    return {
      kind: 'single',
      isOpenTender,
      rounds: [],
      current: null,
      ended,
      headline: {
        label: ended
          ? (isOpenTender ? 'Rodada única encerrada' : 'Encerrado')
          : (isOpenTender ? 'Rodada única termina em' : 'Termina em'),
        short: ended ? (isOpenTender ? 'Rodada única encerrada' : 'Encerrado') : singleLabel,
        until: endsAt,
        note: ended
          ? `Encerrou em ${formatDay(endsAt)}`
          : (isOpenTender ? OPEN_TENDER_NOTE : ''),
      },
    };
  }

  return {
    kind: 'none',
    rounds: [],
    current: null,
    ended: false,
    headline: { label: 'Disponibilidade', short: '', until: toMs(p.endsAt), note: '' },
  };
}

/**
 * Etiqueta de venda. Na página do imóvel, a rodada que está valendo; no card,
 * onde a rodada já aparece na foto e no quadro das rodadas, só "Leilão".
 */
export function saleTagLabel(p, schedule, { compact = false } = {}) {
  if (schedule.kind === 'rounds') {
    if (compact) return 'Leilão';
    return schedule.current ? `${schedule.current.round}ª rodada` : 'Leilão encerrado';
  }
  return p.modalidade || p.auctionType || '';
}
