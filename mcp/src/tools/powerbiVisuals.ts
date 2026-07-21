import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { loadJson, textResult } from '../util.js';

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

export function registerPowerbiVisuals(server: McpServer): void {
  server.registerTool(
    'fluent_powerbi_visuals',
    {
      title: 'Power BI visual catalog (Fluent 2)',
      description:
        'Catalog of every Microsoft Power BI visual — comparison/trend charts, part-to-whole, distribution, tables/matrices, maps, cards/KPIs/gauges, AI-powered, filtering/slicers, buttons, custom visuals — each with its official Learn doc URL, when-to-use, and how the Fluent 2 base theme styles it (grounded in the official visualizations-overview + the 21-page Fluent 2 showcase report). Use when a user asks which Power BI visual to use, wants the doc/link for a visual, or asks how Fluent 2 styles a chart/table/slicer/etc. Filter by category, showcasePage, or a free-text query. Pair with fluent_generate_powerbi_theme (theme JSON) and fluent_scaffold_pbip (PBIP/PBIR project).',
      inputSchema: {
        query: z.string().optional().describe('Free-text search across visual name, description, when-to-use, category and showcase page (e.g. "trend over time", "part to whole", "slicer", "KPI", "map").'),
        category: z.string().optional().describe('Filter by category, e.g. "Comparison & trends", "AI-powered", "Cards, KPIs & gauges", "Filtering", "Maps", "Other". Omit for all.'),
        showcasePage: z.string().optional().describe('Filter by the Fluent 2 showcase report page, e.g. "Bars", "AI-powered", "Cards or callouts", "Conditional formatting".'),
        limit: z.number().int().min(1).max(60).default(25).describe('Max results to return.'),
      },
    },
    async ({ query, category, showcasePage, limit }) => {
      const data = loadJson<any>('powerbi-visuals.json');
      if (!data) return textResult('Power BI visual catalog not found at mcp/data/powerbi-visuals.json.');
      let items = flatten(data);

      if (category) items = items.filter((v) => norm(v.category).includes(norm(category)));
      if (showcasePage) items = items.filter((v) => norm(v.showcasePage || '').includes(norm(showcasePage)));
      if (query) items = items.filter((v) => matchesQuery(v, query));

      if (!query && !category && !showcasePage) {
        const overview = {
          note: 'Provide a "query", "category", and/or "showcasePage" to get matching Power BI visuals with their Learn doc URLs + Fluent 2 styling. Example: category="AI-powered" or query="trend over time".',
          counts: data.counts,
          categories: (data.categories || []).map((c: any) => ({ name: c.name, showcasePages: c.showcasePages, visuals: (c.visuals || []).map((v: any) => v.name) })),
          featurePages: (data.featurePages || []).map((f: any) => f.name),
          fluent2BaseTheme: data.fluent2BaseTheme,
          showcaseReport: data.showcaseReport,
        };
        return textResult(JSON.stringify(overview, null, 2));
      }

      if (items.length === 0) {
        return textResult(`No Power BI visual matched (category=${category ?? '-'}, showcasePage=${showcasePage ?? '-'}, query=${query ?? '-'}). Call with no arguments to list categories.`);
      }
      const filterDesc = [category && `category="${category}"`, showcasePage && `showcasePage="${showcasePage}"`, query && `query="${query}"`].filter(Boolean).join(', ');
      return textResult(render(items, limit, `Power BI visuals — ${items.length} result(s)${filterDesc ? ' for ' + filterDesc : ''}:`));
    }
  );
}
