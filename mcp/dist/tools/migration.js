import { z } from 'zod';
import { loadJson, textResult } from '../util.js';
export function registerMigration(server) {
    server.registerTool('fluent_migration_guidance', {
        title: 'Fluent 2 adoption & migration guidance',
        description: 'Guidance for adopting Fluent 2 in an EXISTING app or report: Fluent UI React v8 -> v9 (shims, side-by-side, component mapping, theme bridge), from another design system (MUI/Chakra/Ant Design/Bootstrap), replacing hardcoded values with design tokens, applying Fluent 2 to an existing Power BI PBIP/PBIR report and repairing the layout distortion it causes, and per-surface adoption (Power BI, Power Apps, Power Pages, PCF).',
        inputSchema: {
            scenario: z
                .enum(['v8-to-v9', 'from-design-system', 'hardcoded-to-tokens', 'powerbi-report', 'per-surface', 'all'])
                .default('all')
                .describe('Which adoption/migration scenario to return.'),
        },
    }, async ({ scenario }) => {
        const data = loadJson('migration.json');
        if (!data)
            return textResult('Migration guidance not found at mcp/data/migration.json.');
        const s = data.scenarios || {};
        if (scenario === 'all')
            return textResult(JSON.stringify(s, null, 2));
        const map = {
            'v8-to-v9': s.v8ToV9,
            'from-design-system': s.fromOtherDesignSystem,
            'hardcoded-to-tokens': s.hardcodedToTokens,
            'powerbi-report': s.powerbiReport,
            'per-surface': s.perSurface,
        };
        const section = map[scenario];
        if (!section)
            return textResult(`No guidance for scenario "${scenario}".`);
        return textResult(JSON.stringify(section, null, 2));
    });
}
