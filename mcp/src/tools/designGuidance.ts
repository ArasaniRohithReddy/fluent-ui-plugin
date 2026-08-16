import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { loadJson, textResult, loadLocalOverlay, withLocalOverlay } from '../util.js';
import { buildIndex, capped, sizeOf, TOPIC_MAX_CHARS } from './guidanceIndex.js';

/** Sections carry a heading + text; the shape is stable across every topic. */
interface GuidanceSection {
  heading?: string;
  text?: string;
  [k: string]: unknown;
}

/**
 * A gated topic returns four empty arrays plus a notice. Empty arrays are a
 * hallucination magnet — a model reads "sections: []" as "there is nothing to
 * say" rather than "the source is behind a sign-in and was not captured" — so
 * the refusal has to be machine-readable, not just prose in gatedNotice.
 */
const GATED_INSTRUCTION =
  'No content is available for this topic: the source page is behind a Microsoft sign-in and was not captured ' +
  '(see NOTICE). Do not infer or generate guidance for this topic from its name, from related topics, or from ' +
  'general knowledge presented as Fluent 2 guidance. Cite docUrl and stop.';

function isGated(topic: any): boolean {
  if (!topic || typeof topic !== 'object') return false;
  if (!topic.gatedNotice) return false;
  const empty = (v: unknown) => !Array.isArray(v) || v.length === 0;
  return empty(topic.keyPoints) && empty(topic.sections);
}

/** Path shown to the reader — the gitignored file the overlay is read from. */
const OVERLAY_FILE = 'mcp/data/local/design-guidance.json';

const OVERLAY_NOTE =
  'Restored from this checkout\'s own gitignored copy at ' +
  OVERLAY_FILE +
  '. The published dataset withholds the prose of sign-in-gated Microsoft pages (see NOTICE) and ships the facts ' +
  'plus docUrl, so a fresh clone of the plugin returns the stub for this topic, not this text. Cite docUrl when quoting it.';

/**
 * Say which of the two datasets answered.
 *
 * The overlay is correct behaviour, but it makes one machine answer differently
 * from a fresh clone for the same call, and nothing in the response used to
 * admit that. Provenance travels with the answer so restored text is never
 * mistaken for published text.
 */
function provenanceFor(published: any, resolved: any, enriched: boolean): Record<string, unknown> {
  return enriched
    ? {
        source: 'local-overlay',
        overlayFile: OVERLAY_FILE,
        publishedChars: sizeOf(published),
        restoredChars: sizeOf(resolved),
        note: OVERLAY_NOTE,
      }
    : {
        source: 'published',
        note: 'From the published dataset (mcp/data/design-guidance.json). Every clone returns this same content.',
      };
}

