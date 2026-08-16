// Build mcp/data/fluent-icons.json — the Fluent system icon index that
// fluent_icon_search reads.
//
// Why this exists: an agent that guesses a Fluent icon name is wrong often
// enough to be useless. `AddCircle24Regular` is real, `AddCircle26Regular` is
// not, and nothing about the design name "Add Circle" tells you which sizes
// were actually shipped. Guessing produces a compile error every time.
//
// Two upstream manifests are combined, both from microsoft/fluentui-system-icons
// (MIT, Copyright (c) 2020 Microsoft Corporation):
//
//   1. assets/<Icon Name>/metadata.json  — the DESIGN record: human name, the
//      sizes and styles the design was drawn for, a description, and the
//      `metaphor` keyword list. The metaphors are the whole reason search can
//      answer "trash" with `Delete24Regular`: Fluent icons are named for the
//      object, not the function ("Shield, not security").
//   2. packages/react-icons/metadata.json — the AUTHORITATIVE export list,
//      26,469 keys, one per real React export.
//
// The two do not agree. Deriving the export name from the design name
// (strip non-alphanumerics, TitleCase) resolves only ~2,953 of 2,973 families —
// acronyms and oddities break it (LTR -> Ltr, "Card UI" -> CardUi). Worse, the
// design record lists sizes the export list does not always ship. So EVERY name
// this script writes is checked for membership in the export manifest first,
// and anything that fails is dropped and reported. Nothing is derived at query
// time; the tool only ever hands back a name that existed upstream.
//
// The dataset stores families (name, base, per-style size lists, description,
// metaphors), not the 26,469 export names — those are reconstructable from
// base + size + style once the combination has been verified here.
//
// We embed names, sizes, styles, descriptions and metaphors only. No SVG
// artwork, no product/launch icons, no file-type icons (see NOTICE).
//
// Usage:
//   node scripts/build-icons.mjs                 # full build from main
//   node scripts/build-icons.mjs --ref=<sha>     # pin a specific commit
//   node scripts/build-icons.mjs --limit=50      # quick partial run (writes nothing)
//   node scripts/build-icons.mjs --dry-run       # report only
//
// Re-runnable and idempotent: the same upstream commit produces byte-identical
// output apart from meta.generated.

import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const OUT = new URL('../mcp/data/fluent-icons.json', import.meta.url);
const REPO = 'microsoft/fluentui-system-icons';
const API = `https://api.github.com/repos/${REPO}`;
const RAW = `https://raw.githubusercontent.com/${REPO}`;

/** The only sizes Fluent system icons are drawn at. Anything else is a typo. */
const VALID_SIZES = [12, 16, 20, 24, 28, 32, 48];
const STYLES = ['Regular', 'Filled', 'Light', 'Color'];

const args = new Map(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v ?? 'true'];
  }),
);
const REF = args.get('ref') || 'main';
const LIMIT = args.has('limit') ? Number(args.get('limit')) : 0;
const CONCURRENCY = args.has('concurrency') ? Number(args.get('concurrency')) : 12;
const DRY = args.has('dry-run') || LIMIT > 0;

const log = (...a) => console.log(...a);

/**
 * The GitHub API rate-limits anonymous callers hard enough that even resolving
 * a commit sha returns 403. Reuse the token the machine already has rather than
 * asking for a new one; raw.githubusercontent works either way.
 */
function githubToken() {
  const fromEnv = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  if (fromEnv) return fromEnv.trim();
  try {
    return execFileSync('gh', ['auth', 'token'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return '';
  }
}
const TOKEN = githubToken();
log(TOKEN ? 'GitHub API: using an existing token' : 'GitHub API: anonymous (expect rate limiting)');

async function getText(url, tries = 4) {
  for (let attempt = 1; attempt <= tries; attempt++) {
    try {
      const headers = {
        'user-agent': 'fluent-ui-plugin build-icons',
        accept: 'application/vnd.github.raw, application/json;q=0.9, */*;q=0.8',
      };
      if (TOKEN && url.startsWith(API)) headers.authorization = `Bearer ${TOKEN}`;
      const res = await fetch(url, { headers });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    } catch (err) {
      if (attempt === tries) throw new Error(`${url}: ${err.message}`);
      // Be polite rather than fast: this hits ~3,000 files on a public CDN.
      await new Promise((r) => setTimeout(r, 400 * attempt * attempt));
    }
  }
  return null;
}

const getJson = async (url) => {
  const t = await getText(url);
  return t === null ? null : JSON.parse(t);
};

/** Run `worker` over `items` with a fixed number of in-flight requests. */
async function pool(items, worker, concurrency, onTick) {
  const out = new Array(items.length);
  let next = 0;
  let done = 0;
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      out[i] = await worker(items[i], i);
      if (onTick && ++done % 250 === 0) onTick(done, items.length);
    }
  });
  await Promise.all(runners);
  return out;
}

