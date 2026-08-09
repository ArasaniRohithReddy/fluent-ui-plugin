// Replace migration.json's v8->v9 component mapping with the real per-component
// rows now available in fluent-v8.json.
//
// The old mapping had 20 entries whose `v8` field was a slash-joined label such
// as "DefaultButton / PrimaryButton / IconButton / ActionButton". That reads fine
// in prose but cannot be looked up: an agent asking about IconButton found
// nothing, because no entry was keyed on it. The new dataset has 101 rows keyed
// on a single component each, with prop-level mapping, gotchas and a difficulty
// rating.
//
// The old hand-written `notes` are still worth keeping where they add something,
// so they are carried across onto the matching rows rather than discarded.
import { readFileSync, writeFileSync } from 'node:fs';

const MIGRATION = new URL('../mcp/data/migration.json', import.meta.url);
const V8 = new URL('../mcp/data/fluent-v8.json', import.meta.url);

const migration = JSON.parse(readFileSync(MIGRATION, 'utf8'));
const v8 = JSON.parse(readFileSync(V8, 'utf8'));

const rows = v8.migration?.map ?? [];
if (rows.length < 50) {
  console.error(`fluent-v8.json has only ${rows.length} mapping rows — refusing to replace a working mapping with less data`);
  process.exit(1);
}

const scenario = migration.scenarios?.v8ToV9;
if (!scenario) {
  console.error('migration.json has no scenarios.v8ToV9');
  process.exit(1);
}

const previous = Array.isArray(scenario.componentMapping) ? scenario.componentMapping : [];

// Index the old prose notes by each individual name in a slash-joined label, so
// "DefaultButton / PrimaryButton" contributes a note to both.
const legacyNotes = new Map();
for (const entry of previous) {
  const names = String(entry.v8 || '')
    .split('/')
    .map((s) => s.trim())
    .filter(Boolean);
  for (const n of names) {
    if (entry.notes && !legacyNotes.has(n)) legacyNotes.set(n, entry.notes);
  }
}

let carried = 0;
const mapped = rows
  .map((r) => {
    const out = {
      v8: r.v8,
      v9: r.v9,
      difficulty: r.difficulty ?? null,
      imports: r.imports ?? null,
      keyPropMapping: r.keyPropMapping ?? null,
      gotchas: r.gotchas ?? null,
    };
    if (r.variant) out.variant = r.variant;
    if (Array.isArray(r.v9Exports) && r.v9Exports.length) out.v9Exports = r.v9Exports;
    const legacy = legacyNotes.get(r.v8);
    if (legacy && legacy !== r.gotchas) {
      out.notes = legacy;
      carried += 1;
    }
    return out;
  })
  .sort((a, b) => String(a.v8).localeCompare(String(b.v8)));

// Anything the old mapping named that the new rows do not cover would be a
// regression, so surface it rather than letting it disappear.
const newNames = new Set(mapped.map((m) => m.v8));
const dropped = [...legacyNotes.keys()].filter((n) => !newNames.has(n));

scenario.componentMapping = mapped;
scenario.componentMappingNote =
  `${mapped.length} per-component rows sourced from mcp/data/fluent-v8.json. Each row is keyed on a single v8 export so it can be looked up directly; the previous 20 rows used slash-joined labels such as "DefaultButton / PrimaryButton / IconButton" that no lookup could match. For collisions, v8-only components and runtime traps, call fluent_v8_lookup.`;

writeFileSync(MIGRATION, `${JSON.stringify(migration, null, 2)}\n`, 'utf8');

console.log(`previous rows : ${previous.length} (slash-joined labels)`);
console.log(`new rows      : ${mapped.length} (one component each)`);
console.log(`notes carried : ${carried}`);
console.log(`with props    : ${mapped.filter((m) => m.keyPropMapping).length}`);
console.log(`with gotchas  : ${mapped.filter((m) => m.gotchas).length}`);
if (dropped.length) console.log(`NOT covered by new rows: ${dropped.join(', ')}`);
else console.log('every previously named component is still covered');
