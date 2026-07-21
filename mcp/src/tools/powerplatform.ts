import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { loadJson, textResult } from '../util.js';

export function registerPowerplatform(server: McpServer): void {
  server.registerTool(
    'fluent_powerplatform_guidance',
    {
      title: 'Fluent 2 guidance for Power Platform',
      description:
        'Return grounded, Microsoft-Learn-cited guidance for applying Fluent 2 on Power Platform: Power Apps (modern controls + modern themes), Power Pages (Bootstrap + Fluent design-token CSS), or PCF code components (Fluent React v9 via platform libraries + context.fluentDesignLanguage).',
      inputSchema: {
        surface: z
          .enum(['powerapps', 'powerpages', 'pcf', 'all'])
          .default('all')
          .describe('Which Power Platform surface to return guidance for.'),
      },
    },
    async ({ surface }) => {
      const data = loadJson<any>('powerplatform.json');
      if (!data) {
        return textResult(
          'Power Platform guidance not found at mcp/data/powerplatform.json.'
        );
      }
      if (surface === 'all') {
        return textResult(
          JSON.stringify(
            {
              powerapps: data.powerapps,
              powerpages: data.powerpages,
              pcf: data.pcf,
            },
            null,
            2
          )
        );
      }
      const section = data[surface];
      if (!section) return textResult(`No guidance for surface "${surface}".`);
      return textResult(JSON.stringify(section, null, 2));
    }
  );
}
