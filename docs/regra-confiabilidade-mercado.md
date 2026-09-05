# Regra de confiabilidade da estimativa de mercado

## Objetivo

Medir, de 0 a 100, a confiabilidade da estimativa de mercado de um imóvel de leilão usando no máximo cinco anúncios comparáveis localizados em um raio de 2 km.

Só contam anúncios de venda rastreáveis, únicos, do mesmo tipo de imóvel e com localização, área, quartos e preço válidos. O próprio anúncio do leilão não pode ser usado como comparável.

## Composição do score

### 1. Quantidade de comparáveis — 50 pontos

Cada comparável válido soma 10 pontos, até o limite de cinco.

### 2. Similaridade com o imóvel do leilão — 30 pontos

Cada comparável pode somar até 6 pontos:

| Critério | Peso | Por comparável | Máximo com 5 |
|---|---:|---:|---:|
| Proximidade | 35% | 2,10 | 10,50 |
| Área em m² | 40% | 2,40 | 12,00 |
| Quartos | 15% | 0,90 | 4,50 |
| Preço/m² | 10% | 0,60 | 3,00 |

Regras de similaridade:

- Proximidade: até 1 km = 100%; entre 1 e 2 km = 75%; acima de 2 km = inválido.
- Área: pontuação contínua e simétrica calculada por `menor área ÷ maior área`. Por exemplo, 171,19 m² e 212 m² têm 80,75% de similaridade e recebem 1,94 dos 2,40 pontos de área.
- Quartos: mesma quantidade = 100%; diferença de 1 = 50%; diferença maior = 0%.
- Preço/m²: diferença até 10% = 100%; até 20% = 75%; até 30% = 50%; acima disso = 0%.

### 3. Consistência entre os comparáveis — 20 pontos

Compara somente os anúncios encontrados entre si, sem considerar o imóvel do leilão. Um único comparável recebe 0 pontos.

```text
score = 20 × ((quantidade - 1) / 4) × similaridade média do grupo
```

A similaridade interna considera consistência de preço/m² (10 pontos), área contínua pela mesma razão simétrica (5), quartos (3) e concentração geográfica (2). O máximo por quantidade é: 1 = 0, 2 = 5, 3 = 10, 4 = 15 e 5 = 20 pontos.

## Classificação

- 0 a 30: baixa
- Acima de 30 até 70: média
- Acima de 70: alta

Para ser alta, a confiança também exige pelo menos quatro comparáveis, 21 dos 30 pontos de similaridade com o leilão e 12 dos 20 pontos de consistência do grupo.

| Comparáveis perfeitos | Quantidade | Similaridade | Consistência | Total |
|---:|---:|---:|---:|---:|
| 1 | 10 | 6 | 0 | 16 |
| 2 | 20 | 12 | 5 | 37 |
| 3 | 30 | 18 | 10 | 58 |
| 4 | 40 | 24 | 15 | 79 |
| 5 | 50 | 30 | 20 | 100 |

## Situação da implementação

A regra está implementada no pipeline de mercado. O coletor extrai tipo e quartos, geocodifica os candidatos, elimina resultados fora do raio de 2 km e persiste no máximo os cinco comparáveis mais próximos e fisicamente semelhantes. Quando faltam coordenadas ou outros dados essenciais, a estimativa pode usar a referência regional existente, mas não recebe confiança alta.

A API publica somente o nível (`low`, `medium` ou `high`); a pontuação e sua decomposição permanecem internas. Referências antigas passam a usar a nova regra depois da próxima coleta e rematerialização programada.
