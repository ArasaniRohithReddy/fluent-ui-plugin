import { z } from 'zod';
import { loadJson, textResult, normalizeHex, mixWithWhite } from '../util.js';
/** Fill any Fluent 2 visual-default knobs MISSING from the base theme (the catalog is the documented reference + a defensive fallback; the shipped base already embeds these, so this is typically a no-op). Existing base values always win. Returns the number of knobs added. */
function applyVisualDefaults(theme) {
    const catalog = loadJson('powerbi-visual-defaults.json');
    const knobs = catalog?.globalDefaults?.knobs;
    if (!Array.isArray(knobs))
        return 0;
    theme.visualStyles ??= {};
    theme.visualStyles['*'] ??= {};
    const g = (theme.visualStyles['*']['*'] ??= {});
    let applied = 0;
    for (const k of knobs) {
        if (!k?.card || !k?.property)
            continue;
        if (!Array.isArray(g[k.card]))
            g[k.card] = [{}];
        if (typeof g[k.card][0] !== 'object' || g[k.card][0] === null)
            g[k.card][0] = {};
        if (!(k.property in g[k.card][0])) {
            g[k.card][0][k.property] = k.fluentValue;
            applied++;
        }
    }
    return applied;
}
export function registerPowerbiTheme(server) {
    server.registerTool('fluent_generate_powerbi_theme', {
        title: 'Generate a Fluent 2 Power BI theme',
        description: 'Generate a valid, Fluent 2-aligned Power BI report theme JSON (dataColors, foreground/background levels, status colors, Segoe UI textClasses, and visualStyles "visual defaults"). Optionally recolor to a brand hex. Import in Power BI Desktop via View > Themes > Browse for themes.',
        inputSchema: {
            brandColor: z
                .string()
                .regex(/^#?[0-9a-fA-F]{6}$/)
                .optional()
                .describe('Brand hex, e.g. #0F6CBD. Defaults to the Fluent brand.'),
            name: z.string().optional().describe('Theme name (default "Fluent 2").'),
            includeVisualDefaults: z
                .boolean()
                .default(true)
                .describe('Fill any visual-default knobs missing from the base theme using the Fluent 2 visual-defaults catalog (defensive fallback; the shipped base already includes them).'),
        },
    }, async ({ brandColor, name, includeVisualDefaults }) => {
        const base = loadJson('powerbi-theme.base.json');
        if (!base) {
            return textResult('Base theme not found at mcp/data/powerbi-theme.base.json.');
        }
        const theme = structuredClone(base);
        if (name)
            theme.name = name;
        if (brandColor) {
            const brand = normalizeHex(brandColor);
            if (Array.isArray(theme.dataColors) && theme.dataColors.length) {
                theme.dataColors[0] = brand;
            }
            theme.tableAccent = brand;
            theme.maximum = brand;
            theme.center = mixWithWhite(brand, 0.35);
            theme.minimum = mixWithWhite(brand, 0.8);
        }
        if (includeVisualDefaults)
            applyVisualDefaults(theme);
        return textResult(JSON.stringify(theme, null, 2));
    });
}
