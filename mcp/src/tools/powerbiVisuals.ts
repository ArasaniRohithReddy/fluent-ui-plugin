import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { loadJson, textResult, provenanceFooter } from '../util.js';

interface Visual {
  name: string;
  category: string;
  showcasePage?: string;
  learnDoc: string;
  description?: string;
  whenToUse?: string;
  fluent2?: string;
  stylePreset?: string;
  subTypes?: string[];
  appliesTo?: string[];
  preview?: boolean;
  notes?: string;
}

interface ChartProp {
  name: string;
  type: string;
  required: boolean;
  deprecated?: boolean;
}

interface Chart {
  id: string;
  name: string;
  category: string;
  role: string;
  maturity: string;
  description: string | null;
  whenToUse: string | null;
  npmPackage: string;
  npmPackageVersion: string;
  reactImport: string;
  propsType: string;
  propsInheritedFrom: string[];
  keyProps: ChartProp[];
  inheritedPropCount: number;
  requiredProps: string[];
  a11y: string | null;
  dos: string[];
  donts: string[];
  bestPracticesUrl: string | null;
  powerbiEquivalent: string | null;
  powerbiNote?: string;
  readmeAvailability: { readmeRow: string; v8: string; v9: string; webComponent: string } | null;
  storybookVariants: string[];
  sourceUrl: string;
  docsSourceUrl: string;
}

const norm = (s: string) => (s || '').toLowerCase().trim();

function flatten(data: any): Visual[] {
  const out: Visual[] = [];
  for (const cat of data.categories || []) {
    for (const v of cat.visuals || []) out.push({ ...v, category: cat.name });
  }
  for (const f of data.featurePages || []) out.push({ ...f, category: 'Feature (applies across visuals)' });
  return out;
}

function matchesQuery(v: Visual, q: string): boolean {
  const hay = norm([v.name, v.category, v.showcasePage, v.description, v.whenToUse, v.fluent2, (v.subTypes || []).join(' ')].join(' '));
  return norm(q).split(/\s+/).filter(Boolean).every((w) => hay.includes(w));
}

/**
 * Charts are matched on the same fields as visuals PLUS their upstream do's,
 * don'ts and the Power BI visual they map to - so "trend over time" finds
 * LineChart (whose upstream description literally says "trends over a period of
 * time") and "donut" finds both the Power BI visual and the Fluent component.
 */
function chartMatchesQuery(c: Chart, q: string): boolean {
  const hay = norm(
    [c.name, c.category, c.role, c.description, c.whenToUse, c.powerbiEquivalent, c.dos.join(' '), c.donts.join(' '), c.npmPackage].join(' '),
  );
  return norm(q).split(/\s+/).filter(Boolean).every((w) => hay.includes(w));
}

function render(items: Visual[], limit: number, header: string): string {
  const shown = items.slice(0, limit);
  const lines: string[] = [header, ''];
  shown.forEach((v, i) => {
    lines.push(`${i + 1}. **${v.name}**${v.preview ? ' _(preview)_' : ''} — ${v.category}${v.showcasePage ? ` · showcase: ${v.showcasePage}` : ''}`);
    if (v.description) lines.push(`   ${v.description}`);
    if (v.whenToUse) lines.push(`   When to use: ${v.whenToUse}`);
    if (v.fluent2) lines.push(`   Fluent 2: ${v.fluent2}`);
    if (v.stylePreset) lines.push(`   Style preset: ${v.stylePreset}`);
    if (v.subTypes && v.subTypes.length) lines.push(`   Sub-types: ${v.subTypes.join(' · ')}`);
    if (v.notes) lines.push(`   Note: ${v.notes}`);
    lines.push(`   Learn doc: ${v.learnDoc}`);
    lines.push('');
  });
  if (items.length > limit) lines.push(`… ${items.length - limit} more. Narrow with category/showcasePage/query or raise "limit".`);
  return lines.join('\n');
}

const trim = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s);