export function registerDesignGuidance(server: McpServer): void {
  server.registerTool(
    'fluent_design_guidance',
    {
      title: 'Fluent 2 design-language guidance',
      description:
        'Return grounded, source-cited Fluent 2 (Fluent UI 2.0) design-language guidance from https://fluent2.microsoft.design. Covers 40 topics: the design foundations (design-principles, color, typography, layout, elevation, iconography, motion, shapes, material), UX frameworks (accessibility, content-design, design-tokens, handoffs, onboarding, wait-ux), AI/Copilot guidance (responsible-ai, ai-harm, entry-points, personality-principles, copilot-errors, data-usage-sharing), the full content-engineering practice (system prompt engineering and the evaluating-output-quality track, under content-engineering-* keys), and four system/site topics: component-roadmap (the lifecycle stages plus the per-component status table — the only way to answer "is X stable, preview, or still planned"), whats-new (what changed in Fluent 2), web-component-index (which components the site publishes for React and Web Components, with their routes), and site-routes (sitemap, employee-gated routes, the never-404 behaviour, known duplicate routes). Pass "all" to get a small INDEX of every topic with its size (never the whole corpus). A topic larger than maxChars comes back as an outline plus a section list; pass "section" to read one section in full, or raise "maxChars". Every response carries $provenance.source: "published" (what any clone of the plugin returns) or "local-overlay" (restored from this checkout\'s own gitignored mcp/data/local/ copy of guidance the published dataset withholds — see NOTICE). Use this for the reasoning layer (why/when to apply a style); use fluent_list_tokens / fluent_get_token for exact token values.',
      inputSchema: {
        topic: z
          .enum([
            'design-principles',
            'color',
            'typography',
            'layout',
            'elevation',
            'iconography',
            'motion',
            'shapes',
            'material',
            'accessibility',
            'content-design',
            'design-tokens',
            'handoffs',
            'onboarding',
            'wait-ux',
            'responsible-ai',
            'ai-harm',
            'content-engineering',
            'content-engineering-evals',
            'content-engineering-system-prompt-engineering',
            'content-engineering-define-system-level-behavior',
            'content-engineering-define-task-behavior-patterns',
            'content-engineering-define-prompts-for-complex-tasks',
            'content-engineering-design-interaction-behavior',
            'content-engineering-define-tone-and-context-behavior',
            'content-engineering-define-good-output-quality',
            'content-engineering-decide-what-to-evaluate-first',
            'content-engineering-define-output-requirements-by-experience-type',
            'content-engineering-build-a-prompt-set-and-assertions-for-an-eval',
            'content-engineering-understand-eval-results',
            'content-engineering-turn-eval-results-into-the-right-fixes',
            'content-engineering-track-quality-over-time',
            'entry-points',
            'personality-principles',
            'copilot-errors',
            'data-usage-sharing',
            // Added to match mcp/data/design-guidance.json, which now ships 40
            // topics. Without these four the data is unreachable through the
            // enum and only appears in the "all" index.
            'component-roadmap',
            'whats-new',
            'web-component-index',
            'site-routes',
            'component-roadmap',
            'whats-new',
            'web-component-index',
            'site-routes',
            'all',
          ])
          .default('all')
          .describe('Which Fluent 2 design-language topic to return guidance for. "all" returns an index, not the corpus.'),
        section: z
          .string()
          .optional()
          .describe(
            'Optional case-insensitive substring of a section heading within the topic. Returns only the matching section(s) in full — the way to read a large topic without truncation.'
          ),
        maxChars: z
          .number()
          .int()
          .min(500)
          .max(200000)
          .default(TOPIC_MAX_CHARS)
          .describe(
            'Cap on the response size. Over the cap a topic is returned as an outline (summary + keyPoints + section headings) instead of full text; use "section" to read the parts you need. The default returns every topic whole except the two outliers (data-usage-sharing, responsible-ai).'
          ),
      },
    },
    async ({ topic, section, maxChars }) => {
      const data = loadJson<any>('design-guidance.json');
      if (!data) {
        return textResult(
          'Design-language guidance not found at mcp/data/design-guidance.json.'
        );
      }
      const topics = data.topics || {};
      const overlay = loadLocalOverlay('design-guidance.json');
      // Apply the local overlay on EVERY branch. It used to be applied only on
      // the single-topic branch, so "all" served gated stubs to a reader who
      // had the full content locally.
      const isEnriched = (t: any): boolean => !!(overlay && t?.title && overlay[t.title]);
      const resolveTopic = (key: string): any => {
        const t = topics[key];
        if (!t) return null;
        return withLocalOverlay(t as any, overlay, (t as any)?.title);
      };

      if (topic === 'all') {
        const entries: Record<string, any> = {};
        let enrichedCount = 0;
        for (const key of Object.keys(topics)) {
          const t = resolveTopic(key);
          const enriched = isEnriched(topics[key]);
          if (enriched) enrichedCount++;
          // Every row carries its own provenance (accessStatus + capturedAt):
          // a topic captured before Microsoft put its page behind a sign-in is
          // otherwise indistinguishable from one verified today. `source` marks
          // the rows this checkout answers differently from a fresh clone.
          entries[key] = {
            chars: sizeOf(t),
            sections: Array.isArray(t?.sections) ? t.sections.length : 0,
            accessStatus: t?.accessStatus,
            capturedAt: t?.capturedAt,
            ...(enriched ? { source: 'local-overlay' } : {}),
            ...(isGated(t) ? { gated: true } : {}),
          };
        }
        return textResult(
          buildIndex(entries, {
            what: 'Fluent 2 design-language topics',
            requestOne: 'fluent_design_guidance { topic: "color" } — or { topic: "color", section: "contrast" }',
            entriesKey: 'topics',
            extra: {
              // What a fresh clone would return, stated up front.
              localOverlay: overlay
                ? {
                    present: true,
                    file: OVERLAY_FILE,
                    enrichedTopics: enrichedCount,
                    note:
                      'Rows marked source:"local-overlay" come from this checkout\'s gitignored copy; a fresh clone ' +
                      'returns the published stub for them.',
                  }
                : { present: false, file: OVERLAY_FILE, note: 'Published content only — what any clone returns.' },
              $meta: {
                docBase: data.$meta?.docBase,
                // The do/don't convention is a correctness hazard, not trivia:
                // a "dont" entry reads like an instruction, so it must travel
                // with any listing of this dataset.
                doDontConvention: data.$meta?.doDontConvention,
              },
            },
          })
        );
      }

      const resolved = resolveTopic(topic);
      if (!resolved) return textResult(`No guidance for topic "${topic}".`);

      const gated = isGated(resolved);
      const provenance = provenanceFor(topics[topic], resolved, isEnriched(topics[topic]));
      const body: any = gated ? { ...resolved, agentInstruction: GATED_INSTRUCTION } : resolved;

      // A named section is an explicit, bounded request: honour it in full.
      if (section && section.trim()) {
        const needle = section.trim().toLowerCase();
        const all: GuidanceSection[] = Array.isArray(body.sections) ? body.sections : [];
        const hits = all.filter((s) => String(s?.heading ?? '').toLowerCase().includes(needle));
        if (!hits.length) {
          return textResult(
            JSON.stringify(
              {
                $provenance: provenance,
                topic,
                section,
                matched: 0,
                of: all.length,
                availableHeadings: all.map((s) => s?.heading ?? '(untitled)'),
                ...(gated ? { agentInstruction: GATED_INSTRUCTION, gatedNotice: body.gatedNotice } : {}),
              },
              null,
              2
            )
          );
        }
        return textResult(
          capped(
            JSON.stringify(
              {
                $provenance: provenance,
                topic,
                title: body.title,
                section,
                matched: hits.length,
                of: all.length,
                docUrl: body.docUrl,
                sections: hits,
              },
              null,
              2
            ),
            maxChars,
            `Narrow the section filter: "${section}" matched ${hits.length} of ${all.length} sections.`
          )
        );
      }

      const full = JSON.stringify({ $provenance: provenance, ...body }, null, 2);
      if (full.length <= maxChars) return textResult(full);

      // Over the cap: hand back a structured outline that still parses, rather
      // than a cut-off blob. Everything needed to make the next call is here —
      // including the section headings, which double as the `section` argument.
      const sections: GuidanceSection[] = Array.isArray(body.sections) ? body.sections : [];
      const outline = {
        $provenance: provenance,
        topic,
        title: body.title,
        summary: body.summary,
        docUrl: body.docUrl,
        accessStatus: body.accessStatus,
        capturedAt: body.capturedAt,
        truncated: true,
        sectionsAreHeadingsOnly: true,
        fullChars: full.length,
        maxChars,
        agentInstruction: gated
          ? GATED_INSTRUCTION
          : 'This is an OUTLINE: section text has been withheld for size. Do not answer from the headings alone — call ' +
            `fluent_design_guidance { topic: "${topic}", section: "<heading>" } for the section you need, or raise maxChars.`,
        keyPoints: body.keyPoints ?? [],
        sections: sections.map((s) => ({
          heading: s?.heading ?? '(untitled)',
          chars: sizeOf(s),
          textWithheld: true,
        })),
        images: Array.isArray(body.images) ? body.images.length : 0,
        ...(gated ? { gatedNotice: body.gatedNotice } : {}),
        ...(gated ? { gatedNotice: body.gatedNotice } : {}),
      };
      return textResult(
        capped(
          JSON.stringify(outline, null, 2),
          maxChars,
          `Request one section: fluent_design_guidance { topic: "${topic}", section: "<heading>" }.`
        )
      );
    }
  );
}
