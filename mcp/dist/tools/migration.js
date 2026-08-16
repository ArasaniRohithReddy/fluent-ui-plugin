import { z } from 'zod';
import { loadJson, textResult } from '../util.js';
import { buildIndex, capped, describeValue, sizeOf, SECTION_MAX_CHARS } from './guidanceIndex.js';
export function registerMigration(server) {
    server.registerTool('fluent_migration_guidance', {
        title: 'Fluent 2 adoption & migration guidance',
        description: 'Guidance for adopting Fluent 2 in an EXISTING app or report: Fluent UI React v8 -> v9 (shims, side-by-side, component mapping, theme bridge), the EXECUTABLE tooling Microsoft ships (@fluentui/codemods rules, @fluentui/react-migration-v8-v9 shims + createV8Theme/createV9Theme/createBrandVariants, @fluentui/react-migration-v0-v9, and the *-compat packages) with real commands, imports and upstream-derived versions, from another design system (MUI/Chakra/Ant Design/Bootstrap), replacing hardcoded values with design tokens, applying Fluent 2 to an existing Power BI PBIP/PBIR report and repairing the layout distortion it causes, and per-surface adoption (Power BI, Power Apps, Power Pages, PCF).',
        inputSchema: {
            scenario: z
                .enum(['v8-to-v9', 'tooling', 'from-design-system', 'hardcoded-to-tokens', 'powerbi-report', 'per-surface', 'all'])
                .default('all')
                .describe('Which adoption/migration scenario to return. Use "tooling" for runnable commands and imports.'),
            maxChars: z
                .number()
                .int()
                .min(2000)
                .max(200000)
                .default(SECTION_MAX_CHARS)
                .describe('Cap on the response size. Over the cap the payload is cut and clearly labelled; request a narrower scenario instead.'),
        },
    }, async ({ scenario, maxChars }) => {
        const data = loadJson('migration.json');
        if (!data)
            return textResult('Migration guidance not found at mcp/data/migration.json.');
        const s = data.scenarios || {};
        const map = {
            'v8-to-v9': s.v8ToV9,
            tooling: s.tooling,
            'from-design-system': s.fromOtherDesignSystem,
            'hardcoded-to-tokens': s.hardcodedToTokens,
            'powerbi-report': s.powerbiReport,
            'per-surface': s.perSurface,
        };
        // Returning every scenario grew to ~83,000 characters as the executable
        // tooling inventory landed. Answer `all` with an index, matching the
        // other guidance tools.
        if (scenario === 'all') {
            const entries = {};
            for (const [key, value] of Object.entries(map)) {
                if (!value)
                    continue;
                entries[key] = { chars: sizeOf(value), summary: describeValue(value) };
            }
            return textResult(buildIndex(entries, {
                what: 'Fluent 2 adoption and migration scenarios',
                requestOne: 'fluent_migration_guidance { scenario: "v8-to-v9" }  — or "tooling" for runnable commands and imports',
            }));
        }
        const section = map[scenario];
        if (!section) {
            return textResult(`No guidance for scenario "${scenario}". Valid scenarios: ${Object.keys(map).join(', ')}, all.`);
        }
        return textResult(capped(JSON.stringify(section, null, 2), maxChars, `Request a narrower scenario, or raise maxChars. Scenario "${scenario}" is ${sizeOf(section).toLocaleString('en-US')} characters in full.`));
    });
}
