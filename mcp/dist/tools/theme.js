import { z } from 'zod';
import { textResult, normalizeHex } from '../util.js';
import { getBrandTokensFromPalette, BRAND_STOP_KEYS } from '../colors/index.js';
export function registerTheme(server) {
    server.registerTool('fluent_generate_theme', {
        title: 'Generate a Fluent 2 brand theme',
        description: "Turn a single brand hex into a Fluent 2 BrandVariants ramp (16 slots, 10..160) plus ready-to-use TypeScript that builds light + dark themes with createLightTheme/createDarkTheme, and the brand CSS variables. The ramp is generated with the SAME LAB/LCH Bezier algorithm as Microsoft's Fluent 2 Theme Designer (getBrandTokensFromPalette), not an HSL approximation, so the hexes match the official tool. Neutral/semantic tokens come from the official functions (webLightTheme/webDarkTheme).",
        inputSchema: {
            brandColor: z
                .string()
                .regex(/^#?[0-9a-fA-F]{6}$/, 'brandColor must be a 6-digit hex like #0F6CBD (a leading # is optional); named colors such as "red" are not accepted.')
                .describe('Brand hex, e.g. #0F6CBD.'),
            name: z
                .string()
                .regex(/^[A-Za-z_$][A-Za-z0-9_$]*$/, 'name is used as a JavaScript identifier for the exported theme, so it must start with a letter, _ or $ and contain only letters, digits, _ or $.')
                .default('brand')
                .describe('A valid JS identifier used for the exported theme variables.'),
            vibrancy: z
                .number()
                .min(-50)
                .max(50)
                .default(0)
                .describe('Optional. The Theme Designer\'s "Vibrancy" slider, -50..50, defaulting to 0 exactly like the slider does. It sets BOTH Bezier control points (darkCp = lightCp = vibrancy/100), so higher values hold chroma near the key colour for longer. Leave it at 0 to match what Microsoft\'s Theme Designer (and Power Apps CustomTheme) give a user who only types a brand hex.'),
            hueTorsion: z
                .number()
                .min(-50)
                .max(50)
                .default(0)
                .describe('Optional. The Theme Designer\'s "Hue Torsion" slider, -50..50 (passed upstream as hueTorsion/100). Rotates the curve through LAB space so the ramp travels through neighbouring hues. 0 = no rotation.'),
            darkCp: z
                .number()
                .min(-1)
                .max(1)
                .optional()
                .describe('Advanced. Raw upstream control point of the Bezier curve toward black, overriding vibrancy. getBrandTokensFromPalette\'s own library default is 2/3 - note the Theme Designer never uses it, because its vibrancy slider passes an explicit 0.'),
            lightCp: z
                .number()
                .min(-1)
                .max(1)
                .optional()
                .describe('Advanced. Raw upstream control point of the Bezier curve toward white, overriding vibrancy. getBrandTokensFromPalette\'s own library default is 1/3.'),
        },
    }, async ({ brandColor, name, vibrancy, hueTorsion, darkCp: darkCpIn, lightCp: lightCpIn }) => {
        const brand = normalizeHex(brandColor);
        const torsionSlider = hueTorsion ?? 0;
        const torsion = torsionSlider / 100;
        const vib = vibrancy ?? 0;
        const darkCp = typeof darkCpIn === 'number' ? darkCpIn : vib / 100;
        const lightCp = typeof lightCpIn === 'number' ? lightCpIn : vib / 100;
        const usesRawCp = typeof darkCpIn === 'number' || typeof lightCpIn === 'number';
        const ramp = getBrandTokensFromPalette(brand, { darkCp, lightCp, hueTorsion: torsion });
        const bvLines = BRAND_STOP_KEYS.map(k => `  ${k}: '${ramp[k]}',`).join('\n');
        const cssLines = BRAND_STOP_KEYS.map(k => `  --colorBrand${k}: ${ramp[k]};`).join('\n');
        const ts = `import {\n  BrandVariants,\n  Theme,\n  createLightTheme,\n  createDarkTheme,\n} from '@fluentui/react-components';\n\n` +
            `export const ${name}: BrandVariants = {\n${bvLines}\n};\n\n` +
            `export const ${name}LightTheme: Theme = createLightTheme(${name});\n` +
            `export const ${name}DarkTheme: Theme = createDarkTheme(${name});\n\n` +
            `// Usage:\n// <FluentProvider theme={${name}LightTheme}> ...your app... </FluentProvider>`;
        const settings = usesRawCp
            ? `darkCp = ${darkCp}, lightCp = ${lightCp}, hueTorsion ${torsionSlider} (${torsion})`
            : `vibrancy ${vib} (darkCp = lightCp = ${darkCp}), hueTorsion ${torsionSlider} (${torsion})`;
        // The key colour is where the two curves MEET - a control point, not a sampled stop - so
        // upstream's own output usually does not contain the input hex. Saying so up front stops
        // people reporting the official behaviour as a bug in this tool.
        const keyLower = brand.toLowerCase();
        const keyStop = BRAND_STOP_KEYS.find(k => ramp[k] === keyLower);
        const keyNote = keyStop
            ? `- Your key colour ${keyLower} landed exactly on slot ${keyStop}.\n`
            : `- Slot 80 is ${ramp['80']}, not your key colour ${keyLower}. That is upstream behaviour, not a rounding bug: the key colour is the point where the two Bezier curves meet, while the 16 slots are sampled at fixed, hue-specific lightness stops, so the nearest slot is normally a close neighbour rather than the input hex. Microsoft's Theme Designer behaves identically.\n`;
        return textResult(`Fluent 2 brand theme for ${brand}\n\n` +
            `// theme.ts\n${ts}\n\n` +
            `/* Brand ramp as CSS custom properties */\n:root {\n${cssLines}\n}\n\n` +
            `Notes:\n` +
            `- createLightTheme/createDarkTheme (from @fluentui/react-components) produce the full official Fluent 2 theme (neutral + semantic tokens) from this brand ramp.\n` +
            `- The 16 slots come from the same algorithm as Microsoft's Fluent 2 Theme Designer (theme-designer/src/utils/getBrandTokensFromPalette.ts): the key colour is converted to LCH, two quadratic Bezier curves run through D50 CIE LAB from black and from white to meet at it, points are sampled at hue-specific lightness stops and snapped back into the sRGB gamut. Settings used: ${settings}.\n` +
            keyNote +
            `- Pass vibrancy / hueTorsion (-50..50, exactly like the sliders) to move the ramp; the defaults 0 and 0 are what the Theme Designer and Power Apps CustomTheme start from, so a plain call reproduces the official tool byte-for-byte. darkCp / lightCp expose upstream's raw control points if you need the library's own 2/3 and 1/3 defaults, which the Theme Designer itself never uses.\n` +
            `- @fluentui/react-theme's built-in brandWeb ramp (brand[80] = #0f6cbd) is NOT reproducible from this algorithm at any setting - it is a hand-curated designer ramp shipped as a literal, and the Theme Designer loads it verbatim for its own default state. Use webLightTheme when you want that exact ramp; use this tool to run YOUR brand colour through the official generator.`);
    });
}
