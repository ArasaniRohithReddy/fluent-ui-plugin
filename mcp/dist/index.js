#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { registerPowerbiTheme } from './tools/powerbiTheme.js';
import { registerPbip } from './tools/pbip.js';
import { registerPowerbiVisuals } from './tools/powerbiVisuals.js';
import { registerPowerplatform } from './tools/powerplatform.js';
import { registerAccessibility } from './tools/accessibility.js';
import { registerTokens } from './tools/tokens.js';
import { registerComponents } from './tools/components.js';
import { registerTheme } from './tools/theme.js';
import { registerCode } from './tools/code.js';
import { registerMigration } from './tools/migration.js';
import { registerDesignGuidance } from './tools/designGuidance.js';
import { registerImages } from './tools/images.js';
import { registerConfig } from './tools/config.js';
const server = new McpServer({
    name: 'fluent-ui',
    version: '1.0.0',
});
// Power BI + Power Platform + a11y tools (data ready).
registerPowerbiTheme(server);
registerPbip(server);
registerPowerbiVisuals(server);
registerPowerplatform(server);
registerAccessibility(server);
// Fluent web: tokens, components, brand theme, and code scaffolding
// (grounded in @fluentui/react-theme + @fluentui/react-components data).
registerTokens(server);
registerComponents(server);
registerTheme(server);
registerCode(server);
// Fluent 2 design-language reference + adoption/migration guidance
// (grounded in research/fluent-design.md + migration.json).
registerDesignGuidance(server);
registerMigration(server);
// Fluent 2 media index: direct URLs to every diagram, do/don't example,
// anatomy illustration and Motion video (fluent-images.json).
registerImages(server);
// User-defined presets config (fluent.config.json) + persistent agent memory
// (.fluent/memory.json). Zero-config safe: sensible Fluent 2 defaults, never throws.
registerConfig(server);
async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    // stderr is safe for logs; stdout is reserved for the MCP protocol.
    process.stderr.write('[fluent-ui] MCP server ready (stdio).\n');
}
main().catch((err) => {
    process.stderr.write(`[fluent-ui] fatal: ${String(err)}\n`);
    process.exit(1);
});
