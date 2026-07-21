import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { loadJson, textResult } from '../util.js';

function walkTokens(
  obj: any,
  path: string[],
  out: Array<{ path: string; value: any }>
): void {
  for (const [k, v] of Object.entries(obj)) {
    const p = [...path, k];
    if (v && typeof v === 'object' && !Array.isArray(v)) walkTokens(v, p, out);
    else out.push({ path: p.join('.'), value: v });
  }
}

export function registerTokens(server: McpServer): void {
  server.registerTool(
    'fluent_list_tokens',
    {
      title: 'List Fluent 2 design tokens',
      description:
        'List Fluent 2 design tokens by category (color, typography, spacing, borderRadius, strokeWidth, shadow, motion). For color, choose the theme (light/dark/highContrast). Values are concrete resolved values; each token X is exposed as the CSS variable --X and as tokens.X in Griffel makeStyles.',
      inputSchema: {
        category: z
          .enum(['color', 'typography', 'spacing', 'borderRadius', 'strokeWidth', 'shadow', 'motion', 'all'])
          .default('all'),
        theme: z
          .enum(['light', 'dark', 'highContrast'])
          .default('light')
          .describe('Theme for color tokens.'),
      },
    },
    async ({ category, theme }) => {
      const t = loadJson<any>('fluent-tokens.json');
      if (!t) return textResult('Token data not found at mcp/data/fluent-tokens.json.');
      const themeKey =
        theme === 'dark' ? 'semanticDark' : theme === 'highContrast' ? 'semanticHighContrast' : 'semanticLight';
      if (category === 'color') {
        return textResult(JSON.stringify({ brandRamp: t.color.brandRamp, [themeKey]: t.color[themeKey] }, null, 2));
      }
      if (category === 'all') {
        return textResult(
          JSON.stringify(
            {
              colorBrandRamp: t.color.brandRamp,
              colorSemantic: t.color[themeKey],
              typography: t.typography,
              spacing: t.spacing,
              borderRadius: t.borderRadius,
              strokeWidth: t.strokeWidth,
              shadow: t.shadow,
              motion: t.motion,
            },
            null,
            2
          )
        );
      }
      return textResult(JSON.stringify(t[category], null, 2));
    }
  );

  server.registerTool(
    'fluent_get_token',
    {
      title: 'Get a Fluent 2 design token value',
      description:
        'Look up a Fluent 2 design token by name (e.g. colorBrandBackground, spacingHorizontalM, borderRadiusMedium, fontSizeBase300, shadow8, durationNormal). Returns concrete value(s) across light/dark/high-contrast where applicable plus the CSS variable name.',
      inputSchema: {
        name: z.string().describe('Token name or fragment, e.g. colorBrandBackground.'),
      },
    },
    async ({ name }) => {
      const t = loadJson<any>('fluent-tokens.json');
      if (!t) return textResult('Token data not found.');
      const q = name.toLowerCase().replace(/^--/, '');
      const results: Record<string, any> = {};

      for (const [themeName, key] of [
        ['light', 'semanticLight'],
        ['dark', 'semanticDark'],
        ['highContrast', 'semanticHighContrast'],
      ] as const) {
        const sec = t.color?.[key] || {};
        for (const [k, v] of Object.entries(sec)) {
          if (k.toLowerCase() === q) results[`color.${themeName}.${k}`] = v;
        }
      }

      const out: Array<{ path: string; value: any }> = [];
      for (const cat of ['typography', 'spacing', 'borderRadius', 'strokeWidth', 'shadow', 'motion']) {
        if (t[cat]) walkTokens(t[cat], [cat], out);
      }
      for (const e of out) {
        const leaf = e.path.split('.').pop()!.toLowerCase();
        if (leaf === q) results[e.path] = e.value;
      }

      if (Object.keys(results).length === 0) {
        for (const [k, v] of Object.entries(t.color?.semanticLight || {})) {
          if (k.toLowerCase().includes(q)) results[`color.light.${k}`] = v;
        }
        for (const e of out) {
          if (e.path.toLowerCase().includes(q)) results[e.path] = e.value;
        }
      }

      if (Object.keys(results).length === 0) {
        return textResult(`No token matching "${name}". Use fluent_list_tokens to browse categories.`);
      }
      return textResult(
        `Matches for "${name}" — each token X maps to CSS variable --X and tokens.X in Griffel:\n\n` +
          JSON.stringify(results, null, 2)
      );
    }
  );
}
