/**
 * Generate a Fluent UI React v8 theme from a brand colour.
 *
 * Usage:
 *   node scripts/v8/generate-theme.mjs [--brand #0078d4] [--text #323130]
 *        [--background #ffffff] [--inverted] [--name appTheme]
 *        [--out <path.json>] [--ts <path.ts>] [--full] [--json]
 *
 * With no --brand at all the output is DefaultPalette exactly, because the v8
 * designer pre-seeds every slot with Microsoft's hand-tuned values and only
 * re-derives the ones whose base colour actually changed.
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import {
  generateV8Theme,
  toCreateThemeSnippet,
  parseArgs,
  fail,
  isMain,
  V8ThemeError,
  DATA,
} from './lib.mjs';

const USAGE =
  'usage: node scripts/v8/generate-theme.mjs [--brand #0078d4] [--text #323130] [--background #ffffff]\n' +
  '                                          [--inverted] [--name appTheme] [--out theme.json]\n' +
  '                                          [--ts theme.ts] [--full] [--json]\n';

function asColor(value, flag) {
  if (value === undefined) return undefined;
  if (value === true) throw new V8ThemeError(`${flag} needs a value, e.g. ${flag} #0078d4`);
  return String(value);
}

export function formatTheme(result, { includeSemanticColors }) {
  const L = [];
  const { theme, baseColors, generatedSlots, warnings } = result;
  L.push(
    `FLUENT UI v8 THEME  (@fluentui/react@${DATA.meta.verifiedVersions['@fluentui/react']}, ` +
      `@fluentui/theme@${DATA.meta.verifiedVersions['@fluentui/theme']})`
  );
  L.push('');
  L.push('BASE COLOURS');
  L.push(`  primaryColor    ${baseColors.primaryColor}`);
  L.push(`  backgroundColor ${baseColors.backgroundColor}`);
  L.push(`  foregroundColor ${baseColors.foregroundColor}`);
  L.push(`  isInverted      ${baseColors.isInverted}`);
  L.push('');
  L.push('GENERATED RAMP (23 FabricSlots)');
  for (const [slot, value] of Object.entries(generatedSlots)) {
    const stock = DATA.palette[slot].light;
    const flag = String(value).toLowerCase() === String(stock).toLowerCase() ? '' : `  (default ${stock})`;
    L.push(`  ${slot.padEnd(22)} ${value}${flag}`);
  }
  L.push('');
  L.push(
    `PALETTE ${Object.keys(theme.palette).length} slots  ` +
      `SEMANTICCOLORS ${Object.keys(theme.semanticColors).length} slots  ` +
      `(${theme.meta.filledFromDefaultPalette.length} palette slots came from DefaultPalette)`
  );
  if (theme.meta.accentDerivedFromPrimary) {
    L.push('  palette.accent was auto-set to themePrimary, matching createTheme.');
  }
  if (includeSemanticColors) {
    L.push('');
    L.push('SEMANTICCOLORS');
    for (const [slot, value] of Object.entries(theme.semanticColors)) {
      L.push(`  ${slot.padEnd(34)} ${value}`);
    }
  }
  if (warnings.length) {
    L.push('');
    L.push('NOTES');
    for (const w of warnings) L.push(`  - ${w}`);
  }
  return L.join('\n');
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || args.h) {
    process.stdout.write(USAGE);
    return;
  }
  let result;
  try {
    result = generateV8Theme({
      primaryColor: asColor(args.brand ?? args.primary, '--brand'),
      textColor: asColor(args.text, '--text'),
      backgroundColor: asColor(args.background ?? args.bg, '--background'),
      isInverted: args.inverted === true ? true : undefined,
    });
  } catch (err) {
    if (err instanceof V8ThemeError) return fail(err.message);
    throw err;
  }

  const name = typeof args.name === 'string' ? args.name : 'appTheme';
  const includeSemanticColors = args.full === true;

  if (typeof args.out === 'string') {
    mkdirSync(dirname(args.out), { recursive: true });
    writeFileSync(args.out, JSON.stringify(result.theme, null, 2) + '\n', 'utf8');
    process.stderr.write(`wrote ${args.out}\n`);
  }
  if (typeof args.ts === 'string') {
    mkdirSync(dirname(args.ts), { recursive: true });
    writeFileSync(args.ts, toCreateThemeSnippet(result.theme, { includeSemanticColors, name }) + '\n', 'utf8');
    process.stderr.write(`wrote ${args.ts}\n`);
  }

  if (args.json) {
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    return;
  }
  process.stdout.write(formatTheme(result, { includeSemanticColors }) + '\n');
  // Only dump the snippet inline when it was not already written to a file.
  if (!args.out && !args.ts) {
    process.stdout.write('\n--- createTheme snippet ---\n');
    process.stdout.write(toCreateThemeSnippet(result.theme, { includeSemanticColors, name }) + '\n');
  }
}

if (isMain(import.meta.url)) main();