/** "Add Circle" -> "addcircle". The only key both manifests can be joined on. */
const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');

/**
 * Several upstream design records are double-encoded: the bytes for "⚠️" are
 * stored as the UTF-8 encoding of its own mojibake (C3 A2 C2 9A C2 A0 …), so a
 * correct UTF-8 read still yields "â\u009a\u00a0ï\u00b8\u008f". Re-decoding
 * through latin-1 recovers the original character. Only accept the repair when
 * it produces no replacement characters, so a genuinely accented string is
 * never mangled.
 */
let mojibakeRepairs = 0;
function fixMojibake(s) {
  if (typeof s !== 'string' || !/[\u00c0-\u00ff][\u0080-\u00bf]/.test(s)) return s;
  const repaired = Buffer.from(s, 'latin1').toString('utf8');
  if (repaired.includes('\uFFFD')) return s;
  mojibakeRepairs++;
  return repaired;
}

/** Repair encoding, then flatten whitespace: a few records embed raw newlines
 *  that would turn one search result into three lines of orphaned prose. */
const clean = (s) => fixMojibake(String(s)).replace(/\s+/g, ' ').trim();

/**
 * Split a real export name into base + size + style. Only the seven real sizes
 * count as a size, so `NumberCircle120Regular` reads as base NumberCircle1 at
 * size 20 (correct) rather than an invented size 120, and `Rotate9020Filled`
 * keeps Rotate90 as the base.
 */
const EXPORT_RE = new RegExp(`^(.+?)(?:(${VALID_SIZES.join('|')}))?(${STYLES.join('|')})$`);
function splitExport(name) {
  // Greedy first: prefer the longest base, which is what keeps "Rotate90" whole.
  const greedy = name.match(new RegExp(`^(.+)(${VALID_SIZES.join('|')})(${STYLES.join('|')})$`));
  if (greedy) return { base: greedy[1], size: Number(greedy[2]), style: greedy[3] };
  const m = name.match(EXPORT_RE);
  if (!m) return null;
  return { base: m[1], size: m[2] ? Number(m[2]) : null, style: m[3] };
}

// ---------------------------------------------------------------------------

log(`Resolving ${REPO}@${REF} …`);
const refInfo = REF === 'main' ? await getJson(`${API}/commits/main`) : await getJson(`${API}/commits/${REF}`);
const COMMIT = refInfo?.sha;
if (!COMMIT) throw new Error(`could not resolve ${REPO}@${REF}`);
const COMMIT_DATE = refInfo?.commit?.committer?.date || refInfo?.commit?.author?.date || null;
log(`  commit ${COMMIT} (${COMMIT_DATE})`);

log('Fetching packages/react-icons/metadata.json (the authoritative export list) …');
const exportsManifest = await getJson(`${RAW}/${COMMIT}/packages/react-icons/metadata.json`);
const exportNames = Object.keys(exportsManifest || {});
if (exportNames.length < 20000) throw new Error(`export manifest looks wrong: ${exportNames.length} keys`);
log(`  ${exportNames.length} exports`);

const pkg = await getJson(`${RAW}/${COMMIT}/packages/react-icons/package.json`);
log(`  @fluentui/react-icons source version ${pkg?.version}`);

// Index every export by base so a family can be resolved to a REAL base name
// rather than a derived guess.
const byBase = new Map(); // base -> { sized: Map<style, Set<size>>, resizable: Set<style> }
const unparsedExports = [];
for (const name of exportNames) {
  const parsed = splitExport(name);
  if (!parsed) {
    unparsedExports.push(name);
    continue;
  }
  const { base, size, style } = parsed;
  if (!byBase.has(base)) byBase.set(base, { sized: new Map(), resizable: new Set() });
  const rec = byBase.get(base);
  if (size === null) rec.resizable.add(style);
  else {
    if (!rec.sized.has(style)) rec.sized.set(style, new Set());
    rec.sized.get(style).add(size);
  }
}
const baseByNorm = new Map();
for (const base of byBase.keys()) {
  const k = norm(base);
  if (!baseByNorm.has(k)) baseByNorm.set(k, base);
}
log(`  ${byBase.size} export bases, ${unparsedExports.length} unparsable`);

