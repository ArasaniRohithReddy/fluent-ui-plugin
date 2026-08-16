#!/usr/bin/env node
/**
 * Split sign-in-gated Microsoft content out of the published datasets.
 *
 * Some Fluent 2 usage pages (the AI/Copilot components in particular) require a
 * Microsoft employee sign-in. Their guidance was captured and merged into
 * `mcp/data/*.json`, which are TRACKED — so ~38 KB of verbatim prose from
 * behind a sign-in gate was being redistributed publicly under this repo's MIT
 * licence, while `NOTICE` claimed the opposite. `.gitignore` already keeps
 * `research/` and `assets/screenshots/` local for exactly this reason; this
 * applies the same rule to the data files.
 *
 * The split follows the facts/expression line:
 *   PUBLISHED  - short factual labels (component name, anatomy part names,
 *                section headings), public CDN image URLs, the official docUrl
 *                and Storybook link, and a note saying where to read the rest.
 *   LOCAL ONLY - full sentences and paragraphs (description, whenToUse,
 *                behavior/accessibility/content guidance, do & don't prose),
 *                which are the author's expression, not facts.
 *
 * Nothing is lost: the full text moves to `mcp/data/local/` (gitignored), and
 * the MCP tools transparently merge that overlay back in when it exists. A
 * signed-in employee keeps the complete experience on their own machine; a
 * public clone gets the facts plus a link to the official page.
 *
 *   node scripts/split-gated-content.mjs --dry-run   # report, write nothing
 *   node scripts/split-gated-content.mjs             # perform the split
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const DATA = join(root, 'mcp', 'data');
const LOCAL = join(DATA, 'local');
const dryRun = process.argv.includes('--dry-run');

// Fields holding full sentences. Everything else stays published.
// Two dataset shapes carry gated text: component usage entries and
// design-guidance topics, which name their prose fields differently.
const PROSE_STRINGS = ['description', 'whenToUse', 'summary', 'sourceIntro'];
const PROSE_LISTS = ['behavior', 'accessibility', 'content', 'keyPoints', 'sections'];
const PROSE_OBJECTS = ['bestPractices', 'doDont', 'values'];

const NOTICE_TEXT =
  'The guidance on this page is published by Microsoft behind an employee sign-in, so it is not ' +
  'redistributed here. Read it at the official docUrl. If you have access, restore mcp/data/local/ ' +
  '(or re-run the capture) to merge the full guidance back in on your own machine.';

const isGated = (o) =>
  o && typeof o === 'object' &&
  // Real records carry a docUrl; the nested `capture`/`sourceCapture` blocks
  // don't, and matching those too would double-count and rewrite metadata twice.
  typeof o.docUrl === 'string' &&
  (o.contentSource === 'gated-capture' ||
   (typeof o.accessStatus === 'string' && o.accessStatus.startsWith('employee-gated')) ||
   o?.capture?.accessStatus === 'employee-gated-captured');

let movedChars = 0;
let movedEntries = 0;
const report = [];

for (const file of ['fluent-components-usage.json', 'design-guidance.json', 'fluent-native.json']) {
  const path = join(DATA, file);
  if (!existsSync(path)) continue;
  const raw = readFileSync(path, 'utf8');
  const data = JSON.parse(raw);
  const overlay = {};
  let touched = 0;

  // Walk every object; the three files have different shapes (array-like object,
  // nested guidance, platform map), so key off the gated marker rather than a path.
  const visit = (node, path) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) { node.forEach((v, i) => visit(v, `${path}[${i}]`)); return; }

    if (isGated(node)) {
      const key = node.slug || node.title || node.name || path;
      const stash = {};
      for (const k of PROSE_STRINGS) {
        if (typeof node[k] === 'string' && node[k].trim()) { stash[k] = node[k]; movedChars += node[k].length; delete node[k]; }
      }
      for (const k of PROSE_LISTS) {
        if (Array.isArray(node[k]) && node[k].length) { stash[k] = node[k]; movedChars += JSON.stringify(node[k]).length; node[k] = []; }
      }
      for (const k of PROSE_OBJECTS) {
        if (node[k] && JSON.stringify(node[k]) !== '{"do":[],"dont":[]}' && JSON.stringify(node[k]) !== '{}') {
          stash[k] = node[k]; movedChars += JSON.stringify(node[k]).length;
          node[k] = Array.isArray(node[k]) ? [] : (('do' in node[k]) ? { do: [], dont: [] } : {});
        }
      }
      // `capture` / `sourceCapture` record HOW the gated page was fetched
      // (including the sign-in method and the pre-redirect URL). That belongs
      // with the local copy, not in a public repo.
      for (const k of ['capture', 'sourceCapture']) {
        if (node[k]) { stash[k] = node[k]; delete node[k]; }
      }
      if (Object.keys(stash).length) {
        overlay[key] = stash;
        node.gatedNotice = NOTICE_TEXT;
        touched++; movedEntries++;
      }
    }
    for (const [k, v] of Object.entries(node)) visit(v, `${path}/${k}`);
  };
  visit(data, file);

  if (!touched) { report.push(`  ${file}: no gated prose found`); continue; }
  report.push(`  ${file}: ${touched} entries redacted -> local overlay`);

  if (!dryRun) {
    mkdirSync(LOCAL, { recursive: true });
    const overlayPath = join(LOCAL, file);
    // Re-running after a split would otherwise overwrite a full overlay with an
    // empty one and destroy the only remaining copy of the gated text.
    if (existsSync(overlayPath)) {
      const existing = JSON.parse(readFileSync(overlayPath, 'utf8'));
      if (Object.keys(existing).length > Object.keys(overlay).length) {
        console.error(`  REFUSING to shrink ${file} overlay (${Object.keys(existing).length} -> ${Object.keys(overlay).length} entries).`);
        console.error('  The tracked file appears already split. Delete the overlay first if this is intentional.');
        process.exit(1);
      }
    }
    writeFileSync(overlayPath, JSON.stringify(overlay, null, 2) + '\n');
    writeFileSync(path, JSON.stringify(data, null, 2) + '\n');
  }
}

console.log(dryRun ? 'DRY RUN — nothing written' : 'Split applied');
report.forEach((r) => console.log(r));
console.log(`  ${movedEntries} entries, ${movedChars} chars of gated prose moved out of tracked data`);
if (!dryRun) console.log(`  full text preserved in mcp/data/local/ (gitignored, merged back at runtime)`);
