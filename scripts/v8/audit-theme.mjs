/**
 * Audit an existing Fluent UI v8 theme file.
 *
 * Usage:
 *   node scripts/v8/audit-theme.mjs <themePath.json> [--json] [--strict] [--all]
 *
 * `--strict` exits non-zero on warnings as well as errors, for CI.
 * A theme file may be a full ITheme, an IPartialTheme, or a bare
 * `{ "palette": {...} }` - the auditor only needs one of the two colour maps.
 */

import { auditV8Theme, readJson, parseArgs, fail, isMain, V8ThemeError } from './lib.mjs';

const USAGE = 'usage: node scripts/v8/audit-theme.mjs <themePath.json> [--json] [--strict] [--all]\n';

const SEVERITY_ORDER = { error: 0, warn: 1, info: 2 };

export function formatAudit(a, { showAll = false } = {}) {
  const L = [];
  const s = a.summary;
  L.push(`FLUENT UI v8 THEME AUDIT  ${a.ok ? 'PASS' : 'FAIL'}`);
  L.push('');
  L.push('COMPLETENESS');
  L.push(`  palette        ${s.paletteSlotsPresent}/${s.paletteSlotsExpected}`);
  L.push(`  semanticColors ${s.semanticSlotsPresent}/${s.semanticSlotsExpected}`);
  L.push('');
  L.push('CONTRAST (WCAG 2.2 AA: 4.5:1 text, 3:1 non-text)');
  L.push(`  checked ${s.contrastChecks}, failing ${s.contrastFailures}`);
  const shown = showAll ? a.contrast : a.contrast.filter((c) => !c.pass);
  for (const c of shown.sort((x, y) => x.ratio - y.ratio)) {
    const mark = c.pass ? 'ok  ' : c.waiver ? 'note' : 'FAIL';
    L.push(
      `   ${mark} ${String(c.ratio).padStart(5)}:1 (need ${c.required})  ${c.foreground} on ${c.background}` +
        (c.waiver ? `  [waived: ${c.waiver}]` : '')
    );
  }
  if (!showAll && a.contrast.length > shown.length) {
    L.push(`   ... ${a.contrast.length - shown.length} passing pair(s) hidden, use --all`);
  }
  L.push('');
  L.push('DERIVATION');
  L.push(`  hardcoded (value is in no palette slot): ${s.hardcodedSlots}`);
  for (const h of a.hardcoded) {
    L.push(`   - semanticColors.${h.slot} = ${h.value}  (should be palette.${h.derivesFrom} = ${h.expected})`);
  }
  L.push(`  re-pointed to another palette slot: ${s.repointedSlots}`);
  if (showAll) {
    for (const r of a.repointed) {
      L.push(`   - semanticColors.${r.slot} -> palette.${r.matchesPaletteSlot} (documented: ${r.derivesFrom})`);
    }
  }
  L.push('');
  L.push(`FINDINGS  ${s.errors} error, ${s.warnings} warn, ${s.bySeverity.info || 0} info`);
  const findings = a.findings
    .slice()
    .sort((x, y) => SEVERITY_ORDER[x.severity] - SEVERITY_ORDER[y.severity]);
  for (const f of findings) {
    if (!showAll && f.severity === 'info' && f.code.startsWith('contrast')) continue;
    L.push(`  [${f.severity}] ${f.code}: ${f.message}`);
    if (Array.isArray(f.slots) && f.slots.length && showAll) {
      L.push(`        ${f.slots.map((x) => (typeof x === 'string' ? x : x.slot)).join(', ')}`);
    }
  }
  return L.join('\n');
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const path = args._[0];
  if (!path || args.help) {
    process.stderr.write(USAGE);
    process.exit(2);
  }
  let audit;
  try {
    audit = auditV8Theme(readJson(path));
  } catch (err) {
    if (err instanceof V8ThemeError) return fail(err.message);
    throw err;
  }
  process.stdout.write(
    (args.json ? JSON.stringify(audit, null, 2) : formatAudit(audit, { showAll: args.all === true })) + '\n'
  );
  const bad = args.strict ? audit.summary.errors + audit.summary.warnings : audit.summary.errors;
  if (bad > 0) process.exit(1);
}

if (isMain(import.meta.url)) main();
