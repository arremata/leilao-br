import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const vercelConfig = JSON.parse(
  readFileSync(new URL('../../vercel.json', import.meta.url), 'utf8'),
);

test('production CSP permits only the Google Identity stylesheet origin', () => {
  const globalHeaders = vercelConfig.headers.find(({ source }) => source === '/(.*)');
  const csp = globalHeaders?.headers.find(({ key }) => key === 'Content-Security-Policy')?.value;
  const styleDirective = csp
    ?.split(';')
    .map((directive) => directive.trim())
    .find((directive) => directive.startsWith('style-src '));

  assert.equal(
    styleDirective,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://accounts.google.com",
  );
});
