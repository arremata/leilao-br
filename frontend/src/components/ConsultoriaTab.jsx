import { useState } from 'react';
import { Link } from 'react-router-dom';
import { fmtBRL } from '../utils';
import { auctionSchedule, formatDayTime } from '../auctionRounds';
import { occupancyStatus, paymentFacts } from '../listingFacts';

/**
 * Aba "Consultoria": acompanhamento do começo ao fim, com um chat sobre o
 * imóvel.
 *
 * As perguntas rápidas são respondidas NA HORA com os dados oficiais que o
 * Argos já tem deste imóvel — nunca com texto inventado. A pergunta livre, que
 * depende de alguém do outro lado, fica marcada como "em breve" até existir
 * esse atendimento: o campo não finge enviar nada.
 *
 * Linguagem: acompanhamento e organização de informação. Nunca "análise
 * jurídica", "parecer", "assessoria jurídica" ou "consultoria jurídica"
 * (docs/PRODUCT_CONTEXT.md).
 */
export default function ConsultoriaTab({ p, total, locked = false }) {
  const questions = buildQuestions(p, total);
  // Fechada: a prévia mostra duas perguntas já respondidas, sem interação.
  const [thread, setThread] = useState(() => (locked ? questions.slice(0, 2) : []));
  const asked = new Set(thread.map(item => item.id));

  const ask = (question) => {
    if (asked.has(question.id)) return;
    setThread(current => [...current, question]);
  };

  const content = (
    <div className="consult-grid">
      <section className="card consult-intro">
        <span className="tag accent">Consultoria</span>
        <h3 className="h1">Ajuda para você se preparar para o lance</h3>
        <p>
          A gente acompanha você em cada etapa deste imóvel: das dúvidas antes do
          lance até o dia de pegar a chave.
        </p>
        <p className="consult-disclaimer">
          A decisão do lance é sua; não garantimos o resultado do leilão.
        </p>
        <ul className="consult-steps">
          <li>
            <b>Tire suas dúvidas</b>
            <span>Pergunte sobre este imóvel a quem entende de leilão.</span>
          </li>
          <li>
            <b>Crédito e documentos</b>
            <span>Ajuda para organizar o crédito, o FGTS e os papéis.</span>
          </li>
          <li>
            <b>Até a chave</b>
            <span>Acompanhamento depois do lance: pagamento, registro e entrega.</span>
          </li>
        </ul>
        <Link className="consult-dictionary-link" to="/dicionario">
          Não entendeu alguma palavra? Veja o dicionário do leilão →
        </Link>
      </section>

      <section className="card consult-chat" aria-label="Chat sobre este imóvel">
        <header className="consult-chat-head">
          <span className="consult-avatar" aria-hidden="true">A</span>
          <div>
            <strong>Argos</strong>
            <span>Respostas com os dados oficiais deste imóvel</span>
          </div>
        </header>

        <div className="consult-chat-body" aria-live="polite">
          <div className="consult-msg is-bot">
            Oi! Escolha uma pergunta abaixo. Eu respondo com o que a Caixa publicou
            sobre este imóvel.
          </div>
          {thread.map(item => (
            <div key={item.id} className="consult-pair">
              <div className="consult-msg is-user">{item.question}</div>
              <div className="consult-msg is-bot">{item.answer}</div>
            </div>
          ))}
        </div>

        <div className="consult-quick" role="group" aria-label="Perguntas rápidas">
          {questions.map(question => (
            <button
              key={question.id}
              type="button"
              className="consult-chip"
              onClick={() => ask(question)}
              disabled={asked.has(question.id)}
            >
              {question.question}
            </button>
          ))}
        </div>

        <div className="consult-compose">
          <input
            type="text"
            disabled
            placeholder="Escreva sua dúvida sobre este imóvel"
            aria-label="Escreva sua dúvida sobre este imóvel (em breve)"
          />
          <button type="button" className="btn primary sm" disabled>Enviar</button>
        </div>
        <p className="consult-soon">
          <span className="tag accent">em breve</span>
          Perguntas livres, respondidas por quem entende de leilão.
        </p>
      </section>
    </div>
  );

  if (!locked) return content;

  // Ainda não disponível: a prévia fica desfocada e inerte (sem foco, sem
  // clique, fora da leitura de tela) e o aviso explica o que vem aí.
  return (
    <div className="consult-locked">
      <div className="consult-locked-preview" inert aria-hidden="true">
        {content}
      </div>
      <div className="consult-locked-card" role="status">
        <span className="consult-lock" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="4" y="11" width="16" height="10" rx="2" />
            <path d="M8 11V7a4 4 0 0 1 8 0v4" />
          </svg>
        </span>
        <span className="tag accent">em breve</span>
        <h3 className="h2">Consultoria para o seu lance</h3>
        <p>
          Ajuda para você se preparar para dar o lance neste imóvel: entender as
          regras, organizar a conta e tirar dúvidas num chat 24 horas.
        </p>
        <p className="consult-disclaimer">
          A decisão do lance é sua; não garantimos o resultado do leilão.
        </p>
        <p className="consult-locked-note">Ainda não está disponível.</p>
      </div>
    </div>
  );
}

