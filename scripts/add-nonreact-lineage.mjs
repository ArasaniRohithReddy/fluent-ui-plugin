// Add the non-React Fluent lineage to the Fluent 1 dataset.
//
// "Which Fluent do I use without React?" has a genuinely awkward answer, and the
// dataset could not give it before. The honest version:
//   - office-ui-fabric-core is the CSS-only Fluent 1 answer, deprecated but
//     still the recommended one for what it does
//   - Fluent UI Web Components v1 and v2 were FAST-based Fluent 1; only v3 is
//     Fluent 2
//   - there is NO CSS-only Fluent 2 library at all
//
// That last point is why this is worth shipping. Asked for "the Fluent 2
// equivalent of Fabric Core", the tempting move is to name the closest-sounding
// package. There isn't one; the real answer is to consume design tokens as CSS
// custom properties. An explicit does-not-exist record beats a plausible
// substitute.
import { readFileSync, writeFileSync } from 'node:fs';

const TARGET = new URL('../mcp/data/fluent-v8.json', import.meta.url);
const RESEARCH = process.argv[2];
if (!RESEARCH) {
  console.error('usage: node scripts/add-nonreact-lineage.mjs <web-components-core.json>');
  process.exit(1);
}

const data = JSON.parse(readFileSync(TARGET, 'utf8'));
const research = JSON.parse(readFileSync(RESEARCH, 'utf8'));

const core = research.officeUiFabricCore ?? {};
const wc = research.webComponents ?? {};
const lineage = research.nonReactLineage ?? [];

if (!lineage.length && !core.package) {
  console.error('research file has neither nonReactLineage nor officeUiFabricCore — nothing to add');
  process.exit(1);
}

data.nonReact = {
  note:
    'Fluent without React. Covers the CSS-only line (office-ui-fabric-core) and the web-components line, including which generation each belongs to.',
  verifiedOn: research.meta?.verifiedOn ?? '2026-08',
  lineage,
  officeUiFabricCore: core,
  webComponents: wc,
  // Recorded deliberately: the absence is the answer, and without it an agent
  // will reach for the nearest plausible package name.
  noCssOnlyFluent2: {
    exists: false,
    whatPeopleExpect: 'A Fluent 2 successor to office-ui-fabric-core — a CSS-only Fluent 2 framework.',
    reality:
      core.fluent2Successor ??
      'There is no CSS-only Fluent 2 library. Consume Fluent 2 design tokens as CSS custom properties instead.',
    doNotSubstitute:
      'Do not name a different package as the Fluent 2 equivalent of Fabric Core. None of them is one.',
  },
};

// Merge, rather than replace, so nothing already recorded is lost.
const seen = new Set((data.unverified ?? []).map((u) => (typeof u === 'string' ? u : JSON.stringify(u))));
let added = 0;
for (const u of research.unverified ?? []) {
  const key = typeof u === 'string' ? u : JSON.stringify(u);
  if (!seen.has(key)) {
    (data.unverified ??= []).push(u);
    seen.add(key);
    added += 1;
  }
}

writeFileSync(TARGET, `${JSON.stringify(data, null, 2)}\n`, 'utf8');

console.log(`lineage entries    : ${lineage.length}`);
console.log(`wc generations     : ${(wc.generations ?? []).length}`);
console.log(`fabric core status : ${core.status ?? 'unknown'} (v${core.version ?? '?'})`);
console.log(`unverified merged  : +${added} (total ${data.unverified.length})`);
console.log(`no CSS-only Fluent 2 recorded explicitly: yes`);