log('Listing assets/ …');
const rootTree = await getJson(`${API}/git/trees/${COMMIT}`);
const assetsEntry = rootTree.tree.find((t) => t.path === 'assets');
const assetsTree = await getJson(`${API}/git/trees/${assetsEntry.sha}`);
if (assetsTree.truncated) throw new Error('assets tree was truncated — cannot trust the family list');
let familyDirs = assetsTree.tree.filter((t) => t.type === 'tree').map((t) => t.path).sort();
log(`  ${familyDirs.length} icon families`);
if (LIMIT) {
  familyDirs = familyDirs.slice(0, LIMIT);
  log(`  --limit=${LIMIT}: partial run, nothing will be written`);
}

// Product/launch icons and file-type icons are excluded on purpose: the Fluent 2
// site separates them from the MIT system set and Microsoft brand/trademark
// terms apply to them. They live in other packages upstream, so this is a
// belt-and-braces filter — it should match nothing, and it reports if it does.
const EXCLUDE_RE = /^(office|word|excel|powerpoint|onenote|outlook|onedrive|sharepoint|teams|skype|yammer|visio|windows|copilot|bing|xbox|azure|github)\b|file type|filetype|product launch|app launcher icon/i;

log(`Fetching per-family metadata.json (concurrency ${CONCURRENCY}) …`);
const rawFamilies = await pool(
  familyDirs,
  async (dir) => {
    const url = `${RAW}/${COMMIT}/assets/${encodeURIComponent(dir).replace(/%2F/g, '/')}/metadata.json`;
    const text = await getText(url);
    if (text === null) return { dir, missing: true };
    try {
      return { dir, meta: JSON.parse(text) };
    } catch {
      return { dir, unparsable: true };
    }
  },
  CONCURRENCY,
  (done, total) => log(`  ${done}/${total}`),
);

// ---------------------------------------------------------------------------
// Cross-validate. A family is only kept when its base resolves to real exports.

const families = [];
const problems = { noMetadata: [], unparsable: [], noExportBase: [], noVerifiedVariant: [], excluded: [] };
const metaKeys = new Map();
const usedBases = new Set();
const excludedBases = new Set();
let sizesDroppedAsUnshipped = 0;
let stylesAddedFromExports = 0;
let rtlPairs = 0;

/** Collect every export base a policy-excluded design owns, so promoting the
 *  no-design-record bases below cannot quietly bring it back. */
function markExcludedBases(name) {
  const n = norm(name);
  for (const base of byBase.keys()) {
    const b = norm(base);
    if (b === n || b.startsWith(n)) excludedBases.add(base);
  }
}

