// Build mcp/data/fluent-charts.json — the Fluent 2 data-visualisation catalog.
//
// Why this exists: the plugin's headline surfaces include Power BI, yet the
// datasets carried ZERO data-visualisation records. `@fluentui/react-charts`
// and `DataVizPalette` appeared 0 times across mcp/data/*.json, so an agent
// asked "which Fluent chart shows a trend over time, and how do I theme it?"
// had nothing to read and would invent an answer. Worse, three sibling
// packages ship chart components with THE SAME export names at three different
// maturity levels, so a guess is not just vague, it is wrong in a way that
// compiles:
//
//   @fluentui/react-charts        v9, stable   <- the current one
//   @fluentui/react-charting      v8-era, legacy
//   @fluentui/chart-web-components  0.0.x, preview
//
// All three export `DonutChart`. Two export `LineChart`, `DataVizPalette`,
// `Legends`, `Sparkline` and more. Recommending the wrong one produces code
// that builds and then renders with the wrong design system.
//
// Sources (every fact below is read from one of these; nothing is inferred):
//
//   1. packages/charts/react-charts/library/package.json
//      -> the version, the d3 dependency set, and the @fluentui/react-theme
//         dependency that proves this is the v9 (Fluent 2) package.
//   2. packages/charts/react-charts/library/src/index.ts
//      -> the export surface: which modules the package actually re-exports.
//   3. packages/charts/react-charts/library/etc/react-charts.api.md
//      -> the API-Extractor report. This is the SAME class of source the
//         component catalog used for @fluentui/react-components, and it is the
//         only place that states, per prop, the exact type and whether it is
//         optional. Component declarations and props interfaces both come from
//         here, so no prop name in the output was typed by hand.
//   4. packages/charts/react-charts/library/src/utilities/colors.ts
//      -> DataVizPalette: the 40-slot qualitative palette + 7 semantic colours,
//         including the light/dark pairs and the Fluent palette names the
//         upstream comments record (cornflower.tint10 and friends).
//   5. packages/charts/react-charts/library/README.md
//      -> the cross-platform availability table (v8 / v9 / web components).
//   6. packages/charts/react-charts/stories/src/<Chart>/<Chart>Description.md
//      and <Chart>BestPractices.md
//      -> the upstream prose for what each chart is for, its do's/don'ts and
//         its accessibility behaviour.
//   7. https://storybooks.fluentui.dev/charts/index.json
//      -> the published charts Storybook: the docs id and story variants per
//         chart. (Note: unlike the react Storybook there is no llms/*.txt
//         companion here - /charts/llms/<id>.txt 404s - which is exactly why
//         the props come from the API-Extractor report instead.)
//   8. https://unpkg.com/@fluentui/react-charts@<version>/lib/utilities/colors.js
//      -> the PUBLISHED palette, diffed against master. If npm and master ever
//         disagree the build fails rather than shipping a palette nobody can
//         actually install. (registry.npmjs.org is blocked here; unpkg is not.)
//   9. packages/charts/{react-charting,chart-web-components,chart-utilities}/package.json
//      and their src/index.ts -> the sibling packages' versions and real export
//      lists, so "legacy" and "preview" are stated with evidence.
//
// What is CURATED rather than fetched: `category`, `whenToUse` and
// `powerbiEquivalent`. These are editorial classification - upstream publishes
// no such mapping - and every record says so via `classification: "curated"`.
// The Power BI names are validated against mcp/data/powerbi-visuals.json at
// build time, so a curated mapping can never point at a visual that does not
// exist in this plugin's own catalog.
//
// Usage:
//   node scripts/build-charts-data.mjs               # build from master
//   node scripts/build-charts-data.mjs --ref=<sha>   # pin a commit
//   node scripts/build-charts-data.mjs --dry-run     # report, write nothing
//
// Re-runnable and idempotent: the same upstream ref produces byte-identical
// output apart from meta.generatedAt.

import { writeFileSync, readFileSync, existsSync } from 'node:fs';

const OUT = new URL('../mcp/data/fluent-charts.json', import.meta.url);
const PBI_VISUALS = new URL('../mcp/data/powerbi-visuals.json', import.meta.url);
const REPO = 'microsoft/fluentui';
const args = process.argv.slice(2);
const REF = (args.find((a) => a.startsWith('--ref=')) || '--ref=master').slice(6);
const DRY = args.includes('--dry-run');
const RAW = `https://raw.githubusercontent.com/${REPO}/${REF}`;
const BLOB = `https://github.com/${REPO}/blob/${REF}`;
const CHARTS_DIR = 'packages/charts';
const LIB = `${CHARTS_DIR}/react-charts/library`;
const STORIES = `${CHARTS_DIR}/react-charts/stories/src`;
const SB = 'https://storybooks.fluentui.dev/charts';

/**
 * raw.githubusercontent throttles a burst of ~100 sequential requests by
 * answering 404 rather than 429 - which is indistinguishable from "this file
 * does not exist" unless you check twice. That silently cost three charts their
 * upstream description on the first run. So a 404 is only believed after it is
 * reproduced on a second, delayed attempt.
 */
async function get(url, { optional = false, retries = 3 } = {}) {
  let lastErr = null;
  let notFound = 0;
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const res = await fetch(url, { headers: { 'user-agent': 'fluent-ui-plugin/build-charts-data' } });
      if (res.ok) return res.text();
      if (res.status === 404) {
        if (++notFound >= 2) {
          if (optional) return null;
          throw new Error(`GET ${url} -> 404`);
        }
      }
      lastErr = new Error(`GET ${url} -> ${res.status}`);
    } catch (e) {
      if (/-> 404$/.test(e.message)) throw e;
      lastErr = e;
    }
    await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
  }
  if (optional) return null;
  throw lastErr ?? new Error(`GET ${url} failed`);
}
const getJson = async (url, opts) => {
  const t = await get(url, opts);
  return t === null ? null : JSON.parse(t.replace(/^\uFEFF/, ''));
};

/* ------------------------------------------------------------------ parsers */

/** The `export * from './X';` module list in src/index.ts, in file order. */
function parseIndexModules(src) {
  return [...src.matchAll(/^export \* from '\.\/([^']+)';/gm)].map((m) => m[1]);
}

/**
 * Every `export const X: React_2.FunctionComponent<YProps>` (or FC /
 * ForwardRefExoticComponent) in the API-Extractor report, with the props type
 * it is declared against. This is the definitive component list: index.ts only
 * names modules, and a module can export several components (src/Popover.ts
 * re-exports both ChartPopover and ChartAnnotationLayer).
 */
function parseComponentDecls(api) {
  const out = new Map();
  const re = /^export const (\w+): React_2\.(?:FunctionComponent|FC|ForwardRefExoticComponent)<([^;]+)>;/gm;
  for (const m of api.matchAll(re)) {
    const propsType = m[2].replace(/\s*&\s*React_2\.RefAttributes<[^>]+>\s*$/, '').trim();
    out.set(m[1], { name: m[1], propsType, declaration: m[0] });
  }
  return out;
}

/** `export interface X extends Y {` ... `}` -> { extends, members[] }. */
function parseInterface(api, name) {
  // `\s*` before the brace matters: API Extractor writes
  // `export interface LegendsProps {` with a space, and a regex that demanded
  // `Name{` silently found nothing for every interface without an `extends`
  // clause - 11 charts came out with zero props and looked like type aliases.
  const re = new RegExp(`^export interface ${name}\\b\\s*(?:extends ([^{]+))?\\{`, 'm');
  const m = api.match(re);
  if (!m) return null;
  const start = api.indexOf(m[0]) + m[0].length;
  let depth = 1;
  let i = start;
  for (; i < api.length && depth > 0; i++) {
    if (api[i] === '{') depth++;
    else if (api[i] === '}') depth--;
  }
  const body = api.slice(start, i - 1);
  return { extends: (m[1] || '').trim() || null, body };
}