function buildQuestions(p, total) {
  const schedule = auctionSchedule(p);
  const occupancy = occupancyStatus(p);
  const { fgts, financing } = paymentFacts(p);
  const list = [];

  list.push({
    id: 'fgts',
    question: 'Aceita FGTS?',
    answer: fgts === true
      ? 'Aceita. A Caixa permite usar o FGTS nesta compra, se você e o imóvel cumprirem as regras do fundo.'
      : fgts === false
        ? 'Não. A Caixa não lista o FGTS entre as formas de pagamento deste imóvel.'
        : 'A Caixa não publicou as formas de pagamento deste imóvel.',
  });

  list.push({
    id: 'financing',
    question: 'Dá para financiar?',
    answer: financing === true
      ? 'Dá. A Caixa permite financiar pelo SBPE, se o seu crédito for aprovado.'
      : financing === false
        ? (fgts === false
          ? 'Não. Este imóvel é só à vista, com dinheiro seu.'
          : 'Não. A Caixa não aceita financiamento para este imóvel.')
        : 'A Caixa não publicou as formas de pagamento deste imóvel.',
  });

  list.push({
    id: 'occupancy',
    question: 'Tem alguém morando?',
    answer: occupancy === 'occupied'
      ? 'Segundo a Caixa, sim, o imóvel está ocupado. Tirar quem mora lá costuma ficar por conta de quem compra, e isso leva tempo e dinheiro.'
      : occupancy === 'vacant'
        ? 'Segundo a Caixa, não: o imóvel está desocupado.'
        : 'A Caixa não informou se há alguém morando no imóvel.',
  });

  if (Number(total) > 0) {
    list.push({
      id: 'total',
      question: 'Quanto vou pagar no total?',
      answer: `Com o valor inicial e os custos estimados, cerca de R$ ${fmtBRL(total)} até a chave. A conta completa, item por item, está na aba "Quanto você vai pagar".`,
    });
  }

  if (schedule.kind === 'rounds') {
    const [first, second] = schedule.rounds;
    const when = (round) => formatDayTime(round.at) || 'data a publicar';
    const from = (round) => (round.price ? `, a partir de R$ ${fmtBRL(round.price)}` : '');
    const describe = (round) => (round.state === 'ended'
      ? `A ${round.round}ª rodada foi em ${when(round)}${from(round)}.`
      : `A ${round.round}ª rodada é em ${when(round)}${from(round)}.`);
    list.push({
      id: 'when',
      question: 'Quando é o leilão?',
      answer: schedule.current?.round === 2
        ? `${describe(first)} Agora vale a 2ª rodada: ${when(second)}${from(second)}.`
        : schedule.current?.round === 1
          ? `${describe(first)} Se ninguém comprar, a 2ª rodada é em ${when(second)}${from(second)}.`
          : `${describe(first)} ${describe(second)} As duas rodadas já aconteceram.`,
    });
  } else if (schedule.kind === 'single') {
    list.push({
      id: 'when',
      question: 'Quando é o leilão?',
      answer: schedule.ended
        ? `A disputa já aconteceu, em ${formatDayTime(schedule.headline.until)}.`
        : `A disputa é em ${formatDayTime(schedule.headline.until)}. É rodada única: não existe 2ª rodada com preço menor.`,
    });
  } else {
    list.push({
      id: 'when',
      question: 'Até quando está à venda?',
      answer: 'É venda direta: não tem data de leilão. Fica à venda até alguém comprar pelo preço anunciado.',
    });
  }

  return list;
}