for (const row of rawFamilies) {
  if (row.missing) {
    problems.noMetadata.push(row.dir);
    continue;
  }
  if (row.unparsable) {
    problems.unparsable.push(row.dir);
    continue;
  }
  const m = row.meta || {};
  const designName = typeof m.name === 'string' && m.name.trim() ? m.name.trim() : row.dir;
  for (const k of Object.keys(m)) metaKeys.set(k, (metaKeys.get(k) || 0) + 1);

  if (EXCLUDE_RE.test(designName) || EXCLUDE_RE.test(row.dir)) {
    problems.excluded.push(designName);
    markExcludedBases(designName);
    continue;
  }

  // Some designs ship as a left-to-right/right-to-left pair instead of a single
  // export base — "Task List" is TaskListLtr + TaskListRtl, and neither name
  // appears in the design record. Claim both, and keep the RTL twin on the entry.
  let base = baseByNorm.get(norm(designName)) || baseByNorm.get(norm(row.dir));
  let rtlBase = null;
  if (!base) {
    const ltr = baseByNorm.get(norm(designName) + 'ltr') || baseByNorm.get(norm(row.dir) + 'ltr');
    const rtl = baseByNorm.get(norm(designName) + 'rtl') || baseByNorm.get(norm(row.dir) + 'rtl');
    if (ltr) {
      base = ltr;
      rtlBase = rtl || null;
    }
  }
  if (!base) {
    problems.noExportBase.push(designName);
    continue;
  }
  const rec = byBase.get(base);

  // Only sizes that BOTH the design record and the export manifest agree on are
  // kept, and a style the exports ship but the design record forgot is added
  // back. The export manifest wins either way: it is what you can import.
  const declaredSizes = new Set((Array.isArray(m.size) ? m.size : []).map(Number));
  const variants = {};
  for (const style of STYLES) {
    const shipped = rec.sized.get(style);
    if (!shipped || shipped.size === 0) continue;
    const sizes = [...shipped].sort((a, b) => a - b);
    variants[style] = sizes;
    if (declaredSizes.size) {
      for (const s of declaredSizes) if (!shipped.has(s)) sizesDroppedAsUnshipped++;
    }
    if (Array.isArray(m.style) && !m.style.includes(style)) stylesAddedFromExports++;
  }
  const resizable = STYLES.filter((s) => rec.resizable.has(s));

  if (Object.keys(variants).length === 0 && resizable.length === 0) {
    problems.noVerifiedVariant.push(designName);
    continue;
  }
  usedBases.add(base);
  if (rtlBase) rtlPairs++;

  const entry = { name: designName, base };
  entry.variants = variants;
  if (resizable.length) entry.resizable = resizable;
  if (rtlBase) entry.rtlBase = rtlBase;
  if (typeof m.description === 'string' && m.description.trim()) entry.description = clean(m.description);
  const metaphor = (Array.isArray(m.metaphor) ? m.metaphor : [])
    .map((x) => clean(x).toLowerCase())
    .filter(Boolean);
  if (metaphor.length) entry.metaphor = [...new Set(metaphor)];
  // RTL: "mirror" flips in right-to-left locales, "unique" needs its own asset.
  if (typeof m.directionType === 'string') entry.rtl = m.directionType;
  families.push(entry);
}

families.sort((a, b) => a.name.localeCompare(b.name));

// 319 icon families ship exports but no assets/<name>/metadata.json upstream —
// Agents, Add Starburst and friends are real, importable icons with no design
// record at all (the icons repo ships scripts/noMetadata.js to track exactly
// this). Dropping them would make the tool answer "no such icon" about icons
// that exist, so they are promoted with a display name split out of the export
// base and flagged: searchable by name, but with no description or metaphors.
let derivedFromExports = 0;
const splitBase = (b) =>
  b
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim();

for (const [base, rec] of byBase) {
  if (usedBases.has(base) || excludedBases.has(base)) continue;
  const display = splitBase(base);
  if (EXCLUDE_RE.test(display)) {
    problems.excluded.push(display);
    continue;
  }
  const variants = {};
  for (const style of STYLES) {
    const shipped = rec.sized.get(style);
    if (shipped && shipped.size) variants[style] = [...shipped].sort((a, b) => a - b);
  }
  const resizable = STYLES.filter((s) => rec.resizable.has(s));
  if (!Object.keys(variants).length && !resizable.length) continue;
  const e = { name: display, base, variants };
  if (resizable.length) e.resizable = resizable;
  e.noDesignRecord = true;
  families.push(e);
  derivedFromExports++;
}
families.sort((a, b) => a.name.localeCompare(b.name));

// Count exactly how many real export names this dataset can reconstruct, and
// prove every one of them exists upstream.
let verifiedExportNames = 0;
let mismatches = 0;
const exportSet = new Set(exportNames);
for (const f of families) {
  for (const [style, sizes] of Object.entries(f.variants || {})) {
    for (const s of sizes) {
      verifiedExportNames++;
      if (!exportSet.has(`${f.base}${s}${style}`)) mismatches++;
    }
  }
  for (const style of f.resizable || []) {
    verifiedExportNames++;
    if (!exportSet.has(`${f.base}${style}`)) mismatches++;
  }
  if (f.rtlBase && !byBase.has(f.rtlBase)) mismatches++;
}
if (mismatches > 0) throw new Error(`${mismatches} reconstructed names are not in the export manifest — refusing to write`);

const withMetaphor = families.filter((f) => f.metaphor?.length).length;
const withDescription = families.filter((f) => f.description).length;
const withRtl = families.filter((f) => f.rtl).length;

// ---------------------------------------------------------------------------

