import { z } from 'zod';
import { loadJson, textResult, provenanceFooter } from '../util.js';
const load = () => loadJson('figma.json');
/**
 * Two states that must never collapse into each other: `false` means Figma
 * documents the host as unsupported; `null`/absent means we could not read the
 * catalog (it is JS-rendered) and are declining to guess either way.
 */
function catalogLabel(v) {
    if (v === true)
        return 'confirmed in the Figma MCP Catalog';
    if (v === false)
        return 'NOT in the Figma MCP Catalog — connection will fail';
    return 'UNCONFIRMED — Figma publishes no install guide for this host, and the catalog page could not be read. Try it; if authorization fails, that is the catalog gate, not a config error.';
}
export function registerFigma(server) {
    server.registerTool('fluent_figma_guidance', {
        title: 'Figma MCP server for Fluent — access limits, host setup, design-to-code',
        description: 'Everything needed to drive a Fluent 2 design-to-code workflow from Figma: what actually gates access (seat/plan rate limits and the client catalog allowlist), per-host config, Microsoft\'s official Fluent Figma kits, Code Connect status, and how a Figma frame becomes @fluentui/react-components v9 + Griffel. Call the "access" section BEFORE starting a Figma workflow — a View or Collab seat gets 6 tool calls per month and will run out mid-task. This plugin never handles Figma credentials; auth is the host\'s own OAuth flow.',
        inputSchema: {
            section: z
                .enum(['access', 'hosts', 'servers', 'kits', 'code-connect', 'workflow', 'prerequisites', 'unverified', 'all'])
                .default('access')
                .describe('Which section to return. "access" is the one that most often explains a failing workflow.'),
            host: z
                .string()
                .optional()
                .describe('Optional host id to get setup for just that client, e.g. "vscode", "cursor", "claude-code", "copilot-cli".'),
        },
    }, async ({ section, host }) => {
        const data = load();
        if (!data)
            return textResult('Figma dataset not found at mcp/data/figma.json.');
        if (host) {
            const hit = (data.hosts ?? []).find((h) => h.id?.toLowerCase() === host.toLowerCase());
            if (!hit) {
                const ids = (data.hosts ?? []).map((h) => h.id).join(', ');
                return textResult(`No Figma setup recorded for host "${host}".\n\nKnown hosts: ${ids}`);
            }
            return textResult(JSON.stringify({
                host: hit,
                catalogStatus: catalogLabel(hit.catalogConfirmed),
                readThisFirst: data.entitlementSummary,
                configNotes: data.hostConfigNotes,
            }, null, 2));
        }
        switch (section) {
            case 'access':
                return textResult(JSON.stringify({
                    summary: data.entitlementSummary,
                    rateLimits: data.rateLimits,
                    exemptFromRateLimits: data.rateLimitExemptTools,
                    catalogGate: data.catalogGate,
                    diagnose: 'Run the whoami tool first — it is rate-limit exempt and reports the authenticated email, every plan the user belongs to, and the seat type in each. That distinguishes "wrong account" from "out of quota".',
                }, null, 2));
            case 'hosts':
                return textResult(JSON.stringify({
                    hosts: (data.hosts ?? []).map((h) => ({ ...h, catalogStatus: catalogLabel(h.catalogConfirmed) })),
                    configNotes: data.hostConfigNotes,
                }, null, 2));
            case 'servers':
                return textResult(JSON.stringify({ servers: data.servers, notes: data.meta }, null, 2));
            case 'kits':
                return textResult(JSON.stringify({
                    resources: data.fluentFigmaResources,
                    tiers: data.fluentKitTiers,
                    implication: data.fluentKitTiersImplication,
                }, null, 2) +
                    // The kit URLs are the least-verified part of this dataset - the
                    // v8 kit link in particular has no first-party source - so the
                    // caveats have to travel with the answer, not sit in a side topic.
                    provenanceFooter(data.unverified, {
                        terms: ['kit', 'figma', 'url', 'toolkit'],
                        seeAlso: 'fluent_figma_guidance { section: "unverified" }',
                    }));
            case 'code-connect':
                return textResult(JSON.stringify(data.codeConnect, null, 2));
            case 'workflow':
                return textResult(JSON.stringify(data.workflow, null, 2));
            case 'prerequisites':
                return textResult(JSON.stringify(data.prerequisiteMatrix, null, 2));
            case 'unverified':
                return textResult(JSON.stringify(data.unverified, null, 2));
            case 'all':
            default:
                return textResult(JSON.stringify(data, null, 2));
        }
    });
}
