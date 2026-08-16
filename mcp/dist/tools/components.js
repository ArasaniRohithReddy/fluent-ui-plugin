import { z } from 'zod';
import { loadJson, loadLocalOverlay, withLocalOverlay, textResult } from '../util.js';
const norm = (str) => String(str || '').toLowerCase().replace(/[^a-z0-9]/g, '');
/** Path shown to the reader — the gitignored file the overlay is read from. */
const OVERLAY_FILE = 'mcp/data/local/fluent-components-usage.json';
const OVERLAY_NOTE = 'Restored from this checkout\'s own gitignored copy at ' +
    OVERLAY_FILE +
    '. The published dataset withholds the prose of sign-in-gated Microsoft pages (see NOTICE) and ships the facts ' +
    'plus docUrl, so a fresh clone of the plugin returns the stub for this record, not this text. Cite docUrl when quoting it.';
const sizeOf = (value) => {
    try {
        return JSON.stringify(value)?.length ?? 0;
    }
    catch {
        return 0;
    }
};
/**
 * Say which of the two datasets answered.
 *
 * The overlay is correct behaviour, but it makes one machine answer differently
 * from a fresh clone for the same call, and nothing in the response used to
 * admit that - so a demo from a checkout that has mcp/data/local/ could show an
 * audience prose no user of the published plugin can obtain. Same shape as
 * fluent_design_guidance so the two tools read identically.
 */
function provenanceFor(published, resolved, enriched) {
    return enriched
        ? {
            source: 'local-overlay',
            overlayFile: OVERLAY_FILE,
            publishedChars: sizeOf(published),
            restoredChars: sizeOf(resolved),
            note: OVERLAY_NOTE,
        }
        : {
            source: 'published',
            note: 'From the published dataset (mcp/data/fluent-components.json + fluent-components-usage.json). Every clone returns this same content.',
        };
}
/**
 * `''.includes('')` is true, so an empty query used to behave as a wildcard:
 * fluent_get_component returned the first record in the file as if it were the
 * answer, and fluent_search_components dumped the whole catalog. An agent that
 * passes an unresolved variable must be told, not answered.
 */
function rejectEmpty(value, param, tool) {
    if (value && value.trim())
        return null;
    return (`\`${param}\` is required and was empty${value ? ' (whitespace only)' : ''}. ` +
        `${tool} does not treat an empty ${param} as "any component" — that would return an arbitrary ` +
        'record as if it were the answer.\n\n' +
        'Next step: pass a real component name (e.g. "Button", "DataGrid", "CopilotMessage"), a catalog ' +
        'id (e.g. "components-list"), or a keyword to search for ("overlay", "chat", "form").');
}
/**
 * Fluent 1 (v8) index, read-only. v8 and v9 share many export names, and some
 * names exist ONLY in v8 (PrimaryButton, DefaultButton, Stack). Without this,
 * a v9 miss is a dead end even though fluent_v8_lookup has the full answer.
 */