const data = {
  meta: {
    dataset: 'fluent-icons',
    generated: new Date().toISOString().slice(0, 10),
    verifiedOn: new Date().toISOString().slice(0, 7),
    scope:
      'Every Fluent 2 system icon family shipped by @fluentui/react-icons: design name, verified export base, the sizes and styles that actually exist, description, search metaphors, and RTL behaviour. Names, sizes, styles, descriptions and metaphors only — no SVG artwork.',
    fields: {
      name: 'Display/design name, e.g. "Add Circle".',
      base: 'Verified export base. Append a size and a style to get a real export: base + size + style, e.g. AddCircle + 24 + Regular.',
      variants: 'style -> the sizes that style actually ships. A size missing here does not exist, whatever the design record says.',
      resizable: 'Styles that also ship WITHOUT a size in the name (AccessTimeRegular). Those scale with fontSize / height / width.',
      rtlBase: 'Present when the design ships as a left-to-right/right-to-left pair; this is the right-to-left export base.',
      rtl: 'directionType from the design record: "mirror" flips in RTL locales, "unique" has its own RTL asset.',
      noDesignRecord:
        'True when the icon ships exports but has no assets/<name>/metadata.json upstream. The name is split out of the export base, and there is no description or metaphor list.',
    },
    source: {
      repo: `https://github.com/${REPO}`,
      ref: REF,
      commit: COMMIT,
      commitDate: COMMIT_DATE,
      manifests: [
        'assets/<Icon Name>/metadata.json — design record (name, size[], style[], description, metaphor[], directionType)',
        'packages/react-icons/metadata.json — authoritative export list, one key per real React export',
        'packages/react-icons/package.json — package version',
      ],
    },
    package: {
      name: '@fluentui/react-icons',
      version: pkg?.version ?? null,
      versionSource: `packages/react-icons/package.json at ${COMMIT.slice(0, 12)}`,
      versionCaveat:
        'Read from the source repo, not from the npm registry. Treat it as the version the icon set was built from, not proof of what is published on npm.',
      import: "import { AddCircle24Regular } from '@fluentui/react-icons';",
    },
    license: {
      spdx: 'MIT',
      holder: 'Copyright (c) 2020 Microsoft Corporation',
      url: `https://github.com/${REPO}/blob/main/LICENSE`,
      embeds: 'icon names, sizes, styles, descriptions and metaphors only — no SVG artwork',
      excluded:
        'Product/launch icons and file-type icons are deliberately excluded: the Fluent 2 site separates them from the MIT system icon set and Microsoft brand/trademark terms apply to them.',
    },
    validSizes: VALID_SIZES,
    styles: STYLES,
    counts: {
      families: families.length,
      familiesWithDesignRecord: families.length - derivedFromExports,
      familiesDerivedFromExportsOnly: derivedFromExports,
      exportsInManifest: exportNames.length,
      verifiedExportNames,
      familiesWithMetaphor: withMetaphor,
      familiesWithDescription: withDescription,
      familiesWithRtl: withRtl,
      ltrRtlPairs: rtlPairs,
    },
    validation: {
      method:
        'Every name in this file is a key that exists in packages/react-icons/metadata.json at the pinned commit. Design names are joined to export bases on a lowercase-alphanumeric key (so "Card UI" resolves to CardUi and "LTR" to Ltr) rather than derived, and every base+size+style combination is re-checked against the export manifest before it is written. Never derive a name at query time.',
      reconstructedNamesChecked: verifiedExportNames,
      reconstructedNamesNotInManifest: mismatches,
      familiesWithNoExportBase: problems.noExportBase.length,
      familiesWithNoVerifiedVariant: problems.noVerifiedVariant.length,
      familiesWithoutMetadataJson: problems.noMetadata.length,
      familiesPromotedWithoutDesignRecord: derivedFromExports,
      excludedByBrandPolicy: problems.excluded.length,
      designSizesDroppedAsUnshipped: sizesDroppedAsUnshipped,
      stylesRecoveredFromExports: stylesAddedFromExports,
      unparsableExportNames: unparsedExports.length,
      doubleEncodedStringsRepaired: mojibakeRepairs,
    },
    unverified: [
      `@fluentui/react-icons version ${pkg?.version ?? '?'} is read from the source repo; the npm registry was not reachable from the build host, so the published version is not independently confirmed.`,
      'There is no upstream rename/deprecation manifest for icons. The repo-root migrations.json is an Nx workspace migration file, not an icon map, so renamed icons are repaired structurally (valid size/style + nearest verified base) rather than from a table.',
      'Sizes come from the export manifest, which is what you can import. A design record occasionally lists a size the package does not ship; those are dropped, not reported as available.',
    ],
  },

  // Attached to every search result, because the naming rule is the reason
  // metaphor search is needed at all.
  guidance: {
    naming:
      'Fluent system icons are literal metaphors and are named for the shape or object they represent, not the functionality they provide — "Shield, not security". Search by the object you want to see, not by the feature. (fluent2.microsoft.design/iconography)',
    styles: {
      Regular:
        'The default. Use for wayfinding and for actions that are available but not active.',
      Filled:
        'Use for selected states, and for small moments that need extra visual weight.',
      Light: 'Limited legacy coverage. Do not assume it exists for a given icon.',
      Color:
        'Avoid. The @fluentui/react-icons README warns that Color variants are non-compliant with Windows High Contrast Mode, collide on SVG gradient ids when rendered more than once, and fail contrast in dark themes. Prefer Regular/Filled.',
    },
    sizes:
      'Icons exist at 12, 16, 20, 24, 28, 32 and 48 px only, and not every icon exists at every size. 12px icons are informational, never interactive. Exports without a size in the name are resizable: they scale with fontSize/height/width instead.',
    bundleIcon:
      "const Save = bundleIcon(SaveFilled, SaveRegular); — bundleIcon takes the Filled icon first and the Regular icon second, and swaps them for hover/selected states.",
    accessibility:
      'A decorative icon inside an already-labelled control takes aria-hidden="true". A standalone icon that carries meaning takes an aria-label and role="img".',
    rtl:
      'directionType "mirror" means the icon flips in right-to-left locales; "unique" means a separate RTL asset exists. Icons without it do not flip.',
    docs: [
      'https://fluent2.microsoft.design/iconography',
      `https://github.com/${REPO}`,
      'https://react.fluentui.dev',
    ],
  },

  families,
};

