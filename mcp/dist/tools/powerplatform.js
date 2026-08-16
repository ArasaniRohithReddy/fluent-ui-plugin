import { z } from 'zod';
import { loadJson, textResult } from '../util.js';
import { buildIndex, capped, sizeOf, SECTION_MAX_CHARS } from './guidanceIndex.js';
export function registerPowerplatform(server) {
    server.registerTool('fluent_powerplatform_guidance', {
        title: 'Fluent 2 guidance for Power Platform',
        description: 'Return grounded, Microsoft-Learn-cited guidance for applying Fluent on Power Platform: Power Apps canvas (modern controls + modern themes), model-driven apps (the New Look + modern theme overrides), Power Pages (Bootstrap + Fluent design-token CSS + standard code components), or PCF code components (Fluent React v9 via platform libraries + context.fluentDesignLanguage, or Fluent 8 for v8 codebases). Use the "myths" surface to check corrected false claims, and "applies" to find out whether Fluent applies to a surface at all before recommending it. "all" returns a small INDEX of the surfaces — request one surface for its full guidance.',
        inputSchema: {
            surface: z
                .enum(['powerapps', 'model-driven', 'powerpages', 'pcf', 'myths', 'applies', 'all'])
                .default('all')
                .describe('Which Power Platform surface to return guidance for, or "myths"/"applies" for correctness checks. "all" returns an index, not every surface.'),
            maxChars: z
                .number()
                .int()
                .min(500)
                .max(200000)
                .default(SECTION_MAX_CHARS)
                .describe('Cap on the response size. Over the cap the payload is cut and clearly labelled; request a single surface instead.'),
        },
    }, async ({ surface, maxChars }) => {
        const data = loadJson('powerplatform.json');
        if (!data) {
            return textResult('Power Platform guidance not found at mcp/data/powerplatform.json.');
        }
        if (surface === 'myths') {
            if (!data.correctedMyths)
                return textResult('No corrected myths recorded.');
            return textResult(capped(JSON.stringify(data.correctedMyths, null, 2), maxChars, 'Request a single surface instead.'));
        }
        if (surface === 'applies') {
            if (!data.fluentAppliesBySurface)
                return textResult('No per-surface applicability matrix recorded.');
            return textResult(capped(JSON.stringify(data.fluentAppliesBySurface, null, 2), maxChars, 'Request a single surface instead.'));
        }
        if (surface === 'all') {
            // Returning every surface at once was ~33k characters. Hand back the
            // index instead (the fluent_v8_guidance pattern), and point at the two
            // correctness checks: several of those myths are the difference between
            // correct advice and confidently wrong advice.
            const surfaces = {
                powerapps: 'powerapps',
                'model-driven': 'modelDriven',
                powerpages: 'powerpages',
                pcf: 'pcf',
            };
            const entries = {};
            for (const [key, dataKey] of Object.entries(surfaces)) {
                entries[key] = { chars: sizeOf(data[dataKey]), present: data[dataKey] !== undefined };
            }
            entries.myths = { chars: sizeOf(data.correctedMyths), present: data.correctedMyths !== undefined };
            entries.applies = {
                chars: sizeOf(data.fluentAppliesBySurface),
                present: data.fluentAppliesBySurface !== undefined,
            };
            return textResult(buildIndex(entries, {
                what: 'Fluent 2 guidance surfaces for Power Platform',
                requestOne: 'fluent_powerplatform_guidance { surface: "pcf" }',
                extra: {
                    checkFirst: 'Before recommending anything, call surface:"applies" (does Fluent apply to that surface at all?) and surface:"myths" (corrected false claims).',
                },
            }));
        }
        const key = surface === 'model-driven' ? 'modelDriven' : surface;
        const section = data[key];
        if (!section)
            return textResult(`No guidance for surface "${surface}".`);
        return textResult(capped(JSON.stringify(section, null, 2), maxChars, `Surface "${surface}" is larger than the cap; raise maxChars to read it whole.`));
    });
}