function renderCharts(items: Chart[], limit: number, header: string, palette: any): string {
  const shown = items.slice(0, limit);
  const lines: string[] = [header, ''];
  shown.forEach((c, i) => {
    lines.push(`${i + 1}. **${c.name}** _(${c.maturity})_ — ${c.category}${c.role !== 'chart' ? ` · ${c.role}` : ''}`);
    if (c.description) lines.push(`   ${trim(c.description, 320)}`);
    if (c.whenToUse) lines.push(`   When to use: ${c.whenToUse}`);
    lines.push(`   Import: ${c.reactImport}   (${c.npmPackage}@${c.npmPackageVersion})`);
    const req = c.requiredProps.length ? c.requiredProps.join(', ') : 'none';
    const optional = c.keyProps.filter((p) => !p.required).slice(0, 8).map((p) => p.name);
    lines.push(`   Props: required [${req}]${optional.length ? ` · notable [${optional.join(', ')}]` : ''}${c.inheritedPropCount ? ` · +${c.inheritedPropCount} inherited from ${c.propsInheritedFrom.join(' > ')}` : ''}`);
    lines.push(
      `   Theming: render inside <FluentProvider theme={webLightTheme}>; omit \`color\` on a series to cycle DataVizPalette, or pin one with DataVizPalette.color1…color${palette?.qualitativeCount ?? 40} / .success / .error.`,
    );
    if (c.dos.length) lines.push(`   Do: ${trim(c.dos[0], 200)}`);
    if (c.donts.length) lines.push(`   Don't: ${trim(c.donts[0], 200)}`);
    if (c.a11y) lines.push(`   Accessibility: ${trim(c.a11y.replace(/\s*\n\s*-\s*/g, ' · ').replace(/^-\s*/, '').replace(/\s+/g, ' '), 260)}`);
    if (c.powerbiEquivalent) lines.push(`   Power BI equivalent: ${c.powerbiEquivalent}${c.powerbiNote ? ` — ${c.powerbiNote}` : ''}`);
    else lines.push('   Power BI equivalent: none (no first-party Power BI visual does this).');
    if (c.readmeAvailability && c.readmeAvailability.v9 !== 'Stable') {
      // The README column is either a caveat ("Preview", "Planned", "-") or a
      // ship date ("April 2025"). Printing a ship date as a caveat made three
      // perfectly stable charts look risky.
      const v9 = c.readmeAvailability.v9;
      if (/preview|planned/i.test(v9) || v9 === '-') {
        lines.push(`   Upstream caveat: the react-charts README availability table lists this as v9 = "${v9}".`);
      } else {
        lines.push(`   Shipped in v9: ${v9} (react-charts README availability table).`);
      }
    }
    lines.push(`   Docs: ${c.docsSourceUrl}`);
    lines.push('');
  });
  if (items.length > limit) lines.push(`… ${items.length - limit} more Fluent chart(s). Narrow with category/query or raise "limit".`);
  return lines.join('\n');
}

