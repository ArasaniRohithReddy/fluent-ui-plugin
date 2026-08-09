#!/usr/bin/env node
/**
 * Merge literal on-screen text (vision OCR) into mcp/data/fluent-images.json.
 *
 * Why this exists as a separate field: `alt` DESCRIBES an image ("Consent dialog
 * asking whether to send optional Office experience data"), while `ocrText` is
 * the copy actually rendered inside it ("Do you want optional data about your
 * Office experience sent to Microsoft?" / "Send optional data" / "Don't send
 * optional data"). For Responsible AI and content-design pages the exact wording
 * IS the guidance, so an agent that can only read alt text loses the lesson.
 *
 * Usage:
 *   node scripts/merge-ocr-text.mjs <ocr.json> [--dry-run]
 *
 * <ocr.json> is [{ url, text, labels? }, ...]. Rows are matched to media items by
 * exact CDN url; a row that matches nothing is reported rather than dropped
 * silently, because a URL drift would otherwise look like a clean run.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const target = join(here, '..', 'mcp', 'data', 'fluent-images.json');
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const src = args.find((a) => !a.startsWith('--'));

if (!src) {
  console.error('usage: node scripts/merge-ocr-text.mjs <ocr.json> [--dry-run]');
  process.exit(1);
}

const ocr = JSON.parse(readFileSync(resolve(src), 'utf8'));
const doc = JSON.parse(readFileSync(target, 'utf8'));
const byUrl = new Map(doc.media.map((m) => [m.url, m]));

const EMPTY = new Set(['', '(no text)', 'n/a', 'none']);
let merged = 0, skippedEmpty = 0, unmatched = 0, addedLabels = 0;
const misses = [];

for (const row of ocr) {
  const text = (row.text || '').trim();
  if (EMPTY.has(text.toLowerCase())) { skippedEmpty++; continue; }
  const item = byUrl.get(row.url);
  if (!item) { unmatched++; misses.push(row.url); continue; }

  item.ocrText = text;
  merged++;

  // OCR sometimes recovers callout labels the anatomy pass missed. Union them,
  // preserving existing order so a re-run is a no-op.
  const incoming = Array.isArray(row.labels) ? row.labels
    : typeof row.labels === 'string' && row.labels.startsWith('[') ? JSON.parse(row.labels) : [];
  if (incoming.length) {
    const have = new Set(item.labels || []);
    const add = incoming.filter((l) => l && !have.has(l));
    if (add.length) { item.labels = [...(item.labels || []), ...add]; addedLabels += add.length; }
  }
}

doc.$meta.counts.withOcrText = doc.media.filter((m) => m.ocrText).length;

console.log(`merged ocrText: ${merged}`);
console.log(`skipped (no text in image): ${skippedEmpty}`);
console.log(`labels added: ${addedLabels}`);
console.log(`unmatched urls: ${unmatched}`);
misses.slice(0, 10).forEach((u) => console.log('  MISS ' + u));
console.log(`media items now carrying ocrText: ${doc.$meta.counts.withOcrText}`);

if (unmatched > 0) {
  console.error('\nERROR: some OCR rows did not match any media item by url.');
  console.error('Refusing to write a partial merge - fix the urls and re-run.');
  process.exit(1);
}
if (dryRun) { console.log('\n(DRY RUN - nothing written)'); process.exit(0); }

writeFileSync(target, JSON.stringify(doc, null, 2) + '\n');
console.log('\nwrote ' + target);
