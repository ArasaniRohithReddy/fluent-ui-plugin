/**
 * build-v8-data.mjs — deterministically assemble `mcp/data/fluent-v8.json`
 *
 * Fluent 1 = Fluent UI React v8 (`@fluentui/react`). The MCP server needs a
 * grounded, lookup-friendly dataset for it. This script builds that dataset
 * from the verified research extracts rather than from hand-maintained JSON,
 * so the whole file can be regenerated and diffed when the research is
 * refreshed.
 *
 * Rules this script enforces (they matter — the output becomes generated code):
 *  - Never invent a value. Anything the research did not verify is omitted or
 *    `null`, and every input's `unverified` notes are carried through to the
 *    top-level `unverified` array with their source file attached.
 *  - Confidence ratings on v8->v9 token mappings are passed through untouched.
 *  - `styling.imports[].doNotEmit` and `icons.doNotEmit` survive verbatim: a
 *    code generator reads them to avoid emitting non-exported symbols.
 *  - One row per component. Slash/comma-joined groups in the research tables
 *    ("HoverCard, ExpandingCard, PlainCard") are exploded into one row each so
 *    an exact-name lookup always hits.
 *
 * Input precedence: for every research topic we prefer a structured `*.json`
 * extract over the matching `*.md` report, because the JSON was produced by the
 * researcher itself and needs no lossy re-parsing. Multi-part extracts are
 * supported (`components.json` + `components.part2.json` + ...) — they are read
 * in filename order and deep-merged, since the researcher emits large topics as
 * "Part N of M".
 *
 * The output carries NO timestamp: re-running with identical inputs must
 * produce byte-identical output.
 *
 * Usage:
 *   node scripts/build-v8-data.mjs [--research <dir>] [--out <file>] [--check] [--json]
 *     --research  research folder (default: $FLUENT_V8_RESEARCH, then the
 *                 known session-state location)
 *     --check     do not write; fail if the on-disk file differs from the build
 *     --json      print the run summary as JSON
 *
 *   node scripts/build-v8-data.mjs --refresh-upstream [--ref master] [--out <file>]
 *     Recompute ONLY the v8/v9 name classes (collisions, renames, casing traps,
 *     behaviour traps) and the quoted package versions, against the live
 *     API-Extractor reports in microsoft/fluentui. Needs network, does NOT need
 *     the research folder. Run this whenever upstream ships new components.
 */

import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname, resolve, basename } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '..');
const DEFAULT_OUT = join(REPO_ROOT, 'mcp', 'data', 'fluent-v8.json');
const DEFAULT_MIGRATION_OUT = join(REPO_ROOT, 'mcp', 'data', 'migration.json');

/** Candidate research folders, first existing wins. */
const RESEARCH_CANDIDATES = [
  process.env.FLUENT_V8_RESEARCH,
  join(REPO_ROOT, 'research', 'v8'),
  join(REPO_ROOT, '.research', 'v8-research'),
  join(
    process.env.USERPROFILE || process.env.HOME || '',
    '.copilot',
    'session-state',
    'bd2cc0b0-5cec-4497-a23c-fe37998d821b',
    'files',
    'v8-research'
  ),
].filter(Boolean);

/**
 * Topic -> the JSON basenames we accept, and the markdown fallback.
 * `json` is a prefix match: `components.json`, `components.part2.json`,
 * `components-2.json` all belong to the `components` topic.
 */
const TOPICS = {
  theming: { json: 'theming', md: 'theming.md' },
  styling: { json: 'styling', md: 'styling.md' },
  components: { json: 'components', md: 'components.md' },
  migration: { json: ['migration', 'v8-to-v9-map', 'v8tov9'], md: 'v8-to-v9-map.md' },
  history: { json: ['history', 'history-support', 'support'], md: 'history-support.md' },
  platforms: { json: ['platforms', 'platform'], md: 'platforms.md' },
  designA11y: { json: ['design-a11y', 'design-accessibility', 'designA11y'], md: 'design-a11y.md' },
};

/* ------------------------------------------------------------------ *
 * tiny CLI + fs helpers (zero deps, Node 18+ built-ins only)
 * ------------------------------------------------------------------ */

export function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const eq = a.indexOf('=');
      if (eq > -1) out[a.slice(2, eq)] = a.slice(eq + 1);
      else if (argv[i + 1] && !argv[i + 1].startsWith('--')) out[a.slice(2)] = argv[++i];
      else out[a.slice(2)] = true;
    } else out._.push(a);
  }
  return out;
}

const isMain = (url) => process.argv[1] && url === pathToFileURL(process.argv[1]).href;
const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

function readJsonIfExists(file) {
  if (!existsSync(file)) return null;
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch (err) {
    throw new Error(`${basename(file)} is not valid JSON: ${err.message}`);
  }
}

/* ------------------------------------------------------------------ *
 * merging
 * ------------------------------------------------------------------ */

/**
 * Deep merge for multi-part research extracts. Arrays concatenate and then
 * de-duplicate on their serialized form — Part 2 of a report frequently
 * repeats a handful of rows from Part 1, and a duplicated collision row would
 * otherwise show up twice in the shipped dataset.
 */
export function deepMerge(a, b) {
  if (b === undefined) return a;
  if (a === undefined) return b;
  if (Array.isArray(a) && Array.isArray(b)) {
    const seen = new Set();
    const out = [];
    for (const v of [...a, ...b]) {
      const k = JSON.stringify(v);
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(v);
    }
    return out;
  }
  if (isPlainObject(a) && isPlainObject(b)) {
    const out = { ...a };
    for (const [k, v] of Object.entries(b)) out[k] = k in out ? deepMerge(out[k], v) : v;
    return out;
  }
  return b; // later part wins for scalars
}

const isPlainObject = (v) => !!v && typeof v === 'object' && !Array.isArray(v);

/** Set `target[key]` only when it is currently absent / null / empty. */
function fillMissing(target, source) {
  for (const [k, v] of Object.entries(source)) {
    if (v === undefined || v === null) continue;
    const cur = target[k];
    const empty =
      cur === undefined ||
      cur === null ||
      (Array.isArray(cur) && cur.length === 0) ||
      (isPlainObject(cur) && Object.keys(cur).length === 0);
    if (empty) target[k] = v;
  }
  return target;
}

const sortKeys = (obj) =>
  Object.fromEntries(Object.entries(obj).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));

const LIB_IMPORT_RE = /from '@fluentui\/react\/lib\/([^']+)'/;

/**
 * Force every catalog entry onto one shape. Entries arrive from two very
 * different producers — the researcher's JSON (rich: keyProps/sample/a11y, and
 * a `v9: {status,name,package}` verdict) and the markdown tables (family,
 * /lib/ entry, interfaces, and a `v9` migration row) — and a lookup dataset is
 * useless if half the records answer a different set of questions.
 */
export function normalizeComponent(name, e) {
  const libImport =
    e.libImport ??
    (e.libEntry
      ? `import { ${name} } from '@fluentui/react/lib/${e.libEntry}';`
      : `import { ${name} } from '@fluentui/react';`);
  const deep = LIB_IMPORT_RE.exec(libImport);
  const v9 = { ...(e.v9 ?? {}) };
  const fromMap = e._v9FromMap ?? {};
  const out = {
    name,
    family: e.family ?? null,
    category: e.category ?? null,
    libEntry: e.libEntry ?? (deep ? deep[1] : null),
    libImport,
    libImportIsDeepPath: Boolean(deep),
    barrelImport: e.barrelImport ?? `import { ${name} } from '@fluentui/react';`,
    relatedExports: e.relatedExports ?? [],
    alternateLibEntries: e.alternateLibEntries ?? [],
    interfaces: e.interfaces ?? null,
    keyProps: e.keyProps ?? [],
    sample: e.sample ?? null,
    a11y: e.a11y ?? null,
    deprecated: e.deprecated ?? { is: false, replacedBy: null },
    deprecatedExports: e.deprecatedExports ?? [],
    v9: {
      status: v9.status ?? null,
      name: v9.name ?? null,
      package: v9.package ?? null,
      equivalent: v9.equivalent ?? fromMap.equivalent ?? null,
      exports: v9.exports ?? fromMap.exports ?? [],
      difficulty: v9.difficulty ?? fromMap.difficulty ?? null,
      keyPropMapping: v9.keyPropMapping ?? fromMap.keyPropMapping ?? null,
      gotchas: v9.gotchas ?? fromMap.gotchas ?? null,
    },
    sources: e.sources ?? (e.source ? [e.source] : []),
  };
  return out;
}

/* ------------------------------------------------------------------ *
 * markdown helpers
 * ------------------------------------------------------------------ */

/**
 * Split one markdown table row into cells. Backtick-aware and escape-aware:
 * the research tables contain `'top' \| 'right'` inside code spans, and a naive
 * `split('|')` shreds those rows.
 */
export function splitRow(line) {
  const cells = [];
  let cur = '';
  let inCode = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '\\' && line[i + 1] === '|') {
      cur += '|';
      i++;
      continue;
    }
    if (ch === '`') inCode = !inCode;
    if (ch === '|' && !inCode) {
      cells.push(cur);
      cur = '';
      continue;
    }
    cur += ch;
  }
  cells.push(cur);
  // a well-formed row starts and ends with `|`, producing empty edge cells
  if (cells.length && cells[0].trim() === '') cells.shift();
  if (cells.length && cells[cells.length - 1].trim() === '') cells.pop();
  return cells.map((c) => c.trim());
}

const isTableRow = (l) => typeof l === 'string' && /^\s*\|.*\|\s*$/.test(l);
const isDelimiterRow = (l) => typeof l === 'string' && /^\s*\|[\s:|-]+\|\s*$/.test(l) && l.includes('-');

