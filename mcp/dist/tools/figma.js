import { z } from 'zod';
import { loadJson, textResult, provenanceFooter } from '../util.js';
import { buildIndex, capped, sizeOf, SECTION_MAX_CHARS } from './guidanceIndex.js';
const load = () => loadJson('figma.json');
/* ------------------------------------------------------------------------- *
 * DTCG token export — the code -> Figma direction.
 *
 * Figma's own MCP server only reads OUT of Figma. Nothing in it pushes a token
 * set IN. Microsoft's own "Variables Import" plugin closes that gap: it eats
 * Design Token Community Group (DTCG) JSON and writes Figma Variables. We
 * cannot run the plugin — nothing outside the Figma editor can — but we can
 * emit exactly the file it expects, which reduces the human step to "open the
 * plugin, pick the file".
 *
 * Everything below is generated from mcp/data/fluent-tokens.json, which is read
 * and never written.
 * ------------------------------------------------------------------------- */
/** Types used by the export. Every one of these is BOTH a DTCG type and handled by the plugin. */
const DTCG_TYPES_USED = ['color', 'dimension', 'duration', 'number', 'fontFamily', 'fontWeight'];
/**
 * The plugin's colour parser (src/utils/color.ts) accepts ONLY `#RRGGBB` and
 * `#RRGGBBAA`; anything else is reported as "Invalid color" and skipped. Fluent
 * ships `rgba(...)` and the CSS keyword `transparent` for ~80 semantic slots, so
 * they are converted rather than emitted as-is. Both conversions are exact, not
 * approximations. Returns null when a value cannot be represented at all.
 */
