import { z } from 'zod';
import { loadJson, textResult } from '../util.js';
export function registerPowerplatform(server) {
    server.registerTool('fluent_powerplatform_guidance', {
        title: 'Fluent 2 guidance for Power Platform',
        description: 'Return grounded, Microsoft-Learn-cited guidance for applying Fluent on Power Platform: Power Apps canvas (modern controls + modern themes), model-driven apps (the New Look + modern theme overrides), Power Pages (Bootstrap + Fluent design-token CSS + standard code components), or PCF code components (Fluent React v9 via platform libraries + context.fluentDesignLanguage, or Fluent 8 for v8 codebases). Use the "myths" surface to check corrected false claims, and "applies" to find out whether Fluent applies to a surface at all before recommending it.',
        inputSchema: {
            surface: z
                .enum(['powerapps', 'model-driven', 'powerpages', 'pcf', 'myths', 'applies', 'all'])
                .default('all')
                .describe('Which Power Platform surface to return guidance for, or "myths"/"applies" for correctness checks.'),
        },
    }, async ({ surface }) => {
        const data = loadJson('powerplatform.json');
        if (!data) {
            return textResult('Power Platform guidance not found at mcp/data/powerplatform.json.');
        }
        if (surface === 'myths') {
            if (!data.correctedMyths)
                return textResult('No corrected myths recorded.');
            return textResult(JSON.stringify(data.correctedMyths, null, 2));
        }
        if (surface === 'applies') {
            if (!data.fluentAppliesBySurface)
                return textResult('No per-surface applicability matrix recorded.');
            return textResult(JSON.stringify(data.fluentAppliesBySurface, null, 2));
        }
        if (surface === 'all') {
            return textResult(JSON.stringify({
                powerapps: data.powerapps,
                modelDriven: data.modelDriven,
                powerpages: data.powerpages,
                pcf: data.pcf,
                // Surfaced with the guidance rather than hidden behind a separate
                // call: several of these myths are the difference between correct
                // advice and confidently wrong advice.
                fluentAppliesBySurface: data.fluentAppliesBySurface,
                correctedMyths: data.correctedMyths,
            }, null, 2));
        }
        const key = surface === 'model-driven' ? 'modelDriven' : surface;
        const section = data[key];
        if (!section)
            return textResult(`No guidance for surface "${surface}".`);
        return textResult(JSON.stringify(section, null, 2));
    });
}
