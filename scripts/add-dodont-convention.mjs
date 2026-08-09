// Record the do/don't phrasing convention in design-guidance.json.
//
// Fluent's do/don't tables put the negation in the COLUMN HEADER, not the
// sentence. So a genuine don't reads:
//
//   do:   "Use emoji sparingly and only when they serve a clear purpose"
//   dont: "Use emoji to replace meaningful text"
//
// Both open with "Use emoji". The text is verbatim and correct, and the tool
// returns the do/dont keys intact, so nothing is currently wrong. The hazard is
// that a dont string quoted on its own inverts into advice to do the thing --
// the same failure class that once shipped inverted advice here.
//
// The fix is NOT to rewrite the source text. It is to state the convention so
// any consumer knows the key carries the polarity.
import { readFileSync, writeFileSync } from 'node:fs';

const TARGET = new URL('../mcp/data/design-guidance.json', import.meta.url);
const raw = readFileSync(TARGET, 'utf8');
const data = JSON.parse(raw);

data.$meta ??= {};
data.$meta.doDontConvention = {
  shape: 'Each doDont block has a "do" array and a "dont" array of verbatim source strings.',
  warning:
    'Entries are bare imperatives. The negation lives in the "dont" key, NOT in the sentence — a dont often reads "Use X ..." and means "Don\'t use X ...". Never quote, render, or summarise a dont entry without its key, and never treat a leading "Use"/"Do" as evidence an entry is a do.',
  correctRendering: 'Prefix every "dont" entry with "Don\'t " when flattening to prose or a single list.',
  whyVerbatim:
    'The strings are left exactly as published so they stay traceable to the source page; rewriting them to embed the negation would break that.',
};

// Count the pairs this applies to, so the note is provably relevant.
let blocks = 0;
let dos = 0;
let donts = 0;
let bareImperativeDonts = 0;
const walk = (o) => {
  if (!o || typeof o !== 'object') return;
  if (Array.isArray(o)) return o.forEach(walk);
  if (Array.isArray(o.do) || Array.isArray(o.dont)) {
    blocks += 1;
    dos += (o.do ?? []).length;
    donts += (o.dont ?? []).length;
    for (const x of o.dont ?? []) {
      if (!/^\s*[^A-Za-z]*(don'?t|do not|never|avoid|steer clear|refrain)/i.test(String(x))) bareImperativeDonts += 1;
    }
  }
  for (const v of Object.values(o)) walk(v);
};
walk(data.topics ?? {});

const trailingNewline = raw.endsWith('\n');
writeFileSync(TARGET, JSON.stringify(data, null, 2) + (trailingNewline ? '\n' : ''), 'utf8');

console.log(`doDont blocks           : ${blocks}`);
console.log(`do entries              : ${dos}`);
console.log(`dont entries            : ${donts}`);
console.log(`  of which bare imperative (rely on the key for negation): ${bareImperativeDonts}`);
console.log(`convention note written : yes`);
