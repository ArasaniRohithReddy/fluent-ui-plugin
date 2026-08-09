/**
 * Convert between a Fluent UI v8 theme and a Fluent 2 (v9) brand ramp.
 *
 * Usage:
 *   node scripts/v8/convert-theme.mjs to-v9   <v8Theme.json>  [--out <p>] [--ts <p>] [--json] [--all]
 *   node scripts/v8/convert-theme.mjs to-v8   <brandRamp.json> [--out <p>] [--ts <p>] [--json]
 *                                             [--background #1b1a19] [--text #f3f2f1] [--inverted]
 *
 * `to-v8` accepts either a bare `{ "10": "#...", ..., "160": "#..." }` ramp, a
 * 16-item array, or a v9 theme file with a `brandRamp` / `brand` property.
 *
 * Neither direction is lossless. Both print exactly what was lost.
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import {
  v8ThemeToV9,
  v9ToV8Theme,
  toV9ThemeSnippet,
  toCreateThemeSnippet,
  readJson,
  parseArgs,
  fail,
  isMain,
  V8ThemeError,
  V9_BRAND_STOPS,
} from './lib.mjs';

const USAGE =
  'usage: node scripts/v8/convert-theme.mjs to-v9 <v8Theme.json> [--out <p>] [--ts <p>] [--json] [--all]\n' +
  '       node scripts/v8/convert-theme.mjs to-v8 <brandRamp.json> [--out <p>] [--ts <p>] [--json]\n' +
  '                                          [--background #1b1a19] [--text #f3f2f1] [--inverted]\n';

const CONFIDENCE_ORDER = { low: 0, medium: 1, 'n/a': 2, high: 3 };

export function formatToV9(r, { showAll = false } = {}) {
  const L = [];
  L.push('v8 -> Fluent 2 (v9)');
  L.push('');
  L.push('BRAND RAMP (16 stops)  [positions INFERRED, see NOTES]');
  for (const stop of V9_BRAND_STOPS) {
    const p = r.brandRampProvenance[stop];
    L.push(`  ${String(stop).padStart(3)}  ${r.brandRamp[stop]}  ${p.source}${p.from ? ` <- ${p.from}` : ''}`);
  }
  L.push('');
  L.push(`TOKEN OVERRIDES  ${r.summary.tokensProduced} v9 tokens from ${r.summary.paletteSlots} palette + ${r.summary.semanticSlots} semantic slots`);
  if (showAll) {
    for (const [token, value] of Object.entries(r.tokenOverrides)) L.push(`  ${token.padEnd(42)} ${value}`);
  }
  L.push('');
  L.push(`LOSSY  ${r.summary.lossyCount} slot(s)`);
  const byConfidence = r.summary.byConfidence;
  L.push(
    `  by confidence: ` +
      Object.entries(byConfidence)
        .sort((a, b) => (CONFIDENCE_ORDER[a[0]] ?? 9) - (CONFIDENCE_ORDER[b[0]] ?? 9))
        .map(([k, v]) => `${k}=${v}`)
        .join(' ')
  );
  const interesting = r.lossy
    .slice()
    .sort((a, b) => (CONFIDENCE_ORDER[a.confidence] ?? 9) - (CONFIDENCE_ORDER[b.confidence] ?? 9));
  const shown = showAll ? interesting : interesting.filter((l) => !l.v9Token || l.confidence === 'low');
  const limit = showAll ? shown.length : 20;
  for (const l of shown.slice(0, limit)) {
    L.push(
      `   - ${l.kind}.${l.slot}${l.value ? ` (${l.value})` : ''} -> ${l.v9Token || 'NOTHING'}` +
        `  [${l.confidence || 'n/a'}] ${l.reason}`
    );
  }
  if (interesting.length > Math.min(limit, shown.length)) {
    L.push(`   ... ${interesting.length - Math.min(limit, shown.length)} more, use --all`);
  }
  if (r.conflicts.length) {
    L.push('');
    L.push(`TOKEN COLLISIONS  ${r.conflicts.length}`);
    for (const c of r.conflicts) {
      L.push(`   - ${c.v9Token}: ${c.winner}=${c.winnerValue} won over ${c.loser}=${c.loserValue}`);
    }
  }
  L.push('');
  L.push('NOTES');
  for (const w of r.warnings) L.push(`  - ${w}`);
  return L.join('\n');
}

export function formatToV8(r) {
  const L = [];
  L.push('Fluent 2 (v9) brand ramp -> v8');
  L.push('');
  L.push(`ADOPTED FROM RAMP  ${r.adoptedFromRamp.length}`);
  for (const a of r.adoptedFromRamp) L.push(`  brand[${a.stop}] -> palette.${a.slot} = ${r.theme.palette[a.slot]}`);
  L.push('');
  L.push(`DERIVED BY THE v8 SHADE ALGORITHM  ${r.derivedFromShadeAlgorithm.length}`);
  L.push(`  ${r.derivedFromShadeAlgorithm.join(', ')}`);
  if (r.missingRampStops.length) {
    L.push('');
    L.push(`RAMP STOPS ABSENT FROM INPUT  ${r.missingRampStops.join(', ')}`);
  }
  L.push('');
  L.push('CANNOT ROUND-TRIP');
  L.push(`  neutrals      ${r.cannotRoundTrip.neutrals}`);
  L.push(`  status colors ${r.cannotRoundTrip.statusColors}`);
  L.push(`  v9 tokens with no v8 home: ${r.cannotRoundTrip.tokens.length} (use --json for the list)`);
  L.push('');
  L.push('NOTES');
  for (const w of r.warnings) L.push(`  - ${w}`);
  return L.join('\n');
}

function writeOut(path, text) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text.endsWith('\n') ? text : text + '\n', 'utf8');
  process.stderr.write(`wrote ${path}\n`);
}

/** A ramp may arrive bare, nested under brandRamp/brand, or as a 16-item array. */
function extractRamp(doc) {
  if (Array.isArray(doc)) return doc;
  if (doc && typeof doc === 'object') {
    if (doc.brandRamp) return doc.brandRamp;
    if (doc.brand) return doc.brand;
    return doc;
  }
  throw new V8ThemeError('expected a brand ramp object or array');
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const direction = args._[0];
  const path = args._[1];
  if (!direction || !path || args.help) {
    process.stderr.write(USAGE);
    process.exit(2);
  }
  if (direction !== 'to-v9' && direction !== 'to-v8') {
    process.stderr.write(`error: unknown direction "${direction}"\n${USAGE}`);
    process.exit(2);
  }

  try {
    if (direction === 'to-v9') {
      const result = v8ThemeToV9({ theme: readJson(path) });
      if (typeof args.out === 'string') writeOut(args.out, JSON.stringify(result, null, 2));
      if (typeof args.ts === 'string') writeOut(args.ts, toV9ThemeSnippet(result));
      process.stdout.write(
        (args.json ? JSON.stringify(result, null, 2) : formatToV9(result, { showAll: args.all === true })) + '\n'
      );
      return;
    }
    const result = v9ToV8Theme({
      brandRamp: extractRamp(readJson(path)),
      isInverted: args.inverted === true,
      backgroundColor: typeof args.background === 'string' ? args.background : undefined,
      textColor: typeof args.text === 'string' ? args.text : undefined,
    });
    if (typeof args.out === 'string') writeOut(args.out, JSON.stringify(result.theme, null, 2));
    if (typeof args.ts === 'string') writeOut(args.ts, toCreateThemeSnippet(result.theme));
    process.stdout.write(
      (args.json ? JSON.stringify(result, null, 2) : formatToV8(result)) + '\n'
    );
  } catch (err) {
    if (err instanceof V8ThemeError) return fail(err.message);
    throw err;
  }
}

if (isMain(import.meta.url)) main();
