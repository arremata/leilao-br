// ============================================================
// legalDemo.js — dados jurídicos de demonstração (aba Jurídico)
// ------------------------------------------------------------
// Conteúdo estruturado e RAMIFICADO POR MODALIDADE, usado como
// fallback enquanto o backend ainda não serve `property.legal`.
//
// Precedência no frontend: property.legal ?? legalDemo[id].
// Quando o agente jurídico do backend passar a popular `legal`,
// estes dados deixam de ser usados automaticamente.
//
// Estados de verificação (anti-alucinação):
//   'verificado'    — confirmado no documento/fonte
//   'nao-localizado'— não encontrado na fonte disponível
//   'requer-humano' — exige leitura dos autos / diligência manual
//
// Modalidades:
//   'judicial'     — Leilão judicial (CPC, arts. 879–903)
//   'extrajudicial'— Alienação fiduciária (Lei 9.514/97, art. 27)
//   'venda-direta' — Venda direta de bem retomado (não é leilão)
// ============================================================

const legalDemo = {
  // ----------------------------------------------------------
  // a1 — Curitiba · Caixa · EXTRAJUDICIAL (alienação fiduciária)
  // ----------------------------------------------------------
  a1: {
    modalidade: 'extrajudicial',
    modalidadeLabel: 'Leilão extrajudicial · alienação fiduciária',
    baseLegal: 'Lei 9.514/97, art. 27 — leilão após consolidação da propriedade. Não se aplicam os arts. 886/889/891 do CPC.',
    conclusao: {
      recomendacao: 'nao',
      principalRisco: 'Lance mínimo (R$ 253.345) acima do valor de mercado estimado (R$ 210.000) e imóvel ocupado, exigindo ação de imissão na posse.',
      providencia: 'Confirmar regularidade da notificação/purgação da mora (art. 26) e a consolidação averbada na matrícula antes de qualquer proposta.',
    },
    processo: {
      tipo: 'Procedimento extrajudicial (Lei 9.514/97)',
      numero: 'Edital 0022/0226 — CPA/RE (Caixa)',
      foro: 'Cartório de RI / agente fiduciário',
      fase: 'Pós-consolidação — 2º leilão / licitação aberta',
      link: 'https://venda-imoveis.caixa.gov.br',
    },
    partes: {
      credor: 'Caixa Econômica Federal (credor fiduciário)',
      devedor: 'Ex-mutuário fiduciante (identificação sob sigilo)',
      observacao: 'Verificar existência de cônjuge fiduciante para fins de notificação.',
    },
    divida: {
      valor: null,
      dataAtualizacao: 'Não informada no edital',
      memoriaCalculo: 'nao-localizado',
      impugnacao: 'Não há informação sobre purgação da mora ou discussão do saldo.',
    },
    matricula: {
      numero: '92.385',
      cartorio: 'CRI de Curitiba/PR',
      proprietario: 'Caixa Econômica Federal (propriedade consolidada)',
      titularidade: 'Integral (consolidada em favor do credor)',
      onus: [
        { tipo: 'Alienação fiduciária', descricao: 'Em favor da Caixa — consolidada após inadimplemento.', gravidade: 'info' },
        { tipo: 'Débito condominial', descricao: 'De responsabilidade do comprador — solicitar certidão do síndico.', gravidade: 'warn' },
        { tipo: 'Tributos (IPTU)', descricao: 'Sub-rogam no preço (STJ, repetitivo out/2024), ainda que o edital atribua ao arrematante.', gravidade: 'info' },
      ],
    },
    editalAnalise: {
      dataPublicacao: '29/05/2026',
      antecedencia: 'Adequada',
      valorAvaliacao: 253345,
      lanceMinimo: 253345,
      debitos: 'Edital transfere IPTU ao arrematante — cláusula nula quanto a tributos (sub-rogação no preço, STJ 2024). Condomínio permanece com o comprador.',
      desocupacao: 'Por conta do arrematante (imóvel ocupado).',
      divergencias: [
        'Área total (45,74 m²) x área privativa (38,40 m²) — conferir qual base foi usada na avaliação.',
      ],
    },
    avaliacao: {
      data: 'Não datada no edital',
      valor: 253345,
      avaliador: 'Caixa Econômica Federal',
      vistoria: 'nao-localizado',
      atualidade: 'Lance mínimo = avaliação, porém acima do mercado (R$ 210k) — risco de sobrepreço, não de preço vil.',
      impugnacao: 'Não aplicável (extrajudicial).',
    },
    riscos: [
      { tipo: 'Notificação / purgação da mora (art. 26, Lei 9.514)', nivel: 'medio', verificacao: 'requer-humano', fonte: 'Não verificável só pelo edital — exige certidão do RI / procedimento.' },
      { tipo: 'Consolidação da propriedade', nivel: 'baixo', verificacao: 'verificado', fonte: 'Alienação fiduciária consolidada consta nos ônus.' },
      { tipo: 'Ocupação / imissão na posse (art. 30, Lei 9.514)', nivel: 'alto', verificacao: 'verificado', fonte: 'Imóvel ocupado — ação de imissão estimada em 6–12 meses.' },
      { tipo: 'Preço acima do mercado', nivel: 'alto', verificacao: 'verificado', fonte: 'Lance R$ 253.345 vs. mercado R$ 210.000.' },
    ],
    verificacoes: [
      { item: 'Matrícula / ônus', estado: 'verificado', fonte: 'Edital + descrição registral', nota: 'Confirmar certidão atualizada do RI.' },
      { item: 'Notificação da mora', estado: 'requer-humano', fonte: 'Cartório de RI', nota: 'Regularidade não consta do edital.' },
      { item: 'Débito condominial', estado: 'requer-humano', fonte: 'Síndico/administradora', nota: 'Sem base pública.' },
      { item: 'Ocupação real', estado: 'verificado', fonte: 'Edital', nota: 'Recomenda-se vistoria.' },
    ],
    documentos: [
      { tipo: 'Edital', nome: 'Edital 0022/0226 — CPA/RE', origem: 'venda-imoveis.caixa.gov.br', url: 'https://venda-imoveis.caixa.gov.br', data: '29/05/2026', status: 'baixado', baseou: 'Datas, valor mínimo, condições de pagamento, FGTS e ônus mencionados.' },
      { tipo: 'Matrícula', nome: 'Matrícula 92.385 — CRI Curitiba', origem: 'ONR / cartório', url: null, data: null, status: 'nao-disponivel', baseou: 'Número e cartório citados no edital; cadeia dominial e averbações não obtidas.' },
      { tipo: 'Notificação da mora', nome: 'Procedimento art. 26 (Lei 9.514)', origem: 'Cartório de RI', url: null, data: null, status: 'nao-disponivel', baseou: 'Regularidade da consolidação não verificável só pelo edital.' },
    ],
  },

  // ----------------------------------------------------------
  // a2 — Londrina · JUDICIAL (CPC, arts. 879–903)
  // ----------------------------------------------------------
  a2: {
    modalidade: 'judicial',
    modalidadeLabel: 'Leilão judicial eletrônico',
    baseLegal: 'CPC, arts. 879–903 — edital (886/887), avaliação (873), preço vil (891), intimações (889), invalidação (903).',
    conclusao: {
      recomendacao: 'cautela',
      principalRisco: 'Edital com datas de 1ª e 2ª praça "a confirmar" — conteúdo incompleto (art. 886) e necessidade de checar intimações do art. 889 nos autos.',
      providencia: 'Obter o edital definitivo (com datas/valores) e certidão de intimação do executado e de eventuais credores antes do lance.',
    },
    processo: {
      tipo: 'Execução — leilão judicial',
      numero: '4001883-07.2025.8.26.0011',
      foro: 'Foro Central Cível (plataforma LEJE)',
      fase: 'Designação de leilão',
      link: 'https://www.leje.com.br',
    },
    partes: {
      credor: 'A confirmar no edital/autos (exequente)',
      devedor: 'A confirmar no edital/autos (executado)',
      observacao: 'Verificar cônjuge e eventual coproprietário (art. 889, II).',
    },
    divida: {
      valor: null,
      dataAtualizacao: 'Não localizada no edital',
      memoriaCalculo: 'requer-humano',
      impugnacao: 'Verificar nos autos se há impugnação ao valor / embargos.',
    },
    matricula: {
      numero: '104.093',
      cartorio: '2º CRI de Londrina/PR',
      proprietario: 'Executado (a confirmar na matrícula)',
      titularidade: 'A confirmar (integral x fração ideal)',
      onus: [
        { tipo: 'Penhora', descricao: 'Vinculada ao processo 4001883-07.2025.8.26.0011 — confirmar averbação (art. 844).', gravidade: 'warn' },
        { tipo: 'Débitos condominiais/tributários', descricao: 'A verificar — edital recomenda checagem.', gravidade: 'warn' },
      ],
    },
    editalAnalise: {
      dataPublicacao: 'A confirmar',
      antecedencia: 'requer-humano',
      valorAvaliacao: 175268,
      lanceMinimo: 122687,
      debitos: 'Tributos sub-rogam no preço (STJ 2024). Conferir cláusula de transferência de débitos.',
      desocupacao: 'Imóvel informado como desocupado — confirmar por vistoria.',
      divergencias: [
        'Datas de 1ª e 2ª praça constam como "Data a confirmar" — edital incompleto (art. 886).',
        'Lance mínimo (70% da avaliação) — acima do patamar de preço vil (50%, art. 891).',
      ],
    },
    avaliacao: {
      data: 'A confirmar nos autos',
      valor: 175268,
      avaliador: 'Avaliação judicial',
      vistoria: 'requer-humano',
      atualidade: 'Desconto de 30% sobre avaliação — margem confortável, sem indício de preço vil.',
      impugnacao: 'Verificar pedido de nova avaliação (art. 873).',
    },
    riscos: [
      { tipo: 'Nulidade do edital (art. 886/887)', nivel: 'medio', verificacao: 'verificado', fonte: 'Datas da praça ausentes no edital disponível.' },
      { tipo: 'Nulidade da avaliação (art. 873/891)', nivel: 'baixo', verificacao: 'verificado', fonte: 'Avaliação compatível; lance acima de 50%.' },
      { tipo: 'Intimações obrigatórias (art. 889)', nivel: 'medio', verificacao: 'requer-humano', fonte: 'Intimação de executado/cônjuge/credores só confirmável nos autos.' },
      { tipo: 'Suspensão / anulação (art. 903 · bem de família, Lei 8.009)', nivel: 'baixo', verificacao: 'requer-humano', fonte: 'Verificar embargos, impugnação da penhora e alegação de bem de família.' },
    ],
    verificacoes: [
      { item: 'Citação', estado: 'requer-humano', fonte: 'Autos (DataJud dá pistas)', nota: 'Confirmar nos autos.' },
      { item: 'Penhora averbada', estado: 'requer-humano', fonte: 'Matrícula (art. 844)', nota: 'Conferir averbação.' },
      { item: 'Intimação da avaliação', estado: 'requer-humano', fonte: 'Autos', nota: '—' },
      { item: 'Intimação do leilão (art. 889)', estado: 'requer-humano', fonte: 'Autos', nota: 'Campeão de nulidades.' },
      { item: 'Publicação do edital', estado: 'nao-localizado', fonte: 'Edital', nota: 'Datas a confirmar.' },
      { item: 'Recursos/incidentes pendentes', estado: 'requer-humano', fonte: 'Autos', nota: '—' },
    ],
    documentos: [
      { tipo: 'Edital', nome: 'Edital de leilão judicial (LEJE)', origem: 'leje.com.br', url: 'https://www.leje.com.br', data: 'A confirmar', status: 'parcial', baseou: 'Lance mínimo, avaliação e ônus; datas de praça ausentes no documento disponível.' },
      { tipo: 'Matrícula', nome: 'Matrícula 104.093 — 2º CRI Londrina', origem: 'ONR / cartório', url: null, data: null, status: 'nao-disponivel', baseou: 'Número e cartório citados no edital; penhora/ônus a confirmar na certidão.' },
      { tipo: 'Processo/autos', nome: 'Proc. 4001883-07.2025.8.26.0011', origem: 'DataJud / tribunal', url: null, data: null, status: 'nao-disponivel', baseou: 'Metadados via DataJud dão pistas; intimações (art. 889) exigem leitura dos autos.' },
    ],
  },

  // ----------------------------------------------------------
  // a3 — Londrina · Caixa · VENDA DIRETA (não é leilão)
  // ----------------------------------------------------------
  a3: {
    modalidade: 'venda-direta',
    modalidadeLabel: 'Venda direta · bem retomado (Caixa)',
    baseLegal: 'Compra e venda de imóvel já consolidado/retomado. Não há nulidade processual (CPC) nem intimações do art. 889 — foco em matrícula, ônus, ocupação e débitos.',
    conclusao: {
      recomendacao: 'cautela',
      principalRisco: 'Imóvel ocupado (ação de imissão) e débito condominial assumido pelo comprador até 10% da avaliação (~R$ 19.700).',
      providencia: 'Solicitar certidão de débitos condominiais e matrícula atualizada; orçar a desocupação antes de fechar.',
    },
    processo: {
      tipo: 'Venda direta online (Caixa)',
      numero: 'Imóvel 8787708457057',
      foro: 'Não aplicável (extrajudicial/administrativo)',
      fase: 'Disponível para proposta',
      link: 'https://venda-imoveis.caixa.gov.br',
    },
    partes: {
      credor: 'Caixa Econômica Federal (proprietária)',
      devedor: 'Ex-mutuário (identificação sob sigilo)',
      observacao: 'Sem partes processuais — relação de compra e venda.',
    },
    divida: {
      valor: null,
      dataAtualizacao: 'Não aplicável',
      memoriaCalculo: 'nao-localizado',
      impugnacao: 'Não aplicável.',
    },
    matricula: {
      numero: '105.856',
      cartorio: 'CRI de Londrina/PR',
      proprietario: 'Caixa Econômica Federal (propriedade consolidada)',
      titularidade: 'Integral',
      onus: [
        { tipo: 'Alienação fiduciária', descricao: 'Em favor da Caixa — consolidada.', gravidade: 'info' },
        { tipo: 'Leilões negativos', descricao: 'Averbados na matrícula.', gravidade: 'info' },
        { tipo: 'Condomínio (limite 10%)', descricao: 'Comprador assume até 10% da avaliação (~R$ 19.700); excedente fica com a Caixa.', gravidade: 'warn' },
        { tipo: 'Tributos (IPTU)', descricao: 'Sub-rogam no preço (STJ out/2024).', gravidade: 'info' },
      ],
    },
    editalAnalise: {
      dataPublicacao: 'Edital de venda direta (Caixa)',
      antecedencia: 'Não aplicável',
      valorAvaliacao: 170099,
      lanceMinimo: 119069,
      debitos: 'Condomínio: comprador até 10% da avaliação. IPTU sub-roga no preço (STJ 2024).',
      desocupacao: 'Por conta do comprador (imóvel ocupado).',
      divergencias: [
        'Desconto de ~40% sobre a avaliação — atrativo, mas condicionado à desocupação.',
      ],
    },
    avaliacao: {
      data: 'Não datada',
      valor: 170099,
      avaliador: 'Caixa Econômica Federal',
      vistoria: 'nao-localizado',
      atualidade: 'Mercado estimado (R$ 210k) acima da avaliação — margem real positiva.',
      impugnacao: 'Não aplicável.',
    },
    riscos: [
      { tipo: 'Cadeia dominial / ônus na matrícula', nivel: 'baixo', verificacao: 'verificado', fonte: 'Propriedade consolidada da Caixa.' },
      { tipo: 'Ocupação do imóvel', nivel: 'alto', verificacao: 'verificado', fonte: 'Imóvel ocupado — imissão estimada em 6–18 meses.' },
      { tipo: 'Débito condominial (propter rem)', nivel: 'alto', verificacao: 'requer-humano', fonte: 'Acompanha o imóvel; comprador assume até 10% da avaliação.' },
      { tipo: 'Débito tributário (IPTU)', nivel: 'baixo', verificacao: 'verificado', fonte: 'Sub-roga no preço (STJ 2024).' },
    ],
    verificacoes: [
      { item: 'Matrícula / ônus', estado: 'verificado', fonte: 'Edital de venda + descrição registral', nota: 'Confirmar certidão atualizada.' },
      { item: 'Débito condominial', estado: 'requer-humano', fonte: 'Síndico/administradora', nota: 'Crítico — sem base pública.' },
      { item: 'Ocupação real', estado: 'verificado', fonte: 'Edital', nota: 'Recomenda-se vistoria.' },
      { item: 'Regras da venda direta', estado: 'verificado', fonte: 'Edital Caixa', nota: 'Pagamento à vista ou FGTS.' },
    ],
    documentos: [
      { tipo: 'Edital de venda', nome: 'Venda direta — imóvel 8787708457057', origem: 'venda-imoveis.caixa.gov.br', url: 'https://venda-imoveis.caixa.gov.br', data: null, status: 'baixado', baseou: 'Valor, desconto, regra de condomínio (até 10%), FGTS e desocupação.' },
      { tipo: 'Matrícula', nome: 'Matrícula 105.856 — CRI Londrina', origem: 'ONR / cartório', url: null, data: null, status: 'nao-disponivel', baseou: 'Número e cartório citados no edital; leilões negativos e ônus a confirmar na certidão.' },
    ],
  },
};

export default legalDemo;
