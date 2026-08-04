import { z } from 'zod';
import { loadJson, textResult } from '../util.js';
export function registerPowerplatform(server) {
    server.registerTool('fluent_powerplatform_guidance', {
        title: 'Fluent 2 guidance for Power Platform',
        description: 'Return grounded, Microsoft-Learn-cited guidance for applying Fluent 2 on Power Platform: Power Apps canvas (modern controls + modern themes), model-driven apps (the New Look + modern theme overrides), Power Pages (Bootstrap + Fluent design-token CSS + standard code components), or PCF code components (Fluent React v9 via platform libraries + context.fluentDesignLanguage).',
        inputSchema: {
            surface: z
                .enum(['powerapps', 'model-driven', 'powerpages', 'pcf', 'all'])
                .default('all')
                .describe('Which Power Platform surface to return guidance for.'),
        },
    }, async ({ surface }) => {
        const data = loadJson('powerplatform.json');
        if (!data) {
            return textResult('Power Platform guidance not found at mcp/data/powerplatform.json.');
        }
        if (surface === 'all') {
            return textResult(JSON.stringify({
                powerapps: data.powerapps,
                modelDriven: data.modelDriven,
                powerpages: data.powerpages,
                pcf: data.pcf,
            }, null, 2));
        }
        const key = surface === 'model-driven' ? 'modelDriven' : surface;
        const section = data[key];
        if (!section)
            return textResult(`No guidance for surface "${surface}".`);
        return textResult(JSON.stringify(section, null, 2));
    });
}
