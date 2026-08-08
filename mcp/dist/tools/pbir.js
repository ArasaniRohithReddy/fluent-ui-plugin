import { z } from 'zod';
import { join, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { SCRIPTS_DIR, textResult } from '../util.js';
/**
 * Deterministic Power BI PBIR tooling.
 *
 * The engine lives in scripts/pbir/*.mjs so it also runs as a plain CLI with no
 * MCP server and no dependencies. These tools are thin wrappers around it.
 *
 * Why these tools exist: a Power BI custom theme only styles properties a visual
 * has NOT overridden inline. Real reports carry inline visualContainerObjects
 * overrides on 68 to 95 percent of visuals for exactly the properties a Fluent 2
 * theme sets, so registering a theme alone changes almost nothing. The fix is to
 * DELETE the inline override so the theme default applies. Re-tinting the
 * override with a Fluent hex value is an anti-pattern: the override survives and
 * the theme stays inert.
 */
const PBIR_DIR = join(SCRIPTS_DIR, 'pbir');
const modules = new Map();
function loadPbir(file) {
    const key = file;
    if (!modules.has(key)) {
        modules.set(key, import(pathToFileURL(join(PBIR_DIR, file)).href));
    }
    return modules.get(key);
}
function errorText(err) {
    const msg = err instanceof Error ? err.message : String(err);
    return `PBIR error: ${msg}`;
}
/** Every write must land inside the report directory the caller named. */
function assertInside(reportDir, target) {
    const r = resolve(reportDir);
    const c = resolve(target);
    if (c !== r && !c.startsWith(r.endsWith(sep) ? r : r + sep)) {
        throw new Error(`refusing to write outside the report directory: ${target}`);
    }
}
const reportDirArg = z
    .string()
    .min(1)
    .describe('Path to the PBIR report folder (the *.Report directory that contains definition/pages), or the PBIP project root that holds exactly one *.Report folder. A binary .pbix or a PBIR-Legacy report.json cannot be used.');
const formatArg = z
    .enum(['text', 'json'])
    .default('text')
    .describe('text is a readable report; json is the full machine-readable object.');
export function registerPbir(server) {
    // -------------------------------------------------------------------------
    // 1) audit
    // -------------------------------------------------------------------------
    server.registerTool('fluent_pbir_audit', {
        title: 'Audit a Power BI PBIR report (read-only)',
        description: 'Read-only census of a PBIR report: pages with each page\'s real canvas size and visual count, visual count, visualType histogram, schema-version histogram plus the MAX per kind, the current themeCollection and resourcePackages, per-key inline-override counts, inline fontFamily/fontSize counts, top hardcoded color literals, visualGroup/isHidden/parentGroupName counts, bookmark count plus which bookmarks captured formatting, geometry findings against each page\'s own width and height, and the theme-effectiveness matrix. Writes nothing.',
        inputSchema: {
            reportDir: reportDirArg,
            themePath: z
                .string()
                .optional()
                .describe('Optional theme JSON to compute ownership against. Defaults to the theme already registered in the report, then to the built-in Fluent 2 declarations.'),
            top: z
                .number()
                .int()
                .min(1)
                .max(200)
                .default(20)
                .describe('How many rows to keep in the long lists (colors, out-of-bounds, overlaps).'),
            format: formatArg,
        },
    }, async ({ reportDir, themePath, top, format }) => {
        try {
            const mod = await loadPbir('audit.mjs');
            const result = mod.auditReport(reportDir, { themePath, top });
            return textResult(format === 'json' ? JSON.stringify(result, null, 2) : mod.formatAudit(result));
        }
        catch (err) {
            return textResult(errorText(err));
        }
    });
    // -------------------------------------------------------------------------
    // 2) apply theme
    // -------------------------------------------------------------------------
    server.registerTool('fluent_pbir_apply_theme', {
        title: 'Register a Fluent 2 theme in an existing PBIR report',
        description: 'Write the theme to StaticResources/RegisteredResources/<name>.json, APPEND the CustomTheme item to the report\'s existing RegisteredResources package (creating the package only when it is absent, so existing image resources survive), and set themeCollection.customTheme with a COMPUTED reportVersionAtImport (visual = MAX visualContainer schema version, page = MAX page schema version, report = the version in report.json\'s own $schema). Dry run by default. Registering a theme is only step one: run fluent_pbir_normalize_inline afterwards, because a theme styles nothing a visual has overridden inline.',
        inputSchema: {
            reportDir: reportDirArg,
            themeJson: z
                .string()
                .optional()
                .describe('The theme as a JSON string. Use this or themePath. fluent_generate_powerbi_theme produces a valid one.'),
            themePath: z.string().optional().describe('Path to a theme JSON file. Use this or themeJson.'),
            themeName: z
                .string()
                .regex(/^[A-Za-z0-9 _.-]+$/, 'No path separators.')
                .optional()
                .describe('Resource item name. A trailing .json is stripped: the item name has no .json, the item path does.'),
            dryRun: z
                .boolean()
                .default(true)
                .describe('true (default) reports the exact changes without touching disk. Set false to write.'),
            format: formatArg,
        },
    }, async ({ reportDir, themeJson, themePath, themeName, dryRun, format }) => {
        try {
            if (!themeJson && !themePath) {
                return textResult('PBIR error: provide themeJson or themePath.');
            }
            const mod = await loadPbir('apply-theme.mjs');
            const result = mod.applyTheme(reportDir, { themeJson, themePath, themeName, dryRun });
            return textResult(format === 'json' ? JSON.stringify(result, null, 2) : mod.formatApply(result));
        }
        catch (err) {
            return textResult(errorText(err));
        }
    });
    // -------------------------------------------------------------------------
    // 3) normalize inline overrides (the core fix)
    // -------------------------------------------------------------------------
    server.registerTool('fluent_pbir_normalize_inline', {
        title: 'Clear the inline overrides that make a Power BI theme inert',
        description: 'The core fix. For every theme-owned key present inline on a visual, DELETE the inline visualContainerObjects override so the registered theme default applies, and return a full ledger (file, visual, visualType, key, property, before, after, decision, reason). Never touches data-role formatting under visual.objects, never touches a property the theme does not declare for that visual type, never touches names, ids, positions or $schema, and skips visuals whose formatting a bookmark captured (they are reported instead) unless includeBookmarked is set. Dry run by default. Do not use policy remap-colors as a fix: re-tinting an override leaves it in place and the theme stays inert.',
        inputSchema: {
            reportDir: reportDirArg,
            policy: z
                .enum(['theme-wins', 'report', 'remap-colors'])
                .default('theme-wins')
                .describe('theme-wins deletes the theme-owned inline override so the theme applies (the fix). report is a dry-run census that never writes. remap-colors rewrites inline hex colors to the nearest theme color and is an ANTI-PATTERN kept only for cases where an override must survive.'),
            keys: z
                .array(z.string())
                .optional()
                .describe('Container cards to normalize. Defaults to background, border, visualHeader, title. Keys the theme does not own are ignored and reported.'),
            visualTypes: z
                .array(z.string())
                .optional()
                .describe('Restrict to these visualType values (for example card, slicer). Default: every visual.'),
            includeBookmarked: z
                .boolean()
                .default(false)
                .describe('Normalize visuals whose formatting a bookmark captured. Off by default because the bookmark snaps the old style back; re-capture those bookmarks in Power BI Desktop afterwards.'),
            includeDataObjectTypography: z
                .boolean()
                .default(false)
                .describe('Also delete fontFamily/fontSize from data-role cards under visual.objects so the theme textClasses apply. Off by default because visual.objects is data formatting.'),
            themePath: z
                .string()
                .optional()
                .describe('Theme to compute ownership against. Defaults to the theme registered in the report.'),
            dryRun: z
                .boolean()
                .default(true)
                .describe('true (default) computes the full ledger and the projected effectiveness without touching disk.'),
            maxLedger: z
                .number()
                .int()
                .min(1)
                .max(20000)
                .default(200)
                .describe('Cap on ledger rows returned. The remainder is counted in ledgerTruncated; use ledgerPath or the CLI for the full ledger.'),
            ledgerPath: z
                .string()
                .optional()
                .describe('Optional path INSIDE reportDir to write the complete ledger JSON to.'),
            format: formatArg,
        },
    }, async ({ reportDir, policy, keys, visualTypes, includeBookmarked, includeDataObjectTypography, themePath, dryRun, maxLedger, ledgerPath, format, }) => {
        try {
            const mod = await loadPbir('normalize-inline.mjs');
            const result = mod.normalizeInline(reportDir, {
                policy,
                keys,
                visualTypes,
                includeBookmarked,
                includeDataObjectTypography,
                themePath,
                dryRun,
                maxLedger,
            });
            if (ledgerPath) {
                assertInside(result.reportDir, ledgerPath);
                mkdirSync(dirname(resolve(ledgerPath)), { recursive: true });
                writeFileSync(resolve(ledgerPath), JSON.stringify(result.ledger, null, 2) + '\n', 'utf8');
            }
            return textResult(format === 'json' ? JSON.stringify(result, null, 2) : mod.formatNormalize(result));
        }
        catch (err) {
            return textResult(errorText(err));
        }
    });
    // -------------------------------------------------------------------------
    // 4) verify
    // -------------------------------------------------------------------------
    server.registerTool('fluent_pbir_verify', {
        title: 'Verify a Fluent 2 adoption actually landed (V1 to V9)',
        description: 'Runs nine assertions and reports pass or fail for each. V1 report.json parses and themeCollection.customTheme has name, type RegisteredResources and reportVersionAtImport. V2 customTheme.name matches a CustomTheme resource item whose file exists. V3 reportVersionAtImport equals the computed MAX visual/page/report schema versions. V4 the registered theme has the expected name and a reportThemeSchema $schema. V5 the theme-effectiveness ratio per theme-owned key is at or above the target (the matrix is printed; this is the check that catches a run which changed nothing). V6 no data visual carries an inline container fontFamily or fontSize. V7 every visual.json still parses and keeps its required keys. V8 page, visual and bookmark counts equal a supplied baseline. V9 no identifier changed versus the baseline. Writes nothing unless writeBaseline is set.',
        inputSchema: {
            reportDir: reportDirArg,
            expectedThemePath: z
                .string()
                .optional()
                .describe('The Fluent theme the report should carry. V4 compares the registered theme name to this file\'s name.'),
            baselinePath: z
                .string()
                .optional()
                .describe('Baseline JSON written earlier by writeBaseline. Drives V8 and V9; without it they are skipped.'),
            writeBaseline: z
                .string()
                .optional()
                .describe('Path INSIDE reportDir to write a fresh baseline to (counts plus the identity hash), then stop.'),
            target: z
                .number()
                .min(0)
                .max(1)
                .default(0.9)
                .describe('Minimum theme-effectiveness ratio for V5.'),
            keys: z
                .array(z.string())
                .optional()
                .describe('Container cards to score in V5. Defaults to background, border, visualHeader, title.'),
            strictTypography: z
                .boolean()
                .default(false)
                .describe('Make V6 also require zero inline fontFamily/fontSize on data-role cards under visual.objects.'),
            format: formatArg,
        },
    }, async ({ reportDir, expectedThemePath, baselinePath, writeBaseline, target, keys, strictTypography, format, }) => {
        try {
            const mod = await loadPbir('verify.mjs');
            if (writeBaseline) {
                const baseline = mod.makeBaseline(reportDir);
                assertInside(baseline.reportDir, writeBaseline);
                mkdirSync(dirname(resolve(writeBaseline)), { recursive: true });
                writeFileSync(resolve(writeBaseline), JSON.stringify(baseline, null, 2) + '\n', 'utf8');
                return textResult(`Baseline written to ${writeBaseline}\n\n${JSON.stringify(baseline, null, 2)}`);
            }
            const result = mod.verifyReport(reportDir, {
                expectedThemePath,
                baselinePath,
                target,
                keys,
                strictTypography,
            });
            return textResult(format === 'json' ? JSON.stringify(result, null, 2) : mod.formatVerify(result));
        }
        catch (err) {
            return textResult(errorText(err));
        }
    });
}
