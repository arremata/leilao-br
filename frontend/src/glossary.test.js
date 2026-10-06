import test from 'node:test';
import assert from 'node:assert/strict';
import { glossaryEntry, glossaryKeyFor } from './glossary.js';

test('rótulos da tela encontram o verbete, sem ligar para acento e caixa', () => {
  assert.equal(glossaryKeyFor('2ª rodada'), 'segunda_rodada');
  assert.equal(glossaryKeyFor('Rodada única.'), 'rodada_unica');
  assert.equal(glossaryKeyFor('VALOR DE AVALIAÇÃO'), 'valor_avaliacao');
  assert.equal(glossaryKeyFor('Ocupação não informada'), 'ocupacao_nao_informada');
  assert.equal(glossaryKeyFor('ITBI (estimado)'), 'itbi');
  assert.equal(glossaryKeyFor('Só à vista'), 'so_a_vista');
});

test('palavra fora do dicionário não ganha balão', () => {
  assert.equal(glossaryKeyFor('Apartamento'), null);
  assert.equal(glossaryKeyFor(''), null);
  assert.equal(glossaryEntry('nao_existe'), null);
});

test('todo rótulo com balão aponta para um verbete que existe', () => {
  const labels = [
    'Leilão', 'Leilão SFI', 'Licitação aberta', 'Venda direta', 'Venda direta online',
    '1ª rodada', '2ª rodada', 'Rodada única', 'Valor inicial', 'Valor de avaliação',
    'Imóveis parecidos', 'Ocupado', 'Desocupado', 'Ocupação não informada', 'Aceita FGTS',
    'FGTS não informado', 'Não aceita FGTS', 'Aceita financiamento', 'Só à vista', 'ITBI',
    'Comissão do leiloeiro', 'Registro em cartório', 'Desocupação', 'Total até a chave',
  ];
  for (const label of labels) {
    assert.ok(glossaryEntry(glossaryKeyFor(label)), label);
  }
});

test('o verbete leva à página dele no dicionário público', () => {
  const entry = glossaryEntry('valor_avaliacao');
  assert.equal(entry.term, 'Valor de avaliação');
  assert.equal(entry.url, 'https://www.argosleiloes.com.br/dicionario/valor-avaliacao');
});
