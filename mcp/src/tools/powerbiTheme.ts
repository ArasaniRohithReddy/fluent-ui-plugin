import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { loadJson, textResult, normalizeHex, mixWithWhite } from '../util.js';

/** Fill any Fluent 2 visual-default knobs MISSING from the base theme (the catalog is the documented reference + a defensive fallback; the shipped base already embeds these, so this is typically a no-op). Existing base values always win. Returns the number of knobs added. */
function applyVisualDefaults(theme: any): number {
  const catalog = loadJson<any>('powerbi-visual-defaults.json');
  const knobs = catalog?.globalDefaults?.knobs;
  if (!Array.isArray(knobs)) return 0;
  theme.visualStyles ??= {};
  theme.visualStyles['*'] ??= {};
  const g: any = (theme.visualStyles['*']['*'] ??= {});
  let applied = 0;
  for (const k of knobs) {
    if (!k?.card || !k?.property) continue;
    if (!Array.isArray(g[k.card])) g[k.card] = [{}];
    if (typeof g[k.card][0] !== 'object' || g[k.card][0] === null) g[k.card][0] = {};
    if (!(k.property in g[k.card][0])) {
      g[k.card][0][k.property] = k.fluentValue;
      applied++;
    }
  }
  return applied;
}

type PaletteTheme = 'light' | 'dark';

interface PaletteEntry {
  slot?: number;
  key?: string;
  token: string;
  light: string;
  dark: string;
}

/**
 * The series palette, taken from Fluent's own data-visualisation palette rather
 * than invented here.
 *
 * Before this, the base theme carried a hand-picked 12-colour list led by the
 * brand blue. It looked Fluent, but it was NOT the palette
 * @fluentui/react-charts paints with, so a Power BI visual and a React chart
 * showing the same series rendered in different colours - the exact mismatch
 * anyone putting the two on one page would notice. dataColors now comes
 * straight from DataVizPalette's qualitative slots, in slot order, so series N
 * is the same hex on both surfaces.
 *
 * Returns null when the charts dataset is unavailable, in which case the base
 * theme's own dataColors are left untouched.
 */
function dataVizSeriesColors(mode: PaletteTheme, count: number): { colors: string[]; total: number } | null {
  const charts = loadJson<any>('fluent-charts.json');
  const qualitative: PaletteEntry[] | undefined = charts?.dataVizPalette?.qualitative;
  if (!Array.isArray(qualitative) || qualitative.length === 0) return null;
  const ordered = [...qualitative].sort((a, b) => (a.slot ?? 0) - (b.slot ?? 0));
  return {
    colors: ordered.slice(0, count).map((c) => normalizeHex(mode === 'dark' ? c.dark : c.light)),
    total: ordered.length,
  };
}

/** A DataVizPalette semantic colour resolved to hex for the requested theme. */
function semanticColor(mode: PaletteTheme, key: string): string | null {
  const charts = loadJson<any>('fluent-charts.json');
  const entry: PaletteEntry | undefined = (charts?.dataVizPalette?.semantic ?? []).find((s: PaletteEntry) => s.key === key);
  if (!entry) return null;
  return normalizeHex(mode === 'dark' ? entry.dark : entry.light);
}

export function registerPowerbiTheme(server: McpServer): void {
  server.registerTool(
    'fluent_generate_powerbi_theme',
    {
      title: 'Generate a Fluent 2 Power BI theme',
      description:
        'Generate a valid, Fluent 2-aligned Power BI report theme JSON (dataColors, foreground/background levels, status colors, Segoe UI textClasses, and visualStyles "visual defaults"). The series palette is NOT invented: dataColors comes from DataVizPalette - the same data-visualisation palette @fluentui/react-charts paints with - in slot order, so a Power BI visual and a Fluent React chart showing the same series use the same colour. good/bad come from DataVizPalette semantic success/error. Optionally recolor the brand accents to a brand hex. Import in Power BI Desktop via View > Themes > Browse for themes. Output is pure JSON, ready to pass straight to fluent_pbir_apply_theme.',
      inputSchema: {
        brandColor: z
          .string()
          .regex(/^#?[0-9a-fA-F]{6}$/, 'brandColor must be a 6-digit hex colour like #0F6CBD (the leading # is optional)')
          .optional()
          .describe('Brand hex, e.g. #0F6CBD. Recolors the brand accents (tableAccent plus the maximum/center/minimum gradient). Defaults to the Fluent brand.'),
        name: z.string().optional().describe('Theme name (default "Fluent 2").'),
        includeVisualDefaults: z
          .boolean()
          .default(true)
          .describe('Fill any visual-default knobs missing from the base theme using the Fluent 2 visual-defaults catalog (defensive fallback; the shipped base already includes them).'),
        paletteTheme: z
          .enum(['light', 'dark'])
          .default('light')
          .describe('Which DataVizPalette variant to emit. 21 of the 40 qualitative slots and 6 of the 7 semantic colours have a distinct dark-theme value; use "dark" for a dark-canvas report so it matches a chart rendered under webDarkTheme.'),
        dataColorCount: z
          .number()
          .int()
          .min(8)
          .max(40)
          .default(40)
          .describe('How many DataVizPalette qualitative slots to emit as dataColors. 40 (the default) is the whole palette, which is exactly what a Fluent chart cycles through - keep it to guarantee series N matches on both surfaces. A smaller number shortens the theme file but only the first N series will agree.'),
        brandFirstDataColor: z
          .boolean()
          .default(false)
          .describe('Overwrite the FIRST series colour with brandColor. Off by default: it breaks the DataVizPalette match for series 1 and swaps a slot chosen for qualitative separation for an arbitrary brand hex. Turn it on only when a brand-led first series is an explicit requirement.'),
      },
    },
    async ({ brandColor, name, includeVisualDefaults, paletteTheme, dataColorCount, brandFirstDataColor }) => {
      const base = loadJson<any>('powerbi-theme.base.json');
      if (!base) {
        return textResult(
          'Base theme not found at mcp/data/powerbi-theme.base.json.'
        );
      }
      const theme = structuredClone(base);
      if (name) theme.name = name;

      const mode: PaletteTheme = paletteTheme === 'dark' ? 'dark' : 'light';
      const series = dataVizSeriesColors(mode, dataColorCount);
      if (series) theme.dataColors = series.colors;

      const good = semanticColor(mode, 'success');
      const bad = semanticColor(mode, 'error');
      if (good) theme.good = good;
      if (bad) theme.bad = bad;
      // `neutral` is deliberately left at the base value: DataVizPalette has no
      // neutral, and its nearest member (warning, #F7630C) reads as an alert
      // rather than a middle state. See powerbiAlignment.statusColors in
      // mcp/data/fluent-charts.json.

      if (brandColor) {
        const brand = normalizeHex(brandColor);
        if (brandFirstDataColor && Array.isArray(theme.dataColors) && theme.dataColors.length) {
          theme.dataColors[0] = brand;
        }
        theme.tableAccent = brand;
        theme.maximum = brand;
        theme.center = mixWithWhite(brand, 0.35);
        theme.minimum = mixWithWhite(brand, 0.8);
      }
      if (includeVisualDefaults) applyVisualDefaults(theme);
      // Pure JSON, no preamble: the output is passed verbatim to
      // fluent_pbir_apply_theme, which parses it.
      return textResult(JSON.stringify(theme, null, 2));
    }
  );
}
