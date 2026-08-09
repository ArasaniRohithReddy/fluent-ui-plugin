#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { registerPowerbiTheme } from './tools/powerbiTheme.js';
import { registerPbip } from './tools/pbip.js';
import { registerPbir } from './tools/pbir.js';
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
import { registerV8 } from './tools/v8.js';
import { registerFigma } from './tools/figma.js';
import { registerNative } from './tools/native.js';
const server = new McpServer({
    name: 'fluent-ui',
    version: '1.0.0',
});
// Power BI + Power Platform + a11y tools (data ready).
registerPowerbiTheme(server);
registerPbip(server);
// Deterministic PBIR report tooling: audit, apply theme, clear the inline
// overrides that make a theme inert, and verify the result (engine in
// scripts/pbir, which also runs standalone as a CLI).
registerPbir(server);
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
// Fluent 1 (Fluent UI React v8 / Office UI Fabric): symbol lookup and reference.
// Ships the collision and trap data that matters most — cases where v8 and v9
// share an export name, so the code compiles and then misbehaves at runtime.
registerV8(server);
// Figma MCP server for design-to-code. Read-only reference: this plugin never
// asks for, stores or forwards a Figma token — auth is the host's OAuth flow.
// Leads with entitlements because a View/Collab seat gets 6 calls per MONTH,
// which is enough to start a workflow and not enough to finish one.
registerFigma(server);
// Native platforms: iOS, Android, Windows. The same component name resolves to
// a different type on each (and often to two types on one platform — Android
// splits Fluent 2 Compose from Fluent 1 Views by Kotlin package, not artifact),
// so guessing from the web API is how native Fluent code fails to compile.
registerNative(server);
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
