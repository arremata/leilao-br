// ============================================================
// legalGlossary.js — termos e artigos da aba Jurídico
// ------------------------------------------------------------
// Conteúdo de referência exibido no painel lateral (glossário)
// da aba Jurídico. Linguagem simples para o investidor entender
// os artigos/termos citados na análise.
//
// ⚠️ Conteúdo educativo — não é parecer jurídico.
// ============================================================

const legalGlossary = [
  // ---- Artigos do CPC ----
  { termo: 'Art. 886 (CPC)', categoria: 'Artigos do CPC', definicao: 'Define o que o edital de leilão precisa conter: descrição do bem, valor da avaliação, dia/hora/local do leilão e menção a ônus, recursos ou processos pendentes. A falta de um requisito pode anular o leilão.' },
  { termo: 'Art. 887 (CPC)', categoria: 'Artigos do CPC', definicao: 'Trata da publicação do edital — onde e com qual antecedência ele deve ser divulgado (em regra, na internet e com pelo menos 5 dias de antecedência). Publicação irregular é causa comum de nulidade.' },
  { termo: 'Art. 873 (CPC)', categoria: 'Artigos do CPC', definicao: 'Permite uma nova avaliação do imóvel quando houver erro ou dolo do avaliador, mudança no valor do bem, ou dúvida fundada sobre o valor atribuído.' },
  { termo: 'Art. 889 (CPC)', categoria: 'Artigos do CPC', definicao: 'Lista quem deve ser intimado do leilão com pelo menos 5 dias de antecedência: executado, cônjuge, coproprietário, credores com garantia real (hipoteca, penhor, alienação fiduciária), usufrutuário, entre outros. A falta de intimação pode anular a arrematação.' },
  { termo: 'Art. 891 (CPC)', categoria: 'Artigos do CPC', definicao: 'Proíbe lance por “preço vil”. Vil é o lance abaixo do mínimo fixado no edital; se não houver mínimo, é o lance abaixo de 50% da avaliação.' },
  { termo: 'Art. 895 (CPC)', categoria: 'Artigos do CPC', definicao: 'Permite arrematação parcelada: entrada mínima de 25% à vista e o saldo em até 30 parcelas mensais, garantido por hipoteca do próprio imóvel.' },
  { termo: 'Art. 903 (CPC)', categoria: 'Artigos do CPC', definicao: 'A arrematação é “perfeita, acabada e irretratável” com a assinatura do auto. Pode ser invalidada (vício/preço vil), ineficaz ou resolvida (não pagamento) se requerido em até 10 dias.' },
  { termo: 'Art. 843 (CPC)', categoria: 'Artigos do CPC', definicao: 'Cuida da alienação de bem indivisível: assegura ao coproprietário a reserva da sua parte sobre o preço e o direito de preferência na arrematação.' },
  { termo: 'Art. 844 (CPC)', categoria: 'Artigos do CPC', definicao: 'Prevê a averbação da penhora na matrícula do imóvel, gerando presunção de fraude contra quem comprar depois disso.' },

  // ---- Leis e códigos ----
  { termo: 'Lei 9.514/97', categoria: 'Leis e códigos', definicao: 'Regula a alienação fiduciária de imóveis. Define a notificação/purgação da mora (art. 26) e os leilões extrajudiciais após a consolidação da propriedade (art. 27) — regras próprias, diferentes do CPC.' },
  { termo: 'Lei 8.009/90', categoria: 'Leis e códigos', definicao: 'Protege o “bem de família”: o imóvel residencial da família é, em regra, impenhorável. Pode ser alegado até a assinatura da carta de arrematação.' },
  { termo: 'CTN, art. 130, § único', categoria: 'Leis e códigos', definicao: 'Na arrematação, os tributos do imóvel (ex.: IPTU) sub-rogam-se no preço — ou seja, são pagos com o valor do lance. O STJ (2024) fixou que cláusula de edital transferindo esses tributos ao arrematante é nula.' },

  // ---- Conceitos ----
  { termo: 'Preço vil', categoria: 'Conceitos', definicao: 'Lance muito abaixo do valor real do bem. É vedado e pode anular a arrematação (art. 891).' },
  { termo: 'Propter rem', categoria: 'Conceitos', definicao: 'Obrigação “que adere à coisa”: acompanha o imóvel e passa ao novo dono. O caso clássico é a dívida de condomínio, que continua sendo do arrematante.' },
  { termo: 'Alienação fiduciária', categoria: 'Conceitos', definicao: 'Garantia em que a propriedade do imóvel fica com o credor (banco) até a quitação. Em caso de inadimplência, há consolidação e leilão extrajudicial (Lei 9.514).' },
  { termo: 'Consolidação da propriedade', categoria: 'Conceitos', definicao: 'Quando o devedor não paga, a propriedade se transfere definitivamente ao credor fiduciário, que então leva o imóvel a leilão.' },
  { termo: 'Purgação da mora', categoria: 'Conceitos', definicao: 'Pagamento das parcelas em atraso (mais encargos) para regularizar a dívida e evitar a consolidação/leilão.' },
  { termo: 'Imissão na posse', categoria: 'Conceitos', definicao: 'Ação para o arrematante tomar posse de um imóvel ocupado. Gera custo e prazo — por isso entra como custo de desocupação na viabilidade.' },
  { termo: 'Praça (1ª e 2ª)', categoria: 'Conceitos', definicao: 'São as sessões do leilão judicial. Na 1ª praça busca-se o valor da avaliação; na 2ª aceitam-se descontos, desde que não configurem preço vil.' },
  { termo: 'Matrícula', categoria: 'Conceitos', definicao: 'O “RG” do imóvel no Cartório de Registro de Imóveis: traz o histórico de proprietários e todos os ônus (penhoras, hipotecas, alienação fiduciária).' },
  { termo: 'Ônus / gravame', categoria: 'Conceitos', definicao: 'Restrições registradas na matrícula que limitam o imóvel — por exemplo penhora, hipoteca, alienação fiduciária ou usufruto.' },
  { termo: 'Penhora', categoria: 'Conceitos', definicao: 'Constrição judicial do bem para garantir o pagamento de uma dívida em processo de execução.' },
  { termo: 'Usufruto / direito real de habitação', categoria: 'Conceitos', definicao: 'Direito de usar ou morar no imóvel pertencente a outra pessoa. Pode sobreviver à arrematação se não for extinto.' },
  { termo: 'Carta de arrematação', categoria: 'Conceitos', definicao: 'Documento expedido pelo juízo que transfere a propriedade ao arrematante e permite o registro do imóvel em seu nome.' },
  { termo: 'Venda direta', categoria: 'Conceitos', definicao: 'Venda de imóvel já retomado pelo banco (ex.: Caixa). Não é leilão nem processo judicial — não há nulidade de edital nem intimações do art. 889.' },

  // ---- Órgãos e fontes ----
  { termo: 'ONR', categoria: 'Órgãos e fontes', definicao: 'Operador Nacional do Registro de Imóveis — plataforma para solicitar matrículas e certidões de forma eletrônica (serviço pago, por imóvel).' },
  { termo: 'DataJud', categoria: 'Órgãos e fontes', definicao: 'Base nacional do CNJ com metadados de processos (capa e movimentações). Dá pistas sobre os atos, mas não traz o inteiro teor das peças.' },
];

export default legalGlossary;
