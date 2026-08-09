// Merge fenced ```json blocks from a sub-agent transcript into one object.
//
// Two problems this solves, both learned the hard way:
//  1. Agents split large replies into "Part 1/3" etc., so taking only the last
//     block silently discards most of the payload.
//  2. A transcript also contains blocks from EARLIER turns - raw research
//     artifacts such as OAuth discovery documents - which pollute the merge and
//     produce a nonsense shape. So we can restrict to the final turn and/or to
//     blocks that actually look like the schema we asked for.
//
// Usage:
//   node merge-agent-json.mjs <transcript> <out.json> [--after-turn] [--keys=a,b,c]
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const [src, out, ...flags] = process.argv.slice(2);
if (!src || !out) {
  console.error('usage: node merge-agent-json.mjs <transcript> <out.json> [--after-turn] [--keys=a,b]');
  process.exit(1);
}

const afterTurn = flags.includes('--after-turn');
const keysFlag = flags.find((f) => f.startsWith('--keys='));
const wantKeys = keysFlag ? keysFlag.slice('--keys='.length).split(',').map((s) => s.trim()) : null;

let text = readFileSync(src, 'utf8');

// Keep only the final turn when asked: earlier turns hold exploratory output.
if (afterTurn) {
  const marks = [...text.matchAll(/^\[Turn \d+\]/gm)];
  if (marks.length > 1) text = text.slice(marks[marks.length - 1].index);
}

const blocks = [...text.matchAll(/```json\s*\n([\s\S]*?)```/g)].map((m) => m[1]);

const isPlainObject = (v) => v && typeof v === 'object' && !Array.isArray(v);

// Arrays concatenate and objects merge, so a payload split across several blocks
// reassembles instead of later blocks clobbering earlier ones.
const deepMerge = (a, b) => {
  if (Array.isArray(a) && Array.isArray(b)) return [...a, ...b];
  if (isPlainObject(a) && isPlainObject(b)) {
    const out = { ...a };
    for (const [k, v] of Object.entries(b)) out[k] = k in a ? deepMerge(a[k], v) : v;
    return out;
  }
  return b;
};

let merged = {};
let used = 0;
const skipped = [];

for (const raw of blocks) {
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    skipped.push('unparseable');
    continue;
  }
  if (wantKeys && isPlainObject(parsed) && !wantKeys.some((k) => k in parsed)) {
    skipped.push(`off-schema (${Object.keys(parsed).slice(0, 3).join(',')})`);
    continue;
  }
  merged = deepMerge(merged, parsed);
  used += 1;
}

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, `${JSON.stringify(merged, null, 2)}\n`, 'utf8');

console.log(`blocks found : ${blocks.length}`);
console.log(`merged       : ${used}`);
if (skipped.length) console.log(`skipped      : ${skipped.length} (${[...new Set(skipped)].join('; ')})`);
console.log(`top-level    : ${Object.keys(merged).join(', ') || '(empty)'}`);
console.log(`-> ${out}`);
