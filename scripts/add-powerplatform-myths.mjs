// Add the corrected Power Platform myths to powerplatform.json.
//
// These are claims that sound plausible, appear in blog posts and community
// answers, and are wrong. They matter more than ordinary guidance because an
// agent that believes one of them will state it confidently: that Power BI
// custom visuals use Fluent (the sandbox ships no UI library at all), that
// Power Pages can have Bootstrap swapped out for a Fluent CSS library
// (Microsoft explicitly warns against it), or that Fluent 8 and Fluent 9
// platform libraries can be declared together in one PCF manifest (they cannot).
//
// Storing them as explicit myth/reality pairs lets the tool warn rather than
// stay silent, which is the difference between an agent that hedges and one
// that confidently misleads.
import { readFileSync, writeFileSync } from 'node:fs';

const TARGET = new URL('../mcp/data/powerplatform.json', import.meta.url);
const RESEARCH = process.argv[2];
if (!RESEARCH) {
  console.error('usage: node scripts/add-powerplatform-myths.mjs <v8-powerplatform.json>');
  process.exit(1);
}

const data = JSON.parse(readFileSync(TARGET, 'utf8'));
const research = JSON.parse(readFileSync(RESEARCH, 'utf8'));

const raw = research.correctedMyths ?? [];
if (!raw.length) {
  console.error('no correctedMyths in the research file — nothing to add');
  process.exit(1);
}

const pick = (o, ...keys) => keys.map((k) => o[k]).find((v) => typeof v === 'string' && v.trim()) ?? null;

const myths = raw
  .map((m) => ({
    myth: pick(m, 'myth', 'claim'),
    reality: pick(m, 'reality', 'truth', 'correction'),
    surface: pick(m, 'surface', 'area'),
    source: pick(m, 'source', 'citation', 'url'),
  }))
  .filter((m) => m.myth && m.reality);

data.correctedMyths = {
  note:
    'Plausible-sounding claims about Fluent on Power Platform that are false. Check these before asserting that a Fluent generation applies to a surface — several of them are the difference between correct guidance and confidently wrong guidance.',
  verifiedOn: research.meta?.verifiedOn ?? '2026-08',
  items: myths,
};

// The decision matrix answers the prior question: does Fluent even apply here?
if (research.decisionMatrix) data.fluentAppliesBySurface = research.decisionMatrix;

writeFileSync(TARGET, `${JSON.stringify(data, null, 2)}\n`, 'utf8');

console.log(`myths added        : ${myths.length}`);
console.log(`with a source      : ${myths.filter((m) => m.source).length}`);
console.log(`decision matrix    : ${research.decisionMatrix ? 'added' : 'not present in research'}`);
console.log(`top-level keys now : ${Object.keys(data).join(', ')}`);
