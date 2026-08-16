#!/usr/bin/env node
/**
 * Derive per-theme shadow tokens.
 *
 * `fluent-tokens.json` shipped ONE shadow set, so `fluent_get_token shadow16
 * theme=dark` returned the light value. Fluent 2 does ship different shadows
 * per theme — not different geometry, different *colours*: upstream builds them
 * from `colorNeutralShadowAmbient` / `colorNeutralShadowKey`, which are
 * rgba(0,0,0,0.12)/0.14 in light and rgba(0,0,0,0.24)/0.28 in dark.
 *
 * We already ship those alias colours per theme, so the shadows are derivable
 * rather than needing a new source. The formula is upstream's verbatim, from
 * `@fluentui/tokens` `lib/utils/shadows.js`:
 *
 *   shadow2  = 0 0 2px {ambient}, 0 1px  2px {key}
 *   shadow4  = 0 0 2px {ambient}, 0 2px  4px {key}
 *   shadow8  = 0 0 2px {ambient}, 0 4px  8px {key}
 *   shadow16 = 0 0 2px {ambient}, 0 8px 16px {key}
 *   shadow28 = 0 0 8px {ambient}, 0 14px 28px {key}
 *   shadow64 = 0 0 8px {ambient}, 0 32px 64px {key}
 *
 * ...called twice per theme: once with the neutral pair, once with the brand
 * pair and a "Brand" suffix.
 *
 *   node scripts/build-shadow-tokens.mjs             # write
 *   node scripts/build-shadow-tokens.mjs --check     # verify only, exit 1 on drift
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const FILE = join(root, 'mcp', 'data', 'fluent-tokens.json');
const check = process.argv.includes('--check');

/** Verbatim port of upstream `createShadowTokens`. */
function createShadowTokens(ambient, key, suffix = '') {
  return {
    [`shadow2${suffix}`]: `0 0 2px ${ambient}, 0 1px 2px ${key}`,
    [`shadow4${suffix}`]: `0 0 2px ${ambient}, 0 2px 4px ${key}`,
    [`shadow8${suffix}`]: `0 0 2px ${ambient}, 0 4px 8px ${key}`,
    [`shadow16${suffix}`]: `0 0 2px ${ambient}, 0 8px 16px ${key}`,
    [`shadow28${suffix}`]: `0 0 8px ${ambient}, 0 14px 28px ${key}`,
    [`shadow64${suffix}`]: `0 0 8px ${ambient}, 0 32px 64px ${key}`,
  };
}

const data = JSON.parse(readFileSync(FILE, 'utf8'));
const THEMES = { light: 'semanticLight', dark: 'semanticDark', highContrast: 'semanticHighContrast' };

const byTheme = {};
for (const [theme, aliasKey] of Object.entries(THEMES)) {
  const alias = data.color?.[aliasKey];
  if (!alias) throw new Error(`missing color.${aliasKey} — cannot derive ${theme} shadows`);
  for (const need of ['colorNeutralShadowAmbient', 'colorNeutralShadowKey', 'colorBrandShadowAmbient', 'colorBrandShadowKey']) {
    if (!alias[need]) throw new Error(`${aliasKey} is missing ${need}`);
  }
  byTheme[theme] = {
    ...createShadowTokens(alias.colorNeutralShadowAmbient, alias.colorNeutralShadowKey),
    ...createShadowTokens(alias.colorBrandShadowAmbient, alias.colorBrandShadowKey, 'Brand'),
  };
}

// Sanity: the shipped single set should equal the light set. If it doesn't,
// something upstream changed and a human should look before we overwrite.
const drift = Object.entries(byTheme.light).filter(([k, v]) => data.shadow?.[k] && data.shadow[k] !== v);
if (drift.length) {
  console.error('  WARNING: derived light shadows differ from the shipped values:');
  for (const [k, v] of drift) console.error(`    ${k}\n      shipped: ${data.shadow[k]}\n      derived: ${v}`);
}

const differing = Object.keys(byTheme.light).filter((k) => byTheme.light[k] !== byTheme.dark[k]);

if (check) {
  const existing = data.shadowByTheme;
  const same = JSON.stringify(existing) === JSON.stringify(byTheme);
  console.log(`shadowByTheme ${same ? 'up to date' : 'OUT OF DATE'} (${differing.length}/12 differ between light and dark)`);
  process.exit(same ? 0 : 1);
}

data.shadowByTheme = byTheme;
data.shadowByThemeMeta = {
  derivedFrom: 'color.semantic{Light,Dark,HighContrast}.color{Neutral,Brand}Shadow{Ambient,Key}',
  formula: '@fluentui/tokens lib/utils/shadows.js createShadowTokens(ambient, key, suffix)',
  upstreamVersion: '1.0.0-alpha.24',
  note:
    'Shadow GEOMETRY is identical across themes; the COLOURS differ. Light uses ' +
    'rgba(0,0,0,0.12)/0.14, dark uses rgba(0,0,0,0.24)/0.28, so dark shadows are roughly twice as ' +
    `opaque. ${differing.length} of 12 tokens differ between light and dark; the Brand variants are ` +
    'theme-invariant because their ambient/key colours are. Regenerate with scripts/build-shadow-tokens.mjs.',
  differingTokens: differing,
};

writeFileSync(FILE, JSON.stringify(data, null, 2) + '\n');
console.log(`shadowByTheme written: 3 themes x 12 tokens, ${differing.length} differ between light and dark`);
for (const k of differing) console.log(`  ${k}\n    light: ${byTheme.light[k]}\n    dark:  ${byTheme.dark[k]}`);
