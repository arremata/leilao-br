import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const vercelConfig = JSON.parse(
  readFileSync(new URL('../../vercel.json', import.meta.url), 'utf8'),
);
const globalHeaders = vercelConfig.headers.find(({ source }) => source === '/(.*)');
const csp = globalHeaders?.headers.find(({ key }) => key === 'Content-Security-Policy')?.value;

function cspDirective(name) {
  return csp
    ?.split(';')
    .map((directive) => directive.trim())
    .find((directive) => directive.startsWith(`${name} `));
}

test('production CSP permits only the Google Identity stylesheet origin', () => {
  assert.equal(
    cspDirective('style-src'),
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://accounts.google.com",
  );
});

test('production CSP permits the Google Maps embed used on property pages', () => {
  assert.equal(
    cspDirective('frame-src'),
    'frame-src https://accounts.google.com https://www.google.com https://vercel.live https://*.vercel.live',
  );
});

test('production proxies only the public Caixa photo directory', () => {
  const photoRewrite = vercelConfig.rewrites.find(({ source }) => source === '/caixa-fotos/(.*)');

  assert.deepEqual(photoRewrite, {
    source: '/caixa-fotos/(.*)',
    destination: 'https://venda-imoveis.caixa.gov.br/fotos/$1',
  });
});
