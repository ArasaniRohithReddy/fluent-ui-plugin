import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { join, relative } from 'node:path';
import {
  readdirSync,
  readFileSync,
  mkdirSync,
  writeFileSync,
  existsSync,
} from 'node:fs';
import { TEMPLATES_DIR, textResult, normalizeHex } from '../util.js';

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

export function registerPbip(server: McpServer): void {
  server.registerTool(
    'fluent_scaffold_pbip',
    {
      title: 'Scaffold a Fluent 2 Power BI PBIP/PBIR project',
      description:
        'Create a Fluent 2-themed Power BI Project (PBIP) with the enhanced report format (PBIR) by copying the bundled, schema-validated template and renaming it. Writes files under outputDir. Open the resulting .pbip in Power BI Desktop (enable preview: PBIP save option + PBIR enhanced report format).',
      inputSchema: {
        name: z
          .string()
          .min(1)
          .regex(/^[A-Za-z0-9 _-]+$/, 'Use letters, numbers, spaces, underscores or hyphens (no path separators).')
          .default('FluentReport')
          .describe('Report/project name (used for file names, folders, and internal references).'),
        outputDir: z
          .string()
          .describe('Absolute or relative directory to write the project into.'),
        brandColor: z
          .string()
          .regex(/^#?[0-9a-fA-F]{6}$/)
          .optional()
          .describe('Optional brand hex to recolor the registered Fluent theme (replaces #0F6CBD).'),
      },
    },
    async ({ name, outputDir, brandColor }) => {
      const src = join(TEMPLATES_DIR, 'pbip');
      if (!existsSync(src)) {
        return textResult('PBIP template not found at templates/pbip.');
      }
      const files = walk(src);
      const written: string[] = [];
      for (const f of files) {
        const rel = relative(src, f).split('FluentReport').join(name);
        const dest = join(outputDir, rel);
        let content = readFileSync(f, 'utf8').split('FluentReport').join(name);
        if (brandColor && content.includes('#0F6CBD')) {
          content = content.split('#0F6CBD').join(normalizeHex(brandColor));
        }
        mkdirSync(join(dest, '..'), { recursive: true });
        writeFileSync(dest, content, 'utf8');
        written.push(rel);
      }
      return textResult(
        `Scaffolded Fluent 2 PBIP/PBIR project "${name}" into ${outputDir}\n\n` +
          `Files (${written.length}):\n` +
          written.map((w) => ' - ' + w).join('\n') +
          `\n\nNext: open ${name}.pbip in Power BI Desktop (Options > Preview features: enable the .pbip save option and the PBIR enhanced report format).`
      );
    }
  );
}
