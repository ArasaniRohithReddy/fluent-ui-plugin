import { z } from 'zod';
import { loadJson, textResult } from '../util.js';
const load = () => loadJson('fluent-v8.json');
/** Index values are sometimes a single key and sometimes a list of them. */
const asKeys = (v) => v === undefined ? [] : Array.isArray(v) ? v : [v];
/** Case-insensitive exact match, so `detailslist` still resolves to `DetailsList`. */
function resolveName(name, pools) {
    const lower = name.toLowerCase();
    for (const pool of pools) {
        if (!pool)
            continue;
        for (const key of Object.keys(pool)) {
            if (key.toLowerCase() === lower)
                return key;
        }
    }
    return null;
}
export function registerV8(server) {
    server.registerTool('fluent_v8_lookup', {
        title: 'Fluent 1 (v8) symbol lookup — v9 equivalent, collisions, traps',
        description: 'Look up a Fluent UI React v8 (Fluent 1 / Office UI Fabric) component or export and get everything needed to use or migrate it: exact import path, whether a Fluent 2 (v9) equivalent exists, v8-only status and why it blocks migration, name collisions where v8 and v9 share an export name but behave differently, and known runtime traps. Use before writing or migrating any v8 code.',
        inputSchema: {
            name: z.string().describe('The v8 component or export name, e.g. "DetailsList", "Stack", "Nav", "Dialog".'),
        },
    }, async ({ name }) => {
        const data = load();
        if (!data)
            return textResult('Fluent 1 dataset not found at mcp/data/fluent-v8.json.');
        const resolved = resolveName(name, [data.components, data.exportIndex, data.collisionIndex, data.trapIndex]);
        if (!resolved) {
            const all = new Set([
                ...Object.keys(data.components ?? {}),
                ...Object.keys(data.exportIndex ?? {}),
            ]);
            const lower = name.toLowerCase();
            const near = [...all].filter((k) => k.toLowerCase().includes(lower) || lower.includes(k.toLowerCase())).slice(0, 10);
            return textResult(`"${name}" was not found in the Fluent 1 (v8) dataset.` +
                (near.length ? `\n\nDid you mean: ${near.join(', ')}` : '') +
                `\n\nThis dataset covers ${all.size} v8 exports. Absence here does not prove the export does not exist in @fluentui/react — verify against the package before concluding.`);
        }
        const out = { name: resolved };
        if (data.components?.[resolved])
            out.component = data.components[resolved];
        const tier1 = (data.v8Only?.tier1 ?? []).find((e) => e.name === resolved);
        if (tier1) {
            out.v8Only = {
                ...tier1,
                meaning: 'No Fluent 2 (v9) equivalent. Migrating this component means rebuilding it, not swapping it.',
            };
        }
        // Collisions are the highest-value warning here: the names match, the code
        // compiles, and the behaviour is wrong at runtime.
        const collisionKeys = asKeys(data.collisionIndex?.[resolved]);
        const collisions = (data.collisions ?? []).filter((c) => c.name === resolved || collisionKeys.includes(c.name));
        if (collisions.length) {
            out.collisions = collisions;
            out.collisionWarning =
                'v8 and v9 both export this name with different behaviour. A swap type-checks and then misbehaves at runtime — read the hazard before changing imports.';
        }
        const trapKeys = asKeys(data.trapIndex?.[resolved]);
        const traps = (data.traps ?? []).filter((t) => t.component === resolved || trapKeys.includes(t.component) || (t.v8Names ?? []).includes(resolved));
        if (traps.length)
            out.traps = traps;
        return textResult(JSON.stringify(out, null, 2));
    });
    server.registerTool('fluent_v8_guidance', {
        title: 'Fluent 1 (v8) reference — versions, theming, styling, platforms',
        description: 'Reference guidance for Fluent UI React v8 (Fluent 1 / Office UI Fabric): package lineage, whether to stay on v8 or migrate to Fluent 2, current support status, theming (palette, semanticColors, ThemeGenerator), the @fluentui/fluent2-theme package that gives a v8 app the Fluent 2 look without migrating, styling APIs and icons, host-platform version pins (SPFx, PCF, Dynamics, Office, Teams), the v8 to v9 migration path, and documented errors in Microsoft\'s own migration docs.',
        inputSchema: {
            section: z
                .enum([
                'lineage',
                'version-decision',
                'support',
                'theming',
                'fluent2-theme',
                'styling',
                'icons',
                'design-language',
                'accessibility',
                'platforms',
                'non-react',
                'migration',
                'v8-only',
                'collisions',
                'traps',
                'docs-errata',
                'unverified',
                'all',
            ])
                .default('version-decision')
                .describe('Which section of the Fluent 1 reference to return.'),
        },
    }, async ({ section }) => {
        const data = load();
        if (!data)
            return textResult('Fluent 1 dataset not found at mcp/data/fluent-v8.json.');
        const map = {
            lineage: data.lineage,
            'version-decision': data.versionDecision,
            support: data.support,
            theming: data.theming,
            'fluent2-theme': data.fluent2ThemeForV8,
            styling: data.styling,
            icons: data.icons,
            'design-language': data.designLanguage,
            accessibility: data.accessibility,
            platforms: data.platforms,
            'non-react': data.nonReact,
            migration: data.migration,
            'v8-only': data.v8Only,
            collisions: data.collisions,
            traps: data.traps,
            'docs-errata': data.docsErrata,
            unverified: data.unverified,
        };
        if (section === 'all') {
            // The full dataset is far too large to return in one response, so hand
            // back a map of what is available instead of truncating silently.
            const summary = Object.fromEntries(Object.entries(map).map(([k, v]) => [
                k,
                Array.isArray(v) ? `${v.length} entries` : v && typeof v === 'object' ? `${Object.keys(v).length} keys` : v === undefined ? 'not present' : typeof v,
            ]));
            return textResult(`The Fluent 1 dataset is too large to return whole. Request a section.\n\n${JSON.stringify(summary, null, 2)}`);
        }
        const value = map[section];
        if (value === undefined)
            return textResult(`Section "${section}" is not present in the Fluent 1 dataset.`);
        return textResult(JSON.stringify(value, null, 2));
    });
}