export function registerPowerbiVisuals(server: McpServer): void {
  server.registerTool(
    'fluent_powerbi_visuals',
    {
      title: 'Power BI visual + Fluent chart catalog (Fluent 2)',
      description:
        'Answer "which chart do I use for X, and how do I theme it?" across BOTH data-visualisation surfaces. (1) Every Microsoft Power BI visual — comparison/trend charts, part-to-whole, distribution, tables/matrices, maps, cards/KPIs/gauges, AI-powered, filtering/slicers, buttons, custom visuals — with its official Learn doc URL, when-to-use, and how the Fluent 2 base theme styles it. (2) Every chart in @fluentui/react-charts, the Fluent 2 (v9) first-party React chart library — with its maturity tier, import, real props, upstream do\'s/don\'ts, accessibility behaviour, DataVizPalette theming and the Power BI visual it corresponds to. Use surface="fluent-charts" for web/React, "powerbi" for a report, or the default "both" to see the mapping. Sibling packages @fluentui/react-charting (v8-era, legacy) and @fluentui/chart-web-components (0.0.x, preview) export THE SAME component names, so call this rather than guessing an import. Pair with fluent_generate_powerbi_theme (whose dataColors are the DataVizPalette slots listed here) and fluent_scaffold_pbip.',
      inputSchema: {
        query: z.string().optional().describe('Free-text search across name, description, when-to-use, category, showcase page and (for Fluent charts) the upstream do\'s/don\'ts — e.g. "trend over time", "part to whole", "slicer", "KPI", "map", "sankey".'),
        category: z.string().optional().describe('Filter by category, e.g. "Comparison & trends", "AI-powered", "Cards, KPIs & gauges", "Filtering", "Maps", "Other". Fluent-chart-only categories: "Flow & hierarchy", "Project & schedule", "Declarative & schema-driven", "Chart building blocks". Omit for all.'),
        showcasePage: z.string().optional().describe('Filter by the Fluent 2 showcase report page, e.g. "Bars", "AI-powered", "Cards or callouts", "Conditional formatting". Power BI visuals only.'),
        surface: z
          .enum(['powerbi', 'fluent-charts', 'both'])
          .default('both')
          .describe('Which catalog to search: "powerbi" = Power BI report visuals only; "fluent-charts" = @fluentui/react-charts components only; "both" (default) = returns the Power BI visuals then the matching Fluent charts, which is how you see the mapping between them.'),
        limit: z.number().int().min(1).max(60).default(25).describe('Max results to return, per surface.'),
      },
    },
    async ({ query, category, showcasePage, surface, limit }) => {
      const data = loadJson<any>('powerbi-visuals.json');
      if (!data) return textResult('Power BI visual catalog not found at mcp/data/powerbi-visuals.json.');
      const chartsData = loadJson<any>('fluent-charts.json');
      const wantPbi = surface !== 'fluent-charts';
      const wantCharts = surface !== 'powerbi' && !!chartsData;

      let items = flatten(data);
      if (category) items = items.filter((v) => norm(v.category).includes(norm(category)));
      if (showcasePage) items = items.filter((v) => norm(v.showcasePage || '').includes(norm(showcasePage)));
      if (query) items = items.filter((v) => matchesQuery(v, query));
      if (!wantPbi) items = [];

      let charts: Chart[] = wantCharts ? (chartsData.charts as Chart[]) : [];
      // showcasePage is a Power BI report concept; asking for one is asking for
      // report visuals, so it excludes the React catalog rather than silently
      // returning charts that cannot satisfy the filter.
      if (showcasePage) charts = [];
      if (category) charts = charts.filter((c) => norm(c.category).includes(norm(category)));
      if (query) charts = charts.filter((c) => chartMatchesQuery(c, query));

      const caveats = (chartsData?.meta?.unverified?.entries ?? []).map((u: any) => `${u.name} — ${u.note}`);

      if (!query && !category && !showcasePage) {
        const overview: any = {
          note: 'Provide a "query", "category", and/or "showcasePage" to get matching charts. Add surface="fluent-charts" for the React library only, or surface="powerbi" for report visuals only. Example: query="trend over time" or category="AI-powered".',
        };
        if (wantPbi) {
          overview.powerbi = {
            counts: data.counts,
            categories: (data.categories || []).map((c: any) => ({ name: c.name, showcasePages: c.showcasePages, visuals: (c.visuals || []).map((v: any) => v.name) })),
            featurePages: (data.featurePages || []).map((f: any) => f.name),
            fluent2BaseTheme: data.fluent2BaseTheme,
            showcaseReport: data.showcaseReport,
          };
        }
        if (wantCharts) {
          overview.fluentCharts = {
            summary: `${chartsData.meta.chartsCatalogued} components in ${chartsData.meta.reactPackage}@${chartsData.meta.reactPackageVersion} — the Fluent 2 (v9) first-party chart library.`,
            packages: (chartsData.meta.packages || []).map((p: any) => ({
              name: p.name,
              version: p.version,
              maturity: p.maturity,
              use: p.use,
              generation: p.generation,
              ...(p.collisionWarning ? { collisionWarning: p.collisionWarning } : {}),
            })),
            byCategory: Object.fromEntries(
              (chartsData.meta.categories || []).map((cat: string) => [cat, (chartsData.charts as Chart[]).filter((c) => c.category === cat).map((c) => c.name)]),
            ),
            dataVizPalette: {
              export: chartsData.dataVizPalette.export,
              qualitative: chartsData.dataVizPalette.qualitativeCount,
              semantic: chartsData.dataVizPalette.semanticCount,
              howItWorks: chartsData.dataVizPalette.howItWorks,
              themeVariation: chartsData.dataVizPalette.themeVariation,
            },
            powerbiAlignment: chartsData.powerbiAlignment,
            accessibility: chartsData.accessibility.rules.map((r: any) => r.rule),
            unverified: chartsData.meta.unverified.count,
            // Embedded rather than appended as a text footer: this branch
            // returns machine-readable JSON and a trailing footer would make it
            // unparseable.
            unverifiedEntries: caveats,
          };
        }
        return textResult(JSON.stringify(overview, null, 2));
      }

      if (items.length === 0 && charts.length === 0) {
        return textResult(
          `No chart matched (surface=${surface}, category=${category ?? '-'}, showcasePage=${showcasePage ?? '-'}, query=${query ?? '-'}). Call with no arguments to list the categories on both surfaces.`,
        );
      }

      const filterDesc = [category && `category="${category}"`, showcasePage && `showcasePage="${showcasePage}"`, query && `query="${query}"`].filter(Boolean).join(', ');
      const blocks: string[] = [];
      if (items.length) blocks.push(render(items, limit, `Power BI visuals — ${items.length} result(s)${filterDesc ? ' for ' + filterDesc : ''}:`));
      if (charts.length) {
        blocks.push(
          renderCharts(
            charts,
            limit,
            `Fluent 2 React charts (${chartsData.meta.reactPackage}@${chartsData.meta.reactPackageVersion}) — ${charts.length} result(s)${filterDesc ? ' for ' + filterDesc : ''}:`,
            chartsData.dataVizPalette,
          ),
        );
        blocks.push(
          `Same colours on both surfaces: fluent_generate_powerbi_theme emits dataColors from DataVizPalette's ${chartsData.dataVizPalette.qualitativeCount} qualitative slots in slot order, so series N in the report and series N in the React chart are the same hex.`,
        );
      } else if (wantCharts && items.length) {
        blocks.push('No @fluentui/react-charts component matched this filter. Fluent charts cover the cartesian/part-to-whole/distribution families; maps, AI-powered visuals and slicers are Power BI-only.');
      }
      const terms = [query, category].filter(Boolean).map(String).concat(charts.map((c) => c.name));
      return textResult(blocks.join('\n\n') + provenanceFooter(charts.length ? caveats : [], { terms, seeAlso: 'mcp/data/fluent-charts.json → meta.unverified' }));
    }
  );
}
