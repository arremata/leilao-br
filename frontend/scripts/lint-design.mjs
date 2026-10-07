import { readFileSync } from 'node:fs';

const css = ['design-system.css', 'property-costs.css'].map(file => readFileSync(new URL('../src/' + file, import.meta.url), 'utf8')).join('\n');
const errors = [];
if (/\b\d*\.?\d+px\b/.test(css)) errors.push('Use REM for dimensions in design-system.css.');
if (/transition\s*:\s*all\b/.test(css)) errors.push('List transition properties explicitly.');
// Continuous motion is reserved for the live indicator (.ui-live), which must
// also stop for people who ask the system for reduced motion.
const infiniteRules = [...css.matchAll(/([^{}]+)\{[^{}]*animation[^;{}]*\binfinite\b/g)].map(match => match[1].trim());
if (infiniteRules.some(selector => !/^\.ui-live\b/.test(selector))) errors.push('Continuous animations are reserved for .ui-live.');
if (infiniteRules.length && !/prefers-reduced-motion[^{]*\{\s*\.ui-live[^{]*\{[^}]*animation:\s*none/.test(css)) errors.push('.ui-live must stop under prefers-reduced-motion.');
// Spacing comes only from tokens, so one change in :root reaches every screen.
const rawSpacing = [...css.matchAll(/^[^-\n][^\n]*?\b((?:padding|margin|gap|row-gap|column-gap)(?:-[a-z]+)?\s*:[^;}]*\d(?:rem|em)\b)/gm)].map(match => match[1].trim());
if (rawSpacing.length) errors.push(`Use --ui-space-*/--ui-gap-*/--ui-pad-* tokens for spacing:\n  ${rawSpacing.join('\n  ')}`);
for (const token of ['gap-tight', 'gap-inline', 'gap-stack', 'gap-group', 'gap-section', 'pad-page', 'pad-card', 'pad-tile', 'pad-button']) {
  if (!css.includes(`--ui-${token}:`)) errors.push(`Missing token --ui-${token}.`);
}
for (const token of ['space-xs', 'space-sm', 'space-md', 'space-lg', 'space-xl', 'text-xs', 'text-sm', 'text-md', 'text-lg', 'text-xl', 'control-sm', 'control-md', 'control-lg', 'radius-pill']) {
  if (!css.includes(`--ui-${token}:`)) errors.push(`Missing token --ui-${token}.`);
}
if (errors.length) { console.error(errors.join('\n')); process.exitCode = 1; }
else console.log('Design contract: REM, named sizes and motion checks passed.');
