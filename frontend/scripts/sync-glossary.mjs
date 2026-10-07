#!/usr/bin/env node
// Copia os verbetes do dicionário público para o app.
//
// A fonte editorial é `content/glossary.js` no repositório da landing
// (arremata/Landing-page-Argos), que publica www.argosleiloes.com.br/dicionario.
// O app só exibe o termo e a frase curta no balão e leva ao verbete no site.
// Nunca edite `src/content/glossary.generated.js` à mão: mude na landing e rode
//
//   node scripts/sync-glossary.mjs ../caminho/da/landing/content/glossary.js

import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const source = process.argv[2];
if (!source) {
  console.error('Uso: node scripts/sync-glossary.mjs <landing>/content/glossary.js');
  process.exit(1);
}

const { GLOSSARY } = createRequire(import.meta.url)(resolve(source));
const entries = Object.fromEntries(
  Object.entries(GLOSSARY).map(([key, { term, body }]) => [key, { term, body }]),
);

const target = resolve(dirname(fileURLToPath(import.meta.url)), '../src/content/glossary.generated.js');
writeFileSync(target, `// GERADO por scripts/sync-glossary.mjs a partir do dicionário da landing.
// Não edite aqui: mude content/glossary.js na landing e rode o script.

export const GLOSSARY = ${JSON.stringify(entries, null, 2)};
`);
console.log(`${Object.keys(entries).length} verbetes em ${target}`);