/**
 * Members of a props interface. Only TOP-LEVEL members are read (depth 0), so
 * the inner fields of an inline object type are not mistaken for props.
 *
 * Depth counts {} () [] ONLY. Counting angle brackets looked reasonable and was
 * wrong: `calloutPropsPerDataPoint?: (p: any) => ChartPopoverProps;` contains a
 * lone `>` from the arrow, which drove depth negative and made the inner
 * `mode:` of the following `reflowProps?: { ... }` surface as a required
 * top-level prop of ten different charts. Generic types never span lines in an
 * API-Extractor report, so angle brackets carry no nesting information here.
 *
 * `// (undocumented)` and `// @deprecated` markers are carried through because
 * "this prop exists but upstream never documented it" is information.
 */
function parseMembers(body) {
  const OPEN = { '{': 1, '(': 1, '[': 1 };
  const CLOSE = { '}': 1, ')': 1, ']': 1 };
  let depth = 0;
  let pendingUndocumented = false;
  let pendingDeprecated = false;
  let buf = '';
  const out = [];
  for (const line of body.split('\n')) {
    const t = line.trim();
    if (depth === 0 && /^\/\/ \(undocumented\)/.test(t)) { pendingUndocumented = true; continue; }
    if (depth === 0 && /^\/\/ @deprecated/.test(t)) { pendingDeprecated = true; continue; }
    if (depth === 0 && t.startsWith('//')) continue;
    buf = buf ? buf + ' ' + t : t;
    for (const ch of t) {
      if (OPEN[ch]) depth++;
      else if (CLOSE[ch]) depth = Math.max(0, depth - 1);
    }
    if (depth > 0) continue;
    const m = buf.match(/^(\w+)(\?)?\s*:\s*([\s\S]+?);?$/);
    if (m) {
      out.push({
        name: m[1],
        type: m[3].replace(/;+$/, '').replace(/\s+/g, ' ').trim(),
        required: !m[2],
        ...(pendingUndocumented ? { undocumented: true } : {}),
        ...(pendingDeprecated ? { deprecated: true } : {}),
      });
    }
    buf = '';
    pendingUndocumented = false;
    pendingDeprecated = false;
  }
  return out;
}

/** Resolve a props interface plus everything it extends, nearest-wins. */
function resolveProps(api, propsType) {
  const seen = new Set();
  const chain = [];
  let cur = propsType;
  while (cur && !seen.has(cur)) {
    seen.add(cur);
    const iface = parseInterface(api, cur);
    if (!iface) break;
    chain.push({ name: cur, members: parseMembers(iface.body) });
    cur = iface.extends ? iface.extends.split(',')[0].trim() : null;
  }
  const merged = new Map();
  for (const level of chain) for (const m of level.members) if (!merged.has(m.name)) merged.set(m.name, m);
  return {
    found: chain.length > 0,
    inheritedFrom: chain.slice(1).map((c) => c.name),
    own: chain[0]?.members ?? [],
    all: [...merged.values()],
  };
}

/**
 * DataVizPalette from src/utilities/colors.ts.
 *
 * The token map is `color1: 'qualitative.1'` - an INDIRECTION, not a hex. The
 * hexes live in two `Palette` objects where index 0 is the light/default value
 * and index 1, when present, is the dark-theme override. 19 of the 40
 * qualitative slots ship a single value used in both themes; the rest ship a
 * pair. The trailing comment on each row names the Fluent colour it came from
 * (`// [cornflower.tint10]`), which is the only provenance upstream publishes
 * for these values, so it is captured verbatim.
 */
function parseColors(src) {
  const objBody = (name) => {
    const i = src.indexOf(`const ${name}`);
    if (i < 0) throw new Error(`palette ${name} not found`);
    const start = src.indexOf('{', i);
    let depth = 0, j = start;
    for (; j < src.length; j++) {
      if (src[j] === '{') depth++;
      else if (src[j] === '}' && --depth === 0) break;
    }
    return src.slice(start + 1, j);
  };

  const tokens = {};
  for (const line of objBody('DataVizPalette').split('\n')) {
    const m = line.match(/^\s*([A-Za-z0-9]+)\s*:\s*'([^']+)'/);
    if (m) tokens[m[1]] = m[2];
  }

  // Matched over the whole object body rather than line by line: master's .ts
  // writes one entry per line with a trailing `// [cornflower.tint10]` comment,
  // but the published .js on npm spreads each array over several lines. The
  // cross-check against npm only works if both formats parse.
  const palette = (name) => {
    const out = {};
    const re = /'?([A-Za-z0-9]+)'?\s*:\s*\[([^\]]*)\]\s*,?[ \t]*(?:\/\/[ \t]*([^\n]*))?/g;
    for (const m of objBody(name).matchAll(re)) {
      const values = m[2].split(',').map((s) => s.trim().replace(/^'|'$/g, '')).filter(Boolean);
      out[m[1]] = { values, fluentPalette: (m[3] || '').replace(/^\[|\],?$/g, '').trim() || null };
    }
    return out;
  };

  const helpers = [...src.matchAll(/^export const (\w+) = \(([^)]*)\)(?::\s*([^=]+))? =>/gm)].map((m) => ({
    name: m[1],
    signature: `${m[1]}(${m[2].replace(/\s+/g, ' ').trim()})${m[3] ? `: ${m[3].trim()}` : ''}`,
  }));
  for (const m of src.matchAll(/^export function (\w+)\(([^)]*)\)(?::\s*([^{]+))?\s*\{/gm)) {
    helpers.push({ name: m[1], signature: `${m[1]}(${m[2].replace(/\s+/g, ' ').trim()})${m[3] ? `: ${m[3].trim()}` : ''}` });
  }

  return { tokens, qualitative: palette('QualitativePalette'), semantic: palette('SemanticPalette'), helpers };
}

/**
 * The README's availability table is written in human labels ("VerticalBarChart
 * Grouped"), not export names, so a naive lookup silently returns null for two
 * thirds of the charts. These aliases map the table's row label to the real
 * v9 export. Rows with no v9 export (PieChart, TreeChart, the two v8-only
 * stacked horizontal bars) are deliberately absent.
 */
const README_ROW_ALIASES = {
  'HorizontalBarChart with Axis': 'HorizontalBarChartWithAxis',
  'VerticalBarChart Grouped': 'GroupedVerticalBarChart',
  'VerticalBarChart Stacked': 'VerticalStackedBarChart',
  'Plotly schema Chart (new)': 'DeclarativeChart',
  'Scatter Chart (new)': 'ScatterChart',
  'Gantt Chart (new)': 'GanttChart',
};

/** The README's per-chart availability table (v8 / v9 / web component). */
function parseAvailabilityTable(readme) {
  const rows = {};
  const cells = [...readme.matchAll(/<tr>([\s\S]*?)<\/tr>/g)].map((m) =>
    [...m[1].matchAll(/<t[dh]>([\s\S]*?)<\/t[dh]>/g)].map((c) => c[1].trim()),
  );
  for (const row of cells) {
    if (row.length !== 4) continue;
    if (row[0] === 'Chart' || row[0] === 'Documentation') continue;
    const key = README_ROW_ALIASES[row[0]] ?? row[0];
    rows[key] = { readmeRow: row[0], v8: row[1], v9: row[2], webComponent: row[3] };
  }
  return rows;
}

