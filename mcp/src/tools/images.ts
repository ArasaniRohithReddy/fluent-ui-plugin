import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { loadJson, textResult } from '../util.js';

interface MediaItem {
  id: string;
  source: 'component' | 'topic';
  owner: string;
  slug: string;
  category: string;
  platform: string;
  docUrl?: string;
  type: 'image' | 'video';
  kind: string;
  section?: string;
  alt?: string;
  url: string;
  labels?: string[];
  verdict?: string;
}

const norm = (s: string) => (s || '').toLowerCase().trim();

function matchesOwner(m: MediaItem, owner: string): boolean {
  const o = norm(owner);
  return norm(m.owner).includes(o) || norm(m.slug).includes(o) || norm(m.slug).replace(/-/g, ' ').includes(o);
}

function matchesQuery(m: MediaItem, query: string): boolean {
  const hay = norm([m.owner, m.slug, m.kind, m.section, m.alt, (m.labels || []).join(' ')].join(' '));
  return norm(query)
    .split(/\s+/)
    .filter(Boolean)
    .every((w) => hay.includes(w));
}

function render(items: MediaItem[], limit: number, header: string): string {
  const shown = items.slice(0, limit);
  const lines: string[] = [header, ''];
  shown.forEach((m, i) => {
    const tag = m.type === 'video' ? '🎬 video' : 'image';
    const bits = [m.owner, m.kind, m.section].filter(Boolean).join(' · ');
    lines.push(`${i + 1}. **${bits}** (${tag}${m.verdict ? ' · ' + m.verdict.toUpperCase() : ''})`);
    if (m.alt) lines.push(`   ${m.alt}`);
    if (m.labels && m.labels.length) lines.push(`   Parts: ${m.labels.join(' · ')}`);
    // Markdown embed (hosts that render markdown show it inline) + raw URL for copy/paste.
    lines.push(`   ![${(m.alt || m.owner).replace(/[[\]]/g, '')}](${m.url})`);
    lines.push(`   URL: ${m.url}`);
    if (m.docUrl) lines.push(`   Source page: ${m.docUrl}`);
    lines.push('');
  });
  if (items.length > limit) {
    lines.push(`… ${items.length - limit} more. Narrow with owner/kind/type or raise "limit".`);
  }
  return lines.join('\n');
}

export function registerImages(server: McpServer): void {
  server.registerTool(
    'fluent_get_images',
    {
      title: 'Fluent 2 images & videos (with source URLs)',
      description:
        'Return direct URLs to the official Microsoft Fluent 2 visuals from https://fluent2.microsoft.design — anatomy diagrams, do/don\'t examples, state/type illustrations, layout specs, and Motion demo videos — for a given component or design topic. Use this whenever a user asks to SEE or GET a link to a Fluent 2 diagram/example/anatomy/motion video (e.g. "show me the Card anatomy", "do and don\'t images for buttons", "responsible AI examples", "motion easing videos"). Every result includes the real CDN url plus a markdown image embed and the source doc page. Filter by owner (component/topic name or slug), kind (anatomy, dodont, state, type, layout, behavior, content, example, hero, principle, accessibility, workflow, video), type (image|video), or a free-text query.',
      inputSchema: {
        owner: z
          .string()
          .optional()
          .describe('Component or design-topic name/slug to get visuals for, e.g. "Card", "Message bar", "responsible-ai", "motion".'),
        kind: z
          .string()
          .optional()
          .describe('Filter by visual kind: anatomy | dodont | state | type | layout | behavior | content | example | hero | principle | accessibility | pattern | workflow | video. Omit for all kinds.'),
        type: z
          .enum(['image', 'video', 'all'])
          .default('all')
          .describe('Return images, videos (Motion demos), or all.'),
        verdict: z
          .enum(['do', 'dont', 'any'])
          .default('any')
          .describe('For do/don\'t examples, restrict to the "do" or the "don\'t" variant.'),
        query: z
          .string()
          .optional()
          .describe('Free-text search across owner, alt text, section, kind and callout labels (all words must match). Use when owner/kind aren\'t enough.'),
        limit: z.number().int().min(1).max(100).default(20).describe('Max results to return.'),
      },
    },
    async ({ owner, kind, type, verdict, query, limit }) => {
      const data = loadJson<{ $meta?: any; media?: MediaItem[] }>('fluent-images.json');
      if (!data || !Array.isArray(data.media)) {
        return textResult('Media index not found at mcp/data/fluent-images.json.');
      }
      let items = data.media;

      if (owner) items = items.filter((m) => matchesOwner(m, owner));
      if (kind && norm(kind) !== 'all') items = items.filter((m) => norm(m.kind) === norm(kind));
      if (type && type !== 'all') items = items.filter((m) => m.type === type);
      if (verdict && verdict !== 'any') items = items.filter((m) => m.verdict === verdict);
      if (query) items = items.filter((m) => matchesQuery(m, query));

      // No filters at all → return an overview so the caller can narrow down.
      if (!owner && !kind && !query && (!type || type === 'all') && (!verdict || verdict === 'any')) {
        const owners: Record<string, number> = {};
        for (const m of data.media) owners[m.owner] = (owners[m.owner] || 0) + 1;
        const overview = {
          note: 'Provide an "owner" (component/topic) and/or "kind"/"query" to get direct image/video URLs. Example: owner="Card", kind="anatomy".',
          counts: data.$meta?.counts,
          owners,
        };
        return textResult(JSON.stringify(overview, null, 2));
      }

      if (items.length === 0) {
        return textResult(
          `No Fluent 2 media matched (owner=${owner ?? '-'}, kind=${kind ?? '-'}, type=${type}, verdict=${verdict}, query=${query ?? '-'}). Try a broader filter, or call with no arguments to list available owners.`
        );
      }

      const filterDesc = [owner && `owner="${owner}"`, kind && `kind="${kind}"`, type !== 'all' && `type="${type}"`, verdict !== 'any' && `verdict="${verdict}"`, query && `query="${query}"`]
        .filter(Boolean)
        .join(', ');
      return textResult(render(items, limit, `Fluent 2 media — ${items.length} result(s)${filterDesc ? ' for ' + filterDesc : ''}:`));
    }
  );
}