function cssColorToDtcgHex(value) {
    const v = value.trim();
    if (v === 'transparent')
        return '#00000000';
    if (/^#[0-9a-f]{6}$/i.test(v) || /^#[0-9a-f]{8}$/i.test(v))
        return v.toLowerCase();
    if (/^#[0-9a-f]{3}$/i.test(v))
        return ('#' + v[1] + v[1] + v[2] + v[2] + v[3] + v[3]).toLowerCase();
    const m = v.match(/^rgba?\(\s*([0-9.]+)\s*,\s*([0-9.]+)\s*,\s*([0-9.]+)\s*(?:,\s*([0-9.]+)\s*)?\)$/i);
    if (!m)
        return null;
    const h = (n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
    const base = '#' + h(Number(m[1])) + h(Number(m[2])) + h(Number(m[3]));
    if (m[4] === undefined)
        return base;
    const alpha = Number(m[4]);
    if (!Number.isFinite(alpha))
        return null;
    return alpha >= 1 ? base : base + h(alpha * 255);
}
export function buildFluentDtcg() {
    const t = loadJson('fluent-tokens.json');
    if (!t)
        return null;
    /** Which `tokens.*` names really exist, straight from the generated dataset — never guessed. */
    const realTokenNames = t.color?.cssVarByToken ?? {};
    const token = (type, value, description, codeName) => {
        const tok = { $type: type, $value: value, $description: description };
        // Figma variables can carry a per-platform "code syntax" string, and Figma
        // states the MCP server hands that exact string to the model. Populating it
        // here is what turns get_variable_defs from an inference problem into a
        // lookup: the variable literally answers with `tokens.colorBrandBackground`.
        if (codeName && realTokenNames[codeName]) {
            tok.$extensions = { codeSyntax: `tokens.${codeName}`, codeSyntaxPlatform: 'WEB' };
        }
        return tok;
    };
    const count = (g) => Object.values(g).reduce((n, v) => n + ('$value' in v ? 1 : count(v)), 0);
    // ---- Global collection: primitives that do not change with the theme ----
    const global = {};
    const rampSets = [['BrandRamp', t.color?.brandRamp ?? {}]];
    for (const [name, ramp] of Object.entries(t.color?.otherBrandRamps ?? {})) {
        rampSets.push([`BrandRamp${name.replace(/^brand/, '')}`, ramp]);
    }
    for (const [groupName, ramp] of rampSets) {
        const g = {};
        for (const [stop, hex] of Object.entries(ramp)) {
            const hexValue = cssColorToDtcgHex(String(hex));
            if (!hexValue)
                continue;
            const primary = String(t.color?.brandPrimarySlot ?? '') === String(stop) && groupName === 'BrandRamp';
            g[stop] = token('color', hexValue, `Fluent 2 ${groupName} stop ${stop}${primary ? ' — the primary brand slot' : ''}.`);
        }
        global[groupName] = g;
    }
    const dimensionGroup = (source, label) => {
        const g = {};
        for (const [name, value] of Object.entries(source ?? {})) {
            const px = parseFloat(String(value));
            if (!Number.isFinite(px))
                continue;
            g[name] = token('dimension', `${px}px`, `Fluent 2 ${label}: ${name} = ${value}.`, name);
        }
        return g;
    };
    global.Spacing = { ...dimensionGroup(t.spacing?.horizontal, 'horizontal spacing'), ...dimensionGroup(t.spacing?.vertical, 'vertical spacing') };
    global.CornerRadius = dimensionGroup(t.borderRadius, 'corner radius');
    global.StrokeWidth = dimensionGroup(t.strokeWidth, 'stroke width');
    global.FontSize = dimensionGroup(t.typography?.fontSizes, 'font size');
    global.LineHeight = dimensionGroup(t.typography?.lineHeights, 'line height');
    const families = {};
    for (const [key, stack] of Object.entries(t.typography?.fontFamilies ?? {})) {
        const name = `fontFamily${key.charAt(0).toUpperCase()}${key.slice(1)}`;
        // The plugin runs extractFirstFontFamily(), so the full CSS stack is safe to
        // send: Figma stores the first family and the fallbacks stay documented.
        families[name] = token('fontFamily', String(stack), `Fluent 2 font stack "${key}". Figma keeps the first family; the full CSS stack is ${stack}.`, name);
    }
    global.FontFamily = families;
    const weights = {};
    for (const [name, w] of Object.entries(t.typography?.fontWeights ?? {})) {
        weights[name] = token('fontWeight', Number(w), `Fluent 2 font weight ${name} = ${w}.`, name);
    }
    global.FontWeight = weights;
    const durations = {};
    for (const [name, d] of Object.entries(t.motion?.durations ?? {})) {
        durations[name] = token('duration', String(d), `Fluent 2 motion duration ${name} = ${d}.`, name);
    }
    global.Duration = durations;
    // ---- Theme collection: one mode per Fluent theme ----
    const themeModes = [
        ['Light', 'fluent-theme-light.tokens.json', t.color?.semanticLight],
        ['Dark', 'fluent-theme-dark.tokens.json', t.color?.semanticDark],
        ['HighContrast', 'fluent-theme-high-contrast.tokens.json', t.color?.semanticHighContrast],
    ];
    const files = [
        { filename: 'fluent-global.tokens.json', collection: 'Fluent Global', mode: 'Global', document: global, tokenCount: count(global) },
    ];
    const skippedColors = [];
    for (const [mode, filename, semantic] of themeModes) {
        if (!semantic)
            continue;
        const colors = {};
        for (const [name, value] of Object.entries(semantic)) {
            const hex = cssColorToDtcgHex(String(value));
            if (!hex) {
                skippedColors.push(`${mode}:${name}=${value}`);
                continue;
            }
            colors[name] = token('color', hex, `Fluent 2 ${mode} theme colour ${name}${String(value) === hex ? '' : ` (source value ${value})`}.`, name);
        }
        const document = { Color: colors };
        files.push({ filename, collection: 'Fluent Theme', mode, document, tokenCount: count(document) });
    }
    const manifest = { name: 'Fluent 2', collections: {} };
    for (const f of files) {
        manifest.collections[f.collection] ??= { modes: {} };
        manifest.collections[f.collection].modes[f.mode] = [f.filename];
    }
    const notExpressible = [
        {
            category: 'shadow (elevation)',
            tokens: Object.keys(t.shadow ?? {}).length,
            reason: 'Fluent shadows are multi-layer CSS box-shadow strings ("0 0 2px rgba(0,0,0,0.12), 0 8px 16px rgba(0,0,0,0.14)"). DTCG does define a composite "shadow" type, but the plugin\'s tokenTypeToFigmaType returns null for it, and Figma has no shadow VARIABLE at all — shadows are effect STYLES. Emitting them would produce "Failed to update a variable of type shadow". Recreate elevation as Figma effect styles by hand, or read the values from fluent_get_token.',
        },
        {
            category: 'motion curves (easing)',
            tokens: Object.keys(t.motion?.curves ?? {}).length,
            reason: 'Fluent easing tokens are cubic-bezier() strings. DTCG defines "cubicBezier", but the plugin does not handle it and Figma has no curve variable type. Durations ARE exported (as $type duration); curves are not. Read them from fluent_get_token instead.',
        },
        {
            category: 'typography ramp (composite text styles)',
            tokens: Object.keys(t.typography?.ramp ?? {}).length,
            reason: 'Entries such as body1 / caption1Strong bundle fontFamily + fontSize + lineHeight + fontWeight. DTCG defines a composite "typography" type; the plugin does not handle it, and Figma models these as Text STYLES, not variables. Every constituent primitive IS exported (FontFamily, FontSize, LineHeight, FontWeight), so the ramp can be rebuilt as Figma text styles that bind to those variables.',
        },
    ];
    if (skippedColors.length) {
        notExpressible.push({
            category: 'colour values that are not representable as hex',
            tokens: skippedColors.length,
            reason: `Dropped rather than emitted as something the plugin would reject: ${skippedColors.slice(0, 5).join(', ')}${skippedColors.length > 5 ? ', ...' : ''}`,
        });
    }
    return {
        manifest,
        files,
        totalTokens: files.reduce((n, f) => n + f.tokenCount, 0),
        typesUsed: [...DTCG_TYPES_USED],
        notExpressible,
    };
}
/** The prose that must travel with any plugin answer. Single source for tool output and tests. */
export const PLUGIN_CAPABILITY_STATEMENT = 'We cannot run Figma plugins. This plugin cannot run, invoke, automate, or trigger a Figma community plugin: ' +
    "Figma plugins execute only inside the Figma editor's sandbox, launched by a signed-in human from the Figma UI, and " +
    'no MCP tool, REST endpoint, or CLI can start one from outside. What we CAN do is name the right plugin and generate ' +
    'the file it consumes — a person still has to open Figma and run it. (The Figma MCP server\'s use_figma tool writes to a ' +
    'canvas through the Figma Plugin API; that is Figma\'s own first-party bridge, not a community plugin, and it cannot be pointed at one.)';
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
        title: 'Figma MCP server for Fluent — access limits, host setup, design-to-code, plugins, DTCG export',
        description: 'Everything needed to drive a Fluent 2 design-to-code workflow from Figma: what actually gates access (seat/plan rate limits and the client catalog allowlist), per-host config, Microsoft\'s official Fluent Figma kits, the Figma community plugins Microsoft links (with honest provenance), Code Connect status, and how a Figma frame becomes @fluentui/react-components v9 + Griffel. Section "tokens-export" runs the reverse direction Figma\'s own MCP server does not cover: it emits Fluent 2 tokens as DTCG JSON for Microsoft\'s Variables Import plugin, turning code tokens into Figma Variables. Call the "access" section BEFORE starting a Figma workflow — a View or Collab seat gets only 6 tool calls per month on Professional/Organization/Enterprise (20 on Starter) and will run out mid-task. This plugin never handles Figma credentials; auth is the host\'s own OAuth flow. It also cannot RUN a Figma plugin — nothing outside the Figma editor can.',
        inputSchema: {
            section: z
                .enum([
                'access',
                'hosts',
                'servers',
                'kits',
                'plugins',
                'tokens-export',
                'code-connect',
                'workflow',
                'prerequisites',
                'unverified',
                'all',
            ])
                .default('access')
                .describe('Which section to return. "access" is the one that most often explains a failing workflow. "plugins" lists the Figma community plugins with provenance. "tokens-export" emits Fluent 2 tokens as DTCG JSON for the Variables Import plugin. "all" returns an index of the sections, not the whole dataset.'),
            host: z
                .string()
                .optional()
                .describe('Optional host id to get setup for just that client, e.g. "vscode", "cursor", "claude-code", "copilot-cli".'),
            dtcgFile: z
                .string()
                .optional()
                .describe('With section:"tokens-export", return the full DTCG document for one file instead of the summary. Use "manifest", "global", "light", "dark", "high-contrast", or an exact filename. These documents are large — raise maxChars.'),
            maxChars: z
                .number()
                .int()
                .min(500)
                .max(200000)
                .default(SECTION_MAX_CHARS)
                .describe('Cap on the response size. Over the cap the payload is cut and clearly labelled; request a narrower section instead.'),
        },
    }, async ({ section, host, maxChars, dtcgFile }) => {
        const data = load();
        if (!data)
            return textResult('Figma dataset not found at mcp/data/figma.json.');
        if (host) {
            const hit = (data.hosts ?? []).find((h) => h.id?.toLowerCase() === host.toLowerCase());
            if (!hit) {
                const ids = (data.hosts ?? []).map((h) => h.id).join(', ');
                return textResult(`No Figma setup recorded for host "${host}".\n\nKnown hosts: ${ids}`);
            }
            return textResult(capped(JSON.stringify({
                host: hit,
                catalogStatus: catalogLabel(hit.catalogConfirmed),
                readThisFirst: data.entitlementSummary,
                configNotes: data.hostConfigNotes,
            }, null, 2), maxChars, `Host "${hit.id}" carries more detail than the cap allows.`));
        }
        /** Which dataset keys each section is built from — also drives the "all" index. */
        const sectionSources = {
            access: [data.entitlementSummary, data.rateLimits, data.rateLimitExemptTools, data.catalogGate],
            hosts: [data.hosts, data.hostConfigNotes],
            servers: [data.servers, data.meta],
            kits: [data.fluentFigmaResources, data.fluentKitTiers, data.fluentKitTiersImplication],
            plugins: [data.fluentFigmaPlugins, data.fluentFigmaPluginsMeta, data.pluginCapability],
            // Deliberately not the generated documents: building 1,200+ tokens to
            // size an index entry would tax every unrelated call. The manifest is
            // the honest stand-in — the real payload is fetched with dtcgFile.
            'tokens-export': [data.pluginCapability],
            'code-connect': [data.codeConnect],
            workflow: [data.workflow],
            prerequisites: [data.prerequisiteMatrix],
            unverified: [data.unverified],
        };
        switch (section) {
            case 'access':
                return textResult(capped(JSON.stringify({
                    summary: data.entitlementSummary,
                    rateLimits: data.rateLimits,
                    exemptFromRateLimits: data.rateLimitExemptTools,
                    catalogGate: data.catalogGate,
                    diagnose: 'Run the whoami tool first — it is rate-limit exempt and reports the authenticated email, every plan the user belongs to, and the seat type in each. That distinguishes "wrong account" from "out of quota".',
                }, null, 2), maxChars, 'Request a narrower section.'));
            case 'hosts':
                return textResult(capped(JSON.stringify({
                    hosts: (data.hosts ?? []).map((h) => ({ ...h, catalogStatus: catalogLabel(h.catalogConfirmed) })),
                    configNotes: data.hostConfigNotes,
                }, null, 2), maxChars, 'Pass host:"<id>" to get one client instead of every client.'));
            case 'servers':
                return textResult(capped(JSON.stringify({ servers: data.servers, notes: data.meta }, null, 2), maxChars, 'Request a narrower section.'));
            case 'kits':
                return textResult(capped(JSON.stringify({
                    resources: data.fluentFigmaResources,
                    tiers: data.fluentKitTiers,
                    implication: data.fluentKitTiersImplication,
                }, null, 2), maxChars, 'Request a narrower section.') +
                    // The kit URLs are the least-verified part of this dataset - the
                    // v8 kit link in particular has no first-party source - so the
                    // caveats have to travel with the answer, not sit in a side topic.
                    provenanceFooter(data.unverified, {
                        terms: ['kit', 'figma', 'url', 'toolkit'],
                        seeAlso: 'fluent_figma_guidance { section: "unverified" }',
                    }));
            case 'plugins': {
                const plugins = data.fluentFigmaPlugins ?? [];
                const proven = plugins.filter((p) => p.official === true).map((p) => p.name);
                return textResult(capped(JSON.stringify({
                    // First line of the payload, because the single most likely
                    // misread of a plugin list is "the agent can run these".
                    weCannotRunPlugins: PLUGIN_CAPABILITY_STATEMENT,
                    capability: data.pluginCapability,
                    provenanceRule: 'Microsoft LINKING a plugin from its Resources page is a recommendation, not authorship. Only entries with official:true have first-party proof; every official:false entry carries a publisherNote saying exactly what is and is not known. Never describe an official:false plugin as Microsoft-made, first-party, or supported.',
                    provenFirstParty: proven,
                    plugins,
                    meta: data.fluentFigmaPluginsMeta,
                    seeAlso: 'fluent_figma_guidance { section: "tokens-export" } generates the DTCG file that the Variables Import plugin consumes — the one place this data set actually feeds a plugin.',
                }, null, 2), maxChars, 'Ask for one plugin by name instead of the whole list.') +
                    provenanceFooter(data.unverified, {
                        terms: ['plugin', 'publisher', 'community', '202'],
                        seeAlso: 'fluent_figma_guidance { section: "unverified" }',
                    }));
            }
            case 'tokens-export': {
                const bundle = buildFluentDtcg();
                if (!bundle)
                    return textResult('Token dataset not found at mcp/data/fluent-tokens.json, so no DTCG export could be built.');
                if (dtcgFile) {
                    const key = dtcgFile.toLowerCase();
                    if (key === 'manifest') {
                        return textResult(JSON.stringify(bundle.manifest, null, 2));
                    }
                    const hit = bundle.files.find((f) => f.filename.toLowerCase() === key) ??
                        bundle.files.find((f) => f.mode.toLowerCase().replace(/[^a-z]/g, '') === key.replace(/[^a-z]/g, '')) ??
                        bundle.files.find((f) => f.filename.toLowerCase().includes(key));
                    if (!hit) {
                        return textResult(`No DTCG file "${dtcgFile}". Available: manifest, ${bundle.files.map((f) => f.filename).join(', ')}.`);
                    }
                    return textResult(capped(JSON.stringify(hit.document, null, 2), maxChars, `${hit.filename} holds ${hit.tokenCount} tokens. Raise maxChars, or run "node scripts/figma/dtcg-export.mjs" to write the real files to disk.`));
                }
                return textResult(capped(JSON.stringify({
                    what: 'Fluent 2 design tokens as Design Token Community Group (DTCG) JSON, ready for Microsoft\'s "Variables Import" Figma plugin. This is the code -> Figma direction; the Figma MCP server only reads the other way.',
                    weCannotRunPlugins: PLUGIN_CAPABILITY_STATEMENT,
                    generatedFrom: 'mcp/data/fluent-tokens.json (read-only)',
                    consumedBy: {
                        plugin: 'Variables Import',
                        url: 'https://www.figma.com/community/plugin/1253424530216967528/variables-import',
                        publisher: 'Microsoft — proven (microsoft/figma-variables-import manifest.json declares this exact plugin id)',
                    },
                    totalTokens: bundle.totalTokens,
                    dtcgTypesUsed: bundle.typesUsed,
                    typeChoiceRationale: 'Every type emitted is BOTH a DTCG type and one the plugin maps to a Figma variable type in tokenTypeToFigmaType (color -> COLOR; dimension/duration/number -> FLOAT; fontFamily/fontWeight -> STRING). The plugin also accepts non-standard convenience types (spacing, borderRadius, fontSize, lineHeight, strokeWidth, gap, padding, letterSpacing); they are deliberately NOT used, both because they are not DTCG and because "fontSize" runs values through a rem-to-px conversion that would turn "14px" into 224.',
                    manifest: bundle.manifest,
                    files: bundle.files.map((f) => ({
                        filename: f.filename,
                        collection: f.collection,
                        mode: f.mode,
                        tokens: f.tokenCount,
                        chars: sizeOf(f.document),
                        getIt: `fluent_figma_guidance { section: "tokens-export", dtcgFile: "${f.filename}", maxChars: 200000 }`,
                    })),
                    sample: {
                        'fluent-global.tokens.json → BrandRamp.80': bundle.files[0]?.document?.BrandRamp?.['80'],
                        'fluent-global.tokens.json → Spacing.spacingHorizontalM': bundle.files[0]?.document?.Spacing?.spacingHorizontalM,
                        'fluent-theme-light.tokens.json → Color.colorBrandBackground': bundle.files[1]?.document?.Color?.colorBrandBackground,
                    },
                    codeSyntax: 'Each token carries $extensions.codeSyntax = "tokens.<name>" with codeSyntaxPlatform "WEB". The plugin passes that to setVariableCodeSyntax, and Figma states the MCP server hands the code syntax string straight to the model — so after importing, get_variable_defs answers with the real Fluent token name instead of a path the agent has to guess at. That closes the single largest unknown in this dataset.',
                    notExpressible: bundle.notExpressible,
                    howToUse: [
                        'Generate the files: node scripts/figma/dtcg-export.mjs --out ./fluent-dtcg (writes the manifest plus one .tokens.json per mode).',
                        'In Figma, open the target Design file and run Plugins > Variables Import. A HUMAN does this step — we cannot.',
                        'Choose the manifest to import every collection and mode at once, or drop in a single .tokens.json for one mode.',
                        'Verify in the Variables panel: collection "Fluent Global" (mode Global) and collection "Fluent Theme" (modes Light, Dark, HighContrast).',
                        'Back in code, get_variable_defs on a node now returns tokens.* names via code syntax — map them with fluent_get_token and never hand-copy a hex.',
                    ],
                    pluginCaveats: [
                        'Verbatim from the plugin README: "This plugin does not contain a fully spec-compliant parser for the DTCG format and cannot handle every single valid token file—it\'s just a tool we built for internal use."',
                        'Verbatim from the plugin README, on what only works from source: "The following are supported only when running a local copy of this plugin, not from the Figma Community: Aliases to any other supported token in a different JSON file and Figma file, if the other Figma file has published the variables to a team library." This export sidesteps that entirely — it emits literal values and no aliases at all, so the Community build is enough.',
                        'No aliases are emitted for a second reason: mcp/data/fluent-tokens.json stores RESOLVED values from @fluentui/react-theme, not Fluent\'s global-to-alias relationships. Emitting an alias graph would be inference, so it is not done.',
                        'The plugin\'s colour parser accepts only #RRGGBB and #RRGGBBAA. Fluent ships rgba(...) and the keyword transparent for some slots; those are converted exactly (transparent -> #00000000) rather than passed through.',
                    ],
                }, null, 2), maxChars, 'Pass dtcgFile to fetch one document.'));
            }
            case 'code-connect':
                return textResult(capped(JSON.stringify(data.codeConnect, null, 2), maxChars, 'Request a narrower section.'));
            case 'workflow':
                return textResult(capped(JSON.stringify(data.workflow, null, 2), maxChars, 'Request a narrower section.'));
            case 'prerequisites':
                return textResult(capped(JSON.stringify(data.prerequisiteMatrix, null, 2), maxChars, 'Request a narrower section.'));
            case 'unverified':
                return textResult(capped(JSON.stringify(data.unverified, null, 2), maxChars, 'Request a narrower section.'));
            case 'all':
            default: {
                // The whole dataset is ~50k characters. Hand back the index instead,
                // the same way fluent_v8_guidance does.
                const entries = {};
                for (const [key, parts] of Object.entries(sectionSources)) {
                    entries[key] = {
                        chars: parts.reduce((n, p) => n + sizeOf(p), 0),
                        present: parts.some((p) => p !== undefined && p !== null),
                    };
                }
                entries.hosts.hostIds = (data.hosts ?? []).map((h) => h.id);
                return textResult(buildIndex(entries, {
                    what: 'Figma MCP guidance sections for Fluent 2 design-to-code',
                    requestOne: 'fluent_figma_guidance { section: "access" }  — or { host: "vscode" }',
                    extra: { readThisFirst: data.entitlementSummary },
                }));
            }
        }
    });
}
