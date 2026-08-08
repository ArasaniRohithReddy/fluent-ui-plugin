/**
 * Deterministic PBIR (Power BI enhanced report format) tooling.
 *
 * Why this exists
 * ---------------
 * A Power BI custom theme only styles properties a visual has NOT overridden
 * inline. Real reports carry inline `visual.visualContainerObjects` overrides on
 * 68-95 percent of visuals for exactly the properties a Fluent 2 theme sets, so
 * registering a theme on its own changes almost nothing.
 *
 * The correct repair is to DELETE the inline override so the theme default
 * applies. Re-tinting the override with a Fluent hex value leaves the override in
 * place and the theme inert; that is an anti-pattern, not a fix.
 *
 * This module is dependency-free ESM so the CLI scripts work without the MCP
 * server, and the MCP tools import the exact same engine.
 */

import {
  readdirSync,
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  statSync,
} from 'node:fs';
import { join, relative, resolve, sep, dirname, basename } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';

/** True when the module at `importMetaUrl` is the entry point Node was started with. */
export function isMain(importMetaUrl) {
  if (!process.argv[1]) return false;
  try {
    return pathToFileURL(resolve(process.argv[1])).href === importMetaUrl;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// File system helpers
// ---------------------------------------------------------------------------

/** Recursively list every file under `dir` (absolute paths). Missing dir returns []. */
export function walk(dir) {
  const out = [];
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p));
    else if (e.isFile()) out.push(p);
  }
  return out;
}

/** True when `child` resolves inside `root`. Guards every write. */
export function isInside(root, child) {
  const r = resolve(root);
  const c = resolve(child);
  return c === r || c.startsWith(r.endsWith(sep) ? r : r + sep);
}

/**
 * Detect the on-disk formatting of a JSON file so a rewrite keeps the same
 * shape (real PBIR reports are CRLF, 2-space, no trailing newline; the plugin
 * templates are LF, 2-space, with a trailing newline).
 */
export function detectStyle(text) {
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const normalized = text.replace(/\r\n/g, '\n');
  const m = /\n([ \t]+)"/.exec(normalized);
  let indent = 2;
  if (m) indent = m[1][0] === '\t' ? '\t' : m[1].length;
  const trailingNewline = /\n$/.test(normalized);
  return { eol, indent, trailingNewline };
}

export const DEFAULT_STYLE = { eol: '\n', indent: 2, trailingNewline: true };

/** Serialize `value` using a detected (or default) style. */
export function stringifyJson(value, style = DEFAULT_STYLE) {
  let s = JSON.stringify(value, null, style.indent ?? 2);
  if ((style.eol ?? '\n') === '\r\n') s = s.replace(/\n/g, '\r\n');
  if (style.trailingNewline) s += style.eol ?? '\n';
  return s;
}

/** Read a JSON file, returning { json, text, style } or null when unreadable. */
export function readJsonFile(path) {
  let text;
  try {
    text = readFileSync(path, 'utf8');
  } catch {
    return null;
  }
  // Strip a UTF-8 BOM before parsing; remember it so a rewrite can restore it.
  const bom = text.charCodeAt(0) === 0xfeff;
  const body = bom ? text.slice(1) : text;
  try {
    return { json: JSON.parse(body), text, style: { ...detectStyle(text), bom } };
  } catch (err) {
    return {
      json: null,
      text,
      style: { ...detectStyle(text), bom },
      error: String(err && err.message),
    };
  }
}

/** Write a JSON file in the given style. Refuses to write outside `root`. */
export function writeJsonFile(root, path, value, style = DEFAULT_STYLE) {
  if (!isInside(root, path)) {
    throw new Error(`refusing to write outside the report directory: ${path}`);
  }
  mkdirSync(dirname(path), { recursive: true });
  let out = stringifyJson(value, style);
  if (style.bom) out = '\uFEFF' + out;
  writeFileSync(path, out, 'utf8');
}

export function sha256(text) {
  return createHash('sha256').update(text).digest('hex');
}

/** Stable hash of a directory tree (path + content), used to prove "untouched". */
export function hashTree(dir) {
  const files = walk(dir).sort();
  const h = createHash('sha256');
  for (const f of files) {
    h.update(relative(dir, f).split(sep).join('/'));
    h.update('\u0000');
    h.update(readFileSync(f));
    h.update('\u0000');
  }
  return h.digest('hex');
}

// ---------------------------------------------------------------------------
// Versions
// ---------------------------------------------------------------------------

