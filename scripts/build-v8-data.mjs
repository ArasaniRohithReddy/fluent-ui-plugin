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
 */

import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname, resolve, basename } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '..');
const DEFAULT_OUT = join(REPO_ROOT, 'mcp', 'data', 'fluent-v8.json');

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
      counts: componentsJson?.meta?.counts ?? null,
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

/* ------------------------------------------------------------------ *
 * main
 * ------------------------------------------------------------------ */

function main() {
  const args = parseArgs(process.argv.slice(2));
  const outFile = typeof args.out === 'string' ? resolve(args.out) : DEFAULT_OUT;

  let dir;
  try {
    dir = resolveResearchDir(typeof args.research === 'string' ? args.research : null);
  } catch (err) {
    process.stderr.write(`ERROR: ${err.message}\n`);
    process.exit(2);
  }

  const { data, warnings, sources } = build(dir);
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