/** Pretty top level, one line per family — readable diffs without the bloat. */
function serialize(d) {
  const { families: fam, ...rest } = d;
  const head = JSON.stringify(rest, null, 2);
  const body = (arr) => (arr.length ? '\n    ' + arr.map((x) => JSON.stringify(x)).join(',\n    ') + '\n  ' : '');
  return head.slice(0, head.lastIndexOf('\n}')) + ',\n  "families": [' + body(fam) + ']\n}\n';
}

log('');
log(`families kept        : ${families.length}`);
log(`  with metaphor      : ${withMetaphor}`);
log(`  with description   : ${withDescription}`);
log(`  with rtl direction : ${withRtl}`);
log(`  ltr/rtl pairs      : ${rtlPairs}`);
log(`derived from exports : ${derivedFromExports} (real exports with no upstream design record)`);
log(`verified export names: ${verifiedExportNames} (of ${exportNames.length} in the manifest)`);
log(`no export base       : ${problems.noExportBase.length}${problems.noExportBase.length ? ' -> ' + problems.noExportBase.slice(0, 20).join(', ') : ''}`);
log(`no verified variant  : ${problems.noVerifiedVariant.length}${problems.noVerifiedVariant.length ? ' -> ' + problems.noVerifiedVariant.slice(0, 20).join(', ') : ''}`);
log(`no metadata.json     : ${problems.noMetadata.length}${problems.noMetadata.length ? ' -> ' + problems.noMetadata.slice(0, 20).join(', ') : ''}`);
log(`excluded by policy   : ${problems.excluded.length}${problems.excluded.length ? ' -> ' + problems.excluded.slice(0, 20).join(', ') : ''}`);
log(`design metadata keys : ${[...metaKeys.entries()].map(([k, v]) => `${k}=${v}`).join(', ')}`);

if (DRY) {
  log('\ndry run — nothing written');
  process.exit(0);
}

if (families.length < 2500) {
  console.error(`only ${families.length} families resolved — refusing to overwrite a working dataset`);
  process.exit(1);
}

const text = serialize(data);
if (existsSync(OUT)) {
  const before = readFileSync(OUT, 'utf8');
  const strip = (s) => s.replace(/"generated": "[^"]*"/, '').replace(/"verifiedOn": "[^"]*"/, '');
  if (strip(before) === strip(text)) log('output is unchanged (idempotent re-run)');
}
writeFileSync(OUT, text, 'utf8');
log(`\nwrote ${OUT.pathname.replace(/^\//, '')} — ${(text.length / 1024).toFixed(0)} KB`);
