import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { join, relative } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  readdirSync,
  readFileSync,
  mkdirSync,
  writeFileSync,
  existsSync,
} from 'node:fs';
import { TEMPLATES_DIR, SCRIPTS_DIR, textResult, normalizeHex } from '../util.js';

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

/**
 * Stamp themeCollection.customTheme.reportVersionAtImport with the SAME
 * computation fluent_pbir_apply_theme performs (visual = MAX visualContainer
 * schema version, page = MAX page schema version, report = the version in
 * report.json's own $schema), by calling the shared PBIR engine rather than
 * duplicating it.
 *
 * Without this the scaffold shipped a hardcoded value that drifted from the
 * template's own $schema URLs, so a freshly scaffolded report failed our own
 * fluent_pbir_verify V3.
 */
async function stampReportVersionAtImport(
  reportDir: string
): Promise<{ computed: Record<string, string>; previous: unknown; changed: boolean } | { error: string }> {
  try {
    const lib: any = await import(pathToFileURL(join(SCRIPTS_DIR, 'pbir', 'lib.mjs')).href);
    const model = lib.loadReport(reportDir);
    const computed = lib.computeReportVersionAtImport(model);
    const report = model.report.json;
    const ct = report?.themeCollection?.customTheme;
    if (!ct) return { computed, previous: null, changed: false };
    const previous = ct.reportVersionAtImport ?? null;
    const changed = JSON.stringify(previous) !== JSON.stringify(computed);
    if (changed) {
      ct.reportVersionAtImport = computed;
      lib.writeJsonFile(model.dir, model.report.path, report, model.report.style);
    }
    return { computed, previous, changed };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

export function registerPbip(server: McpServer): void {
  server.registerTool(
    'fluent_scaffold_pbip',
    {
      title: 'Scaffold a Fluent 2 Power BI PBIP/PBIR project',
      description:
        'Create a Fluent 2-themed Power BI Project (PBIP) with the enhanced report format (PBIR) by copying the bundled, schema-validated template and renaming it. Writes files under outputDir. themeCollection.customTheme.reportVersionAtImport is COMPUTED from the scaffolded files (the same computation fluent_pbir_apply_theme uses), and the scaffolded visual carries no inline background/border/title overrides, so the result passes fluent_pbir_verify V1-V9 out of the box. Open the resulting .pbip in Power BI Desktop (enable preview: PBIP save option + PBIR enhanced report format).',
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
          .regex(/^#?[0-9a-fA-F]{6}$/, 'brandColor must be a 6-digit hex like #0F6CBD (a leading # is optional).')
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

      const reportDir = join(outputDir, `${name}.Report`);
      const stamp = await stampReportVersionAtImport(reportDir);
      const versionNote =
        'error' in stamp
          ? `\n\nWARNING: could not compute reportVersionAtImport (${stamp.error}). Run fluent_pbir_verify on the result.`
          : `\n\nComputed themeCollection.customTheme.reportVersionAtImport = ${JSON.stringify(stamp.computed)}` +
            (stamp.changed ? ' (rewritten to match the scaffolded schema versions).' : ' (template already matched).');

      return textResult(
        `Scaffolded Fluent 2 PBIP/PBIR project "${name}" into ${outputDir}\n\n` +
          `Files (${written.length}):\n` +
          written.map((w) => ' - ' + w).join('\n') +
          versionNote +
          `\n\nVerify at any time: fluent_pbir_verify { reportDir: "${reportDir}" } (expect 9 passed, 0 failed).` +
          `\n\nNext: open ${name}.pbip in Power BI Desktop (Options > Preview features: enable the .pbip save option and the PBIR enhanced report format).`
      );
    }
  );
}