/** Compare dotted numeric versions ("2.10.0" is greater than "2.9.0"). */
export function compareVersions(a, b) {
  const pa = String(a).split('.').map((n) => parseInt(n, 10) || 0);
  const pb = String(b).split('.').map((n) => parseInt(n, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d < 0 ? -1 : 1;
  }
  return 0;
}

/** Highest version in a list, or null when the list is empty. */
export function maxVersion(list) {
  let best = null;
  for (const v of list) {
    if (!v) continue;
    if (best === null || compareVersions(v, best) > 0) best = v;
  }
  return best;
}

/**
 * Pull the schema version out of a PBIR $schema URL, e.g.
 * ".../definition/visualContainer/2.10.0/schema.json" gives "2.10.0".
 */
export function schemaVersion(schemaUrl, kind) {
  if (typeof schemaUrl !== 'string') return null;
  const re = kind
    ? new RegExp(`/${kind}/([0-9]+(?:\\.[0-9]+)*)/schema\\.json`)
    : /\/([0-9]+(?:\.[0-9]+)*)\/schema\.json/;
  const m = re.exec(schemaUrl);
  return m ? m[1] : null;
}

// ---------------------------------------------------------------------------
// PBIR inline literal codec
// ---------------------------------------------------------------------------
// PBIR stores inline formatting as
//   { "properties": { "<prop>": { "expr": { "Literal": { "Value": "'#E6E6E6'" } } } } }
// Strings are single-quoted inside Value (a doubled single quote escapes one),
// numbers carry a type suffix (28D, 3L, 1M), booleans and null are bare.
// Colors add a wrapper: { "solid": { "color": <expr-or-hex> } } and may use a
// theme reference: { "ThemeDataColor": { "ColorId": 0, "Percent": 0 } }.
// This is NOT the theme-JSON shape ("border": [{ "show": true, "radius": 8 }]).

/** Decode a raw PBIR Literal.Value string into a JS value. */
export function decodeLiteralValue(raw) {
  if (typeof raw !== 'string') return raw;
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  if (raw === 'null') return null;
  if (/^'[\s\S]*'$/.test(raw)) return raw.slice(1, -1).replace(/''/g, "'");
  const num = /^(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)([DLMFdlmf])?$/.exec(raw);
  if (num) return Number(num[1]);
  return raw;
}

/** Encode a JS value back into a PBIR Literal.Value string. */
export function encodeLiteralValue(value) {
  if (value === null) return 'null';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') return Number.isInteger(value) ? `${value}L` : `${value}D`;
  return `'${String(value).replace(/'/g, "''")}'`;
}

/** Wrap a JS value in the PBIR expression shape. */
export function encodeInline(value) {
  return { expr: { Literal: { Value: encodeLiteralValue(value) } } };
}

/** Wrap a hex color in the PBIR solid-color shape. */
export function encodeInlineColor(hex) {
  return { solid: { color: { expr: { Literal: { Value: `'${hex}'` } } } } };
}

/**
 * Decode one inline property node into { kind, value }.
 * kind is one of: literal, color, themeColor, expression, raw.
 */
export function decodeInline(node) {
  if (node === null || typeof node !== 'object') return { kind: 'raw', value: node };
  if (node.solid && node.solid.color !== undefined) {
    const c = node.solid.color;
    if (typeof c === 'string') return { kind: 'color', value: c };
    const inner = decodeInline(c);
    if (inner.kind === 'literal') return { kind: 'color', value: inner.value };
    return inner.kind === 'raw' ? { kind: 'expression', value: c } : inner;
  }
  if (node.expr && typeof node.expr === 'object') {
    if (node.expr.Literal && typeof node.expr.Literal.Value === 'string') {
      return { kind: 'literal', value: decodeLiteralValue(node.expr.Literal.Value) };
    }
    if (node.expr.ThemeDataColor) {
      return { kind: 'themeColor', value: node.expr.ThemeDataColor };
    }
    return { kind: 'expression', value: node.expr };
  }
  if (node.Literal && typeof node.Literal.Value === 'string') {
    return { kind: 'literal', value: decodeLiteralValue(node.Literal.Value) };
  }
  return { kind: 'raw', value: node };
}

/** Short human-readable rendering of an inline property value (for the ledger). */
export function describeInline(node) {
  const d = decodeInline(node);
  if (d.kind === 'themeColor') {
    return `ThemeDataColor(ColorId=${d.value.ColorId ?? '?'},Percent=${d.value.Percent ?? 0})`;
  }
  if (d.kind === 'expression' || d.kind === 'raw') {
    const s = JSON.stringify(d.value);
    return s && s.length > 120 ? s.slice(0, 117) + '...' : String(s);
  }
  return String(d.value);
}

/** Every hex color literal anywhere inside a JSON value. */
export function collectHexColors(node, sink = new Map()) {
  if (node === null || typeof node !== 'object') {
    if (typeof node === 'string') {
      const m = /^'?(#[0-9a-fA-F]{3,8})'?$/.exec(node.trim());
      if (m) {
        const hex = m[1].toUpperCase();
        sink.set(hex, (sink.get(hex) || 0) + 1);
      }
    }
    return sink;
  }
  for (const v of Object.values(node)) collectHexColors(v, sink);
  return sink;
}

// ---------------------------------------------------------------------------
// Theme ownership
// ---------------------------------------------------------------------------

/**
 * The visual-container cards a Fluent 2 Power BI theme declares under
 * visualStyles["*"]["*"], and the properties it owns in each. Mirrors
 * mcp/data/powerbi-theme.base.json. A property is only ever deleted when it is
 * in this map or is explicitly declared by the theme being applied.
 */
export const FLUENT2_OWNED = {
  background: ['show', 'color', 'transparency'],
  border: ['show', 'color', 'radius', 'width'],
  dropShadow: [
    'show',
    'color',
    'position',
    'preset',
    'shadowSpread',
    'shadowBlur',
    'angle',
    'shadowDistance',
    'transparency',
  ],
  visualHeader: ['show', 'foreground', 'background', 'border', 'transparency'],
  visualTooltip: ['titleFontColor', 'valueFontColor', 'background'],
  title: ['show', 'fontColor', 'fontSize', 'fontFamily', 'alignment'],
  subTitle: ['show'],
  spacing: ['customizeSpacing', 'verticalSpacing'],
};

/**
 * Cards that live on the visual CONTAINER and are therefore normalizable at all.
 * A card outside this list (a data-role card such as labels or dataPoint) is
 * never touched, even if a theme mentions it. Cards here with no entry in
 * FLUENT2_OWNED become owned only when the applied theme declares them.
 */
export const CONTAINER_CARDS = new Set([
  'background',
  'border',
  'dropShadow',
  'visualHeader',
  'visualTooltip',
  'title',
  'subTitle',
  'spacing',
  'padding',
  'stylePreset',
  'divider',
]);

/** The four container cards that carry almost all real-world override damage. */
export const DEFAULT_KEYS = ['background', 'border', 'visualHeader', 'title'];

/**
 * Card.property paths that are content or authored semantics, never styling.
 * They are never deleted, even when their card is targeted and even when a
 * theme happens to declare the same property name.
 */
export const PROTECTED_PROPERTY_PATHS = new Set([
  'title.text',
  'title.heading',
  'subTitle.text',
  'subTitle.heading',
]);

/** Cards that are content or behavior, never theme-owned styling. */
export const PROTECTED_CARDS = new Set(['general', 'visualLink', 'visualHeaderTooltip']);

/**
 * Ownership index. A theme declares defaults under visualStyles["*"]["*"] and
 * may add per-visual-type declarations under visualStyles["<visualType>"]["*"].
 * The effective ownership for a visual is the star declaration merged with the
 * declaration for that visual's own type, never the union across every type
 * (a property declared only under `tableEx` must not be deleted from an image).
 */
class OwnedIndex {
  constructor(star, byType) {
    this.star = star;
    this.byType = byType;
    this._memo = new Map();
  }

  /** Effective card -> Set(property) map for one visual type. */
  forType(visualType) {
    const key = visualType || '*';
    if (this._memo.has(key)) return this._memo.get(key);
    const merged = new Map();
    for (const [card, props] of this.star) merged.set(card, new Set(props));
    const extra = this.byType.get(key);
    if (extra) {
      for (const [card, props] of extra) {
        if (!merged.has(card)) merged.set(card, new Set());
        for (const p of props) merged.get(card).add(p);
      }
    }
    this._memo.set(key, merged);
    return merged;
  }

  /** True when the theme owns card.prop for a visual of this type. */
  owns(visualType, card, prop) {
    return !!this.forType(visualType).get(card)?.has(prop);
  }

  /** Every card the theme can own anywhere (used for reporting and key filters). */
  cards() {
    const out = new Set(this.star.keys());
    for (const m of this.byType.values()) for (const c of m.keys()) out.add(c);
    return out;
  }

  /** Plain-JSON view for tool output. */
  toJSON() {
    const obj = { '*': Object.fromEntries([...this.star].map(([c, s]) => [c, [...s].sort()])) };
    for (const [t, m] of this.byType) {
      obj[t] = Object.fromEntries([...m].map(([c, s]) => [c, [...s].sort()]));
    }
    return obj;
  }
}

/**
 * Build the ownership index for a theme. Starts from the Fluent 2 container
 * declarations and adds whatever the supplied theme actually declares.
 */
export function themeOwnedProperties(themeJson) {
  const star = new Map();
  const byType = new Map();
  const target = (bucket, card) => {
    if (!bucket.has(card)) bucket.set(card, new Set());
    return bucket.get(card);
  };
  const allowed = (card, prop) =>
    !PROTECTED_CARDS.has(card) &&
    CONTAINER_CARDS.has(card) &&
    !PROTECTED_PROPERTY_PATHS.has(`${card}.${prop}`);

  for (const [card, props] of Object.entries(FLUENT2_OWNED)) {
    for (const p of props) if (allowed(card, p)) target(star, card).add(p);
  }

  const styles = themeJson && themeJson.visualStyles;
  if (styles && typeof styles === 'object') {
    for (const [visualType, byState] of Object.entries(styles)) {
      if (!byState || typeof byState !== 'object') continue;
      const bucket = visualType === '*' ? star : target2(byType, visualType);
      for (const cards of Object.values(byState)) {
        if (!cards || typeof cards !== 'object') continue;
        for (const [card, instances] of Object.entries(cards)) {
          if (!CONTAINER_CARDS.has(card)) continue;
          for (const inst of Array.isArray(instances) ? instances : [instances]) {
            if (!inst || typeof inst !== 'object') continue;
            for (const prop of Object.keys(inst)) {
              if (prop.startsWith('$')) continue;
              if (!allowed(card, prop)) continue;
              target(bucket, card).add(prop);
            }
          }
        }
      }
    }
  }
  return new OwnedIndex(star, byType);
}

function target2(byType, visualType) {
  if (!byType.has(visualType)) byType.set(visualType, new Map());
  return byType.get(visualType);
}

// ---------------------------------------------------------------------------
// Report model
// ---------------------------------------------------------------------------

/** Locate the *.Report folder: accepts the report dir itself or a PBIP root. */
export function resolveReportDir(input) {
  const dir = resolve(input);
  if (existsSync(join(dir, 'definition', 'pages'))) return dir;
  if (existsSync(join(dir, 'definition.pbir'))) return dir;
  let children = [];
  try {
    children = readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isDirectory() && e.name.endsWith('.Report'))
      .map((e) => join(dir, e.name));
  } catch {
    /* fall through to the error below */
  }
  if (children.length === 1) return children[0];
  throw new Error(
    `not a PBIR report directory (no definition/pages): ${dir}. ` +
      'PBIR requires the enhanced report format; a binary .pbix or a PBIR-Legacy report.json cannot be edited on disk.'
  );
}