const HELPER_PURPOSE = {
  getNextColor: 'Pick the next qualitative slot for series `index` (wraps at 40). This is what a chart does when a series omits `color`.',
  getColorFromToken: 'Resolve a DataVizPalette token ("qualitative.1") to the hex for the current theme. Returns the input unchanged if it is not a token, so a raw CSS colour passes straight through.',
  getColorContrast: 'WCAG contrast ratio between two colours (per https://www.w3.org/TR/WCAG/#dfn-contrast-ratio).',
  getInvertedTextColor: 'Flip between colorNeutralForeground1 and colorNeutralBackground1.',
  getContrastTextColor: 'Choose readable label text for a filled shape: keeps colorNeutralForeground1 unless contrast drops below 3, then inverts.',
};

/* -------------------------------------------------------------- curation */

/**
 * Editorial classification. Upstream publishes no chart -> Power BI visual
 * mapping and no category taxonomy, so this table is OURS and every record it
 * feeds is stamped `classification: "curated"`.
 *
 * `category` deliberately reuses the category names already in
 * mcp/data/powerbi-visuals.json wherever one fits, so a single category filter
 * works across both catalogs. Categories with no Power BI counterpart
 * ("Flow & hierarchy", "Project & schedule", "Declarative & schema-driven",
 * "Chart building blocks") are chart-only and are listed as such.
 *
 * `powerbiEquivalent` is validated against powerbi-visuals.json at build time.
 * `null` means Power BI genuinely has no first-party equivalent - saying so is
 * more useful than forcing a match.
 */
const CURATION = {
  LineChart: { category: 'Comparison & trends', role: 'chart', whenToUse: 'A trend over time, or any continuous/number-line x domain. Multiple lines compare series over the same x domain. Upstream caps readability at 9 lines.', powerbiEquivalent: 'Line chart' },
  AreaChart: { category: 'Comparison & trends', role: 'chart', whenToUse: 'A trend over time where the cumulative magnitude matters as much as the shape. `mode: "tonexty"` stacks the series; `mode: "tozeroy"` overlays them.', powerbiEquivalent: 'Area chart' },
  VerticalBarChart: { category: 'Comparison & trends', role: 'chart', whenToUse: 'Compare one measure across a modest number of categories or time buckets, as columns. Supports an overlaid line series via `lineLegendText`/`lineData`.', powerbiEquivalent: 'Column & bar charts' },
  GroupedVerticalBarChart: { category: 'Comparison & trends', role: 'chart', whenToUse: 'Compare several series side by side inside each category (clustered columns).', powerbiEquivalent: 'Column & bar charts' },
  VerticalStackedBarChart: { category: 'Comparison & trends', role: 'chart', whenToUse: 'Category totals broken into parts, where the total is the headline and the split is secondary.', powerbiEquivalent: 'Column & bar charts' },
  HorizontalBarChartWithAxis: { category: 'Comparison & trends', role: 'chart', whenToUse: 'Ranked categories, especially with long category labels that would not fit under a column chart.', powerbiEquivalent: 'Column & bar charts' },
  Sparkline: { category: 'Comparison & trends', role: 'chart', whenToUse: 'A tiny, axis-less trend line to sit inline in a card, list row or table cell.', powerbiEquivalent: 'Table', powerbiNote: 'Power BI has no standalone sparkline visual; sparklines are a per-cell feature of the Table and Matrix visuals.' },
  HorizontalBarChart: { category: 'Part-to-whole', role: 'chart', whenToUse: 'A single value against its total - a ratio / progress bar per row. Variants via `variant` (absolute-scale or part-to-whole).', powerbiEquivalent: 'Column & bar charts', powerbiNote: 'Closest first-party equivalent for the ratio bar is a bar chart or a KPI card; Power BI has no dedicated ratio-bar visual.' },
  DonutChart: { category: 'Part-to-whole', role: 'chart', whenToUse: 'Share of a total across a small number of categories. Fluent v9 ships no PieChart - the README directs pie scenarios to DonutChart.', powerbiEquivalent: 'Pie & donut chart' },
  FunnelChart: { category: 'Part-to-whole', role: 'chart', whenToUse: 'Stage-by-stage drop-off through a linear process (pipeline, conversion).', powerbiEquivalent: 'Funnel chart' },
  ScatterChart: { category: 'Distribution & relationships', role: 'chart', whenToUse: 'Correlation between two measures; add a size dimension for a bubble plot.', powerbiEquivalent: 'Scatter, bubble & dot plot' },
  HeatMapChart: { category: 'Distribution & relationships', role: 'chart', whenToUse: 'Magnitude across two categorical dimensions, encoded as cell colour on a sequential ramp.', powerbiEquivalent: 'Matrix', powerbiNote: 'Power BI has no first-party heat map visual; the equivalent is a Matrix with background-colour conditional formatting (see the "Conditional formatting" feature page).' },
  PolarChart: { category: 'Distribution & relationships', role: 'chart', whenToUse: 'Multivariate comparison on a radial axis (radar / area-polar / scatter-polar).', powerbiEquivalent: 'Custom visuals (AppSource / SDK)', powerbiNote: 'Radar/polar is an AppSource custom visual in Power BI, not a first-party one.' },
  SankeyChart: { category: 'Flow & hierarchy', role: 'chart', whenToUse: 'Flow volume between stages or nodes, where link thickness is the quantity.', powerbiEquivalent: 'Custom visuals (AppSource / SDK)', powerbiNote: 'Sankey is an AppSource custom visual in Power BI, not a first-party one.' },
  GanttChart: { category: 'Project & schedule', role: 'chart', whenToUse: 'Tasks or phases spanning a start/end range on a time axis, optionally grouped.', powerbiEquivalent: 'Custom visuals (AppSource / SDK)', powerbiNote: 'Gantt is an AppSource custom visual in Power BI, not a first-party one.' },
  GaugeChart: { category: 'Cards, KPIs & gauges', role: 'chart', whenToUse: 'One value read against a target or a set of named ranges.', powerbiEquivalent: 'Gauge (radial gauge)' },
  ChartTable: { category: 'Tables & matrices', role: 'chart', whenToUse: 'Show the numbers themselves, styled with the same tokens as the surrounding charts.', powerbiEquivalent: 'Table' },
  DeclarativeChart: { category: 'Declarative & schema-driven', role: 'chart', whenToUse: 'Render a Plotly-schema payload as native Fluent charts - the chart type comes from the data, not from your JSX.', powerbiEquivalent: null },
  VegaDeclarativeChart: { category: 'Declarative & schema-driven', role: 'chart', whenToUse: 'Render a Vega / Vega-Lite specification inside a Fluent surface.', powerbiEquivalent: null },
  AnnotationOnlyChart: { category: 'Chart building blocks', role: 'chart', whenToUse: 'A plot area that carries annotations only - callouts, markers and connectors with no series of its own.', powerbiEquivalent: null },
  CartesianChart: { category: 'Chart building blocks', role: 'container', whenToUse: 'The shared axis/legend/callout frame every cartesian chart is built on. Use it to build a custom cartesian chart, not for ordinary charting.', powerbiEquivalent: null },
  Legends: { category: 'Chart building blocks', role: 'building-block', whenToUse: 'A standalone or shared legend, including multi-select filtering and per-series shapes.', powerbiEquivalent: null },
  ChartPopover: { category: 'Chart building blocks', role: 'building-block', whenToUse: 'The hover/click callout charts render; use it directly to build a custom callout.', powerbiEquivalent: null },
  ChartAnnotationLayer: { category: 'Chart building blocks', role: 'building-block', whenToUse: 'Overlay annotations (text, connectors, arrow heads) on top of a chart plot area.', powerbiEquivalent: null },
  ResponsiveContainer: { category: 'Chart building blocks', role: 'container', whenToUse: 'Size a chart to its parent element, with optional aspect ratio and min/max bounds. Charts take numeric width/height, so this is how you make one fluid.', powerbiEquivalent: null },
  Shape: { category: 'Chart building blocks', role: 'building-block', whenToUse: 'Render a legend shape glyph (the SVG path for a LegendShape). This is the primitive behind non-colour series encoding.', powerbiEquivalent: null },
  Textbox: { category: 'Chart building blocks', role: 'building-block', whenToUse: 'An SVG text label used inside a chart surface.', powerbiEquivalent: null },
};

