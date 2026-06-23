# Features futuras — Arremate

Specs para funcionalidades pendentes de implementação.

---

## 1. Exportar análise

**Objetivo:** Permitir que o usuário exporte a análise completa de um imóvel como PDF ou imagem.

**Localização:** Botão "Exportar análise" no header da página de detalhe do imóvel (`PropertyDetail.jsx`). Atualmente desabilitado com tooltip "Em breve".

**Escopo:**
- Gerar PDF contendo:
  - Score e dados do imóvel (título, endereço, specs)
  - Spread de mercado (gráfico de barra lance vs. mercado)
  - Indicadores do bairro
  - Tabela de comparáveis
  - Tabela de custos completa (com valores do simulador)
  - Métricas de viabilidade (ROI, custo total, lance máximo)
  - Dimensões de risco e alertas
- Nome do arquivo: `arremate-analise-{id}-{data}.pdf`
- Opção de compartilhar via link (futuro)

**Abordagem sugerida:**
- Usar `html2canvas` + `jsPDF` ou `react-pdf/renderer` para geração client-side
- Alternativa: endpoint backend que recebe o ID e gera o PDF server-side

---

## 2. Exportar CSV

**Objetivo:** Exportar a lista filtrada de imóveis do Feed como arquivo CSV.

**Localização:** Botão "Exportar CSV" no header do Feed (`Feed.jsx`). Atualmente desabilitado com tooltip "Em breve".

**Campos a incluir:**
| Campo | Origem |
|-------|--------|
| Título | `p.title` |
| Endereço | `p.address` |
| Bairro | `p.neighborhood` |
| Cidade | `p.city` |
| Tipo | `p.type` |
| Tipo de leilão | `p.auctionType` |
| Praça | `p.praca` |
| Modalidade | `p.modalidade` |
| Lance mínimo | `p.minBid` |
| Mercado | `p.market` |
| Desconto (%) | `p.discount` |
| ROI (%) | `p.roi` |
| Score | `p.score` |
| Área (m²) | `p.area` |
| Quartos | `p.beds` |
| Ocupação | `p.occupancy` |
| Encerra em | `p.endsAt` |
| URL do leilão | `p.auctionUrl` |

**Abordagem sugerida:**
- Geração client-side: construir string CSV, criar `Blob`, trigger download via `URL.createObjectURL`
- Respeitar filtros ativos — exportar apenas `filtered`, não `properties`
- Nome do arquivo: `arremate-feed-{data}.csv`

---

## 3. Configurar alertas

**Objetivo:** Sistema de notificações para imóveis na watchlist — monitorar preço, prazo, riscos e novos leilões similares.

**Localização:** Botão "Configurar alertas" na seção watchlist da Home (`Home.jsx`). Atualmente desabilitado com tooltip "Em breve".

**Tipos de alerta:**
- **Prazo:** notificar X dias antes do encerramento do leilão
- **Preço:** notificar quando lance mínimo muda
- **Novos similares:** notificar quando surgir leilão similar (mesma cidade/tipo/faixa de preço)
- **Risco:** notificar quando dimensão de risco muda

**Canais (por ordem de prioridade):**
1. Notificação in-app (badge no menu)
2. Push notification (PWA)
3. Email (requer backend)

**UI sugerida:**
- Modal ao clicar em "Configurar alertas"
- Toggle por tipo de alerta
- Campo de email para notificações externas
- Frequência: imediato / diário / semanal

**Dependências:**
- Sistema de autenticação (para persistir preferências)
- Backend para monitoramento periódico e envio de notificações
- Service worker para push notifications (PWA já está preparado)

---

## 4. PDF Original do edital

**Objetivo:** Permitir download do edital em PDF a partir da aba Edital na página de detalhe.

**Localização:** Botão "PDF original" na aba Edital (`PropertyDetail.jsx`). Atualmente abre `p.auctionUrl` como placeholder.

**Implementação necessária:**
- **Opção A (link direto):** Se o site do leilão disponibilizar URL direta do PDF, armazenar em `p.edital.pdfUrl` e usar `window.open`
- **Opção B (scraping):** Backend faz scraping da página do leilão e extrai/armazena o PDF
- **Opção C (geração):** Backend gera PDF a partir dos dados do edital já parseados (recriação, não original)

**Campos do seed a adicionar:**
```json
{
  "edital": {
    "pdfUrl": "https://...",
    ...
  }
}
```

**Prioridade:** Opção A > B > C (preferir o documento original quando disponível)
