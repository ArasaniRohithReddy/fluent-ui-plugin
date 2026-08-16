#!/usr/bin/env node
/**
 * Fluent 2 design tokens -> DTCG JSON, for Microsoft's "Variables Import" Figma plugin.
 *
 *   node scripts/figma/dtcg-export.mjs [--out <dir>] [--stdout <manifest|filename>]
 *
 * Why this exists: the Figma MCP server only reads OUT of Figma. Nothing in it
 * pushes a token set IN. Microsoft's Variables Import plugin
 * (https://www.figma.com/community/plugin/1253424530216967528/variables-import,
 * source at github.com/microsoft/figma-variables-import) reads DTCG JSON and
 * writes Figma Variables, so emitting that file closes the code -> Figma
 * direction. We cannot RUN the plugin — Figma plugins execute only inside the
 * Figma editor, launched by a signed-in human — we can only hand over the file.
 *
 * The generator itself lives in the MCP server (mcp/src/tools/figma.ts) so the
 * tool section and this script can never drift apart. Run `npm run build` in
 * mcp/ first if dist/ is stale.
 *
 * mcp/data/fluent-tokens.json is READ ONLY. Nothing here writes to it.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const distFigma = join(here, '..', '..', 'mcp', 'dist', 'tools', 'figma.js');

let buildFluentDtcg;
try {
  ({ buildFluentDtcg } = await import(pathToFileURL(distFigma).href));
} catch (err) {
  console.error(`Could not load the generator from ${distFigma}`);
  console.error('Build the MCP server first:  cd mcp && npm install && npm run build');
  console.error(String(err));
  process.exit(1);
}

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};

const bundle = buildFluentDtcg();
if (!bundle) {
  console.error('mcp/data/fluent-tokens.json could not be read, so there is nothing to export.');
  process.exit(1);
}

const only = flag('--stdout', null);
if (only) {
  if (only === 'manifest') {
    process.stdout.write(JSON.stringify(bundle.manifest, null, '\t') + '\n');
    process.exit(0);
  }
  const hit = bundle.files.find((f) => f.filename === only || f.mode.toLowerCase() === only.toLowerCase());
  if (!hit) {
    console.error(`No such file "${only}". Available: manifest, ${bundle.files.map((f) => f.filename).join(', ')}`);
    process.exit(1);
  }
  process.stdout.write(JSON.stringify(hit.document, null, '\t') + '\n');
  process.exit(0);
}

const outDir = resolve(process.cwd(), flag('--out', 'fluent-dtcg'));
mkdirSync(outDir, { recursive: true });

// The plugin's own demo ships a manifest.json alongside the token documents, so
// mirror that layout exactly rather than inventing one.
writeFileSync(join(outDir, 'manifest.json'), JSON.stringify(bundle.manifest, null, '\t') + '\n', 'utf8');
for (const file of bundle.files) {
  writeFileSync(join(outDir, file.filename), JSON.stringify(file.document, null, '\t') + '\n', 'utf8');
}

console.log(`Wrote ${bundle.files.length + 1} files to ${outDir}`);
console.log(`  manifest.json  (collections: ${Object.keys(bundle.manifest.collections).join(', ')})`);
for (const file of bundle.files) {
  console.log(`  ${file.filename}  ${file.tokenCount} tokens  -> collection "${file.collection}", mode "${file.mode}"`);
}
console.log(`\n${bundle.totalTokens} tokens total, using DTCG types: ${bundle.typesUsed.join(', ')}`);

console.log('\nNOT exported — these Fluent categories cannot be expressed as Figma variables:');
for (const gap of bundle.notExpressible) {
  console.log(`  - ${gap.category} (${gap.tokens} tokens): ${gap.reason}`);
}

console.log('\nNext step (a human has to do this — we cannot run a Figma plugin):');
console.log('  1. Open the target Figma Design file.');
console.log('  2. Plugins > Variables Import.');
console.log(`  3. Import ${join(outDir, 'manifest.json')} for everything, or one .tokens.json for a single mode.`);