function v8Index() {
    const data = loadJson('fluent-v8.json');
    const index = new Map();
    if (!data)
        return index;
    // Mirror the indexes fluent_v8_lookup itself resolves against, so anything
    // that tool can answer is reachable from a v9 miss - including the same-name
    // collisions (Button, Persona, Checkbox), which are the whole point.
    for (const source of [
        data.components,
        data.exportIndex,
        data.collisionIndex,
        data.renameIndex,
        data.casingTrapIndex,
        data.behaviorTrapIndex,
        data.trapIndex,
    ]) {
        for (const key of Object.keys(source || {})) {
            if (!index.has(key.toLowerCase()))
                index.set(key.toLowerCase(), key);
        }
    }
    return index;
}
/** Echoing a 5,000-character argument back at the caller just burns context. */
const echo = (value) => {
    const s = String(value);
    return s.length > 80 ? `${s.slice(0, 80)}… (${s.length} chars)` : s;
};
function v8CrossReference(query, hasExactV9) {
    const resolved = v8Index().get(query.trim().toLowerCase());
    if (!resolved)
        return null;
    return {
        name: resolved,
        generation: 'Fluent 1 (Fluent UI React v8 / Office UI Fabric)',
        alsoInFluent2: hasExactV9,
        note: hasExactV9
            ? `"${resolved}" is exported by BOTH Fluent 1 (@fluentui/react) and Fluent 2 ` +
                '(@fluentui/react-components) for different components. The wrong import compiles cleanly ' +
                'and then misbehaves at runtime — confirm which generation you are on.'
            : `"${resolved}" is a Fluent 1 (v8) export. It is not part of the Fluent 2 catalog, which is ` +
                'why this lookup has no exact match.',
        nextStep: `fluent_v8_lookup { name: "${resolved}" }`,
    };
}
export function registerComponents(server) {
    server.registerTool('fluent_search_components', {
        title: 'Search Fluent 2 components',
        description: 'Search the Fluent 2 (React v9 / Web Components) catalog by name, category, or keyword. Returns matching components with category, maturity, description, React import, and web-component tag. Includes AI/Copilot components and matches the design-site pattern names ("Chat input" finds ChatInput).',
        inputSchema: {
            query: z
                .string()
                .describe('Name, category, or keyword — e.g. "button", "input", "chat", "Actions", "overlay". Must not be empty.'),
        },
    }, async ({ query }) => {
        const empty = rejectEmpty(query, 'query', 'fluent_search_components');
        if (empty)
            return textResult(empty);
        const data = loadJson('fluent-components.json');
        const usage = loadJson('fluent-components-usage.json') || [];
        if (!data)
            return textResult('Component data not found at mcp/data/fluent-components.json.');
        const q = query.trim().toLowerCase();
        const comps = data.components || [];
        // The design site names patterns in prose ("Chat input", "Citations and
        // references"); the code exports them as identifiers. Both must find the
        // one merged record.
        const siteNames = (c) => [c.siteGuidance?.name, c.slug, ...(c.apiComponents || [])].filter(Boolean).map(String);
        const matches = comps.filter((c) => c.name.toLowerCase().includes(q) ||
            (c.category || '').toLowerCase().includes(q) ||
            (c.description || '').toLowerCase().includes(q) ||
            siteNames(c).some((n) => n.toLowerCase().includes(q) || norm(n) === norm(q)));
        const known = new Set(comps.map((c) => norm(c.name)));
        for (const c of comps)
            for (const n of siteNames(c))
                known.add(norm(n));
        const aiMatches = usage.filter((u) => u.category === 'ai' &&
            !known.has(norm(u.name)) &&
            !known.has(norm(u.slug || '')) &&
            (u.name.toLowerCase().includes(q) || (u.description || '').toLowerCase().includes(q) || 'ai copilot chat'.includes(q)));
        // The catalog covers every documented subcomponent, so a broad keyword can
        // match a hundred records. Rank the ones a caller most likely meant first
        // rather than truncating arbitrarily.
        const rank = (c) => {
            const name = c.name.toLowerCase();
            if (name === q)
                return 0;
            if (siteNames(c).some((n) => n.toLowerCase() === q))
                return 0;
            if (name.startsWith(q))
                return 1;
            if (name.includes(q))
                return 2;
            return 3;
        };
        const maturityRank = (m) => ['stable', 'preview', 'compat', 'utility', 'migration', 'deprecated'].indexOf(m || 'stable');
        matches.sort((a, b) => rank(a) - rank(b) || maturityRank(a.maturity) - maturityRank(b.maturity) || a.name.localeCompare(b.name));
        const LIMIT = 80;
        const shown = matches.slice(0, LIMIT);
        const list = [
            ...shown.map((c) => ({
                id: c.id,
                name: c.name,
                category: c.category,
                maturity: c.maturity,
                package: c.npmPackage,
                description: c.description,
                import: c.reactImport,
                webComponent: c.webComponent,
                designSiteName: c.siteGuidance?.name,
                verified: c.verified,
            })),
            ...aiMatches.map((u) => ({
                name: u.name,
                category: 'AI / Copilot',
                description: u.description,
                storybook: u.storybookUrl,
            })),
        ];
        if (!list.length) {
            const v8 = v8CrossReference(q, false);
            return textResult(`No components matching "${echo(query)}".` +
                (v8 ? `\n\nBut it is a Fluent 1 (v8) export — next step: ${v8.nextStep}` : '') +
                '\n\nTry a broader keyword, or fluent_get_component with an exact name.');
        }
        const more = matches.length > LIMIT
            ? `\n\n(${matches.length - LIMIT} further match(es) not shown — narrow the query, or ask for a name directly with fluent_get_component.)`
            : '';
        return textResult(`${list.length} match(es):\n\n` + JSON.stringify(list, null, 2) + more);
    });
    server.registerTool('fluent_get_component', {
        title: 'Get a Fluent 2 component',
        description: "Get full details for a Fluent 2 component: real props (types/defaults/required), slots, React import, web-component tag and attributes, accessibility notes and a code sample, plus design-site usage guidance (when to use, anatomy, states, behavior, do/don't) and Storybook link. Accepts the export name, a catalog id, or the design-site pattern name. Every response carries $provenance.source: \"published\" (what any clone of the plugin returns) or \"local-overlay\" (usage prose restored from this checkout's own gitignored mcp/data/local/ copy of guidance the published dataset withholds — see NOTICE).",
        inputSchema: {
            name: z
                .string()
                .describe('Component name (e.g. Button, DataGridRow, CopilotMessage), a catalog id when two records ' +
                'share a name (e.g. components-list vs migration-shims-v0-list), or a design-site pattern ' +
                'name (e.g. "Chat input"). Must not be empty.'),
        },
    }, async ({ name }) => {
        const empty = rejectEmpty(name, 'name', 'fluent_get_component');
        if (empty)
            return textResult(empty);
        const data = loadJson('fluent-components.json');
        const usageAll = loadJson('fluent-components-usage.json') || [];
        const q = name.trim().toLowerCase();
        const comps = data?.components || [];
        // `name` is the real export name and is deliberately NOT unique: upstream
        // ships Components/List and Migration Shims/V0/List, and the AI-suite
        // Attachment/Textarea collide with their v9 namesakes. Returning one
        // arbitrary record would make the other unreachable, so return every exact
        // match and let `id` disambiguate.
        const byId = comps.filter((c) => String(c.id || '').toLowerCase() === q);
        const byName = comps.filter((c) => c.name.toLowerCase() === q);
        // A design-site pattern name ("Chat input") resolves to the code record it
        // was merged into, so one lookup returns API facts AND usage guidance.
        const bySite = comps.filter((c) => String(c.siteGuidance?.name || '').toLowerCase() === q ||
            (c.slug && norm(c.slug) === norm(q)));
        // "Data Grid" / "data-grid" should reach DataGrid rather than dead-ending.
        const byNorm = norm(q) ? comps.filter((c) => norm(c.name) === norm(q)) : [];
        const partial = comps.filter((c) => c.name.toLowerCase().includes(q)).slice(0, 1);
        let api = [];
        let matchedBy = '';
        if (byId.length) {
            api = byId;
            matchedBy = 'catalog id';
        }
        else if (byName.length) {
            api = byName;
            matchedBy = 'exact export name';
        }
        else if (bySite.length) {
            api = bySite;
            matchedBy = `design-site pattern name "${bySite[0].siteGuidance?.name || echo(name)}"`;
        }
        else if (byNorm.length) {
            api = byNorm;
            matchedBy = `normalised name match on "${byNorm[0].name}"`;
        }
        else if (partial.length) {
            api = partial;
            matchedBy = `partial name match on "${partial[0].name}" — not an exact match for "${echo(name)}"`;
        }
        const primary = api[0] || null;
        // Usage guidance is keyed by the design-site name/slug, the API record by
        // the export name. Link them from either side.
        const usage = usageAll.find((u) => u.name.toLowerCase() === q) ||
            (primary &&
                usageAll.find((u) => (primary.slug && norm(u.slug || '') === norm(primary.slug)) ||
                    u.name.toLowerCase() === String(primary.siteGuidance?.name || '').toLowerCase() ||
                    norm(u.name) === norm(primary.name))) ||
            usageAll.find((u) => u.name.toLowerCase().includes(q)) ||
            null;
        const v8 = v8CrossReference(name, byName.length > 0 || byId.length > 0);
        if (!primary && !usage) {
            return textResult(`No Fluent 2 component "${echo(name)}".` +
                (v8
                    ? `\n\n"${v8.name}" IS a Fluent 1 (v8) export — the answer exists one tool away.\nNext step: ${v8.nextStep}`
                    : '\n\nNext step: fluent_search_components { query: "<keyword>" } to find the right name.'));
        }
        // Restore gated guidance when the reader has it locally (see NOTICE).
        // Check the overlay BEFORE merging so the response can say which dataset
        // answered - withLocalOverlay is used as-is, not restructured.
        const overlay = loadLocalOverlay('fluent-components-usage.json');
        const overlayKey = usage ? usage.slug || usage.name : undefined;
        const enriched = !!(usage && overlay && overlayKey && overlay[overlayKey]);
        const use = usage ? withLocalOverlay(usage, overlay, overlayKey) : null;
        const payload = {
            $provenance: provenanceFor(usage, use, enriched),
            query: echo(name),
            matchedBy,
            api: primary,
            usage: use,
        };
        if (primary && use) {
            payload.linkage =
                `API facts come from the "${primary.name}" catalog record; usage guidance from the design-site ` +
                    `entry "${use.name}". They describe the same thing and are returned together.`;
        }
        else if (primary && primary.siteGuidance) {
            payload.designSiteGuidance = primary.siteGuidance;
        }
        if (api.length > 1) {
            payload.nameIsAmbiguous =
                `${api.length} catalog records export the name "${primary.name}". Ask again with one of these ids: ` +
                    api.map((c) => c.id).join(', ');
            payload.alsoNamed = api.slice(1);
        }
        if (v8)
            payload.fluent1v8 = v8;
        return textResult(JSON.stringify(payload, null, 2));
    });
}
