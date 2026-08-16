#!/usr/bin/env node
/**
 * Sync the host-specific plugin manifests from the root `plugin.json`.
 *
 * The same manifest has to exist in four places because each host looks for it
 * somewhere different (Claude reads `.claude-plugin/`, Codex reads
 * `.codex-plugin/`, GitHub reads `.github/plugin/`). Kept by hand they drift:
 * the root file collected 41 keywords while the three copies stayed frozen at
 * 27, so the manifests the hosts actually read described an older, smaller
 * product than the one being shipped.
 *
 * Root is the single source of truth. This regenerates the copies from it.
 *
 *   node scripts/sync-plugin-manifests.mjs             # write the copies
 *   node scripts/sync-plugin-manifests.mjs --check     # verify only, exit 1 on drift (CI/smoke)
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = 'plugin.json';
const COPIES = ['.claude-plugin/plugin.json', '.codex-plugin/plugin.json', '.github/plugin/plugin.json'];

const check = process.argv.includes('--check');
const source = readFileSync(join(root, SOURCE), 'utf8');

// Compare parsed objects, not raw text: a copy that differs only by trailing
// newline or key order is still correct, and failing CI over that would train
// people to ignore this check.
const expected = JSON.parse(source);
const stable = (o) => JSON.stringify(o, Object.keys(o).sort());

let drifted = 0;
for (const rel of COPIES) {
  const path = join(root, rel);
  let actual = null;
  try { actual = JSON.parse(readFileSync(path, 'utf8')); } catch { /* missing or unparseable */ }

  if (actual && stable(actual) === stable(expected)) {
    if (!check) console.log(`  ${rel} already in sync`);
    continue;
  }

  drifted++;
  if (check) {
    const why = !actual ? 'missing or unparseable' : diffKeys(expected, actual).join(', ');
    console.error(`  DRIFT ${rel}: ${why}`);
  } else {
    writeFileSync(path, source);
    console.log(`  ${rel} updated from ${SOURCE}`);
  }
}

function diffKeys(a, b) {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  return [...keys].filter((k) => JSON.stringify(a[k]) !== JSON.stringify(b[k]));
}

if (check && drifted) {
  console.error(`\n${drifted} manifest(s) out of sync with ${SOURCE}. Run: node scripts/sync-plugin-manifests.mjs`);
  process.exit(1);
}
console.log(check ? 'plugin manifests in sync' : `plugin manifests synced (${COPIES.length} copies)`);