const CHART_ONLY_CATEGORIES = ['Flow & hierarchy', 'Project & schedule', 'Declarative & schema-driven', 'Chart building blocks'];

/* --------------------------------------------------------------- assemble */

function extractSection(md, heading) {
  if (!md) return null;
  const re = new RegExp(`^#{2,4}\\s+(?:${heading})\\s*$`, 'im');
  const m = md.match(re);
  if (!m) return null;
  const start = md.indexOf(m[0]) + m[0].length;
  const rest = md.slice(start);
  const next = rest.search(/^#{1,4}\s+/m);
  return (next === -1 ? rest : rest.slice(0, next)).trim() || null;
}

// Upstream is not consistent: AreaChart writes "### Dont's", LineChart writes
// "### Don'ts". Matching only one spelling silently drops half the guidance.
const DOS_HEADING = "Do'?s";
const DONTS_HEADING = "Don'?t'?s";

const bullets = (block) =>
  block
    ? block
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => /^[-*]\s+/.test(l))
        .map((l) => l.replace(/^[-*]\s+/, '').replace(/\*\*/g, '').trim())
        .filter(Boolean)
    : [];

async function main() {
  console.log(`Building fluent-charts.json from ${REPO}@${REF}\n`);

  const [pkg, indexTs, apiMd, colorsTs, readme, legacyPkg, legacyIndex, legacyColorsDoc, wcPkg, wcIndex, utilPkg] =
    await Promise.all([
      getJson(`${RAW}/${LIB}/package.json`),
      get(`${RAW}/${LIB}/src/index.ts`),
      get(`${RAW}/${LIB}/etc/react-charts.api.md`),
      get(`${RAW}/${LIB}/src/utilities/colors.ts`),
      get(`${RAW}/${LIB}/README.md`),
      getJson(`${RAW}/${CHARTS_DIR}/react-charting/package.json`),
      get(`${RAW}/${CHARTS_DIR}/react-charting/src/index.ts`),
      get(`${RAW}/${CHARTS_DIR}/react-charting/docs/colors.md`),
      getJson(`${RAW}/${CHARTS_DIR}/chart-web-components/package.json`),
      get(`${RAW}/${CHARTS_DIR}/chart-web-components/src/index.ts`),
      getJson(`${RAW}/${CHARTS_DIR}/chart-utilities/package.json`),
    ]);

  const version = pkg.version;
  const modules = parseIndexModules(indexTs);
  const decls = parseComponentDecls(apiMd);
  const colors = parseColors(colorsTs);
  const availability = parseAvailabilityTable(readme);
  console.log(`  index.ts re-exports ${modules.length} modules`);
  console.log(`  api.md declares ${decls.size} React components`);

  // Cross-check the palette against what npm actually ships. A palette that is
  // only true on master is not a palette anyone can use.
  const publishedColors = await get(`https://unpkg.com/@fluentui/react-charts@${version}/lib/utilities/colors.js`, { optional: true });
  let paletteMatchesNpm = null;
  if (publishedColors) {
    const pub = parseColors(publishedColors);
    const strip = (p) => JSON.stringify(Object.fromEntries(Object.entries(p).map(([k, v]) => [k, v.values])));
    paletteMatchesNpm =
      JSON.stringify(pub.tokens) === JSON.stringify(colors.tokens) &&
      strip(pub.qualitative) === strip(colors.qualitative) &&
      strip(pub.semantic) === strip(colors.semantic);
    if (!paletteMatchesNpm) throw new Error(`DataVizPalette on ${REF} differs from the published @fluentui/react-charts@${version}. Refusing to ship a palette nobody can install.`);
    console.log(`  palette cross-checked against npm ${version}: identical`);
  }

  // Storybook: docs id + story variants per chart.
  const sbIndex = await getJson(`${SB}/index.json`, { optional: true });
  const storyMap = new Map();
  if (sbIndex) {
    for (const e of Object.values(sbIndex.entries || {})) {
      const m = /^Charts\/(\w+)$/.exec(e.title || '');
      if (!m) continue;
      const rec = storyMap.get(m[1]) || { docsId: null, variants: [] };
      if (e.type === 'docs') rec.docsId = e.id;
      else rec.variants.push(e.name);
      storyMap.set(m[1], rec);
    }
    console.log(`  charts Storybook: ${storyMap.size} documented charts`);
  }

  // Per-chart upstream prose. Two conventions are in play upstream and both
  // have to be read or a third of the charts silently lose their description:
  //   A) <Chart>/<Chart>Description.md   + <Chart>/<Chart>BestPractices.md
  //   B) <Chart>/docs/<Chart>Overview.md + docs/<Chart>BestPractices.md
  //                                      + docs/<Chart>Dos.md + docs/<Chart>Donts.md
  // Fetched serially: firing ~100 raw.githubusercontent requests at once got
  // some throttled, and a throttled fetch is indistinguishable from "this chart
  // has no docs" unless you look.
  const prose = new Map();
  const emptyUpstreamDocs = [];
  for (const name of decls.keys()) {
    const base = `${RAW}/${STORIES}/${name}`;
    let desc = await get(`${base}/${name}Description.md`, { optional: true });
    let convention = 'Description.md';
    if (desc === null) {
      desc = await get(`${base}/docs/${name}Overview.md`, { optional: true });
      if (desc !== null) convention = 'docs/Overview.md';
    }
    let bp = await get(`${base}/${name}BestPractices.md`, { optional: true });
    let bpUrl = bp === null ? null : `${BLOB}/${STORIES}/${name}/${name}BestPractices.md`;
    if (bp === null) {
      bp = await get(`${base}/docs/${name}BestPractices.md`, { optional: true });
      if (bp !== null) bpUrl = `${BLOB}/${STORIES}/${name}/docs/${name}BestPractices.md`;
    }
    let dosMd = null;
    let dontsMd = null;
    if (convention === 'docs/Overview.md' || bpUrl?.includes('/docs/')) {
      dosMd = await get(`${base}/docs/${name}Dos.md`, { optional: true });
      dontsMd = await get(`${base}/docs/${name}Donts.md`, { optional: true });
    }
    // A 200 with a zero-byte body is upstream shipping a placeholder, which is
    // a different fact from "no file exists". Both end in no prose, but only
    // one of them is worth telling the reader about.
    const present = [desc, bp, dosMd, dontsMd].some((v) => v !== null);
    const anyContent = [desc, bp, dosMd, dontsMd].some((v) => (v || '').trim().length > 0);
    if (present && !anyContent) emptyUpstreamDocs.push(name);
    if (anyContent) prose.set(name, { desc, bp, bpUrl, dosMd, dontsMd, convention });
  }
  console.log(`  upstream Description/BestPractices found for ${prose.size} of ${decls.size} components`);
  if (emptyUpstreamDocs.length) console.log(`    upstream doc files exist but are EMPTY: ${emptyUpstreamDocs.join(', ')}`);
  const noProse = [...decls.keys()].filter((n) => !prose.has(n) && !emptyUpstreamDocs.includes(n));
  if (noProse.length) console.log(`    no story docs upstream: ${noProse.join(', ')}`);

  // Validate the curated Power BI mapping against this plugin's own catalog.
  const pbiNames = new Set();
  if (existsSync(PBI_VISUALS)) {
    const pv = JSON.parse(readFileSync(PBI_VISUALS, 'utf8'));
    for (const c of pv.categories || []) for (const v of c.visuals || []) pbiNames.add(v.name);
    for (const f of pv.featurePages || []) pbiNames.add(f.name);
  }

  const unverified = [];
  const charts = [];
  for (const [name, decl] of [...decls.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const cur = CURATION[name];
    if (!cur) {
      unverified.push({ name, note: `${name} is exported by @fluentui/react-charts@${version} but this build has no curated category/when-to-use for it. Its API facts below are read from the API-Extractor report; the classification is missing.` });
    }
    const props = resolveProps(apiMd, decl.propsType);
    if (!props.found) {
      unverified.push({ name, note: `${name} is declared against ${decl.propsType}, which the API-Extractor report does not publish as an interface (it is a type alias or an inline type). No prop list could be read, so none is claimed.` });
    }
    const p = prose.get(name);
    const story = storyMap.get(name);
    if (cur?.powerbiEquivalent && pbiNames.size && !pbiNames.has(cur.powerbiEquivalent)) {
      throw new Error(`Curated powerbiEquivalent "${cur.powerbiEquivalent}" for ${name} is not a visual in mcp/data/powerbi-visuals.json.`);
    }

    const a11yBlock = extractSection(p?.bp, 'Accessibility');
    const dos = bullets(extractSection(p?.bp, DOS_HEADING) ?? extractSection(p?.dosMd, DOS_HEADING));
    const donts = bullets(extractSection(p?.bp, DONTS_HEADING) ?? extractSection(p?.dontsMd, DONTS_HEADING));
    const description = (p?.desc || '').trim().split(/\n\s*\n/)[0] || null;
    if (!description) {
      unverified.push({
        name,
        note: emptyUpstreamDocs.includes(name)
          ? `${name} has upstream story doc files (${name}Description.md / ${name}BestPractices.md) but they are ZERO BYTES on ${REF}, so there is no upstream description to quote. whenToUse for it is this plugin's curation, not the charting team's wording.`
          : `${name} ships no <Chart>Description.md or docs/<Chart>Overview.md upstream, so there is no upstream description to quote. Its API facts come from the API-Extractor report; whenToUse is this plugin's curation.`,
      });
    }
    const moduleFile = modules.find((mod) => mod === name) || (name === 'ChartPopover' || name === 'ChartAnnotationLayer' ? 'Popover' : null);

    charts.push({
      id: `charts-${name.toLowerCase()}`,
      name,
      category: cur?.category ?? 'Chart building blocks',
      role: cur?.role ?? 'chart',
      maturity: 'stable',
      maturityReason: `Exported @public from @fluentui/react-charts@${version} - a 9.x package that depends on @fluentui/react-theme, i.e. the Fluent 2 (v9) design system. The API-Extractor report tags every export @public; no chart in this package is @beta or @alpha.`,
      description: description,
      whenToUse: cur?.whenToUse ?? null,
      classification: cur ? 'curated' : 'unclassified',
      npmPackage: '@fluentui/react-charts',
      npmPackageVersion: version,
      reactImport: `import { ${name} } from '@fluentui/react-charts';`,
      propsType: decl.propsType,
      propsInheritedFrom: props.inheritedFrom,
      // Own members only. Ten of these charts extend CartesianChartProps, which
      // alone declares ~55 shared axis/legend/callout props; merging them into
      // every record produced 90-prop lists that buried the handful of props
      // that actually distinguish one chart from another. The shared bases are
      // published ONCE under sharedPropsInterfaces instead.
      keyProps: props.own.map((m) => ({
        name: m.name,
        type: m.type,
        required: m.required,
        ...(m.deprecated ? { deprecated: true } : {}),
        ...(m.undocumented ? { undocumentedUpstream: true } : {}),
      })),
      inheritedPropCount: props.all.length - props.own.length,
      // Required across the WHOLE chain - this is "what must I pass", so an
      // inherited required prop belongs here even though it is not listed above.
      requiredProps: props.all.filter((m) => m.required).map((m) => m.name).sort(),
      slots: [],
      a11y: a11yBlock,
      dos,
      donts,
      bestPracticesUrl: p?.bpUrl ?? null,
      powerbiEquivalent: cur?.powerbiEquivalent ?? null,
      ...(cur?.powerbiNote ? { powerbiNote: cur.powerbiNote } : {}),
      readmeAvailability: availability[name] ?? null,
      storybookVariants: story?.variants?.sort() ?? [],
      verified: true,
      sourceUrl: moduleFile ? `${BLOB}/${LIB}/src/${moduleFile}.ts` : `${BLOB}/${LIB}/src/index.ts`,
      docsSourceUrl: story?.docsId ? `${SB}/?path=/docs/${story.docsId}` : `${BLOB}/${LIB}/etc/react-charts.api.md`,
    });
  }

  // Where the README's own column disagrees with the API-Extractor tier, say so
  // instead of picking a winner. Both are upstream; only one can be quoted as
  // the maturity, and the reader deserves to know the other exists.
  for (const c of charts) {
    const v9 = c.readmeAvailability?.v9;
    // The column holds either a caveat ("Preview" / "Planned" / "-") or the
    // month the chart shipped ("April 2025"). Only the former is a caveat -
    // anchoring the match keeps a ship date from being reported as one.
    if (v9 && /^(preview|planned|-)$/i.test(v9)) {
      unverified.push({
        name: c.name,
        note: `The react-charts README availability table lists ${c.name} (row "${c.readmeAvailability.readmeRow}") as v9 = "${v9}", while the API-Extractor report tags its export @public in the stable 9.x package. This dataset reports maturity from the package tier ("stable") and preserves the README's own claim in readmeAvailability. Treat "${v9}" as the charting team's own caveat.`,
      });
    }
  }
  if (emptyUpstreamDocs.length) {
    unverified.push({
      name: emptyUpstreamDocs.join(', '),
      note: `Upstream ships ZERO-BYTE story doc files for ${emptyUpstreamDocs.length} charts on ${REF} (<Chart>Description.md and <Chart>BestPractices.md exist but are empty). No description, do's, don'ts or accessibility prose could be quoted for them.`,
    });
  }

  /* ---- DataVizPalette ---- */  const qualitative = Object.entries(colors.qualitative)
    .map(([slot, v]) => ({
      slot: Number(slot),
      token: `DataVizPalette.color${slot}`,
      tokenValue: `qualitative.${slot}`,
      light: v.values[0],
      dark: v.values[1] ?? v.values[0],
      hasDarkVariant: v.values.length > 1,
      fluentPalette: v.fluentPalette,
    }))
    .sort((a, b) => a.slot - b.slot);

  const semantic = Object.entries(colors.semantic).map(([key, v]) => ({
    key,
    token: `DataVizPalette.${key}`,
    tokenValue: `semantic.${key}`,
    light: v.values[0],
    dark: v.values[1] ?? v.values[0],
    hasDarkVariant: v.values.length > 1,
    fluentPalette: v.fluentPalette,
  }));

  const tokenKeys = Object.keys(colors.tokens);
  if (tokenKeys.length !== qualitative.length + semantic.length) {
    throw new Error(`DataVizPalette has ${tokenKeys.length} tokens but the palettes resolve ${qualitative.length}+${semantic.length}.`);
  }
  const badHex = [...qualitative, ...semantic].filter((c) => !/^#[0-9a-f]{6}$/i.test(c.light) || !/^#[0-9a-f]{6}$/i.test(c.dark));
  if (badHex.length) throw new Error(`Non-hex palette values: ${badHex.map((c) => c.token).join(', ')}`);

  const wcExports = [...wcIndex.matchAll(/^\s*(\w+),?$/gm)].map((m) => m[1]).filter((n) => /Chart$/.test(n));
  const legacyExports = [...legacyIndex.matchAll(/^export \{([^}]+)\}/gm)]
    .flatMap((m) => m[1].split(',').map((s) => s.trim()))
    .filter(Boolean)
    .sort();
  const sharedNames = legacyExports.filter((n) => decls.has(n) || n === 'DataVizPalette' || n === 'getNextColor' || n === 'getColorFromToken');

  const data = {
    meta: {
      title: 'Microsoft Fluent 2 data-visualisation catalog (@fluentui/react-charts + DataVizPalette)',
      fluentVersion: 'Fluent 2 / Fluent UI React v9',
      reactPackage: '@fluentui/react-charts',
      reactPackageVersion: version,
      generatedBy: 'scripts/build-charts-data.mjs',
      generatedAt: new Date().toISOString().slice(0, 10),
      upstreamRef: REF,
      sources: [
        { id: 'package-json', url: `${BLOB}/${LIB}/package.json`, detail: `@fluentui/react-charts@${version}, "${pkg.description}". Depends on @fluentui/react-theme@${pkg.dependencies['@fluentui/react-theme']} (the v9 token package) and on ${Object.keys(pkg.dependencies).filter((d) => d.startsWith('d3-')).length} d3-* runtime packages, which is how "v9, d3-based, stable" is established rather than assumed.` },
        { id: 'index-ts', url: `${BLOB}/${LIB}/src/index.ts`, detail: `The export surface: ${modules.length} \`export * from\` statements. Module count is NOT component count - src/types/index and src/utilities/colors export no component, while src/Popover re-exports two (ChartPopover, ChartAnnotationLayer).` },
        { id: 'api-extractor', url: `${BLOB}/${LIB}/etc/react-charts.api.md`, detail: `API-Extractor report for @fluentui/react-charts. Every component declaration, every prop name/type and every required flag in this dataset is read from here - the same source class the component catalog used. All ${(apiMd.match(/^\/\/ @public/gm) || []).length} tagged symbols are @public; none is @beta or @alpha.` },
        { id: 'colors-ts', url: `${BLOB}/${LIB}/src/utilities/colors.ts`, detail: `DataVizPalette and the QualitativePalette/SemanticPalette hex tables behind it, including the light/dark pairs and the Fluent colour name recorded in each row's trailing comment.` },
        { id: 'colors-doc', url: `${BLOB}/${CHARTS_DIR}/react-charting/docs/colors.md`, detail: `The published explanation of the three ways to colour a series (CSS colour / omit and let the palette cycle / DataVizPalette token) and of the qualitative-vs-semantic split. Written for the v8 package but the palette contract is identical in v9. ${legacyColorsDoc.length} chars read.` },
        { id: 'readme', url: `${BLOB}/${LIB}/README.md`, detail: `The cross-platform availability table (Fluent v8 / v9 / web component) captured per chart as readmeAvailability, plus the accessibility claim quoted in this dataset's accessibility block.` },
        { id: 'stories', url: `${BLOB}/${STORIES}`, detail: `<Chart>Description.md and <Chart>BestPractices.md per chart - the upstream prose for description, do's, don'ts and per-chart accessibility behaviour. Found for ${prose.size} of ${decls.size} components.` },
        { id: 'charts-storybook', url: `${SB}/index.json`, detail: `The published charts Storybook index: docs id and story variants per chart. There is no llms/*.txt companion under /charts (it 404s), which is why props come from the API-Extractor report instead of a docgen table.` },
        ...(publishedColors ? [{ id: 'npm-tarball', url: `https://unpkg.com/@fluentui/react-charts@${version}/lib/utilities/colors.js`, detail: 'The palette as actually published to npm, diffed against master at build time. The build fails if they differ.' }] : []),
      ],
      packages: [
        {
          name: '@fluentui/react-charts',
          version,
          maturity: 'stable',
          generation: 'Fluent 2 (Fluent UI React v9)',
          use: 'current',
          description: pkg.description,
          evidence: `9.x version line; depends on @fluentui/react-theme@${pkg.dependencies['@fluentui/react-theme']}; every API-Extractor symbol is @public; beachball disallows major/prerelease bumps.`,
          componentCount: decls.size,
          import: "import { LineChart } from '@fluentui/react-charts';",
          sourceUrl: `${BLOB}/${LIB}/package.json`,
        },
        {
          name: '@fluentui/react-charting',
          version: legacyPkg.version,
          maturity: 'legacy',
          generation: 'Fluent 1 (Fluent UI React v8 stack)',
          use: 'do-not-start-new-work',
          description: legacyPkg.description,
          evidence: `5.x version line. The upstream charts-migration guide states "Fluent Charting controls are built on fluent v8 stack" and works across v8/v9 only "by using the v8ThemeShim". Exports ${legacyExports.length} value symbols with I-prefixed prop interfaces (IChartProps, ILineChartProps), the v8 naming convention.`,
          import: "import { LineChart } from '@fluentui/react-charting';",
          collisionWarning: `${sharedNames.length} symbols are exported under the SAME NAME by both @fluentui/react-charting and @fluentui/react-charts, so the wrong import compiles cleanly and then renders with the wrong design system: ${sharedNames.join(', ')}.`,
          v8OnlyExports: legacyExports.filter((n) => !decls.has(n) && !['DataVizPalette', 'getNextColor', 'getColorFromToken'].includes(n)),
          migrationDoc: 'https://react.fluentui.dev/?path=/docs/concepts-migration-from-v8-components-charts-migration--docs',
          sourceUrl: `${BLOB}/${CHARTS_DIR}/react-charting/package.json`,
        },
        {
          name: '@fluentui/chart-web-components',
          version: wcPkg.version,
          maturity: 'preview',
          generation: 'Fluent 2 web components (FAST)',
          use: 'preview-only',
          description: wcPkg.description,
          evidence: `Version ${wcPkg.version} - a 0.0.x line, i.e. pre-1.0 with no stability guarantee. src/index.ts exports only ${wcExports.length} charts (${wcExports.join(', ')}); the react-charts README marks every other chart "Planned" for web components.`,
          customElements: ['<fluent-horizontal-bar-chart>', '<fluent-donut-chart>'],
          sourceUrl: `${BLOB}/${CHARTS_DIR}/chart-web-components/package.json`,
        },
        {
          name: '@fluentui/chart-utilities',
          version: utilPkg.version,
          maturity: 'stable',
          generation: 'shared internals',
          use: 'transitive-dependency',
          description: utilPkg.description,
          evidence: `1.x; pulled in as a dependency of @fluentui/react-charts@${version} (it supplies the Plotly/Vega schema plumbing behind DeclarativeChart and VegaDeclarativeChart). You do not normally install it directly.`,
          sourceUrl: `${BLOB}/${CHARTS_DIR}/chart-utilities/package.json`,
        },
      ],
      chartsCatalogued: charts.length,
      moduleExports: modules.length,
      moduleExportNames: modules,
      maturityCounts: charts.reduce((acc, c) => ((acc[c.maturity] = (acc[c.maturity] || 0) + 1), acc), {}),
      categories: [...new Set(charts.map((c) => c.category))].sort(),
      chartOnlyCategories: CHART_ONLY_CATEGORIES,
      fieldNotes: [
        'maturity is a PACKAGE-level tier, not a per-chart guess: stable for @fluentui/react-charts (v9), legacy for @fluentui/react-charting (v8-era), preview for @fluentui/chart-web-components (0.0.x). Every export in the v9 package is tagged @public by API Extractor, so no chart in it is a preview within a stable package.',
        'keyProps[].required is the absence of `?` on the declared member in the API-Extractor report, matching the convention in fluent-components.json. Props inherited from CartesianChartProps are merged in (nearest-wins) and the chain is listed in propsInheritedFrom.',
        'keyProps[].undocumentedUpstream mirrors API Extractor\'s `// (undocumented)` marker: the prop exists, upstream just never wrote a doc comment for it. It is not a claim that the prop is private.',
        'slots is always [] - Fluent charts are d3/SVG components and expose no Slot<> props. The field is kept so a reader can treat chart and component records uniformly.',
        'category and whenToUse and powerbiEquivalent are CURATED (classification: "curated"), not upstream facts. Category names reuse mcp/data/powerbi-visuals.json wherever one fits so a single category filter spans both catalogs; powerbiEquivalent is validated against that file at build time and is null where Power BI has no first-party equivalent.',
        'readmeAvailability is the react-charts README table verbatim (v8 / v9 / web component columns). Where it disagrees with the API-Extractor tier it is reported, not silently reconciled - see unverified.',
        'description, dos, donts and a11y are the upstream Description.md / BestPractices.md prose, so they are the charting team\'s own guidance rather than ours.',
      ],
      unverified: {
        count: unverified.length,
        names: unverified.map((u) => u.name),
        entries: unverified,
      },
    },

    charts,

    // Base interfaces the chart records extend, published once. Ten charts
    // extend CartesianChartProps; repeating its members in each record cost
    // ~150KB and made every chart look identical at a glance.
    sharedPropsInterfaces: Object.fromEntries(
      [...new Set(charts.flatMap((c) => c.propsInheritedFrom))].sort().map((iface) => {
        const parsed = parseInterface(apiMd, iface);
        return [
          iface,
          {
            extends: parsed?.extends ?? null,
            sourceUrl: `${BLOB}/${LIB}/etc/react-charts.api.md`,
            usedBy: charts.filter((c) => c.propsInheritedFrom.includes(iface)).map((c) => c.name),
            props: parseMembers(parsed?.body ?? '').map((m) => ({
              name: m.name,
              type: m.type,
              required: m.required,
              ...(m.deprecated ? { deprecated: true } : {}),
              ...(m.undocumented ? { undocumentedUpstream: true } : {}),
            })),
          },
        ];
      }),
    ),

    dataVizPalette: {
      export: 'DataVizPalette',
      package: '@fluentui/react-charts',
      packageVersion: version,
      alsoExportedBy: `@fluentui/react-charting@${legacyPkg.version} (legacy) exports a DataVizPalette of the same name - importing the wrong one is a silent design-system mismatch.`,
      sourceUrl: `${BLOB}/${LIB}/src/utilities/colors.ts`,
      docUrl: `${BLOB}/${CHARTS_DIR}/react-charting/docs/colors.md`,
      publishedCheck: paletteMatchesNpm === null ? 'npm copy not reachable at build time; values are from the pinned ref only.' : `Diffed against https://unpkg.com/@fluentui/react-charts@${version}/lib/utilities/colors.js at build time: identical.`,
      howItWorks:
        'DataVizPalette maps a friendly key to an INDIRECTION string, not a hex: DataVizPalette.color1 === "qualitative.1". The chart resolves it through getColorFromToken(token, isDarkTheme) at render time. That indirection is the whole point - it is what lets one series definition render correctly in light and dark themes.',
      howToUse: [
        'Omit `color` on a series and the chart cycles the qualitative palette for you via getNextColor(index) - this is the default and the recommended path.',
        'Set `color: DataVizPalette.color7` to pin a series to a specific qualitative slot.',
        'Set `color: DataVizPalette.error` (or success/warning/info/disabled/highError/highSuccess) when the colour carries meaning rather than identity.',
        'Any raw CSS colour also works, but then YOU own the light/dark and contrast story - getColorFromToken passes non-token strings straight through unchanged.',
      ],
      themeVariation: `Each palette entry is an array: index 0 is the light/default colour and index 1, when present, is the dark-theme override. ${qualitative.filter((c) => c.hasDarkVariant).length} of ${qualitative.length} qualitative slots and ${semantic.filter((c) => c.hasDarkVariant).length} of ${semantic.length} semantic colours ship a dark variant; the rest use one value in both themes. getThemeSpecificColor picks index Number(isDarkTheme) and falls back to index 0.`,
      cycling: `getNextColor(index, offset, isDarkTheme) walks the ${qualitative.length} qualitative slots and wraps, so series ${qualitative.length + 1} reuses slot 1.`,
      qualitativeCount: qualitative.length,
      semanticCount: semantic.length,
      tokenCount: tokenKeys.length,
      qualitative,
      semantic,
      helpers: colors.helpers.map((h) => ({ ...h, purpose: HELPER_PURPOSE[h.name] ?? null })),
      notInV9: [
        {
          symbol: 'DataVizGradientPalette / getGradientFromToken / getNextGradient',
          note: `Exported by @fluentui/react-charting@${legacyPkg.version} (legacy) but NOT by @fluentui/react-charts@${version}. Verified absent from the v9 API-Extractor report. Gradient fills in v9 are opted into per chart with enableGradient.`,
        },
        {
          symbol: 'PieChart / TreeChart / StackedBarChart / MultiStackedBarChart',
          note: `Exported by @fluentui/react-charting@${legacyPkg.version} with no v9 counterpart in this build. The react-charts README directs pie scenarios to DonutChart.`,
        },
      ],
    },

    powerbiAlignment: {
      why: 'A Fluent-themed Power BI report and a Fluent-themed React chart on the same page should not use two different series palettes. fluent_generate_powerbi_theme therefore emits dataColors straight from the qualitative slots below, in slot order, so series N is the same colour in both.',
      dataColorsSource: 'dataVizPalette.qualitative[].light (or .dark when paletteTheme="dark"), in slot order, uppercased to match the rest of the theme JSON.',
      statusColors: {
        good: 'dataVizPalette.semantic success',
        bad: 'dataVizPalette.semantic error',
        neutral: 'Left at the base theme value #C19C00. DataVizPalette has no "neutral"; its closest member is warning (#f7630c), which reads as an alert rather than a middle state. #C19C00 is Fluent gold.primary, which is qualitative slot 30\'s dark value, so it is still a Fluent data-viz colour.',
      },
      notAligned: [
        'maximum / center / minimum stay brand-derived. They are a SEQUENTIAL ramp (a gradient across one measure); the qualitative palette is deliberately non-sequential, so reusing it there would be wrong.',
        'tableAccent stays brand-derived - it is chrome, not a series colour.',
      ],
      schemaNote: 'reportThemeSchema-2.156 declares dataColors as an unbounded array of colour strings (no maxItems), so all 40 slots are schema-valid. The schema is additionalProperties:false at the top level, so provenance cannot be embedded in the theme file itself - it lives here instead.',
    },

    accessibility: {
      upstreamClaim: `"Our charts are among the very few charting solutions providing elaborate accessibility support. The charts are WCAG 2.1 MAS C compliant for accessibility." - ${BLOB}/${LIB}/README.md`,
      docUrl: 'https://microsoft.github.io/fluentui-charting-contrib/docs/Accessibility',
      rules: [
        {
          rule: 'Never encode meaning with colour alone.',
          how: 'LineChart exposes allowMultipleShapesForPoints so each series gets a distinct point shape; Legends takes a `shape` per legend and the Shape component renders the glyph. Pair the shape with the colour so the chart survives greyscale printing and colour-vision deficiency.',
          verifiedFrom: 'LineChartProps.allowMultipleShapesForPoints, LegendsProps.shape and the exported Shape component in the API-Extractor report; the LineChart best-practices "Pinpoints" note calls this out as "a unique shape to remove reliance on colors as sole identifier of data set".',
        },
        {
          rule: 'Do not hand-pick adjacent hexes.',
          how: 'Let the chart cycle DataVizPalette (omit `color`). The qualitative slots are ordered so consecutive series stay distinguishable; picking your own adjacent colours discards that.',
          verifiedFrom: 'docs/colors.md: "We cycle through these colors sequentially to paint the data series without color." Custom CSS colours put the contrast burden on the caller by that doc\'s own wording.',
        },
        {
          rule: 'Check contrast, do not eyeball it.',
          how: 'getColorContrast(c1, c2) returns the WCAG ratio and getContrastTextColor(background) picks readable label text (it inverts once contrast would drop below 3).',
          verifiedFrom: 'Both are exported from src/utilities/colors.ts and implement the W3C relative-luminance formula the file links to.',
        },
        {
          rule: 'Respect the theme.',
          how: 'Render charts inside FluentProvider. 21 of the 40 qualitative slots and 6 of the 7 semantic colours have a distinct dark-theme value; hardcoding the light hex breaks dark mode and high contrast.',
          verifiedFrom: 'The two-element arrays in QualitativePalette/SemanticPalette and getThemeSpecificColor(colors, isDarkTheme).',
        },
        {
          rule: 'Keep the keyboard path.',
          how: 'Charts are enterable and arrow/tab navigable and expose per-point accessibility strings (xAxisCalloutAccessibilityData, callOutAccessibilityData, chartTitleAccessibilityData). Do not replace the built-in callout with a custom div that drops them.',
          verifiedFrom: 'The Accessibility section of the upstream BestPractices.md files and AccessibilityProps in the API-Extractor report.',
        },
        {
          rule: 'Cap the series count.',
          how: 'Upstream: "Don\'t use for more than 9 data points. Too many lines make it hard to read." Beyond that the palette starts repeating shapes and the chart stops being readable before it stops being colourful.',
          verifiedFrom: `${BLOB}/${STORIES}/LineChart/LineChartBestPractices.md`,
        },
      ],
      powerbiParallel: 'The same rules apply to a Power BI report: keep dataColors accessible against the background (>= 3:1), do not rely on colour alone (use markers/labels/conditional formatting icons), and prefer the shared DataVizPalette so the web and report surfaces agree.',
    },

    recipes: [
      {
        id: 'theme-a-chart',
        title: 'Theme a Fluent chart',
        note: 'Verified against the API-Extractor report at build time: every prop and export named below exists in @fluentui/react-charts@' + version + '.',
        code: [
          "import { FluentProvider, webLightTheme } from '@fluentui/react-components';",
          "import { LineChart, DataVizPalette, ResponsiveContainer } from '@fluentui/react-charts';",
          '',
          'const data = {',
          "  chartTitle: 'Revenue',",
          '  lineChartData: [',
          "    { legend: 'FY25', data: [{ x: new Date('2025-01-01'), y: 10 }, { x: new Date('2025-02-01'), y: 18 }] },",
          "    { legend: 'FY24', data: [{ x: new Date('2024-01-01'), y: 8 }, { x: new Date('2024-02-01'), y: 12 }], color: DataVizPalette.color7 },",
          '  ],',
          '};',
          '',
          '<FluentProvider theme={webLightTheme}>',
          '  <ResponsiveContainer height={320}>',
          '    <LineChart data={data} allowMultipleShapesForPoints />',
          '  </ResponsiveContainer>',
          '</FluentProvider>',
        ].join('\n'),
        why: 'FluentProvider supplies the tokens the charts read; omitting `color` lets the palette cycle; DataVizPalette.color7 pins one series; allowMultipleShapesForPoints adds the non-colour encoding.',
      },
      {
        id: 'match-powerbi',
        title: 'Make a Power BI report and a React chart agree',
        code: 'fluent_generate_powerbi_theme { brandColor: "#0F6CBD" }   // dataColors = DataVizPalette qualitative slots 1..40\n// React side: render the chart inside FluentProvider and omit `color` on each series.\n// Series N is then the same hex in both surfaces.',
        why: 'Both sides now read the same ordered palette, so a slide that puts a Power BI visual next to a React chart no longer shows two different blues for the same series.',
      },
    ],
  };

  // The recipe claims specific symbols exist. Prove it rather than trusting it.
  const claimed = ['LineChart', 'ResponsiveContainer'];
  for (const c of claimed) if (!decls.has(c)) throw new Error(`Recipe names ${c}, which is not exported.`);
  const lineProps = resolveProps(apiMd, 'LineChartProps').all.map((m) => m.name);
  for (const p of ['data', 'allowMultipleShapesForPoints']) {
    if (!lineProps.includes(p)) throw new Error(`Recipe uses LineChart prop "${p}", which the API report does not declare.`);
  }
  if (!colors.tokens.color7) throw new Error('Recipe uses DataVizPalette.color7, which is not in the token map.');

  // Parser guard. CartesianChartProps declares `reflowProps?: { mode: ... }`
  // and `secondaryYScaleOptions?: { yMinValue?: ... }`. If the member parser
  // ever leaks nested fields again, `mode` and `yMinValue` reappear as
  // top-level props of ten charts - and `mode` even reads as REQUIRED, which
  // would tell every caller to pass a prop that does not exist.
  const cartesian = parseMembers(parseInterface(apiMd, 'CartesianChartProps').body).map((m) => m.name);
  if (!cartesian.includes('reflowProps')) throw new Error('Parser guard: CartesianChartProps lost reflowProps.');
  // `mode` exists ONLY as a field of the inline `reflowProps?: { mode: ... }`
  // object, and it is declared without `?`. When the parser leaked nested
  // fields it surfaced as a REQUIRED top-level prop on ten charts - i.e. the
  // dataset told every caller to pass a prop that does not exist. (yMinValue
  // and yMaxValue look similar but are genuine top-level members as well as
  // nested ones, so they are NOT canaries.)
  if (cartesian.includes('mode')) throw new Error('Parser guard: nested field "mode" leaked out of reflowProps into CartesianChartProps.');
  const lineRequired = resolveProps(apiMd, 'LineChartProps').all.filter((m) => m.required).map((m) => m.name);
  if (lineRequired.length !== 1 || lineRequired[0] !== 'data') {
    throw new Error(`Parser guard: LineChart should require exactly [data]; got [${lineRequired.join(', ')}].`);
  }

  const json = JSON.stringify(data, null, 2) + '\n';
  console.log(`\n  ${charts.length} charts, ${qualitative.length} qualitative + ${semantic.length} semantic palette colours`);
  console.log(`  maturity: ${JSON.stringify(data.meta.maturityCounts)}`);
  console.log(`  unverified: ${unverified.length}`);
  if (DRY) {
    console.log('\n--dry-run: nothing written.');
    return;
  }
  writeFileSync(OUT, json, 'utf8');
  console.log(`\nWrote ${OUT.pathname.replace(/^\//, '')} (${json.length} bytes)`);
}

main().catch((e) => {
  console.error('BUILD FAILED:', e.message);
  process.exit(1);
});
