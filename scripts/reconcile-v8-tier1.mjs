// Reconcile the two tier-1 lists that reached mcp/data/fluent-v8.json by
// different routes.
//
// The dataset was assembled before the final research payload arrived, so it
// carries 91 entries keyed on `reason` plus a `tier1ClaimedCount` of 42 - a
// figure the researching agent later corrected to 56 after realising it had
// counted component *families* rather than individual exports. The research file
// holds those 56 canonical exports with an exact `libImport` and a short
// `whyBlocking`.
//
// Both are real, at different granularities: 91 includes grouped members such as
// DetailsRow and DetailsHeader; 56 lists only the primaries you would actually
// import. So this unions them rather than picking a winner, and replaces the
// stale count with something that states the granularity outright - a bare
// number here is what caused the confusion in the first place.
import { readFileSync, writeFileSync } from 'node:fs';

const DATASET = new URL('../mcp/data/fluent-v8.json', import.meta.url);
const RESEARCH = process.argv[2];
if (!RESEARCH) {
  console.error('usage: node scripts/reconcile-v8-tier1.mjs <components-tier1.json>');
  process.exit(1);
}

const data = JSON.parse(readFileSync(DATASET, 'utf8'));
const research = JSON.parse(readFileSync(RESEARCH, 'utf8'));

const existing = data.v8Only?.tier1 ?? [];
const incoming = research.v8Only?.tier1 ?? [];
if (!incoming.length) {
  console.error('research file has no v8Only.tier1 entries — refusing to touch the dataset');
  process.exit(1);
}

const byName = new Map(existing.map((e) => [e.name, { ...e }]));
let enriched = 0;
let added = 0;

for (const inc of incoming) {
  const cur = byName.get(inc.name);
  if (!cur) {
    byName.set(inc.name, { ...inc, role: inc.role ?? 'primary', source: 'research' });
    added += 1;
    continue;
  }
  // Keep whichever fields each side has; never overwrite a populated value with
  // an empty one.
  if (inc.whyBlocking && !cur.whyBlocking) {
    cur.whyBlocking = inc.whyBlocking;
    enriched += 1;
  }
  if (inc.libImport && !cur.libImport) cur.libImport = inc.libImport;
}

// A primary that inherited no short `whyBlocking` still has the longer `reason`;
// mirror it so consumers can rely on one field being present.
let mirrored = 0;
for (const e of byName.values()) {
  if (!e.whyBlocking && e.reason) {
    e.whyBlocking = e.reason.length > 160 ? `${e.reason.slice(0, 157)}...` : e.reason;
    mirrored += 1;
  }
}

const merged = [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
const primaries = merged.filter((e) => e.role !== 'grouped' || e.primary === e.name);

data.v8Only.tier1 = merged;
delete data.v8Only.tier1ClaimedCount; // ambiguous bare number, superseded below
data.v8Only.counts = {
  exports: merged.length,
  canonicalPrimaries: incoming.length,
  note: `${merged.length} v8-only exports in total, covering ${incoming.length} canonical components you would import directly; the remainder are grouped members such as DetailsRow that ship with a primary. An earlier count of 42 counted families, not exports.`,
};

writeFileSync(DATASET, `${JSON.stringify(data, null, 2)}\n`, 'utf8');

console.log(`existing entries : ${existing.length}`);
console.log(`research entries : ${incoming.length}`);
console.log(`enriched         : ${enriched} gained whyBlocking`);
console.log(`mirrored         : ${mirrored} derived whyBlocking from reason`);
console.log(`added            : ${added}`);
console.log(`total tier1      : ${merged.length} (${primaries.length} primaries)`);
console.log(`missing whyBlocking: ${merged.filter((e) => !e.whyBlocking).length}`);