/** Every table in a markdown document, tagged with its nearest preceding heading. */
export function parseMarkdownTables(md) {
  const lines = md.split(/\r?\n/);
  const tables = [];
  let heading = null;
  for (let i = 0; i < lines.length; i++) {
    const h = /^(#{1,6})\s+(.*)$/.exec(lines[i]);
    if (h) {
      heading = h[2].trim();
      continue;
    }
    if (!isTableRow(lines[i]) || !isDelimiterRow(lines[i + 1])) continue;
    const headers = splitRow(lines[i]).map(cleanCell);
    const rows = [];
    let j = i + 2;
    for (; j < lines.length && isTableRow(lines[j]); j++) rows.push(splitRow(lines[j]));
    tables.push({ heading, headers, rows });
    i = j - 1;
  }
  return tables;
}

/** Strip markdown emphasis / code fences / status emoji from a table cell. */
export function cleanCell(s) {
  return String(s ?? '')
    .replace(/\*\*/g, '')
    .replace(/`/g, '')
    .replace(/[\u26A0\uFE0F\u{1F534}\u{1F7E1}\u{1F7E2}]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Ordered list of the `code spans` in a cell. */
const codeTokens = (s) => [...String(s ?? '').matchAll(/`([^`]+)`/g)].map((m) => m[1].trim());

const IDENT = /^[A-Za-z_$][A-Za-z0-9_$]*$/;
const isIdent = (s) => IDENT.test(s);
const isComponentName = (s) => IDENT.test(s) && /^[A-Z]/.test(s);

const headerIndex = (headers, ...names) => {
  for (const n of names) {
    const i = headers.findIndex((h) => h.toLowerCase() === n.toLowerCase());
    if (i > -1) return i;
  }
  for (const n of names) {
    const i = headers.findIndex((h) => h.toLowerCase().includes(n.toLowerCase()));
    if (i > -1) return i;
  }
  return -1;
};

const findTable = (tables, pred) => tables.find(pred) || null;
const nz = (s) => {
  const v = cleanCell(s);
  return v === '' || v === '—' || v === '-' || v === 'N/A' ? null : v;
};

/* ------------------------------------------------------------------ *
 * research loading
 * ------------------------------------------------------------------ */

export function resolveResearchDir(explicit) {
  const candidates = explicit ? [explicit] : RESEARCH_CANDIDATES;
  for (const c of candidates) {
    if (c && existsSync(c) && statSync(c).isDirectory()) return c;
  }
  throw new Error(
    `research folder not found. Tried:\n  ${candidates.join('\n  ')}\n` +
      'Pass --research <dir> or set FLUENT_V8_RESEARCH.'
  );
}

/**
 * Load one topic. Returns `{ json, md, files }`. `json` is the deep-merge of
 * every matching `*.json` (sorted by filename, so `part1` lands before
 * `part2`); `md` is the raw markdown fallback text, loaded whether or not JSON
 * exists because some sections only ever appeared in prose.
 */
export function loadTopic(dir, topic, sources) {
  const prefixes = Array.isArray(topic.json) ? topic.json : [topic.json];
  const all = readdirSync(dir).sort();
  const jsonFiles = all.filter(
    (f) => f.endsWith('.json') && prefixes.some((p) => f === `${p}.json` || f.startsWith(`${p}.`) || f.startsWith(`${p}-`))
  );

  let json = null;
  for (const f of jsonFiles) {
    const abs = join(dir, f);
    const parsed = readJsonIfExists(abs);
    if (!parsed) continue;
    json = json === null ? parsed : deepMerge(json, parsed);
    recordSource(sources, abs);
  }

  let md = null;
  const mdCandidates = [topic.md, ...prefixes.map((p) => `${p}.md`)];
  for (const name of mdCandidates) {
    const abs = join(dir, name);
    if (!existsSync(abs)) continue;
    md = readFileSync(abs, 'utf8');
    recordSource(sources, abs);
    break;
  }

  return { json, md, files: jsonFiles };
}

function recordSource(sources, abs) {
  const buf = readFileSync(abs);
  const rec = { file: basename(abs), bytes: buf.length, sha256: sha256(buf) };
  if (!sources.some((s) => s.file === rec.file)) sources.push(rec);
}

/* ------------------------------------------------------------------ *
 * extractors — components.md
 * ------------------------------------------------------------------ */

/**
 * The catalog tables look like:
 *   | Component | `/lib/` entry | Interfaces |
 * The first column lists every export of a family (`Layer`, `LayerBase`,
 * `LayerHost`, `registerLayer`, ...). We key the entry on the FIRST export
 * (the family's authorable component) and keep the rest in `relatedExports`,
 * then publish an `exportIndex` so a lookup on any listed export still
 * resolves. Exploding one entry per export would fabricate component records
 * for plain functions like `registerLayer`.
 */
export function extractComponentCatalog(md) {
  if (!md) return {};
  const out = {};
  for (const t of parseMarkdownTables(md)) {
    const ci = headerIndex(t.headers, 'Component');
    const li = headerIndex(t.headers, '/lib/ entry', 'lib entry', 'entry');
    const ii = headerIndex(t.headers, 'Interfaces');
    if (ci !== 0 || li < 0 || ii < 0) continue;

    const category = t.heading ? t.heading.replace(/^\d+\.\s*/, '').trim() : null;
    for (const row of t.rows) {
      const raw = row[ci] ?? '';
      const exports = codeTokens(raw).filter(isIdent);
      if (!exports.length) continue;
      const name = exports[0];

      // `⚠️dep` immediately after a code span marks that export deprecated in v8
      const deprecatedExports = [...raw.matchAll(/`([^`]+)`\s*(?:\u26A0\uFE0F?)?dep\b/g)]
        .map((m) => m[1].trim())
        .filter(isIdent);

      const libEntries = codeTokens(row[li] ?? '').filter(isIdent);
      const libEntry = libEntries[0] ?? null;
      const interfaces = codeTokens(row[ii] ?? '').filter(isIdent);

      out[name] = {
        family: name,
        category,
        libEntry,
        libImport: libEntry
          ? `import { ${name} } from '@fluentui/react/lib/${libEntry}';`
          : `import { ${name} } from '@fluentui/react';`,
        libImportIsDeepPath: Boolean(libEntry),
        barrelImport: `import { ${name} } from '@fluentui/react';`,
        relatedExports: exports.slice(1),
        alternateLibEntries: libEntries.slice(1),
        interfaces: {
          props: interfaces.find((i) => i === `I${name}Props`) ?? interfaces.find((i) => /Props$/.test(i) && !/StyleProps$/.test(i)) ?? null,
          styles: interfaces.find((i) => /(?<!Style)Styles$/.test(i)) ?? null,
          styleProps: interfaces.find((i) => /StyleProps$/.test(i)) ?? null,
          all: interfaces,
        },
        keyProps: [],
        sample: null,
        a11y: null,
        deprecated: { is: deprecatedExports.includes(name), replacedBy: null },
        deprecatedExports,
        v9: null,
        source: 'components.md',
      };
    }
  }
  return out;
}

/**
 * "No v8 component is deprecated as a whole except `Fabric`, `Button`, and
 * `Grid`." — parsing that verified sentence is safer than inferring
 * whole-component deprecation from the prop-level deprecation index.
 */
export function extractWholeComponentDeprecations(md) {
  if (!md) return [];
  const m = /No v8 component is deprecated as a whole except ([^.]*)\./i.exec(md);
  return m ? codeTokens(m[1]).filter(isComponentName) : [];
}

/** The v8-internal `@deprecated` index (props and symbols, not whole components). */
export function extractDeprecationIndex(md) {
  if (!md) return [];
  const t = findTable(
    parseMarkdownTables(md),
    (x) => headerIndex(x.headers, 'Deprecated') === 0 && headerIndex(x.headers, 'Replacement') > 0
  );
  if (!t) return [];
  const di = headerIndex(t.headers, 'Deprecated');
  const ri = headerIndex(t.headers, 'Replacement');
  const si = headerIndex(t.headers, 'Source');
  return t.rows
    .map((r) => ({
      deprecated: cleanCell(r[di]),
      symbols: codeTokens(r[di] ?? ''),
      replacement: nz(r[ri]),
      replacementSymbols: codeTokens(r[ri] ?? ''),
      source: si > -1 ? nz(r[si]) : null,
    }))
    .filter((r) => r.deprecated);
}

/**
 * Tier-1 v8-only components. The research groups related exports on one row
 * ("`ScrollablePane` + `Sticky`", "`HoverCard`, `ExpandingCard`, `PlainCard`");
 * we explode them so every name is individually addressable, keeping the shared
 * reason and a `groupedWith` back-reference.
 */
export function extractTier1(md) {
  if (!md) return [];
  const t = findTable(parseMarkdownTables(md), (x) => {
    const a = headerIndex(x.headers, 'v8 component');
    const b = headerIndex(x.headers, 'Why it blocks migration', 'Why it blocks');
    return a === 0 && b > 0;
  });
  if (!t) return [];
  const li = headerIndex(t.headers, '/lib/ entry', 'lib entry', 'entry');
  const wi = headerIndex(t.headers, 'Why it blocks migration', 'Why it blocks');

  const out = [];
  for (const row of t.rows) {
    const names = codeTokens(row[0] ?? '').filter(isIdent);
    if (!names.length) continue;
    const libEntries = li > -1 ? codeTokens(row[li] ?? '').filter(isIdent) : [];
    const reason = wi > -1 ? nz(row[wi]) : null;
    names.forEach((name, idx) => {
      out.push({
        name,
        role: idx === 0 ? 'primary' : 'member',
        primary: names[0],
        groupedWith: names.filter((n) => n !== name),
        // when the row lists one lib entry per name, keep them aligned;
        // otherwise everything shares the family's single entry
        libEntry: libEntries.length === names.length ? libEntries[idx] : libEntries[0] ?? null,
        reason,
      });
    });
  }
  return out;
}

/** The report's own headline count, used to flag parser drift rather than hide it. */
export function extractTier1ClaimedCount(md) {
  if (!md) return null;
  const m = /Total v8-only surface:\s*\*{0,2}(\d+)\s*Tier-1/i.exec(md);
  return m ? Number(m[1]) : null;
}

/** The 22-row v8/v9 name-collision hazard table (markdown fallback). */
export function extractCollisions(md) {
  if (!md) return [];
  const t = findTable(parseMarkdownTables(md), (x) => {
    const n = headerIndex(x.headers, 'Name');
    const h = headerIndex(x.headers, 'Hazard');
    return n === 0 && h > 0;
  });
  if (!t) return [];
  const v8i = headerIndex(t.headers, 'v8');
  const v9i = headerIndex(t.headers, 'v9');
  const hi = headerIndex(t.headers, 'Hazard');
  return t.rows
    .map((r) => ({
      name: cleanCell(r[0]),
      v8: v8i > -1 ? nz(r[v8i]) : null,
      v9: v9i > -1 ? nz(r[v9i]) : null,
      hazard: hi > -1 ? nz(r[hi]) : null,
      severity: null,
    }))
    .filter((r) => r.name);
}

/* ------------------------------------------------------------------ *
 * extractors — v8-to-v9-map.md
 * ------------------------------------------------------------------ */

const PSEUDO_ROW = /^([A-Za-z_$][A-Za-z0-9_$]*)\s+(.+)$/; // "Button split", "TextField multiline"

/**
 * The "Import before → after" column is the only place the map report states a
 * verified v8 import path, so it is the authority for both the deep-import
 * entry and — crucially — for which package a row's v8 side actually lives in.
 * `Charts` is `@fluentui/react-charting`, not a `@fluentui/react` export, and
 * without this we would emit a fabricated barrel import for it.
 */
export function parseImportCell(cell) {
  const text = cleanCell(cell);
  if (!text) return { v8Package: null, v8LibEntry: null };
  // "same", and "same (now stable in `@fluentui/react-components`)" — the
  // parenthetical talks about the v9 side, so it must not be read as the v8 pkg
  if (/^same\b/i.test(text)) return { v8Package: '@fluentui/react', v8LibEntry: null };
  const arrow = /→|->/.test(String(cell));
  const before = arrow ? String(cell).split(/→|->/)[0] : String(cell);
  const tokens = codeTokens(before).filter((t) => t.startsWith('@'));
  const pkgPath = tokens[0] ?? null;
  if (!pkgPath) return { v8Package: null, v8LibEntry: null };
  const deep = /^@fluentui\/react\/lib\/(.+)$/.exec(pkgPath);
  if (deep) return { v8Package: '@fluentui/react', v8LibEntry: deep[1] };
  const pkg = /^(@[^/]+\/[^/]+)/.exec(pkgPath)?.[1] ?? pkgPath;
  return { v8Package: pkg, v8LibEntry: null };
}

/**
 * Master v8->v9 mapping table. One output row per v8 export name:
 * `HoverCard / ExpandingCard / PlainCard` becomes three rows, and variant rows
 * like `Button split` keep the export name in `v8` with the qualifier in
 * `variant` so `migrationMap` can still be indexed by exact name.
 */
export function extractMigrationMap(md) {
  if (!md) return [];
  const t = findTable(parseMarkdownTables(md), (x) => {
    const a = headerIndex(x.headers, 'v8 component');
    const b = headerIndex(x.headers, 'v9 equivalent');
    return a === 0 && b > 0;
  });
  if (!t) return [];
  const idx = {
    v9: headerIndex(t.headers, 'v9 equivalent'),
    imports: headerIndex(t.headers, 'Import before'),
    props: headerIndex(t.headers, 'Key prop mapping'),
    gotchas: headerIndex(t.headers, 'Gotchas'),
    diff: headerIndex(t.headers, 'Diff'),
  };
  const DIFFICULTY = { T: 'trivial', M: 'moderate', H: 'hard', B: 'blocked' };

  const out = [];
  for (const row of t.rows) {
    const rawCell = row[0] ?? '';
    const label = cleanCell(rawCell);
    // strip parenthetical sub-component lists before splitting on "/"
    const head = rawCell.replace(/\(\+[^)]*\)/g, '').replace(/\([^)]*\)/g, ' ');
    const pieces = head
      .split('/')
      .map((s) => cleanCell(s))
      .filter(Boolean);

    const diffRaw = idx.diff > -1 ? cleanCell(row[idx.diff]) : '';
    const imp = idx.imports > -1 ? parseImportCell(row[idx.imports]) : { v8Package: null, v8LibEntry: null };
    const shared = {
      v9: idx.v9 > -1 ? nz(row[idx.v9]) : null,
      v9Exports: idx.v9 > -1 ? codeTokens(row[idx.v9] ?? '').filter(isIdent) : [],
      imports: idx.imports > -1 ? nz(row[idx.imports]) : null,
      v8Package: imp.v8Package,
      v8LibEntry: imp.v8LibEntry,
      keyPropMapping: idx.props > -1 ? nz(row[idx.props]) : null,
      gotchas: idx.gotchas > -1 ? nz(row[idx.gotchas]) : null,
      difficulty: DIFFICULTY[diffRaw] ?? (diffRaw ? diffRaw : null),
      sourceRow: label,
    };

    for (const piece of pieces) {
      let name = piece;
      let variant = null;
      if (!isIdent(name)) {
        const m = PSEUDO_ROW.exec(piece);
        if (!m) continue;
        name = m[1];
        variant = m[2];
      }
      if (!isIdent(name)) continue;
      out.push({ v8: name, variant, ...shared });
    }
  }
  return out;
}

/** A.2 — Microsoft's doc status vs the real 9.74.5 export surface. */
export function extractStatusCorrections(md) {
  if (!md) return [];
  const t = findTable(parseMarkdownTables(md), (x) => {
    const a = headerIndex(x.headers, 'v8 component');
    const b = headerIndex(x.headers, 'Doc says');
    return a === 0 && b > 0;
  });
  if (!t) return [];
  const di = headerIndex(t.headers, 'Doc says');
  const ai = headerIndex(t.headers, 'Actual status');
  const wi = headerIndex(t.headers, 'What to do');
  return t.rows
    .map((r) => ({
      component: cleanCell(r[0]),
      docSays: nz(r[di]),
      actual: ai > -1 ? nz(r[ai]) : null,
      // the researcher shouts **STABLE** exactly where the published docs are stale
      stableIn9745: ai > -1 ? /\bSTABLE\b/.test(String(r[ai] ?? '')) : false,
      whatToDo: wi > -1 ? nz(r[wi]) : null,
    }))
    .filter((r) => r.component);
}

/** A.3 — the `@fluentui/react-*-compat` inventory, including the unpublished one. */
export function extractCompatInventory(md) {
  if (!md) return [];
  const t = findTable(parseMarkdownTables(md), (x) => {
    const a = headerIndex(x.headers, 'Package');
    const b = headerIndex(x.headers, 'Published');
    return a === 0 && b > 0;
  });
  if (!t) return [];
  const vi = headerIndex(t.headers, 'Version');
  const pi = headerIndex(t.headers, 'Published');
  const gi = headerIndex(t.headers, 'Provides');
  return t.rows
    .map((r) => {
      const rawPublished = String(r[pi] ?? '');
      const published = rawPublished.includes('\u2705')
        ? true
        : rawPublished.includes('\u274C')
          ? false
          : null; // ⚠️ unverified rows stay null rather than guessing
      const version = vi > -1 ? (codeTokens(r[vi])[0] ?? nz(r[vi])) : null;
      return {
        package: codeTokens(r[0])[0] ?? cleanCell(r[0]),
        version: version === '—' ? null : version,
        published,
        installable: published === false ? false : published === true ? true : null,
        provides: gi > -1 ? nz(r[gi]) : null,
        note: cleanCell(rawPublished).replace(/^[\s]*$/, '') || null,
      };
    })
    .filter((r) => r.package);
}

/** A.4 — the `fluentui-contrib` packages that fill v9 gaps. */
export function extractContribPackages(md) {
  if (!md) return [];
  const m = /###\s*A\.4[^\n]*\n([\s\S]*?)(?:\n---|\n##\s)/.exec(md);
  if (!m) return [];
  return [...new Set(codeTokens(m[1]).filter((t) => /^[a-z0-9@][a-z0-9@/-]*$/.test(t)))];
}

/** A.1 — Microsoft's own verbatim "Deprecated Components" list. */
export function extractMicrosoftDeprecatedList(md) {
  if (!md) return [];
  const m = /###\s*A\.1[^\n]*\n([\s\S]*?)(?:\n###|\n##\s)/.exec(md);
  if (!m) return [];
  const quote = /^>\s*(.+)$/m.exec(m[1]);
  return quote ? codeTokens(quote[1]).filter(isComponentName) : [];
}

/** F — where Microsoft's own migration docs are wrong. */
export function extractErrata(md) {
  if (!md) return [];
  const m = /##\s*F\.\s*Errata[^\n]*\n([\s\S]*?)(?:\n##\s)/.exec(md);
  if (!m) return [];
  const out = [];
  for (const line of m[1].split(/\r?\n/)) {
    const item = /^\s*(\d+)\.\s+(.*)$/.exec(line);
    if (!item) continue;
    const text = item[2].trim();
    const docFile = codeTokens(text)[0] ?? null;
    out.push({
      id: `errata-${item[1].padStart(2, '0')}`,
      doc: docFile && /\.mdx?$/.test(docFile) ? docFile : null,
      claim: text,
      source: 'microsoft/fluentui apps/public-docsite-v9/src/Concepts/Migration/FromV8',
    });
  }
  return out;
}

/** D.6 — what `@fluentui/react-migration-v8-v9` actually ships. */
export function extractShims(md) {
  if (!md) return null;
  const sec = /###\s*D\.6[^\n]*\n([\s\S]*?)(?:\n###|\n##\s)/.exec(md);
  if (!sec) return null;
  const grab = (label) => {
    const m = new RegExp(`\\*\\*${label}[^*]*\\*\\*[:]?\\s*([^\\n]*)`, 'i').exec(sec[1]);
    return m ? codeTokens(m[1]) : [];
  };
  const components = grab('Components');
  const propShims = grab('Prop shims').map((s) => s.split('(')[0].trim());
  const theme = grab('Theme');
  const pkg = /@fluentui\/react-migration-v8-v9@([\d.]+)/.exec(md);
  return {
    package: '@fluentui/react-migration-v8-v9',
    version: pkg ? pkg[1] : null,
    // "`CommandButtonShim` (alias of `ActionButtonShim`)" lists the alias
    // target inline, so the raw token list repeats a name
    components: [...new Set(components)],
    propShims: [...new Set(propShims)],
    themeExports: [...new Set(theme)],
    guidance:
      /"(Our recommendation is to[^"]+)"/.exec(md)?.[1]?.replace(/\*\*/g, '').replace(/\s+/g, ' ') ?? null,
  };
}

/** G — the verified reasons a team should stay on v8 for now. */
export function extractDoNotMigrateYet(md) {
  if (!md) return [];
  const sec = /##\s*G\.\s*When a team should NOT migrate yet[^\n]*\n([\s\S]*?)(?:\n##\s)/.exec(md);
  if (!sec) return [];
  const out = [];
  for (const m of sec[1].matchAll(/^\s*(\d+)\.\s+\*\*([^*]+)\*\*\s*([\s\S]*?)(?=\n\s*\d+\.\s+\*\*|\s*$)/gm)) {
    out.push({
      id: `no-migrate-${m[1].padStart(2, '0')}`,
      headline: cleanCell(m[2]),
      detail: m[3].trim().replace(/\s+/g, ' ').replace(/\*\*/g, '') || null,
    });
  }
  return out;
}

/** D.1–D.4 — the officially supported v8/v9 side-by-side story. */
export function extractCoexistence(md) {
  if (!md) return null;
  const topology = /###\s*D\.1[^\n]*\n[\s\S]*?```tsx\n([\s\S]*?)```/.exec(md);
  const layerHostId = /\*\*`([a-z-]+layer-host)`\*\*/.exec(md);
  const portalCompat = /###\s*D\.3[\s\S]*?`(@fluentui\/react-portal-compat)`/.exec(md);
  return {
    providerTopology: topology ? topology[1].trimEnd() : null,
    portalCompatPackage: portalCompat ? portalCompat[1] : null,
    portalCompatRule:
      /`PortalCompatProvider` should be an inner child of `FluentProvider`[^"]*/.exec(md)?.[0]?.replace(/`/g, '') ??
      null,
    v8LayerHostElementId: layerHostId ? layerHostId[1] : null,
    zIndexNote:
      /Both v9 and v8 layers set the same `z-index`[^"]*/
        .exec(md)?.[0]
        ?.replace(/[`*]/g, '')
        .replace(/\s+/g, ' ') ?? null,
  };
}

/** E — codemod reality check (there is no official v8->v9 codemod). */
export function extractTooling(md) {
  if (!md) return null;
  const sec = /##\s*E\.\s*Codemods[^\n]*\n([\s\S]*?)(?:\n##\s)/.exec(md);
  if (!sec) return null;
  const rules = [...sec[1].matchAll(/\*\*`([a-z0-9-]+)`\*\*/g)].map((m) => m[1]);
  const codemodsBullet = sec[1]
    .split(/\r?\n/)
    .find((l) => /^-\s.*@fluentui\/codemods/.test(l));
  return {
    officialV8ToV9Codemod: false,
    codemodsPackageNote: codemodsBullet
      ? codemodsBullet.replace(/^-\s*/, '').replace(/[`*]/g, '').replace(/\s+/g, ' ').trim()
      : null,
    eslintPlugin: '@fluentui/eslint-plugin-react-components',
    eslintRules: [...new Set(rules)],
  };
}

/** The "Critical location correction" note at the top of the map report. */
export function extractMigrationDocsLocation(md) {
  if (!md) return null;
  const m = /\*\*`?(apps\/public-docsite-v9\/src\/Concepts\/Migration\/FromV8\/)`?\*\*/.exec(md);
  return m ? m[1] : null;
}

/**
 * Rule: a lookup must work on a single exact export name. The research phrases
 * hazard rows as groups ("Modal / Popup", "Separator / VerticalDivider vs
 * Divider", "onChange signature (Checkbox, Slider, ...)"). Rather than rewrite
 * the researcher's wording, tag each row with the v8 export names it actually
 * covers — resolved by intersecting the row's identifiers with the verified
 * export set, so a v9-only name like `Switch` never leaks in.
 */
export function attachV8Names(rows, fields, knownExports) {
  return rows.map((row) => {
    const names = [];
    for (const f of fields) {
      for (const tok of String(row[f] ?? '').match(/[A-Za-z_$][A-Za-z0-9_$]*/g) ?? []) {
        if (knownExports.has(tok) && !names.includes(tok)) names.push(tok);
      }
    }
    return { ...row, v8Names: names };
  });
}

/** name -> indexes into `rows`, for O(1) exact-name lookups. */
export function buildNameIndex(rows) {
  const idx = {};
  rows.forEach((row, i) => {
    for (const n of row.v8Names ?? []) (idx[n] ??= []).push(i);
  });
  return sortKeys(idx);
}

/* ------------------------------------------------------------------ *
 * assembly
 * ------------------------------------------------------------------ */

export function build(dir) {
  const sources = [];
  const warnings = [];
  const topics = {};
  for (const [name, spec] of Object.entries(TOPICS)) topics[name] = loadTopic(dir, spec, sources);

  const theming = topics.theming.json;
  const styling = topics.styling.json;
  const componentsJson = topics.components.json;
  const migrationJson = topics.migration.json;
  const history = topics.history.json;
  const platforms = topics.platforms.json;
  const designA11y = topics.designA11y.json;

  const componentsMd = topics.components.md;
  const migrationMd = topics.migration.md;

  /* ---- components ------------------------------------------------- */
  // JSON extract wins; markdown only fills the gaps it can prove.
  const catalog = {};
  const componentsJsonFiles = topics.components.files.length ? topics.components.files : ['components.json'];
  for (const [name, entry] of Object.entries(componentsJson?.components ?? {})) {
    catalog[name] = { ...entry, sources: [...componentsJsonFiles] };
  }
  for (const [name, entry] of Object.entries(extractComponentCatalog(componentsMd))) {
    if (catalog[name]) {
      fillMissing(catalog[name], entry);
      if (!catalog[name].sources.includes('components.md')) catalog[name].sources.push('components.md');
    } else catalog[name] = { ...entry, sources: ['components.md'] };
  }

  const migrationMap = migrationJson?.migrationMap?.length
    ? migrationJson.migrationMap
    : extractMigrationMap(migrationMd);

  /* ---- v8-only / collisions / traps -------------------------------- */
  const tier1 = componentsJson?.v8Only?.tier1?.length
    ? componentsJson.v8Only.tier1
    : extractTier1(componentsMd);
  const tier2Compat = componentsJson?.v8Only?.tier2Compat ?? [];
  const collisions = componentsJson?.collisions?.length
    ? componentsJson.collisions
    : extractCollisions(componentsMd);
  const traps = componentsJson?.traps ?? [];

  const wholeDeprecations = extractWholeComponentDeprecations(componentsMd);
  const deprecationIndex = componentsJson?.deprecations?.length
    ? componentsJson.deprecations
    : extractDeprecationIndex(componentsMd);

  // Names we can PROVE are `@fluentui/react` exports. The migration table's v8
  // column mixes real exports with doc labels (`Keytips` is a /lib/ entry, not
  // an export), so a name that is only a lib-entry label must not become a
  // catalog row with a fabricated barrel import.
  const verifiedExports = new Set();
  const knownLibEntries = new Set();
  for (const [name, entry] of Object.entries(catalog)) {
    verifiedExports.add(name);
    for (const e of entry.relatedExports ?? []) verifiedExports.add(e);
    for (const e of entry.deprecatedExports ?? []) verifiedExports.add(e);
    if (entry.libEntry) knownLibEntries.add(entry.libEntry);
    for (const e of entry.alternateLibEntries ?? []) knownLibEntries.add(e);
  }
  for (const r of tier1) if (isIdent(r.name)) verifiedExports.add(r.name);
  for (const d of deprecationIndex) for (const s of d.symbols ?? []) {
    // the deprecation index mixes exports with prop paths (`strings.hue`,
    // `ariaLabel`); only the PascalCase heads are exports
    const head = String(s).split('.')[0];
    if (isComponentName(head)) verifiedExports.add(head);
  }

  // attach v9 status to catalog entries, and admit v8 exports that only the
  // migration table knows about
  const libEntryLabels = [];
  const foreignPackageRows = [];
  for (const row of migrationMap) {
    if (row.variant) continue; // "Button split" describes a usage, not an export
    const name = row.v8;
    if (!isComponentName(name)) continue;
    if (row.v8Package && row.v8Package !== '@fluentui/react') {
      if (!foreignPackageRows.some((r) => r.name === name)) {
        foreignPackageRows.push({ name, package: row.v8Package, reason: 'not a @fluentui/react export' });
      }
      continue;
    }
    if (!catalog[name]) {
      if (!verifiedExports.has(name) && knownLibEntries.has(name)) {
        if (!libEntryLabels.includes(name)) libEntryLabels.push(name);
        continue; // a /lib/ entry point, not an importable export
      }
      const libEntry = row.v8LibEntry ?? null;
      catalog[name] = {
        family: null,
        category: null,
        libEntry,
        libImport: libEntry
          ? `import { ${name} } from '@fluentui/react/lib/${libEntry}';`
          : `import { ${name} } from '@fluentui/react';`,
        libImportIsDeepPath: Boolean(libEntry),
        barrelImport: `import { ${name} } from '@fluentui/react';`,
        relatedExports: [],
        alternateLibEntries: [],
        interfaces: null,
        keyProps: [],
        sample: null,
        a11y: null,
        deprecated: { is: false, replacedBy: null },
        deprecatedExports: [],
        v9: null,
        sources: ['v8-to-v9-map.md'],
      };
    } else if (!catalog[name].sources.includes('v8-to-v9-map.md')) {
      catalog[name].sources.push('v8-to-v9-map.md');
    }
    if (!catalog[name]._v9FromMap) {
      catalog[name]._v9FromMap = {
        equivalent: row.v9,
        exports: row.v9Exports ?? [],
        difficulty: row.difficulty,
        keyPropMapping: row.keyPropMapping,
        gotchas: row.gotchas,
      };
    }
  }

  for (const name of wholeDeprecations) {
    if (!catalog[name]) continue;
    catalog[name].deprecated = { is: true, replacedBy: catalog[name].deprecated?.replacedBy ?? null };
  }
  for (const row of deprecationIndex) {
    const first = row.symbols?.[0];
    if (first && catalog[first]?.deprecated?.is && !catalog[first].deprecated.replacedBy) {
      catalog[first].deprecated.replacedBy = row.replacement ?? null;
    }
  }

  // every listed export -> owning catalog key, so an exact-name lookup on
  // `LayerHost` or `PivotItem` still resolves without fabricating entries
  const normalized = {};
  for (const [name, entry] of Object.entries(catalog)) normalized[name] = normalizeComponent(name, entry);

  const exportIndex = {};
  for (const [name, entry] of Object.entries(normalized)) {
    exportIndex[name] = name;
    for (const e of entry.relatedExports ?? []) if (!exportIndex[e]) exportIndex[e] = name;
  }

  const knownExports = new Set([...Object.keys(exportIndex), ...verifiedExports]);
  const collisionRows = attachV8Names(collisions, ['name', 'v8'], knownExports);
  const trapRows = attachV8Names(traps, ['component'], knownExports);

  /* ---- v8-only / collisions / traps -------------------------------- */
  // (resolved earlier — the verified-export gate depends on tier1 + deprecations)

  /* ---- migration --------------------------------------------------- */
  const statusCorrections = migrationJson?.statusCorrections?.length
    ? migrationJson.statusCorrections
    : extractStatusCorrections(migrationMd);
  const compatPackages = migrationJson?.compatPackages?.length
    ? migrationJson.compatPackages
    : extractCompatInventory(migrationMd);
  const contribPackages = migrationJson?.contribPackages?.length
    ? migrationJson.contribPackages
    : extractContribPackages(migrationMd);
  const microsoftDeprecatedList = migrationJson?.microsoftDeprecatedList?.length
    ? migrationJson.microsoftDeprecatedList
    : extractMicrosoftDeprecatedList(migrationMd);
  const shims = migrationJson?.shims ?? extractShims(migrationMd);
  const coexistence = migrationJson?.coexistence ?? extractCoexistence(migrationMd);
  const tooling = migrationJson?.tooling ?? extractTooling(migrationMd);

  /* ---- docsErrata --------------------------------------------------- */
  // Three feeds: the explicit errata list, the A.2 rows the researcher marked
  // **STABLE** (the docs still call these preview/experimental/unavailable),
  // and any compat package that is not actually installable.
  const slug = (s) => s.replace(/[^A-Za-z0-9]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').toLowerCase();
  const erratum = (o) => ({
    id: o.id,
    doc: o.doc ?? null,
    claim: o.claim ?? null,
    reality: o.reality ?? null,
    action: o.action ?? null,
    source: o.source ?? null,
  });
  const docsErrata = [];
  for (const e of migrationJson?.docsErrata ?? extractErrata(migrationMd)) docsErrata.push(erratum(e));
  for (const s of statusCorrections) {
    if (!s.stableIn9745) continue;
    docsErrata.push(
      erratum({
        id: `status-${slug(s.component)}`,
        doc: 'ComponentMapping.mdx',
        claim: `Docs say: ${s.docSays}`,
        reality: s.actual,
        action: s.whatToDo,
        source: 'v8-to-v9-map.md#A.2 (cross-checked against react-components 9.74.5 index.ts)',
      })
    );
  }
  for (const p of compatPackages) {
    if (p.installable !== false) continue;
    docsErrata.push(
      erratum({
        id: `not-installable-${slug(p.package)}`,
        claim: `${p.package} is referenced as a migration target`,
        reality: `${p.package} is "private": true and is NOT published to npm — it cannot be installed.`,
        action: 'Do not tell users to install it.',
        source: 'v8-to-v9-map.md#A.3',
      })
    );
  }

  /* ---- unverified --------------------------------------------------- */
  const unverified = [];
  const pushUnverified = (file, list) => {
    for (const note of list ?? []) {
      unverified.push(typeof note === 'string' ? { source: file, note } : { source: file, ...note });
    }
  };
  pushUnverified('theming.json', theming?.unverified);
  pushUnverified('styling.json', styling?.unverified);
  pushUnverified(componentsJsonFiles.join(', '), componentsJson?.unverified);
  pushUnverified('history.json', history?.unverified);
  pushUnverified('platforms.json', platforms?.unverified);
  pushUnverified('design-a11y.json', designA11y?.unverified);
  pushUnverified('migration.json', migrationJson?.unverified);

  // Reconcile the tier-1 table against the report's own headline number. A
  // mismatch means the table and the prose disagree in the research itself —
  // surface it instead of quietly shipping whichever one we parsed.
  const tier1Primaries = tier1.filter((r) => r.role !== 'member');
  const tier1Claimed = extractTier1ClaimedCount(componentsMd);
  if (tier1Claimed !== null && tier1Primaries.length && tier1Claimed !== tier1Primaries.length) {
    unverified.push({
      source: 'components.md',
      note: `Tier-1 count mismatch: the summary prose says ${tier1Claimed} Tier-1 entries but the Tier-1 table has ${tier1Primaries.length} rows. v8Only.tier1 reflects the table (the itemised source); re-verify before quoting a total.`,
    });
  }

  /* ---- meta ---------------------------------------------------------- */
  const verifiedVersions = {
    ...(theming?.meta?.verifiedVersions ?? {}),
    ...(styling?.meta?.verifiedVersions ?? {}),
  };
  if (componentsJson?.meta?.verifiedVersion) {
    const m = /^(@[^@]+)@(.+)$/.exec(componentsJson.meta.verifiedVersion);
    if (m) verifiedVersions[m[1]] = m[2];
  }
  if (componentsJson?.meta?.v9Baseline) {
    const m = /^(@[^@]+)@(.+)$/.exec(componentsJson.meta.v9Baseline);
    if (m) verifiedVersions[m[1]] = m[2];
  }

  const verifiedOn =
    componentsJson?.meta?.verifiedOn ??
    theming?.meta?.verifiedOn ??
    styling?.meta?.verifiedOn ??
    history?.meta?.verifiedOn ??
    null;

  const data = {
    meta: {
      generation: 'Fluent 1',
      library: '@fluentui/react',
      majorVersion: 8,
      verifiedVersions: sortKeys(verifiedVersions),
      verifiedOn,
      v9Baseline: componentsJson?.meta?.v9Baseline ?? null,
      // These describe the upstream v8 library, not this dataset. Published
      // as `counts` they read as a census of the file and contradict it
      // (71 families vs 46 here), right beside "values are never inferred".
      upstreamLibraryCounts: componentsJson?.meta?.counts
        ? {
            ...componentsJson.meta.counts,
            note: 'Totals for the upstream Fluent UI React v8 library as reported by the source research, NOT the size of this dataset. See datasetCounts.',
          }
        : null,
      migrationDocsLocation: extractMigrationDocsLocation(migrationMd),
      sources,
      generatedBy: 'scripts/build-v8-data.mjs',
      note:
        'Assembled from verified research extracts. Values are never inferred: anything the research could not confirm is null or listed in `unverified`.',
    },
    lineage: history?.lineage ?? [],
    versionDecision: history?.versionDecision ?? [],
    support: {
      ...(history?.support ?? {}),
      newProjectGuidance: history?.newProjectGuidance ?? null,
      compat: history?.compat ?? null,
    },
    components: sortKeys(normalized),
    exportIndex: sortKeys(exportIndex),
    v8Only: {
      tier1,
      // families exploded into one addressable row per export name; keep the
      // family list so the count reconciles with the research report
      tier1Families: tier1Primaries.map((r) => r.name),
      tier1ClaimedCount: tier1Claimed,
      tier2Compat,
    },
    collisions: collisionRows,
    collisionIndex: buildNameIndex(collisionRows),
    traps: trapRows,
    trapIndex: buildNameIndex(trapRows),
    deprecations: { wholeComponents: wholeDeprecations, index: deprecationIndex },
    theming: stripMeta(theming),
    styling: stripMeta(styling, ['icons']),
    icons: styling?.icons ?? null,
    designLanguage: designA11y?.designLanguage ?? null,
    accessibility: designA11y?.accessibility ?? null,
    platforms: stripMeta(platforms),
    fluent2ThemeForV8: history?.fluent2ThemeForV8 ?? null,
    migration: {
      map: migrationMap,
      statusCorrections,
      microsoftDeprecatedList,
      compatPackages,
      contribPackages,
      shims,
      coexistence,
      tooling,
      doNotMigrateYet: migrationJson?.doNotMigrateYet ?? extractDoNotMigrateYet(migrationMd),
      // rows the mapping table names but that are NOT importable
      // `@fluentui/react` exports — kept out of `components` on purpose
      libEntryLabels,
      foreignPackages: foreignPackageRows,
    },
    docsErrata,
    unverified,
  };

  return { data, warnings, sources };
}

/** Drop the research file's own bookkeeping keys (and optional hoisted keys). */
function stripMeta(obj, alsoDrop = []) {
  if (!obj) return null;
  const drop = new Set(['meta', 'unverified', ...alsoDrop]);
  return Object.fromEntries(Object.entries(obj).filter(([k]) => !drop.has(k)));
}

/* ------------------------------------------------------------------ *
 * validation
 * ------------------------------------------------------------------ */

export function validate(data) {
  const errors = [];
  const warnings = [];

  const walk = (node, path) => {
    if (node === undefined) {
      errors.push(`undefined value at ${path}`);
      return;
    }
    if (Array.isArray(node)) node.forEach((v, i) => walk(v, `${path}[${i}]`));
    else if (isPlainObject(node)) for (const [k, v] of Object.entries(node)) walk(v, `${path}.${k}`);
  };
  walk(data, '$');

  const compCount = Object.keys(data.components).length;
  if (!compCount) errors.push('components is empty');
  for (const [name, c] of Object.entries(data.components)) {
    if (!c.libImport || typeof c.libImport !== 'string') {
      errors.push(`components.${name} has no libImport`);
    }
  }

  const sections = {
    lineage: data.lineage,
    versionDecision: data.versionDecision,
    support: data.support,
    components: data.components,
    'v8Only.tier1': data.v8Only.tier1,
    'v8Only.tier2Compat': data.v8Only.tier2Compat,
    collisions: data.collisions,
    traps: data.traps,
    theming: data.theming,
    styling: data.styling,
    icons: data.icons,
    designLanguage: data.designLanguage,
    accessibility: data.accessibility,
    platforms: data.platforms,
    'migration.map': data.migration.map,
    'migration.compatPackages': data.migration.compatPackages,
    docsErrata: data.docsErrata,
    unverified: data.unverified,
  };
  const counts = {};
  for (const [name, v] of Object.entries(sections)) {
    const n = v == null ? 0 : Array.isArray(v) ? v.length : isPlainObject(v) ? Object.keys(v).length : 1;
    counts[name] = n;
    if (n === 0) warnings.push(`section "${name}" is EMPTY`);
  }

  // JSON round-trip: the file must survive being read back byte-for-byte
  const text = JSON.stringify(data, null, 2);
  try {
    JSON.parse(text);
  } catch (err) {
    errors.push(`output is not valid JSON: ${err.message}`);
  }

  return { errors, warnings, counts, bytes: Buffer.byteLength(text + '\n', 'utf8') };
}

/* ================================================================== *
 * v8/v9 NAME CLASSES — computed from the upstream API-Extractor reports
 * ================================================================== *
 *
 * The old `collisions` array was hand-curated from a research markdown table.
 * It mixed four different failure modes under one label and — because nobody
 * ever intersected the real export lists — it omitted `Button`, `Checkbox`,
 * `Dropdown`, `Label`, `Link`, `Slider`, `Spinner`, `SearchBox`, `SpinButton`,
 * `CompoundButton` and `DialogContent`, i.e. the most-used components in both
 * libraries.
 *
 * Membership is now MECHANICAL. The two API-Extractor reports in
 * microsoft/fluentui are the authority:
 *   v8: packages/react/etc/react.api.md
 *   v9: packages/react-components/react-components/etc/react-components.api.md
 * Intersecting their PascalCase exports yields the collision set; comparing
 * case-insensitively yields the casing traps. Only the PROSE is hand-written,
 * and a prose entry with no mechanical backing is dropped with a warning, so
 * the list can never drift back into curation.
 *
 * The four classes are deliberately separate because the fix differs:
 *   collisions    — same identifier exported by BOTH; disambiguate the import
 *   renames       — v8 name -> a DIFFERENT v9 name; rename the symbol
 *   casingTraps   — same word, different casing (ComboBox vs Combobox)
 *   behaviorTraps — API semantics changed; rewrite the call site
 */

export const UPSTREAM = {
  repo: 'microsoft/fluentui',
  defaultRef: 'master',
  reports: {
    v8: 'packages/react/etc/react.api.md',
    v9: 'packages/react-components/react-components/etc/react-components.api.md',
  },
  raw: (path, ref = UPSTREAM.defaultRef) =>
    `https://raw.githubusercontent.com/${UPSTREAM.repo}/${ref}/${path}`,
};

/** Packages whose versions we quote but which own no collision export. */
const EXTRA_VERSION_PACKAGES = [
  '@fluentui/react',
  '@fluentui/react-components',
  '@fluentui/theme',
  '@fluentui/tokens',
  '@fluentui/utilities',
  '@fluentui/react-utilities',
  '@fluentui/font-icons-mdl2',
  '@fluentui/react-icons-mdl2',
  '@fluentui/fluent2-theme',
  '@fluentui/codemods',
  '@fluentui/react-migration-v8-v9',
  '@fluentui/react-migration-v0-v9',
  '@fluentui/react-portal-compat',
  '@fluentui/react-portal-compat-context',
  '@fluentui/react-calendar-compat',
  '@fluentui/react-datepicker-compat',
  '@fluentui/react-timepicker-compat',
  '@fluentui/react-icons-compat',
  '@fluentui/react-colorpicker-compat',
  '@fluentui/react-utilities-compat',
  '@fluentui/react-divider',
  '@fluentui/react-switch',
  '@fluentui/react-tabs',
  '@fluentui/react-skeleton',
  '@fluentui/react-progress',
  '@fluentui/react-swatch-picker',
  '@fluentui/react-menu',
  '@fluentui/react-provider',
  '@fluentui/react-combobox',
];

/**
 * Where a package's package.json lives in the monorepo. There is no manifest
 * mapping npm name -> path, and walking all 270+ package.json files costs
 * minutes, so try the three layouts the repo actually uses (v9 libraries were
 * split into `<pkg>/library/` in 2024; v8 packages never were).
 */
export function packageJsonCandidates(pkg) {
  const short = pkg.replace(/^@fluentui\//, '');
  return [
    `packages/react-components/${short}/library/package.json`,
    `packages/react-components/${short}/package.json`,
    `packages/${short}/library/package.json`,
    `packages/${short}/package.json`,
  ];
}

/**
 * Read one API-Extractor report into `name -> { package, form }`.
 *
 * API Extractor renames a symbol when the barrel re-exports something that
 * collides with a local name — `import { Image as Image_2 }` /
 * `export { Image_2 as Image }`. A parser that ignores the alias form silently
 * loses Image, Text, Theme, PartialTheme and SelectionMode, which is exactly
 * five of the collisions, so both export forms are handled here.
 */
export function parseApiReport(md, fallbackPackage) {
  const imports = new Map();
  const exports = new Map();
  for (const line of String(md ?? '').split(/\r?\n/)) {
    let m;
    if ((m = /^import (?:type )?\{ ([A-Za-z0-9_$]+)(?: as ([A-Za-z0-9_$]+))? \} from '([^']+)';$/.exec(line))) {
      imports.set(m[2] || m[1], m[3]);
    } else if ((m = /^export \{ ([A-Za-z0-9_$]+)(?: as ([A-Za-z0-9_$]+))? \}$/.exec(line))) {
      const local = m[1];
      exports.set(m[2] || local, { package: imports.get(local) ?? fallbackPackage, form: 're-export' });
    } else if (
      (m = /^export (?:declare )?(const|function|class|abstract class|interface|type|enum|namespace) ([A-Za-z0-9_$]+)/.exec(line))
    ) {
      exports.set(m[2], { package: fallbackPackage, form: m[1] });
    }
  }
  return exports;
}

/**
 * Every v8 `I<Name>Props` that actually declares an `onChange` member.
 *
 * The inherited prose claimed the onChange break covered "Checkbox, Slider,
 * Toggle, SpinButton, Link, Label, Image, Spinner". Four of those eight
 * (`Link`, `Label`, `Image`, `Spinner`) have no onChange in v8 at all, so the
 * list is derived here instead of trusted.
 */
export function extractV8OnChangeOwners(md) {
  const lines = String(md ?? '').split(/\r?\n/);
  const owners = [];
  for (let i = 0; i < lines.length; i++) {
    const m = /^export interface I([A-Za-z0-9]+)Props\b/.exec(lines[i]);
    if (!m) continue;
    let depth = (lines[i].match(/\{/g) || []).length - (lines[i].match(/\}/g) || []).length;
    let hasOnChange = false;
    for (let j = i + 1; j < lines.length && depth > 0 && j - i < 200; j++) {
      if (/^\s{4}onChange\??:/.test(lines[j])) hasOnChange = true;
      depth += (lines[j].match(/\{/g) || []).length - (lines[j].match(/\}/g) || []).length;
    }
    if (hasOnChange && !owners.includes(m[1])) owners.push(m[1]);
  }
  return owners.sort();
}

const isPascalExport = (n) => /^[A-Z][A-Za-z0-9]*$/.test(n);

/** The mechanical part: intersect the two export sets. No curation. */
export function computeNameClasses(v8Exports, v9Exports) {
  const v8Pascal = [...v8Exports.keys()].filter(isPascalExport);
  const v9Pascal = [...v9Exports.keys()].filter(isPascalExport);
  const collisions = v8Pascal.filter((n) => v9Exports.has(n)).sort();

  const v9ByLower = new Map(v9Pascal.map((n) => [n.toLowerCase(), n]));
  const casingTraps = v8Pascal
    .filter((n) => !v9Exports.has(n) && v9ByLower.has(n.toLowerCase()))
    .map((n) => ({ v8Name: n, v9Name: v9ByLower.get(n.toLowerCase()) }))
    .sort((a, b) => (a.v8Name < b.v8Name ? -1 : 1));

  return {
    collisions,
    casingTraps,
    counts: {
      v8Exports: v8Exports.size,
      v9Exports: v9Exports.size,
      v8PascalExports: v8Pascal.length,
      v9PascalExports: v9Pascal.length,
      collisions: collisions.length,
      casingTraps: casingTraps.length,
    },
  };
}

/**
 * Fetch the two API reports plus every package.json whose version we quote.
 *
 * Versions are DERIVED, never pinned by hand: the dataset previously claimed
 * `@fluentui/react-nav 9.4.3` while upstream had already shipped 9.4.4, and a
 * stale version in a migration instruction is indistinguishable from a wrong
 * one. `private` is captured too — a private package must never be recommended.
 */
export async function fetchUpstream({ ref = UPSTREAM.defaultRef, log = () => {} } = {}) {
  const reports = {};
  for (const [gen, path] of Object.entries(UPSTREAM.reports)) {
    const url = UPSTREAM.raw(path, ref);
    log(`fetching ${path}`);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`GET ${url} -> HTTP ${res.status}`);
    const text = await res.text();
    reports[gen] = {
      path,
      url,
      bytes: Buffer.byteLength(text, 'utf8'),
      sha256: sha256(text),
      text,
    };
  }

  const v8Exports = parseApiReport(reports.v8.text, '@fluentui/react');
  const v9Exports = parseApiReport(reports.v9.text, '@fluentui/react-components');
  const computed = computeNameClasses(v8Exports, v9Exports);
  computed.v8OnChangeOwners = extractV8OnChangeOwners(reports.v8.text);

  const wanted = new Set(EXTRA_VERSION_PACKAGES);
  for (const name of computed.collisions) {
    for (const set of [v8Exports, v9Exports]) {
      const pkg = set.get(name)?.package;
      if (pkg && pkg.startsWith('@fluentui/')) wanted.add(pkg);
    }
  }
  for (const { v8Name, v9Name } of computed.casingTraps) {
    for (const pkg of [v8Exports.get(v8Name)?.package, v9Exports.get(v9Name)?.package]) {
      if (pkg && pkg.startsWith('@fluentui/')) wanted.add(pkg);
    }
  }

  const versions = {};
  const versionMisses = [];
  for (const pkg of [...wanted].sort()) {
    let found = null;
    for (const candidate of packageJsonCandidates(pkg)) {
      const res = await fetch(UPSTREAM.raw(candidate, ref));
      if (!res.ok) continue;
      let json;
      try {
        json = JSON.parse(await res.text());
      } catch {
        continue;
      }
      if (json.name !== pkg) continue;
      found = { version: json.version ?? null, private: json.private === true, path: candidate };
      break;
    }
    if (found) versions[pkg] = found;
    else versionMisses.push(pkg);
    log(`  ${pkg} = ${found ? found.version + (found.private ? ' (private)' : '') : 'NOT FOUND'}`);
  }

  return {
    ref,
    fetchedOn: new Date().toISOString().slice(0, 10),
    reports: Object.fromEntries(
      Object.entries(reports).map(([k, r]) => [k, { path: r.path, url: r.url, bytes: r.bytes, sha256: r.sha256 }])
    ),
    exports: {
      v8: Object.fromEntries([...v8Exports].map(([k, v]) => [k, v.package])),
      v9: Object.fromEntries([...v9Exports].map(([k, v]) => [k, v.package])),
    },
    computed,
    versions,
    versionMisses,
  };
}

/* ---- hand-written prose, re-filed by class ------------------------- *
 * Every string below was written by a human and is preserved verbatim from
 * the previous `collisions` array where one existed. What changed is only
 * WHICH class a row lives in, and the fact that package versions are no
 * longer baked into the sentence — they are injected from upstream.
 */
export const NAME_CLASS_PROSE = {
  collisions: {
    Breadcrumb: {
      v8: 'items: IBreadcrumbItem[], maxDisplayedItems, overflowIndex, dividerAs',
      v9: '<Breadcrumb><BreadcrumbItem><BreadcrumbButton>',
      hazard: 'Same name, array-vs-children; overflow collapsing must be hand-rolled in v9',
      severity: 'medium',
    },
    Button: {
      v8: 'class Button extends React.Component<IButtonProps> — the base class behind DefaultButton / PrimaryButton / IconButton / ActionButton / CommandBarButton; text, iconProps, primary, split + menuProps, allowDisabledFocus, styles',
      v9: 'ForwardRefComponent<ButtonProps>: children for the label, an icon slot, appearance="secondary"|"primary"|"outline"|"subtle"|"transparent", shape, size, disabledFocusable',
      hazard:
        'The highest-traffic collision in either library and the one most likely to be generated wrong. Both packages export `Button`, but in v8 it is a rarely-rendered base class while in v9 it IS the button — so a v8 import inside a v9 app compiles and renders an unthemed v8 button. text / iconProps / primary / styles are all accepted-and-ignored props on the v9 side.',
      severity: 'high',
    },
    Checkbox: {
      v8: 'onChange(ev, checked?: boolean); boxSide, checkmarkIconProps, indeterminate / defaultIndeterminate, label, styles',
      v9: "onChange(ev, data: CheckboxOnChangeData) where data.checked is boolean | 'mixed'; labelPosition, shape, size; children: never",
      hazard:
        'Same name, different onChange contract, and v8\'s `indeterminate` does not exist in v9 — it became checked="mixed". Passing indeterminate to the v9 Checkbox silently does nothing.',
      severity: 'high',
    },
    ColorPicker: {
      v8: 'color: IColor | string REQUIRED, alphaType, strings, onChange(ev, IColor)',
      v9: '<ColorPicker><ColorArea/><ColorSlider/><AlphaSlider/>',
      hazard: 'Same name; IColor type and the strings a11y bundle do not exist in v9',
      severity: 'medium',
    },
    CompoundButton: {
      v8: 'class CompoundButton extends React.Component<IButtonProps>; secondaryText, onRenderDescription',
      v9: 'ForwardRefComponent<CompoundButtonProps>: a secondaryContent slot inside a contentContainer, plus appearance / shape / size from ButtonProps',
      hazard:
        'Both libraries export CompoundButton. `secondaryText` is an unknown prop on the v9 component, so the description simply never renders and nothing warns.',
      severity: 'high',
    },
    Dialog: {
      v8: 'hidden defaults to TRUE; content via dialogContentProps/modalProps',
      v9: 'open boolean defaults false; <DialogSurface><DialogBody><DialogTitle> composition',
      hazard: 'Inverted visibility prop: hidden={isOpen} renders backwards and is the #1 generated-code bug',
      severity: 'high',
    },
    DialogContent: {
      v8: 'IDialogContentProps: title, subText, type: DialogType, showCloseButton, topButtonsProps, isMultiline — normally passed as dialogContentProps rather than rendered directly',
      v9: 'DialogContentProps = ComponentProps<DialogContentSlots> — a single scrollable body <div> slot with no title, no subText and no close button',
      hazard:
        'Both export DialogContent, and they own different parts of the dialog. In v8 it carries the title and the close button; in v9 the title is DialogTitle and the buttons are DialogActions, so a ported <DialogContent title subText> renders an empty box.',
      severity: 'high',
    },
    Dropdown: {
      v8: 'IDropdownProps: options: IDropdownOption[], selectedKey / selectedKeys, onChange(ev, option, index), placeholder, multiSelect, onRenderTitle',
      v9: '<Dropdown><Option> children, selectedOptions, onOptionSelect(ev, data), multiselect, button + listbox slots',
      hazard:
        'Same name; options-array vs children, onChange vs onOptionSelect, and `selectedKey` has no v9 counterpart. Note the v9 Dropdown ships from @fluentui/react-combobox — there is no react-dropdown package to import from.',
      severity: 'high',
    },
    Image: {
      v8: 'IImageProps: src + imageFit: ImageFit enum, coverStyle, maximizeFrame, shouldFadeIn, errorSrc, onLoadingStateChange',
      v9: "ImageProps: fit: 'none'|'center'|'contain'|'cover'|'default', block, bordered, shadow, shape",
      hazard:
        'Same name; the prop is `imageFit` with an enum in v8 and `fit` with string literals in v9, so a ported imageFit={ImageFit.cover} is dropped and the image renders unfitted.',
      severity: 'medium',
    },
    Label: {
      v8: 'ILabelProps: required, disabled, as, styles — renders a <label>',
      v9: "LabelProps: size 'small'|'medium'|'large', weight 'regular'|'semibold', required?: boolean | Slot<'span'>, disabled",
      hazard:
        'Same name, and the props people actually pass (required, disabled) exist in both — so the swap type-checks. What silently changes is the type ramp (v9 has size/weight, v8 has neither) and the styles prop, which v9 drops.',
      severity: 'medium',
    },
    Link: {
      v8: 'ILinkProps: href, disabled, underline, as, styles — renders <a> or <button> depending on href',
      v9: "LinkProps: appearance 'default'|'subtle', inline, disabled, disabledFocusable; root is Slot<'a', 'button' | 'span'>",
      hazard:
        "Same name; v8's `underline` boolean has no v9 counterpart (v9 expresses in-paragraph links with `inline`), and the styles prop is dropped, so links keep working but stop looking like links.",
      severity: 'medium',
    },
    List: {
      v8: 'Virtualized: items + onRenderCell, page windowing, IPage, getPageHeight',
      v9: 'semantic <List>/<ListItem>, NO virtualization',
      hazard: 'Same name but v9 renders every row into the DOM; severe perf regression on large datasets',
      severity: 'high',
    },
    MessageBar: {
      v8: 'messageBarType={MessageBarType.error}, isMultiline, actions, delayedRender live region',
      v9: 'intent="error", <MessageBarBody>/<MessageBarActions>',
      hazard: "Enum→string plus children composition; v8's automatic live-region announcement is not replicated",
      severity: 'medium',
    },
    Nav: {
      v8: 'groups: INavLinkGroup[] | null required; INavLink{name,url}; selectedKey; onLinkClick(ev,item)',
      v9: '<NavDrawer><NavItem value>; selectedValue; onNavItemSelect',
      hazard:
        'Identical export name, zero API overlap; a naive swap type-checks nowhere and silently loses nav state',
      severity: 'high',
    },
    PartialTheme: {
      v8: 'PartialTheme (@fluentui/theme): optional palette / semanticColors / fonts / effects / spacing / components — a partial v8 ITheme',
      v9: 'PartialTheme (@fluentui/react-theme, re-exported from @fluentui/tokens): Partial<Theme>, i.e. a partial FLAT token record',
      hazard:
        'Both export a type named PartialTheme, and the two shapes share no members. A mixed import type-checks a v8 palette object against the v9 provider (or vice versa) and the failure surfaces far away from the import line.',
      severity: 'high',
    },
    Persona: {
      v8: 'text, secondaryText, size={PersonaSize.size48}, presence={PersonaPresence.online}, imageUrl',
      v9: "name, size={48}, presence={{status:'available'}}, avatar={{image:{src}}}",
      hazard: 'text→name rename, enum→number, and presence changes from enum to an object shape',
      severity: 'high',
    },
    Rating: {
      v8: 'rating / defaultRating, max, onChange(event, rating?), RatingSize.Small|Large',
      v9: 'value / defaultValue, onChange(ev, data), size="small"|"medium"|"large"',
      hazard: 'rating→value rename plus enum→string literal; both compile-fail loudly except onChange arg 2',
      severity: 'medium',
    },
    SearchBox: {
      v8: 'ISearchBoxProps: onChange(ev, newValue?: string), onSearch(newValue), onClear, onEscape, underlined, iconProps, labelText, disableAnimation',
      v9: 'SearchBoxProps extends InputProps: onChange(ev, data: InputOnChangeData) reading data.value, plus a dismiss slot — no onSearch, no onClear',
      hazard:
        'Same name; the second onChange argument changes from a string to a data object, and v8\'s onSearch (fired on Enter) and onClear have no v9 equivalent, so "press Enter to search" silently stops working.',
      severity: 'high',
    },
    SelectionMode: {
      v8: 'numeric enum from @fluentui/utilities: none = 0, single = 1, multiple = 2',
      v9: "string union from @fluentui/react-utilities: 'single' | 'multiselect'",
      hazard:
        "Same name, enum vs string union. `SelectionMode.multiple` does not exist in v9 — the value is 'multiselect' — and a v8 enum member is a number, which is not a valid v9 selectionMode at all.",
      severity: 'high',
    },
    Slider: {
      v8: 'onChange(value, range?, event?) — VALUE first; also onChanged(event, value, range?); ranged / lowerValue, showValue, valueFormat, originFromZero',
      v9: 'onChange(ev, data: SliderOnChangeData) reading data.value; min / max / step / vertical / size; no ranged mode and no showValue',
      hazard:
        'Same name and the worst argument-order break in the library: v8 passes the value first, v9 passes the event first. A ported handler reads a React synthetic event as a number.',
      severity: 'high',
    },
    SpinButton: {
      v8: 'value / defaultValue are STRINGS; onChange(ev, newValue?: string), onIncrement / onDecrement / onValidate, iconProps, upArrowButtonStyles',
      v9: 'value / defaultValue are number | null; onChange(ev, data: SpinButtonOnChangeData) reading data.value and data.displayValue; incrementButton / decrementButton slots',
      hazard:
        'Same name; the value prop changes from string to number AND onChange gains a data object. A loosely-typed call site compiles and then produces NaN.',
      severity: 'high',
    },
    Spinner: {
      v8: 'ISpinnerProps: size: SpinnerSize enum, label, labelPosition, ariaLive, styles',
      v9: "SpinnerProps: size 'extra-tiny'|'tiny'|'extra-small'|'small'|'medium'|'large'|'extra-large'|'huge', appearance 'primary'|'inverted', delay, labelPosition 'above'|'below'|'before'|'after'",
      hazard:
        'Same name; SpinnerSize.large is a number and is not one of v9\'s string sizes, so the size prop is ignored and every spinner renders at medium.',
      severity: 'medium',
    },
    TagPicker: {
      v8: 'IBasePickerProps<ITag>; onResolveSuggestions required; ITag{name,key}',
      v9: '<TagPicker><TagPickerControl><TagPickerList>; onOptionSelect',
      hazard: 'Same export name, entirely different contract; ITag does not exist in v9',
      severity: 'high',
    },
    Text: {
      v8: "variant?: keyof IFontStyles ('small','xLarge','mega'), block, nowrap; foundation-legacy tokens",
      v9: 'size={100..1000}, weight, align, truncate, wrap',
      hazard: 'Same name; the v8 variant string set does not exist in v9 and fails silently as an unknown prop',
      severity: 'medium',
    },
    Theme: {
      v8: 'Theme (@fluentui/theme) extends IScheme: palette, semanticColors, fonts, effects, spacing, components',
      v9: 'Theme (@fluentui/react-theme, from @fluentui/tokens): a FLAT record of design tokens — colorNeutralForeground1, spacingHorizontalM, borderRadiusMedium, shadow8, …',
      hazard:
        'Both export a type called Theme and they have no members in common. This is the collision behind most "my theme object does not apply" reports: a mixed import lets the wrong theme satisfy a provider\'s prop type.',
      severity: 'high',
    },
    Tooltip: {
      v8: 'v8 exports BOTH Tooltip and TooltipHost; TooltipHost is the wrapper you use (content, delay: TooltipDelay, overflowMode, DirectionalHint)',
      v9: '<Tooltip content relationship="label"|"description"> around exactly one child',
      hazard:
        'v8 exports both Tooltip and TooltipHost; the v9 Tooltip maps to v8 TooltipHost, not to v8 Tooltip, and it REQUIRES the relationship prop',
      severity: 'medium',
    },
  },

  renames: [
    {
      v8Name: 'Toggle',
      v9Name: 'Switch',
      v8: 'Toggle with onText/offText/inlineLabel, role defaults to \'switch\'',
      v9: 'Switch with label/labelPosition; no onText/offText',
      hazard: 'Renamed and reshaped; on/off text must become adjacent content in v9',
      severity: 'medium',
      alsoIndex: ['Toggle'],
    },
    {
      v8Name: 'Pivot',
      v9Name: 'TabList',
      v8: 'Pivot + PivotItem, selectedKey, linkFormat, PivotItem renders its own tabpanel',
      v9: 'TabList + Tab, selectedValue, appearance; Tab renders NO panel',
      hazard: 'Renamed; panel content silently disappears because v9 Tab does not render children as a panel',
      severity: 'medium',
      alsoIndex: ['Pivot', 'PivotItem'],
    },
    {
      v8Name: 'Shimmer',
      v9Name: 'Skeleton',
      v8: 'Shimmer with shimmerElements: IShimmerElement[], isDataLoaded transition, ariaLabel',
      v9: 'Skeleton + SkeletonItem children',
      hazard: 'Renamed; declarative element array becomes children and the isDataLoaded crossfade is lost',
      severity: 'medium',
      alsoIndex: ['Shimmer'],
    },
    {
      v8Name: 'Separator',
      v9Name: 'Divider',
      v8: 'Two components: Separator (alignContent, vertical) and VerticalDivider (wrapper/divider slots)',
      v9: 'single Divider with vertical prop',
      hazard: "Two-to-one mapping; VerticalDivider's wrapper/divider style slots have no v9 target",
      severity: 'medium',
      alsoIndex: ['Separator', 'VerticalDivider'],
    },
    {
      v8Name: 'ProgressIndicator',
      v9Name: 'ProgressBar',
      v8: 'percentComplete is 0 to 1; omit for indeterminate',
      v9: 'ProgressBar value 0..max, max defaults to 1',
      hazard: 'Scale semantics differ by prop name; passing a 0-100 number yields a permanently full bar',
      severity: 'medium',
      alsoIndex: ['ProgressIndicator'],
    },
    {
      v8Name: 'TooltipHost',
      v9Name: 'Tooltip',
      v8: 'TooltipHost wrapper with content, delay: TooltipDelay, overflowMode, DirectionalHint',
      v9: '<Tooltip content relationship="label"|"description"> around one child',
      hazard:
        'TooltipHost is the v8 component that v9 Tooltip replaces — but v8 ALSO exports a different component literally named Tooltip, so renaming TooltipHost -> Tooltip inside a v8 file changes which component you get. See the Tooltip collision.',
      severity: 'medium',
      alsoIndex: ['TooltipHost', 'TooltipDelay', 'DirectionalHint'],
    },
    {
      v8Name: 'ContextualMenu',
      v9Name: 'Menu',
      v8: 'items: IContextualMenuItem[] array with key/text/subMenuProps; target: Target',
      v9: '<Menu><MenuTrigger><MenuPopover><MenuList> composition',
      hazard: 'Array-driven vs composition; nested subMenuProps trees have no mechanical v9 translation',
      severity: 'high',
      alsoIndex: ['ContextualMenu'],
    },
    {
      v8Name: 'SwatchColorPicker',
      v9Name: 'SwatchPicker',
      v8: 'columnCount + colorCells: IColorCellProps[] required; onChange(ev, id, color)',
      v9: 'SwatchPicker + ColorSwatch children',
      hazard: 'Near-identical name; IColorCellProps has no v9 analogue and onChange arity differs',
      severity: 'medium',
      alsoIndex: ['SwatchColorPicker'],
    },
    {
      v8Name: 'ThemeProvider',
      v9Name: 'FluentProvider',
      v8: 'ThemeProvider theme={createTheme({ palette, semanticColors })}',
      v9: 'FluentProvider theme={webLightTheme} with flat design tokens',
      hazard: 'IPartialTheme palette/semanticColors have no v9 counterpart; theme objects are not portable',
      severity: 'high',
      alsoIndex: ['ThemeProvider'],
    },
  ],

  casingTraps: {
    ComboBox: {
      v8: 'options: IComboBoxOption[]; allowFreeform; text; selectedKey; styles is Partial<IComboBoxStyles>',
      v9: '<Combobox><Option> children; freeform; selectedOptions',
      hazard:
        "Array-vs-children plus v8's non-standard styles type; also v8 root is not the outermost node (container is)",
      casingHazard:
        'v8 spells it ComboBox (capital B) and v9 spells it Combobox (lowercase b). They are different components, so the misspelling is not a typo the compiler catches — it resolves to whichever library exports that exact spelling, and only one of the two libraries has to be installed for it to compile.',
      severity: 'high',
    },
  },

  behaviorTraps: [
    {
      name: 'onChange signature (every v8 control that has an onChange)',
      v8: 'onChange(ev, checked?) / onChange(value, range?, ev?) — second arg IS the value',
      v9: 'onChange(ev, data) — second arg is a data object (data.checked, data.value)',
      hazard:
        'Silent, uniform break across every form control; handlers compile but receive an object, not a primitive',
      severity: 'high',
      deriveAppliesToFrom: 'v8OnChangeProps',
      correction:
        'The previous wording listed "Checkbox, Slider, Toggle, SpinButton, Link, Label, Image, Spinner". Link, Label, Image and Spinner declare no onChange in v8 at all — appliesTo is now derived from the v8 API report (every I<Name>Props that actually declares onChange).',
      appliesTo: [],
    },
    {
      name: 'styles prop (universal)',
      v8: 'styles?: IStyleFunctionOrObject<IXStyleProps, IXStyles> on nearly every component',
      v9: 'No styles prop at all; className + Griffel makeStyles',
      hazard: 'Any generated styles={{root:{...}}} is invalid in v9 and silently dropped; and vice versa',
      severity: 'high',
      appliesTo: [],
    },
    {
      name: 'Icon',
      v8: 'Font glyph via iconName string; requires a one-time global initializeIcons()',
      v9: '@fluentui/react-icons: one React component per icon, e.g. <DeleteRegular/>',
      hazard:
        'v8 icon names are not v9 imports; initializeIcons() is a no-op for v9 and missing it renders boxes',
      severity: 'high',
      appliesTo: ['Icon', 'initializeIcons'],
    },
  ],
};

/**
 * Turn the mechanical name sets + the prose table into the four shipped
 * arrays. Anything mechanical without prose is still emitted (with the prose
 * fields null) so the count never lies; anything with prose but no mechanical
 * backing is dropped into `warnings` rather than shipped.
 */
export function buildNameClasses(upstream, knownExports = new Set()) {
  const warnings = [];
  const v8Pkg = (n) => upstream.exports.v8[n] ?? null;
  const v9Pkg = (n) => upstream.exports.v9[n] ?? null;
  const ver = (pkg) => (pkg && upstream.versions[pkg]?.version) || null;
  const imp = (name, pkg, barrel) => `import { ${name} } from '${barrel ?? pkg}';`;

  const collisions = upstream.computed.collisions.map((name) => {
    const prose = NAME_CLASS_PROSE.collisions[name];
    if (!prose) warnings.push(`no prose for collision "${name}" — shipped with null description`);
    const p8 = v8Pkg(name);
    const p9 = v9Pkg(name);
    return {
      name,
      class: 'collision',
      v8: prose?.v8 ?? null,
      v9: prose?.v9 ?? null,
      hazard:
        prose?.hazard ??
        `Both @fluentui/react (v8) and @fluentui/react-components (v9) export "${name}". The import path alone decides which one you get.`,
      severity: prose?.severity ?? 'high',
      v8Import: imp(name, p8, '@fluentui/react'),
      v9Import: imp(name, p9, '@fluentui/react-components'),
      v8Package: p8,
      v8PackageVersion: ver(p8),
      v9Package: p9,
      v9PackageVersion: ver(p9),
      v9ReexportedFrom: '@fluentui/react-components',
      disambiguate:
        `import { ${name} as V8${name} } from '@fluentui/react';\n` +
        `import { ${name} } from '@fluentui/react-components';`,
      v8Names: [],
    };
  });

  const proseOnly = Object.keys(NAME_CLASS_PROSE.collisions).filter(
    (n) => !upstream.computed.collisions.includes(n)
  );
  for (const n of proseOnly) {
    warnings.push(`prose lists "${n}" as a collision but the upstream API reports do not — dropped`);
  }

  const casingTraps = upstream.computed.casingTraps.map(({ v8Name, v9Name }) => {
    const prose = NAME_CLASS_PROSE.casingTraps[v8Name];
    if (!prose) warnings.push(`no prose for casing trap "${v8Name}" / "${v9Name}"`);
    const p8 = v8Pkg(v8Name);
    const p9 = v9Pkg(v9Name);
    return {
      name: v8Name,
      class: 'casingTrap',
      v8Name,
      v9Name,
      v8: prose?.v8 ?? null,
      v9: prose?.v9 ?? null,
      hazard:
        prose?.casingHazard ??
        `v8 exports "${v8Name}" and v9 exports "${v9Name}". Same word, different casing, different component — the compiler cannot tell you which one you meant.`,
      apiHazard: prose?.hazard ?? null,
      severity: prose?.severity ?? 'high',
      v8Import: imp(v8Name, p8, '@fluentui/react'),
      v9Import: imp(v9Name, p9, '@fluentui/react-components'),
      v8Package: p8,
      v8PackageVersion: ver(p8),
      v9Package: p9,
      v9PackageVersion: ver(p9),
      v8Names: [],
    };
  });

  const renames = NAME_CLASS_PROSE.renames.map((r) => {
    const p8 = v8Pkg(r.v8Name);
    const p9 = v9Pkg(r.v9Name);
    if (!p8) warnings.push(`rename "${r.v8Name}" is not a v8 export in the upstream API report`);
    if (!p9) warnings.push(`rename target "${r.v9Name}" is not a v9 export in the upstream API report`);
    return {
      name: `${r.v8Name} → ${r.v9Name}`,
      class: 'rename',
      v8Name: r.v8Name,
      v9Name: r.v9Name,
      v8: r.v8,
      v9: r.v9,
      hazard: r.hazard,
      severity: r.severity,
      v8Import: p8 ? imp(r.v8Name, p8, '@fluentui/react') : null,
      v9Import: p9 ? imp(r.v9Name, p9, '@fluentui/react-components') : null,
      v8Package: p8,
      v8PackageVersion: ver(p8),
      v9Package: p9,
      v9PackageVersion: ver(p9),
      alsoExportedByV9: Boolean(v9Pkg(r.v8Name)),
      v8Names: [],
    };
  });

  const behaviorTraps = NAME_CLASS_PROSE.behaviorTraps.map((t) => {
    const derived =
      t.deriveAppliesToFrom === 'v8OnChangeProps'
        ? (upstream.computed.v8OnChangeOwners ?? []).filter((n) => Boolean(upstream.exports.v8[n]))
        : null;
    if (t.deriveAppliesToFrom && !derived?.length) {
      warnings.push(`behaviour trap "${t.name}" could not derive appliesTo from ${t.deriveAppliesToFrom}`);
    }
    return {
      name: t.name,
      class: 'behaviorTrap',
      v8: t.v8,
      v9: t.v9,
      hazard: t.hazard,
      severity: t.severity,
      appliesTo: derived ?? t.appliesTo ?? [],
      appliesToSource: t.deriveAppliesToFrom
        ? 'derived from packages/react/etc/react.api.md — every v8 I<Name>Props declaring an onChange member'
        : 'hand-listed',
      ...(t.correction ? { correction: t.correction } : {}),
    };
  });

  // index names: prefer the explicit list, then anything in the row's own text
  // that we can PROVE is a v8 export (same rule the traps table uses). Free
  // text is restricted to PascalCase so a stray word like `on` — which really
  // is a `@fluentui/utilities` export — does not become an index key.
  const known = knownExports instanceof Set ? knownExports : new Set(knownExports);
  const attach = (rows, explicitField) =>
    rows.map((row) => {
      const names = [];
      const push = (n) => {
        if (n && !names.includes(n)) names.push(n);
      };
      for (const n of row[explicitField] ?? []) push(n);
      for (const tok of `${row.name} ${row.v8 ?? ''}`.match(/[A-Za-z_$][A-Za-z0-9_$]*/g) ?? []) {
        if (!isPascalExport(tok)) continue;
        if (known.has(tok) || upstream.exports.v8[tok]) push(tok);
      }
      return { ...row, v8Names: names };
    });

  const collisionRows = attach(
    collisions.map((c) => ({ ...c, _seed: [c.name] })),
    '_seed'
  ).map(({ _seed, ...rest }) => rest);
  const casingRows = attach(
    casingTraps.map((c) => ({ ...c, _seed: [c.v8Name] })),
    '_seed'
  ).map(({ _seed, ...rest }) => rest);
  const renameRows = NAME_CLASS_PROSE.renames.map((r, i) => ({
    ...renames[i],
    v8Names: (r.alsoIndex ?? [r.v8Name]).filter((n) => known.has(n) || upstream.exports.v8[n]),
  }));
  const behaviorRows = attach(
    behaviorTraps.map((t) => ({ ...t, _seed: t.appliesTo })),
    '_seed'
  ).map(({ _seed, ...rest }) => rest);

  return {
    collisions: collisionRows,
    renames: renameRows,
    casingTraps: casingRows,
    behaviorTraps: behaviorRows,
    warnings,
  };
}

/**
 * Executable migration tooling that upstream actually ships. Paths are fetched
 * so the rule list, the shim export list and every version are DERIVED — the
 * previous guidance described these packages in prose and quoted versions by
 * hand, which is how `@fluentui/react-nav 9.4.3` outlived upstream's 9.4.4.
 */
export const UPSTREAM_TOOLING_PATHS = {
  codemodsReadme: 'packages/codemods/README.md',
  codemodMods: [
    'packages/codemods/src/codeMods/mods/componentToCompat/componentToCompat.mod.ts',
    'packages/codemods/src/codeMods/mods/configMod/configMod.mod.ts',
    'packages/codemods/src/codeMods/mods/officeToFluentImport/officeToFluentImport.mod.ts',
    'packages/codemods/src/codeMods/mods/oldToNewButton/oldToNewButton.mod.ts',
    'packages/codemods/src/codeMods/mods/personaToAvatar/personaToAvatar.mod.ts',
  ],
  codemodUpgradesJson: 'packages/codemods/src/codeMods/mods/upgrades.json',
  shimIndex: 'packages/react-components/react-migration-v8-v9/library/src/index.ts',
  shimApi: 'packages/react-components/react-migration-v8-v9/library/etc/react-migration-v8-v9.api.md',
  shimReadme: 'packages/react-components/react-migration-v8-v9/library/README.md',
  v0ShimIndex: 'packages/react-components/react-migration-v0-v9/library/src/index.ts',
  v0ShimReadme: 'packages/react-components/react-migration-v0-v9/library/README.md',
};

/** Parse one `*.mod.ts` for the fields the codemod runner reads. */
export function parseCodemod(path, source) {
  const str = (re) => re.exec(source)?.[1] ?? null;
  const enabled = /enabled:\s*(true|false)/.exec(source);
  const comment = /enabled:\s*(?:true|false),?\s*\/\/\s*(.+)/.exec(source);
  return {
    id: path.split('/').at(-2),
    name: str(/name:\s*'([^']+)'/) ?? str(/name:\s*"([^"]+)"/),
    version: str(/version:\s*'([^']+)'/),
    enabled: enabled ? enabled[1] === 'true' : null,
    enabledNote: comment ? comment[1].trim() : null,
    path,
  };
}

/** The `-n / -r / -e / -l / -c` bullets in the codemods README. */
export function parseCodemodFlags(readme) {
  const flags = [];
  for (const line of String(readme ?? '').split(/\r?\n/)) {
    const m = /^\s*-\s*`(-[a-zA-Z])`\s*(.+)$/.exec(line);
    if (m) flags.push({ flag: m[1], description: m[2].replace(/\s+/g, ' ').trim() });
  }
  return flags;
}

/**
 * Every name a `export { A, B } from './x'` barrel re-exports, split into
 * values and types — a type-only export is not something you can call, so
 * listing `ColorVariants` beside `createV8Theme` would be misleading.
 */
export function parseBarrelExports(source) {
  const values = [];
  const types = [];
  const re = /export\s+(type\s+)?\{([^}]*)\}\s+from/g;
  let m;
  while ((m = re.exec(String(source ?? ''))) !== null) {
    const typeOnly = Boolean(m[1]);
    for (const raw of m[2].split(',')) {
      const isTypeMember = /\btype\b/.test(raw);
      const n = raw.replace(/\btype\b/g, '').trim().split(/\s+as\s+/).pop();
      if (!n || !/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(n)) continue;
      const bucket = typeOnly || isTypeMember ? types : values;
      if (!bucket.includes(n)) bucket.push(n);
    }
  }
  return { values, types };
}

/** `export const createV8Theme: (...) => Theme_2;` -> a quotable signature. */
export function parseApiSignatures(apiMd, names) {
  const out = {};
  const lines = String(apiMd ?? '').split(/\r?\n/);
  for (const n of names) {
    const i = lines.findIndex((l) => new RegExp(`^export (declare )?const ${n}\\b`).test(l));
    if (i > -1) out[n] = lines[i].replace(/^export (declare )?/, '').replace(/;\s*$/, '');
  }
  return out;
}

async function fetchText(path, ref) {
  const res = await fetch(UPSTREAM.raw(path, ref));
  return res.ok ? await res.text() : null;
}

export async function fetchTooling({ ref = UPSTREAM.defaultRef, log = () => {} } = {}) {
  log('fetching migration tooling sources');
  const codemodsReadme = await fetchText(UPSTREAM_TOOLING_PATHS.codemodsReadme, ref);
  const mods = [];
  for (const p of UPSTREAM_TOOLING_PATHS.codemodMods) {
    const src = await fetchText(p, ref);
    if (src) mods.push(parseCodemod(p, src));
  }
  const upgradesRaw = await fetchText(UPSTREAM_TOOLING_PATHS.codemodUpgradesJson, ref);
  let upgrades = null;
  try {
    upgrades = upgradesRaw ? JSON.parse(upgradesRaw) : null;
  } catch {
    upgrades = null;
  }
  const shimIndex = await fetchText(UPSTREAM_TOOLING_PATHS.shimIndex, ref);
  const shimApi = await fetchText(UPSTREAM_TOOLING_PATHS.shimApi, ref);
  const shimReadme = await fetchText(UPSTREAM_TOOLING_PATHS.shimReadme, ref);
  const v0Index = await fetchText(UPSTREAM_TOOLING_PATHS.v0ShimIndex, ref);
  const v0Readme = await fetchText(UPSTREAM_TOOLING_PATHS.v0ShimReadme, ref);

  const shimExports = parseBarrelExports(shimIndex);
  const v0Exports = parseBarrelExports(v0Index);
  return {
    codemods: {
      readmeTagline: /^Tool .+$/m.exec(String(codemodsReadme ?? '').split('\n').slice(0, 6).join('\n'))?.[0] ?? null,
      flags: parseCodemodFlags(codemodsReadme),
      mods,
      upgradesJsonIsTemplate: Boolean(upgrades && (upgrades.upgrades ?? []).every((u) => !u.name)),
      paths: {
        readme: UPSTREAM_TOOLING_PATHS.codemodsReadme,
        mods: UPSTREAM_TOOLING_PATHS.codemodMods,
        upgradesJson: UPSTREAM_TOOLING_PATHS.codemodUpgradesJson,
      },
    },
    shims: {
      exports: shimExports.values,
      components: shimExports.values.filter((n) => n.endsWith('Shim')),
      propShims: shimExports.values.filter((n) => n.startsWith('shim')),
      themeExports: shimExports.values.filter((n) => !n.endsWith('Shim') && !n.startsWith('shim')),
      types: shimExports.types,
      signatures: parseApiSignatures(shimApi, ['createV8Theme', 'createV9Theme', 'createBrandVariants']),
      guidance: (String(shimReadme ?? '').match(/^Our recommendation[^\n]*/m) ?? [null])[0],
      bundleWarning: (String(shimReadme ?? '').match(/^Shims depend on both[^\n]*/m) ?? [null])[0],
      paths: { index: UPSTREAM_TOOLING_PATHS.shimIndex, api: UPSTREAM_TOOLING_PATHS.shimApi, readme: UPSTREAM_TOOLING_PATHS.shimReadme },
    },
    v0Shims: {
      exports: v0Exports.values,
      types: v0Exports.types,
      warning: (String(v0Readme ?? '').match(/^These are not production-ready[^\n]*/m) ?? [null])[0],
      paths: { index: UPSTREAM_TOOLING_PATHS.v0ShimIndex, readme: UPSTREAM_TOOLING_PATHS.v0ShimReadme },
    },
  };
}

/* ---- compat packages: what each one is FOR ------------------------- *
 * Versions and the `private` flag come from upstream; only the sentence
 * describing the package is written here, each traceable to its README.
 */
const COMPAT_PROSE = {
  '@fluentui/react-calendar-compat': {
    provides: 'The v8 Calendar (month/year/decade views) ported onto the v9 toolset with zero v8 dependencies.',
    whenToUse: 'You need a calendar in a v9 app. v9 has no Calendar of its own.',
    import: "import { Calendar } from '@fluentui/react-calendar-compat';",
    readme: 'packages/react-components/react-calendar-compat/library/README.md',
  },
  '@fluentui/react-datepicker-compat': {
    provides: 'The v8 DatePicker on v9, keeping most of the v8 API surface.',
    whenToUse: 'Migrating a screen that uses v8 DatePicker — this is the only supported v9 target.',
    import: "import { DatePicker } from '@fluentui/react-datepicker-compat';",
    readme: 'packages/react-components/react-datepicker-compat/library/README.md',
  },
  '@fluentui/react-timepicker-compat': {
    provides: 'A v8-style TimePicker built on v9 Combobox + Field.',
    whenToUse: 'You need time selection in a v9 app.',
    import: "import { TimePicker } from '@fluentui/react-timepicker-compat';",
    readme: 'packages/react-components/react-timepicker-compat/library/README.md',
  },
  '@fluentui/react-icons-compat': {
    provides: 'v8 icon utility functions (registerIcons and friends) usable from a v9 app.',
    whenToUse:
      'ONLY if you still depend on v8 icon registration. Otherwise use @fluentui/react-icons directly — that is the README\'s own recommendation.',
    import: "import { registerIcons } from '@fluentui/react-icons-compat';",
    readme: 'packages/react-components/react-icons-compat/library/README.md',
  },
  '@fluentui/react-portal-compat': {
    provides:
      'PortalCompatProvider — makes v9 portalled surfaces (Dialog/Popover/Tooltip/Menu) inherit v9 CSS variables when they mount inside a portal created by v8 or Northstar.',
    whenToUse:
      'ALWAYS, in any app running v8 and v9 together. Without it, v9 overlays render unthemed. It must be an inner child of FluentProvider.',
    import:
      "import { FluentProvider } from '@fluentui/react-components';\nimport { PortalCompatProvider } from '@fluentui/react-portal-compat';\n\n<FluentProvider>\n  <PortalCompatProvider>{/* your components */}</PortalCompatProvider>\n</FluentProvider>",
    readme: 'packages/react-components/react-portal-compat/README.md',
  },
  '@fluentui/react-portal-compat-context': {
    provides: 'The context primitive behind PortalCompatProvider; @fluentui/react depends on it directly.',
    whenToUse: 'Transitively. You do not normally install this yourself.',
    import: null,
    readme: null,
  },
};

/** Build the executable-tooling block for mcp/data/migration.json. */
export function buildMigrationTooling(upstream, tooling) {
  const v = (pkg) => upstream.versions[pkg] ?? null;
  const src = (path) => `https://github.com/${UPSTREAM.repo}/blob/${upstream.ref}/${path}`;

  const compatPackages = Object.entries(COMPAT_PROSE).map(([pkg, prose]) => {
    const info = v(pkg);
    return {
      package: pkg,
      version: info?.version ?? null,
      private: info?.private ?? null,
      installable: info ? !info.private : null,
      provides: prose.provides,
      whenToUse: prose.whenToUse,
      install: info && !info.private ? `npm install ${pkg}` : null,
      import: prose.import,
      source: prose.readme ? src(prose.readme) : null,
    };
  });

  const neverRecommend = Object.entries(upstream.versions)
    .filter(([, info]) => info.private)
    .map(([pkg, info]) => ({
      package: pkg,
      reason:
        `"private": true in ${info.path} — it is never published to npm, so "npm install ${pkg}" cannot succeed.`,
      source: src(info.path),
    }));

  return {
    title: 'Executable migration tooling — the real packages, commands and imports Microsoft ships',
    summary:
      'There is NO official v8 -> v9 codemod. What upstream does ship is: (1) @fluentui/codemods, which upgrades an Office-UI-Fabric / pre-v8 codebase UP TO v8; (2) @fluentui/react-migration-v8-v9 shims + theme bridge, so v8 call sites can render v9; (3) *-compat packages that give a v9 app the v8 features v9 never got. Use them in that order.',
    verifiedFrom: {
      repo: `https://github.com/${UPSTREAM.repo}`,
      ref: upstream.ref,
      fetchedOn: upstream.fetchedOn,
      note: 'Every version below is read from the upstream package.json at build time, never hand-written.',
    },
    decisionTable: [
      {
        situation: 'Codebase still imports from `office-ui-fabric-react` or `@uifabric/*`',
        use: '@fluentui/codemods',
        command: 'npx @fluentui/codemods',
        why: 'Re-paths the old package names to `@fluentui/*` v8. Do this BEFORE thinking about v9.',
      },
      {
        situation: 'Large v8 app, cannot rewrite every call site at once',
        use: '@fluentui/react-migration-v8-v9',
        command: 'npm install @fluentui/react-migration-v8-v9',
        why: 'Shims take v8 props and render v9 underneath, so a screen can move without touching its call sites.',
      },
      {
        situation: 'v8 and v9 running in the same tree',
        use: '@fluentui/react-portal-compat',
        command: 'npm install @fluentui/react-portal-compat',
        why: 'Without PortalCompatProvider, every v9 Dialog/Popover/Tooltip renders unthemed.',
      },
      {
        situation: 'v9 app needs Calendar / DatePicker / TimePicker (v9 has none)',
        use: '*-compat packages',
        command: 'npm install @fluentui/react-datepicker-compat',
        why: 'v8 components rebuilt on the v9 toolset. Versioned 0.x and allowed to break — pin them.',
      },
      {
        situation: 'Migrating from Fluent UI Northstar (v0)',
        use: '@fluentui/react-migration-v0-v9',
        command: 'npm install @fluentui/react-migration-v0-v9',
        why: 'Northstar -> v9 shims. Read the warning below before shipping it.',
      },
    ],
    codemods: {
      package: '@fluentui/codemods',
      version: v('@fluentui/codemods')?.version ?? null,
      private: v('@fluentui/codemods')?.private ?? null,
      scope: tooling.codemods.readmeTagline,
      criticalCaveat:
        'This is NOT a v8 -> v9 converter. It upgrades a pre-v8 / office-ui-fabric-react codebase up to v8. Nothing in this package emits v9 code.',
      command: 'npx @fluentui/codemods',
      listRulesCommand: 'npx @fluentui/codemods -l',
      runOneRuleCommand: 'npx @fluentui/codemods -n RepathOfficeImportsToFluent',
      configFile: {
        name: 'modConfig.json',
        shape: { stringFilters: [], regexFilters: [], includeMods: true },
        note: 'Place in the repo root and pass -c instead of using command-line filters.',
      },
      flags: tooling.codemods.flags,
      rules: tooling.codemods.mods.map((m) => ({
        ...m,
        runnable: m.enabled === true,
        source: src(m.path),
      })),
      enabledRules: tooling.codemods.mods.filter((m) => m.enabled === true).map((m) => m.name),
      disabledRules: tooling.codemods.mods.filter((m) => m.enabled === false).map((m) => m.name),
      upgradesJson: {
        path: UPSTREAM_TOOLING_PATHS.codemodUpgradesJson,
        source: src(UPSTREAM_TOOLING_PATHS.codemodUpgradesJson),
        isEmptyTemplate: tooling.codemods.upgradesJsonIsTemplate,
        note: tooling.codemods.upgradesJsonIsTemplate
          ? 'Upstream ships this file as an EMPTY template — the `configMod` rule is enabled but has nothing to run until you fill it in with your own {name,type,version,options.from,options.to} rows.'
          : null,
      },
      source: src(UPSTREAM_TOOLING_PATHS.codemodsReadme),
    },
    shims: {
      package: '@fluentui/react-migration-v8-v9',
      version: v('@fluentui/react-migration-v8-v9')?.version ?? null,
      private: v('@fluentui/react-migration-v8-v9')?.private ?? null,
      install: 'npm install @fluentui/react-migration-v8-v9',
      whatItDoes:
        'Each shim exposes a v8 component\'s props interface and renders the v9 component underneath, so an existing v8 call site keeps compiling while the rendered output becomes Fluent 2.',
      componentAreas: ['Button', 'Checkbox', 'Menu', 'Stack', 'Theme'],
      componentAreasSource: `https://github.com/${UPSTREAM.repo}/tree/${upstream.ref}/packages/react-components/react-migration-v8-v9/library/src/components`,
      components: tooling.shims.components,
      propShims: tooling.shims.propShims,
      themeExports: tooling.shims.themeExports,
      typeExports: tooling.shims.types,
      themeBridge: [
        {
          name: 'createV8Theme',
          signature: tooling.shims.signatures.createV8Theme ?? null,
          whatItDoes: 'Builds a v8 Theme from v9 brand variants + a v9 theme, so v8 components inherit the Fluent 2 palette.',
          whenToUse: 'v9 is the source of truth and you still render v8 components (charts, DetailsList, Panel).',
          import: "import { createV8Theme } from '@fluentui/react-migration-v8-v9';",
        },
        {
          name: 'createV9Theme',
          signature: tooling.shims.signatures.createV9Theme ?? null,
          whatItDoes: 'The opposite direction — derives a v9 Theme from an existing v8 Theme.',
          whenToUse: 'v8 owns the brand (an existing product theme) and you are adding v9 UI beside it.',
          import: "import { createV9Theme } from '@fluentui/react-migration-v8-v9';",
        },
        {
          name: 'createBrandVariants',
          signature: tooling.shims.signatures.createBrandVariants ?? null,
          whatItDoes: 'Turns a v8 IPalette into a v9 BrandVariants ramp (the 16-step brand scale v9 themes are built from).',
          whenToUse: 'First step when the only brand definition you have is a v8 palette.',
          import: "import { createBrandVariants } from '@fluentui/react-migration-v8-v9';",
        },
      ],
      guidance: tooling.shims.guidance,
      bundleWarning: tooling.shims.bundleWarning,
      source: src(UPSTREAM_TOOLING_PATHS.shimIndex),
    },
    v0Shims: {
      package: '@fluentui/react-migration-v0-v9',
      version: v('@fluentui/react-migration-v0-v9')?.version ?? null,
      private: v('@fluentui/react-migration-v0-v9')?.private ?? null,
      install: 'npm install @fluentui/react-migration-v0-v9',
      whatItDoes: 'Shims for migrating Fluent UI React Northstar (v0) to v9.',
      exports: tooling.v0Shims.exports,
      warning: tooling.v0Shims.warning,
      source: src(UPSTREAM_TOOLING_PATHS.v0ShimIndex),
    },
    compatPackages,
    neverRecommend,
    eslint: {
      package: '@fluentui/eslint-plugin-react-components',
      rules: ['prefer-fluentui-v9', 'enforce-use-client'],
      whatItDoes: 'Flags v8 imports that already have a v9 equivalent, so the migration cannot regress.',
      note: 'Version not derived here — this package is not in the version set above; treat the rule names as the verified part.',
    },
  };
}
/**
 * Sync the v8 dataset's own migration block to the derived upstream facts.
 * `migration.shims.version` and every compat-package version were previously
 * hand-copied and had already drifted a patch behind.
 */
export function applyMigrationFacts(data, upstream, tooling) {
  const m = (data.migration ??= {});
  const v = (pkg) => upstream.versions[pkg] ?? null;

  m.shims = {
    ...(m.shims ?? {}),
    package: '@fluentui/react-migration-v8-v9',
    version: v('@fluentui/react-migration-v8-v9')?.version ?? m.shims?.version ?? null,
    components: tooling.shims.components,
    propShims: tooling.shims.propShims,
    themeExports: tooling.shims.themeExports,
    themeBridge: Object.entries(tooling.shims.signatures).map(([name, signature]) => ({ name, signature })),
    guidance: tooling.shims.guidance ?? m.shims?.guidance ?? null,
    source: `https://github.com/${UPSTREAM.repo}/blob/${upstream.ref}/${UPSTREAM_TOOLING_PATHS.shimIndex}`,
  };

  const byPackage = new Map((m.compatPackages ?? []).map((p) => [p.package, p]));
  for (const [pkg, info] of Object.entries(upstream.versions)) {
    if (!/-compat$/.test(pkg) && pkg !== '@fluentui/react-portal-compat-context') continue;
    const prev = byPackage.get(pkg) ?? { package: pkg };
    byPackage.set(pkg, {
      ...prev,
      version: info.version,
      published: !info.private,
      installable: !info.private,
      provides: COMPAT_PROSE[pkg]?.provides ?? prev.provides ?? null,
      note: info.private ? '❌ "private": true — NOT published to npm. Never recommend installing it.' : '✅',
      source: `https://github.com/${UPSTREAM.repo}/blob/${upstream.ref}/${info.path}`,
    });
  }
  m.compatPackages = [...byPackage.values()].sort((a, b) => (a.package < b.package ? -1 : 1));

  m.tooling = {
    ...(m.tooling ?? {}),
    officialV8ToV9Codemod: false,
    codemodsPackage: '@fluentui/codemods',
    codemodsVersion: v('@fluentui/codemods')?.version ?? null,
    codemodsScope: tooling.codemods.readmeTagline,
    codemodsPackageNote:
      '@fluentui/codemods upgrades a pre-v8 / office-ui-fabric-react codebase UP TO v8. It is not a v8→v9 tool. Do not recommend it as a v9 migration step — but DO recommend it as the step before one, if the codebase still imports office-ui-fabric-react or @uifabric/*.',
    codemodRules: tooling.codemods.mods.map((r) => ({
      name: r.name,
      id: r.id,
      enabled: r.enabled,
      enabledNote: r.enabledNote,
      source: `https://github.com/${UPSTREAM.repo}/blob/${upstream.ref}/${r.path}`,
    })),
    eslintPlugin: '@fluentui/eslint-plugin-react-components',
    eslintRules: ['prefer-fluentui-v9', 'enforce-use-client'],
    executableSteps: 'See mcp/data/migration.json -> scenarios.tooling for the full runnable command/import set.',
  };
  return data;
}

/** Index rows by the exported name they answer to, not by array position. */
export function buildClassIndex(rows) {
  const idx = {};
  for (const row of rows) {
    // collision/rename rows key on `name`; the legacy traps table keys on
    // `component`. Indexing the wrong field silently produces [null] entries.
    const key = row.name ?? row.component;
    if (!key) continue;
    for (const n of row.v8Names ?? []) {
      (idx[n] ??= []).push(key);
    }
  }
  return sortKeys(idx);
}

/**
 * Patch an already-built dataset with recomputed name classes + versions.
 * Kept separate from `build()` so the classes can be refreshed from upstream
 * without the research folder, which is what actually happens in practice.
 */
export function applyNameClasses(data, upstream, built) {
  data.collisions = built.collisions;
  data.collisionIndex = buildClassIndex(built.collisions);
  data.renames = built.renames;
  data.renameIndex = buildClassIndex(built.renames);
  data.casingTraps = built.casingTraps;
  data.casingTrapIndex = buildClassIndex(built.casingTraps);
  data.behaviorTraps = built.behaviorTraps;
  data.behaviorTrapIndex = buildClassIndex(built.behaviorTraps);
  data.trapIndex = buildClassIndex(data.traps ?? []);

  data.meta ??= {};
  data.meta.verifiedVersions = sortKeys({
    ...(data.meta.verifiedVersions ?? {}),
    ...Object.fromEntries(
      Object.entries(upstream.versions)
        .filter(([, v]) => v.version && !v.private)
        .map(([k, v]) => [k, v.version])
    ),
  });
  data.meta.v9Baseline = upstream.versions['@fluentui/react-components']?.version
    ? `@fluentui/react-components@${upstream.versions['@fluentui/react-components'].version}`
    : data.meta.v9Baseline ?? null;
  data.meta.upstreamApiReports = {
    repo: `https://github.com/${UPSTREAM.repo}`,
    ref: upstream.ref,
    fetchedOn: upstream.fetchedOn,
    reports: upstream.reports,
    computed: upstream.computed,
    method:
      'collisions = PascalCase exports present in BOTH reports; casingTraps = present in both only when compared case-insensitively. Membership is computed, never curated. Note API Extractor emits aliased re-exports (`export { Image_2 as Image }`) for names that clash with a local symbol — a parser that only reads `export { X }` misses Image, PartialTheme, SelectionMode, Text and Theme and reports 21 collisions instead of 26.',
  };
  data.meta.upstreamPackageVersions = {
    source: `https://github.com/${UPSTREAM.repo} package.json files on ref "${upstream.ref}"`,
    fetchedOn: upstream.fetchedOn,
    packages: sortKeys(upstream.versions),
    note: 'Read from upstream package.json at build time. `private: true` packages are recorded here but must never be recommended for install.',
  };

  const priv = Object.entries(upstream.versions)
    .filter(([, v]) => v.private)
    .map(([k]) => k);
  data.unverified = (data.unverified ?? []).filter(
    (u) => !String(u.note ?? '').startsWith('[name-classes]') && !String(u.note ?? '').startsWith('[versions]')
  );
  for (const w of built.warnings) {
    data.unverified.push({ source: 'scripts/build-v8-data.mjs', note: `[name-classes] ${w}` });
  }
  for (const p of upstream.versionMisses ?? []) {
    data.unverified.push({
      source: 'scripts/build-v8-data.mjs',
      note: `[versions] could not resolve a package.json for ${p} in ${UPSTREAM.repo}@${upstream.ref}; no version is quoted for it.`,
    });
  }
  if (priv.length) {
    data.meta.upstreamPackageVersions.privatePackages = priv;
  }
  if (!upstream.versions['@fluentui/eslint-plugin-react-components']) {
    data.unverified.push({
      source: 'scripts/build-v8-data.mjs',
      note: '[versions] @fluentui/eslint-plugin-react-components is quoted for its rule names (prefer-fluentui-v9, enforce-use-client) but no version was resolved from the monorepo, so none is published here.',
    });
  }

  data.meta.datasetCounts = {
    ...(data.meta.datasetCounts ?? {}),
    components: Object.keys(data.components ?? {}).length,
    collisions: data.collisions.length,
    renames: data.renames.length,
    casingTraps: data.casingTraps.length,
    behaviorTraps: data.behaviorTraps.length,
    traps: (data.traps ?? []).length,
    unverified: data.unverified.length,
    note: 'Measured from this file. Regenerate with scripts/build-v8-data.mjs.',
  };
  return data;
}

/* ------------------------------------------------------------------ *
 * main
 * ------------------------------------------------------------------ */

/**
 * `--refresh-upstream` recomputes only the name classes + versions against the
 * live API reports and patches the existing dataset. It deliberately does NOT
 * need the research folder: the research extracts are frozen, the upstream API
 * is not, and the collision list is the part that goes stale dangerously.
 */
async function refreshUpstreamMain(args) {
  const outFile = typeof args.out === 'string' ? resolve(args.out) : DEFAULT_OUT;
  const ref = typeof args.ref === 'string' ? args.ref : UPSTREAM.defaultRef;
  const quiet = Boolean(args.json);
  const log = (m) => {
    if (!quiet) process.stderr.write(m + '\n');
  };

  const data = readJsonIfExists(outFile);
  if (!data) {
    process.stderr.write(`ERROR: ${outFile} does not exist — run a full build first.\n`);
    process.exit(2);
  }

  const upstream = await fetchUpstream({ ref, log });
  const tooling = await fetchTooling({ ref, log });
  const knownExports = new Set([
    ...Object.keys(data.exportIndex ?? {}),
    ...Object.keys(data.components ?? {}),
  ]);
  const built = buildNameClasses(upstream, knownExports);
  applyNameClasses(data, upstream, built);
  applyMigrationFacts(data, upstream, tooling);

  const text = JSON.stringify(data, null, 2) + '\n';

  // The adoption dataset quotes the same packages, so refresh it in the same
  // pass — two files disagreeing about a version is worse than one being old.
  const migrationFile =
    typeof args['migration-out'] === 'string' ? resolve(args['migration-out']) : DEFAULT_MIGRATION_OUT;
  const migrationData = readJsonIfExists(migrationFile);
  let migrationText = null;
  if (migrationData) {
    migrationData.scenarios ??= {};
    migrationData.scenarios.tooling = buildMigrationTooling(upstream, tooling);
    migrationData.$meta ??= {};
    migrationData.$meta.packageVersionsSeen = Object.fromEntries(
      Object.entries(upstream.versions)
        .filter(([, info]) => info.version)
        .map(([pkg, info]) => [pkg, info.private ? `${info.version} (private — never published)` : info.version])
    );
    migrationData.$meta.packageVersionSource = {
      repo: `https://github.com/${UPSTREAM.repo}`,
      ref: upstream.ref,
      fetchedOn: upstream.fetchedOn,
      method: 'Read from each package.json in the monorepo at build time by scripts/build-v8-data.mjs --refresh-upstream.',
    };
    // v8ToV9 must point at the executable steps, not restate them.
    if (migrationData.scenarios.v8ToV9) {
      migrationData.scenarios.v8ToV9.executableTooling =
        'Runnable commands, codemod rule list, shim exports, theme-bridge signatures and compat packages (with versions read from upstream) are in scenarios.tooling — request scenario="tooling".';
    }
    migrationText = JSON.stringify(migrationData, null, 2) + '\n';
  }

  if (args.check) {
    const current = readFileSync(outFile, 'utf8');
    if (current !== text) {
      process.stderr.write(`ERROR: ${outFile} is out of date (re-run without --check)\n`);
      process.exit(1);
    }
    if (migrationText && readFileSync(migrationFile, 'utf8') !== migrationText) {
      process.stderr.write(`ERROR: ${migrationFile} is out of date (re-run without --check)\n`);
      process.exit(1);
    }
  } else {
    writeFileSync(outFile, text, 'utf8');
    if (migrationText) writeFileSync(migrationFile, migrationText, 'utf8');
  }

  const summary = {
    out: outFile,
    migrationOut: migrationText ? migrationFile : null,
    ref: upstream.ref,
    fetchedOn: upstream.fetchedOn,
    reports: upstream.reports,
    counts: {
      ...upstream.computed.counts,
      renames: built.renames.length,
      behaviorTraps: built.behaviorTraps.length,
      codemodRules: tooling.codemods.mods.length,
      codemodRulesEnabled: tooling.codemods.mods.filter((m) => m.enabled === true).length,
      shimComponents: tooling.shims.components.length,
    },
    collisions: built.collisions.map((c) => c.name),
    casingTraps: built.casingTraps.map((c) => `${c.v8Name} / ${c.v9Name}`),
    privatePackages: Object.entries(upstream.versions)
      .filter(([, v]) => v.private)
      .map(([k]) => k),
    warnings: built.warnings,
  };
  process.stdout.write(JSON.stringify(summary, null, 2) + '\n');
  process.exit(0);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args['refresh-upstream']) {
    refreshUpstreamMain(args).catch((err) => {
      process.stderr.write(`ERROR: ${err.message}\n`);
      process.exit(2);
    });
    return;
  }
  const outFile = typeof args.out === 'string' ? resolve(args.out) : DEFAULT_OUT;

  let dir;
  try {
    dir = resolveResearchDir(typeof args.research === 'string' ? args.research : null);
  } catch (err) {
    process.stderr.write(`ERROR: ${err.message}\n`);
    process.exit(2);
  }

  const { data, warnings, sources } = build(dir);
  // A full research rebuild cannot recompute the name classes — those come
  // from the live upstream API reports, not from the frozen research extracts.
  // Carry them over rather than letting a rebuild silently revert to the old
  // hand-curated collision list.
  const existing = readJsonIfExists(outFile);
  if (existing?.meta?.upstreamApiReports) {
    for (const k of [
      'collisions',
      'collisionIndex',
      'renames',
      'renameIndex',
      'casingTraps',
      'casingTrapIndex',
      'behaviorTraps',
      'behaviorTrapIndex',
    ]) {
      if (existing[k] !== undefined) data[k] = existing[k];
    }
    data.meta.upstreamApiReports = existing.meta.upstreamApiReports;
    data.meta.upstreamPackageVersions = existing.meta.upstreamPackageVersions;
    data.meta.verifiedVersions = sortKeys({
      ...data.meta.verifiedVersions,
      ...(existing.meta.verifiedVersions ?? {}),
    });
    data.trapIndex = buildClassIndex(data.traps ?? []);
    data.meta.datasetCounts = existing.meta.datasetCounts ?? data.meta.datasetCounts;
    warnings.push(
      'name classes (collisions/renames/casingTraps/behaviorTraps) were carried over from the existing file — re-run with --refresh-upstream to recompute them against microsoft/fluentui.'
    );
  }
  const v = validate(data);
  const text = JSON.stringify(data, null, 2) + '\n';

  const allWarnings = [...warnings, ...v.warnings];

  if (args.check) {
    const current = existsSync(outFile) ? readFileSync(outFile, 'utf8') : null;
    if (current !== text) {
      process.stderr.write(`ERROR: ${outFile} is out of date (re-run without --check)\n`);
      process.exit(1);
    }
  } else if (!v.errors.length) {
    writeFileSync(outFile, text, 'utf8');
  }

  const summary = {
    research: dir,
    out: outFile,
    bytes: v.bytes,
    sources: sources.map((s) => s.file),
    counts: v.counts,
    warnings: allWarnings,
    errors: v.errors,
  };

  if (args.json) {
    process.stdout.write(JSON.stringify(summary, null, 2) + '\n');
  } else {
    const L = [];
    L.push(`research: ${dir}`);
    L.push(`inputs:   ${sources.map((s) => s.file).join(', ')}`);
    L.push(`output:   ${outFile} (${v.bytes.toLocaleString('en-US')} bytes)`);
    L.push('');
    L.push('SECTION COUNTS');
    const width = Math.max(...Object.keys(v.counts).map((k) => k.length));
    for (const [k, n] of Object.entries(v.counts)) {
      L.push(`  ${k.padEnd(width)}  ${String(n).padStart(5)}${n === 0 ? '   <-- EMPTY' : ''}`);
    }
    if (allWarnings.length) {
      L.push('');
      L.push('WARNINGS');
      for (const w of allWarnings) L.push(`  ! ${w}`);
    }
    if (v.errors.length) {
      L.push('');
      L.push('ERRORS (nothing written)');
      for (const e of v.errors) L.push(`  x ${e}`);
    }
    process.stdout.write(L.join('\n') + '\n');
  }

  process.exit(v.errors.length ? 1 : 0);
}

if (isMain(import.meta.url)) main();