/** Load a PBIR report into an in-memory model. Never mutates disk. */
export function loadReport(input) {
  const dir = resolveReportDir(input);
  const defDir = join(dir, 'definition');
  const reportPath = join(defDir, 'report.json');
  const report = readJsonFile(reportPath);
  if (!report || report.json === null) {
    throw new Error(
      `cannot parse ${reportPath}${report && report.error ? ': ' + report.error : ''}`
    );
  }

  const pagesDir = join(defDir, 'pages');
  const pagesMeta = readJsonFile(join(pagesDir, 'pages.json'));

  const pages = [];
  const visuals = [];
  let pageDirs = [];
  try {
    pageDirs = readdirSync(pagesDir, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort();
  } catch {
    pageDirs = [];
  }

  for (const pd of pageDirs) {
    const pagePath = join(pagesDir, pd, 'page.json');
    const pf = readJsonFile(pagePath);
    if (!pf || pf.json === null) continue;
    const page = {
      dirName: pd,
      path: pagePath,
      relPath: relative(dir, pagePath).split(sep).join('/'),
      json: pf.json,
      style: pf.style,
      name: pf.json.name ?? pd,
      displayName: pf.json.displayName ?? pd,
      width: Number(pf.json.width) || 0,
      height: Number(pf.json.height) || 0,
      schemaVersion: schemaVersion(pf.json.$schema, 'page'),
      visuals: [],
    };

    const visualsDir = join(pagesDir, pd, 'visuals');
    let vDirs = [];
    try {
      vDirs = readdirSync(visualsDir, { withFileTypes: true })
        .filter((e) => e.isDirectory())
        .map((e) => e.name)
        .sort();
    } catch {
      vDirs = [];
    }
    for (const vd of vDirs) {
      const vPath = join(visualsDir, vd, 'visual.json');
      if (!existsSync(vPath)) continue;
      const vf = readJsonFile(vPath);
      const j = vf ? vf.json : null;
      const v = {
        path: vPath,
        relPath: relative(dir, vPath).split(sep).join('/'),
        dirName: vd,
        pageName: page.name,
        pageDirName: pd,
        json: j,
        style: vf ? vf.style : DEFAULT_STYLE,
        parseError: vf ? vf.error || null : 'unreadable',
        // Never assume `visual` exists: about a quarter of visual.json files are
        // group containers that carry `visualGroup` and no `visual` node.
        name: j ? j.name ?? vd : vd,
        isGroup: !!(j && j.visualGroup && !j.visual),
        isHidden: !!(j && j.isHidden === true),
        parentGroupName: j ? (j.parentGroupName ?? null) : null,
        visualType: j && j.visual ? (j.visual.visualType ?? null) : null,
        position: j ? (j.position ?? null) : null,
        schemaVersion: j ? schemaVersion(j.$schema, 'visualContainer') : null,
      };
      page.visuals.push(v);
      visuals.push(v);
    }
    pages.push(page);
  }

  const bookmarksDir = join(defDir, 'bookmarks');
  const bookmarks = [];
  let bmFiles = [];
  try {
    bmFiles = readdirSync(bookmarksDir)
      .filter((f) => f.endsWith('.bookmark.json'))
      .sort();
  } catch {
    bmFiles = [];
  }
  for (const f of bmFiles) {
    const bp = join(bookmarksDir, f);
    const bf = readJsonFile(bp);
    if (!bf || bf.json === null) continue;
    bookmarks.push({
      path: bp,
      relPath: relative(dir, bp).split(sep).join('/'),
      json: bf.json,
      style: bf.style,
      name: bf.json.name ?? basename(f, '.bookmark.json'),
      displayName: bf.json.displayName ?? null,
      schemaVersion: schemaVersion(bf.json.$schema, 'bookmark'),
    });
  }

  return {
    dir,
    definitionDir: defDir,
    report: {
      path: reportPath,
      relPath: relative(dir, reportPath).split(sep).join('/'),
      json: report.json,
      style: report.style,
      schemaVersion: schemaVersion(report.json.$schema, 'report'),
    },
    pagesMeta:
      pagesMeta && pagesMeta.json
        ? { path: join(pagesDir, 'pages.json'), json: pagesMeta.json, style: pagesMeta.style }
        : null,
    pages,
    visuals,
    bookmarks,
    themeCollection: report.json.themeCollection ?? {},
    resourcePackages: Array.isArray(report.json.resourcePackages)
      ? report.json.resourcePackages
      : [],
  };
}

/** Visuals that can carry container formatting (a `visual` node exists). */
export function dataVisuals(model) {
  return model.visuals.filter((v) => v.json && v.json.visual);
}

/** Max visualContainer / page / report schema versions, for reportVersionAtImport. */
export function computeReportVersionAtImport(model) {
  return {
    visual: maxVersion(model.visuals.map((v) => v.schemaVersion)) ?? '2.0.0',
    page: maxVersion(model.pages.map((p) => p.schemaVersion)) ?? '2.0.0',
    report: model.report.schemaVersion ?? '2.0.0',
  };
}

/** The RegisteredResources package (or null). */
export function registeredResourcesPackage(model) {
  return model.resourcePackages.find((p) => p && p.type === 'RegisteredResources') ?? null;
}

/** Resolve the currently registered custom theme file, if any. */
export function registeredTheme(model) {
  const ct = model.themeCollection && model.themeCollection.customTheme;
  if (!ct || !ct.name) return null;
  const pkg = registeredResourcesPackage(model);
  const items = pkg && Array.isArray(pkg.items) ? pkg.items : [];
  const item =
    items.find((i) => i && i.type === 'CustomTheme' && i.name === ct.name) ??
    items.find((i) => i && i.type === 'CustomTheme') ??
    null;
  const relPath = item && item.path ? item.path : `${ct.name}.json`;
  const abs = join(dir_(model), 'StaticResources', 'RegisteredResources', relPath);
  const file = existsSync(abs) ? readJsonFile(abs) : null;
  return {
    customTheme: ct,
    item,
    nameMatchesItem: !!(item && item.name === ct.name),
    path: abs,
    relPath: relative(dir_(model), abs).split(sep).join('/'),
    exists: !!file && file.json !== null,
    json: file ? file.json : null,
    style: file ? file.style : DEFAULT_STYLE,
  };
}

function dir_(model) {
  return model.dir;
}

// ---------------------------------------------------------------------------
// Bookmarks
// ---------------------------------------------------------------------------

/**
 * Bookmarks capture formatting under
 * explorationState.sections.<page>.visualContainers.<visual>.singleVisual.objects
 * (newer reports also use `vcObjects` for container formatting). A bookmark that
 * captured the old formatting snaps it back after the inline override is cleared,
 * so those visuals are reported and skipped by default.
 */
export function bookmarkFormattingIndex(model) {
  const byVisual = new Map();
  const bookmarksCapturing = [];

  for (const bm of model.bookmarks) {
    const sections = bm.json?.explorationState?.sections ?? {};
    let captures = 0;
    const cards = new Set();
    for (const [pageName, section] of Object.entries(sections)) {
      const containers = section?.visualContainers ?? {};
      for (const [visualName, container] of Object.entries(containers)) {
        const sv = container?.singleVisual ?? {};
        const bags = [
          ['objects', sv.objects],
          ['vcObjects', sv.vcObjects],
          ['objects', container?.objects],
          ['vcObjects', container?.vcObjects],
        ];
        const captured = new Set();
        for (const [bagName, bag] of bags) {
          if (!bag || typeof bag !== 'object') continue;
          for (const card of Object.keys(bag)) {
            captured.add(card);
            cards.add(`${bagName}.${card}`);
          }
        }
        if (captured.size === 0) continue;
        captures++;
        const key = `${pageName}::${visualName}`;
        if (!byVisual.has(key)) {
          byVisual.set(key, {
            visual: visualName,
            page: pageName,
            bookmarks: new Set(),
            cards: new Set(),
          });
        }
        const entry = byVisual.get(key);
        entry.bookmarks.add(bm.displayName || bm.name);
        for (const c of captured) entry.cards.add(c);
      }
    }
    if (captures > 0) {
      bookmarksCapturing.push({
        name: bm.name,
        displayName: bm.displayName,
        file: bm.relPath,
        visualsWithFormatting: captures,
        cards: [...cards].sort(),
      });
    }
  }
  return { byVisual, bookmarksCapturing };
}

/** The bookmark capture entry for this visual/card, or null. */
export function bookmarkCapture(index, visual, card) {
  const hit =
    index.byVisual.get(`${visual.pageName}::${visual.name}`) ??
    [...index.byVisual.values()].find((e) => e.visual === visual.name) ??
    null;
  if (!hit) return null;
  if (card && hit.cards.size && !hit.cards.has(card)) return null;
  return hit;
}

// ---------------------------------------------------------------------------
// Inline override census
// ---------------------------------------------------------------------------

/** Iterate every inline container property: { card, index, prop, node, bag }. */
export function* iterContainerProperties(visual) {
  const vco = visual.json?.visual?.visualContainerObjects;
  if (!vco || typeof vco !== 'object') return;
  for (const [card, instances] of Object.entries(vco)) {
    const arr = Array.isArray(instances) ? instances : [instances];
    for (let i = 0; i < arr.length; i++) {
      const props = arr[i] && arr[i].properties;
      if (!props || typeof props !== 'object') continue;
      for (const prop of Object.keys(props)) {
        yield { card, index: i, prop, node: props[prop], bag: props, instance: arr[i] };
      }
    }
  }
}

/** Iterate every inline data-role property under visual.objects. */
export function* iterObjectProperties(visual) {
  const objects = visual.json?.visual?.objects;
  if (!objects || typeof objects !== 'object') return;
  for (const [card, instances] of Object.entries(objects)) {
    const arr = Array.isArray(instances) ? instances : [instances];
    for (let i = 0; i < arr.length; i++) {
      const props = arr[i] && arr[i].properties;
      if (!props || typeof props !== 'object') continue;
      for (const prop of Object.keys(props)) {
        yield { card, index: i, prop, node: props[prop], bag: props, instance: arr[i] };
      }
    }
  }
}

/**
 * Count inline overrides per card and per card.property, split by whether the
 * theme owns the property. Per-card counts are DISTINCT visuals so the
 * theme-effectiveness ratio is per visual, not per property instance.
 */
export function censusInlineOverrides(model, owned) {
  const perCardVisuals = new Map();
  const perCardOwnedVisuals = new Map();
  const perPropertyInstances = new Map();
  const perCardInstances = new Map();
  const typography = {
    containerFontFamily: 0,
    containerFontSize: 0,
    dataObjectFontFamily: 0,
    dataObjectFontSize: 0,
    visualsWithInlineFontFamily: 0,
    visualsWithInlineFontSize: 0,
    visualsWithAnyInlineFont: 0,
  };
  const colors = new Map();
  const targets = dataVisuals(model);
  let ownedInstances = 0;

  for (const v of targets) {
    const cardsSeen = new Set();
    const ownedCardsSeen = new Set();
    let containerFF = false;
    let containerFS = false;
    let objFF = false;
    let objFS = false;

    for (const it of iterContainerProperties(v)) {
      cardsSeen.add(it.card);
      perCardInstances.set(it.card, (perCardInstances.get(it.card) || 0) + 1);
      const key = `${it.card}.${it.prop}`;
      perPropertyInstances.set(key, (perPropertyInstances.get(key) || 0) + 1);
      if (owned.owns(v.visualType, it.card, it.prop)) {
        ownedCardsSeen.add(it.card);
        ownedInstances++;
      }
      if (it.prop === 'fontFamily') containerFF = true;
      if (it.prop === 'fontSize') containerFS = true;
      collectHexColors(it.node, colors);
    }
    for (const it of iterObjectProperties(v)) {
      if (it.prop === 'fontFamily') objFF = true;
      if (it.prop === 'fontSize') objFS = true;
      collectHexColors(it.node, colors);
    }

    for (const c of cardsSeen) perCardVisuals.set(c, (perCardVisuals.get(c) || 0) + 1);
    for (const c of ownedCardsSeen) {
      perCardOwnedVisuals.set(c, (perCardOwnedVisuals.get(c) || 0) + 1);
    }
    if (containerFF) typography.containerFontFamily++;
    if (containerFS) typography.containerFontSize++;
    if (objFF) typography.dataObjectFontFamily++;
    if (objFS) typography.dataObjectFontSize++;
    if (containerFF || objFF) typography.visualsWithInlineFontFamily++;
    if (containerFS || objFS) typography.visualsWithInlineFontSize++;
    if (containerFF || containerFS || objFF || objFS) typography.visualsWithAnyInlineFont++;
  }

  const sortDesc = (m) => Object.fromEntries([...m].sort((a, b) => b[1] - a[1]));
  return {
    dataVisualCount: targets.length,
    ownedInstances,
    perCardVisuals: sortDesc(perCardVisuals),
    perCardOwnedVisuals: sortDesc(perCardOwnedVisuals),
    perCardInstances: sortDesc(perCardInstances),
    perPropertyInstances: sortDesc(perPropertyInstances),
    typography,
    colors: [...colors].sort((a, b) => b[1] - a[1]).map(([color, count]) => ({ color, count })),
  };
}

/**
 * Theme-effectiveness ratio per theme-owned card:
 *   1 - (data visuals with an inline theme-owned override for that card / data visuals)
 * 1.00 means the theme fully controls that card. Target is 0.90 or higher.
 */
export function effectivenessMatrix(census, owned, keys) {
  const cards = keys && keys.length ? keys : [...owned.cards()].sort();
  const total = census.dataVisualCount || 0;
  const out = {};
  for (const card of cards) {
    const overridden = census.perCardOwnedVisuals[card] || 0;
    out[card] = {
      dataVisuals: total,
      overridden,
      ratio: total === 0 ? 1 : Number((1 - overridden / total).toFixed(4)),
    };
  }
  return out;
}

/** Render the effectiveness matrix as a fixed-width table. */
export function formatEffectiveness(matrix, target = 0.9) {
  const rows = Object.entries(matrix);
  if (!rows.length) return '(no theme-owned keys)';
  const w = Math.max(3, ...rows.map(([k]) => k.length));
  const lines = [
    `${'key'.padEnd(w)}  ${'overridden'.padStart(10)}  ${'visuals'.padStart(7)}  ${'ratio'.padStart(6)}  status`,
    `${'-'.repeat(w)}  ${'-'.repeat(10)}  ${'-'.repeat(7)}  ${'-'.repeat(6)}  ------`,
  ];
  for (const [k, m] of rows) {
    lines.push(
      `${k.padEnd(w)}  ${String(m.overridden).padStart(10)}  ${String(m.dataVisuals).padStart(7)}  ${m.ratio
        .toFixed(4)
        .padStart(6)}  ${m.ratio >= target ? 'PASS' : 'FAIL'}`
    );
  }
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------

const EPS = 0.5;

/** Visual types commonly used as decorative background or navigation layers. */
const DECORATIVE_TYPES = new Set(['basicShape', 'shape', 'image', 'textbox', 'actionButton']);

function rectOf(v) {
  const p = v.position || {};
  return {
    x: Number(p.x) || 0,
    y: Number(p.y) || 0,
    w: Number(p.width) || 0,
    h: Number(p.height) || 0,
  };
}

/**
 * Out-of-bounds and overlap findings. Canvas size is read from EACH page: real
 * reports use arbitrary sizes such as 1350x1142 or 1850x1537, never a fixed
 * 1280x720 or 1920x1080.
 *
 * `overlapCount` counts every intersecting pair. `significantOverlapCount`
 * drops the stacking every real report uses on purpose (cards on a shape or
 * image backdrop, grouped siblings, hidden bookmark layers) and keeps only
 * pairs of chrome-bearing visuals whose intersection covers at least
 * `minAreaRatio` of the smaller visual.
 */
export function geometryFindings(model, { maxOverlaps = 50, minAreaRatio = 0.2 } = {}) {
  const outOfBounds = [];
  const overlaps = [];
  let overlapCount = 0;
  let significantOverlapCount = 0;

  for (const page of model.pages) {
    const W = page.width;
    const H = page.height;
    const placed = page.visuals.filter((v) => v.position);
    for (const v of placed) {
      if (!W || !H) continue;
      const r = rectOf(v);
      const sides = [];
      if (r.x < -EPS) sides.push('left');
      if (r.y < -EPS) sides.push('top');
      if (r.x + r.w > W + EPS) sides.push('right');
      if (r.y + r.h > H + EPS) sides.push('bottom');
      if (sides.length) {
        outOfBounds.push({
          page: page.name,
          pageDisplayName: page.displayName,
          canvas: { width: W, height: H },
          visual: v.name,
          visualType: v.visualType ?? (v.isGroup ? '(visualGroup)' : '(no visual node)'),
          rect: r,
          sides,
          grouped: !!v.parentGroupName,
        });
      }
    }

    const candidates = placed.filter((v) => !v.isHidden && !v.isGroup);
    for (let i = 0; i < candidates.length; i++) {
      for (let j = i + 1; j < candidates.length; j++) {
        const a = candidates[i];
        const b = candidates[j];
        if (a.parentGroupName === b.name || b.parentGroupName === a.name) continue;
        const ra = rectOf(a);
        const rb = rectOf(b);
        const ox = Math.min(ra.x + ra.w, rb.x + rb.w) - Math.max(ra.x, rb.x);
        const oy = Math.min(ra.y + ra.h, rb.y + rb.h) - Math.max(ra.y, rb.y);
        if (ox <= EPS || oy <= EPS) continue;
        overlapCount++;

        const siblings = !!a.parentGroupName && a.parentGroupName === b.parentGroupName;
        const decorative =
          DECORATIVE_TYPES.has(a.visualType) || DECORATIVE_TYPES.has(b.visualType);
        const smaller = Math.min(ra.w * ra.h, rb.w * rb.h) || 1;
        const ratio = (ox * oy) / smaller;
        if (siblings || decorative || ratio < minAreaRatio) continue;

        significantOverlapCount++;
        if (overlaps.length < maxOverlaps) {
          overlaps.push({
            page: page.name,
            pageDisplayName: page.displayName,
            a: { visual: a.name, visualType: a.visualType, rect: ra },
            b: { visual: b.name, visualType: b.visualType, rect: rb },
            overlap: {
              width: Number(ox.toFixed(2)),
              height: Number(oy.toFixed(2)),
              areaRatioOfSmaller: Number(ratio.toFixed(3)),
            },
          });
        }
      }
    }
  }
  return { outOfBounds, overlapCount, significantOverlapCount, overlaps };
}

// ---------------------------------------------------------------------------
// Identity fingerprint (never rename anything)
// ---------------------------------------------------------------------------

function collectPageBindings(node, ids) {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (const n of node) collectPageBindings(n, ids);
    return;
  }
  if (node.pageBinding && typeof node.pageBinding === 'object' && node.pageBinding.name) {
    ids.add(`pageBinding:${node.pageBinding.name}:${node.pageBinding.type ?? ''}`);
  }
  for (const v of Object.values(node)) collectPageBindings(v, ids);
}

/**
 * Every identifier that must survive an edit: page names, visual names, group
 * references, visualInteractions targets, bookmark names, pageBinding names.
 */
export function identitySet(model) {
  const ids = new Set();
  for (const p of model.pages) {
    ids.add(`page:${p.name}`);
    ids.add(`pageDir:${p.dirName}`);
    collectPageBindings(p.json, ids);
    const vi = p.json?.visualInteractions;
    if (Array.isArray(vi)) {
      for (const it of vi) {
        ids.add(`interaction:${it?.source ?? ''}>${it?.target ?? ''}:${it?.type ?? ''}`);
      }
    }
  }
  for (const v of model.visuals) {
    ids.add(`visual:${v.pageName}/${v.name}`);
    if (v.parentGroupName) {
      ids.add(`parentGroup:${v.pageName}/${v.name}->${v.parentGroupName}`);
    }
    collectPageBindings(v.json, ids);
  }
  for (const b of model.bookmarks) ids.add(`bookmark:${b.name}`);
  return ids;
}

export function identityHash(model) {
  return sha256([...identitySet(model)].sort().join('\n'));
}

// ---------------------------------------------------------------------------
// Misc helpers
// ---------------------------------------------------------------------------

export function histogram(values) {
  const m = new Map();
  for (const v of values) {
    const k = v === null || v === undefined ? '(none)' : String(v);
    m.set(k, (m.get(k) || 0) + 1);
  }
  return Object.fromEntries([...m].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])));
}

export function dirSize(dir) {
  let bytes = 0;
  for (const f of walk(dir)) {
    try {
      bytes += statSync(f).size;
    } catch {
      /* ignore unreadable files */
    }
  }
  return bytes;
}

/** Minimal argv parser: --flag, --key value, --key=value, plus positionals. */
export function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) {
      out._.push(a);
      continue;
    }
    const eq = a.indexOf('=');
    if (eq > -1) {
      out[a.slice(2, eq)] = a.slice(eq + 1);
      continue;
    }
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) out[key] = true;
    else {
      out[key] = next;
      i++;
    }
  }
  return out;
}

export function toList(value) {
  if (value === undefined || value === null || value === true || value === false) return [];
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  return String(value)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export function fail(message) {
  process.stderr.write(`error: ${message}\n`);
  process.exit(1);
}
