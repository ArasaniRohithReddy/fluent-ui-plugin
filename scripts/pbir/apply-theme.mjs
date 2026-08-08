/**
 * fluent_pbir_apply_theme / apply-theme.mjs
 *
 * Register a custom theme in an existing PBIR report:
 *  1. write the theme JSON to StaticResources/RegisteredResources/<name>.json
 *  2. APPEND a CustomTheme item to the existing RegisteredResources package
 *     (creating the package only when it is absent, so existing image
 *     resources are preserved)
 *  3. set themeCollection.customTheme with a COMPUTED reportVersionAtImport
 *
 * reportVersionAtImport is an object with all three members:
 *   visual = MAX visualContainer schema version across every visual.json
 *   page   = MAX page schema version across every page.json
 *   report = the version in definition/report.json's own $schema
 *
 * Registering a theme is only step one. A theme styles nothing that a visual has
 * overridden inline, so run normalize-inline afterwards.
 *
 * Usage:
 *   node scripts/pbir/apply-theme.mjs <reportDir> --theme <themePath> [--name Fluent2]
 *                                     [--apply] [--json]
 *   (dry run by default; pass --apply to write)
 */

import { readFileSync, existsSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import {
  isMain,
  loadReport,
  readJsonFile,
  writeJsonFile,
  computeReportVersionAtImport,
  registeredResourcesPackage,
  isInside,
  parseArgs,
  fail,
  DEFAULT_STYLE,
} from './lib.mjs';

/** Item name convention: no `.json` on the name, `.json` on the path. */
export function normalizeThemeName(name) {
  const base = String(name || 'Fluent2').trim();
  if (/[\\/]/.test(base) || base.includes('..')) {
    throw new Error(`invalid theme name (no path separators allowed): ${name}`);
  }
  return base.replace(/\.json$/i, '');
}

/**
 * @param {string} reportDir
 * @param {{themeJson?: object|string, themePath?: string, themeName?: string, dryRun?: boolean}} opts
 */
export function applyTheme(reportDir, opts = {}) {
  const model = loadReport(reportDir);
  const dryRun = opts.dryRun !== false;

  let theme = null;
  let themeOrigin = null;
  if (opts.themeJson) {
    theme = typeof opts.themeJson === 'string' ? JSON.parse(opts.themeJson) : opts.themeJson;
    themeOrigin = 'themeJson';
  } else if (opts.themePath) {
    if (!existsSync(opts.themePath)) throw new Error(`theme file not found: ${opts.themePath}`);
    const f = readJsonFile(opts.themePath);
    if (!f || f.json === null) throw new Error(`theme file is not valid JSON: ${opts.themePath}`);
    theme = f.json;
    themeOrigin = opts.themePath;
  } else {
    throw new Error('provide themeJson or themePath');
  }
  if (!theme || typeof theme !== 'object') throw new Error('theme must be a JSON object');

  const itemName = normalizeThemeName(opts.themeName || theme.name || 'Fluent2');
  const itemPath = `${itemName}.json`;
  const themeAbs = join(model.dir, 'StaticResources', 'RegisteredResources', itemPath);
  if (!isInside(model.dir, themeAbs)) {
    throw new Error(`refusing to write outside the report directory: ${themeAbs}`);
  }

  const reportVersionAtImport = computeReportVersionAtImport(model);
  const changes = [];
  const warnings = [];

  // 1) theme file
  const existingTheme = existsSync(themeAbs) ? readFileSync(themeAbs, 'utf8') : null;
  const themeStyle = existingTheme
    ? readJsonFile(themeAbs).style
    : { ...DEFAULT_STYLE, ...model.report.style };
  changes.push({
    kind: existingTheme ? 'overwrite-theme-file' : 'write-theme-file',
    path: relative(model.dir, themeAbs).split(sep).join('/'),
    themeName: theme.name ?? null,
    bytes: JSON.stringify(theme).length,
  });

  // 2) resourcePackages: APPEND to the existing RegisteredResources package.
  const report = model.report.json;
  if (!Array.isArray(report.resourcePackages)) report.resourcePackages = [];
  let pkg = registeredResourcesPackage(model);
  if (!pkg) {
    pkg = { name: 'RegisteredResources', type: 'RegisteredResources', items: [] };
    report.resourcePackages.push(pkg);
    changes.push({ kind: 'create-resource-package', name: 'RegisteredResources' });
  } else {
    changes.push({
      kind: 'reuse-resource-package',
      name: pkg.name,
      existingItems: (pkg.items || []).length,
    });
  }
  if (!Array.isArray(pkg.items)) pkg.items = [];

  const existingItem = pkg.items.find((i) => i && i.type === 'CustomTheme' && i.name === itemName);
  const otherThemes = pkg.items.filter(
    (i) => i && i.type === 'CustomTheme' && i.name !== itemName
  );
  if (existingItem) {
    if (existingItem.path !== itemPath) {
      changes.push({
        kind: 'update-resource-item-path',
        name: itemName,
        from: existingItem.path,
        to: itemPath,
      });
      existingItem.path = itemPath;
    } else {
      changes.push({ kind: 'resource-item-already-present', name: itemName, path: itemPath });
    }
  } else {
    pkg.items.push({ name: itemName, path: itemPath, type: 'CustomTheme' });
    changes.push({ kind: 'append-resource-item', name: itemName, path: itemPath, type: 'CustomTheme' });
  }
  if (otherThemes.length) {
    warnings.push(
      `the RegisteredResources package still lists ${otherThemes.length} other CustomTheme item(s): ` +
        otherThemes.map((i) => i.name).join(', ') +
        '. Only themeCollection.customTheme.name is applied.'
    );
  }

  // 3) themeCollection.customTheme with the COMPUTED reportVersionAtImport.
  if (!report.themeCollection || typeof report.themeCollection !== 'object') {
    report.themeCollection = {};
  }
  const before = report.themeCollection.customTheme
    ? JSON.parse(JSON.stringify(report.themeCollection.customTheme))
    : null;
  report.themeCollection.customTheme = {
    name: itemName,
    reportVersionAtImport,
    type: 'RegisteredResources',
  };
  changes.push({
    kind: 'set-customTheme',
    before,
    after: report.themeCollection.customTheme,
  });

  if (!report.themeCollection.baseTheme) {
    warnings.push(
      'themeCollection has no baseTheme. Power BI Desktop normally keeps a SharedResources base theme; the custom theme layers on top of it.'
    );
  }

  const written = [];
  if (!dryRun) {
    writeJsonFile(model.dir, themeAbs, theme, themeStyle);
    written.push(relative(model.dir, themeAbs).split(sep).join('/'));
    writeJsonFile(model.dir, model.report.path, report, model.report.style);
    written.push(model.report.relPath);
  }

  return {
    reportDir: model.dir,
    dryRun,
    themeOrigin,
    themeName: itemName,
    themePath: relative(model.dir, themeAbs).split(sep).join('/'),
    reportVersionAtImport,
    changes,
    warnings,
    written,
    nextStep:
      'A theme only styles properties no visual has overridden inline. Run normalize-inline (policy theme-wins) next, then verify.',
  };
}

export function formatApply(r) {
  const L = [];
  L.push(`${r.dryRun ? 'DRY RUN' : 'APPLIED'}  theme "${r.themeName}" -> ${r.reportDir}`);
  L.push(`  theme file: ${r.themePath} (source: ${r.themeOrigin})`);
  L.push(`  computed reportVersionAtImport: ${JSON.stringify(r.reportVersionAtImport)}`);
  L.push('');
  L.push('CHANGES');
  for (const c of r.changes) {
    L.push(`  - ${c.kind}: ${JSON.stringify({ ...c, kind: undefined })}`);
  }
  if (r.warnings.length) {
    L.push('');
    L.push('WARNINGS');
    for (const w of r.warnings) L.push(`  ! ${w}`);
  }
  if (r.written.length) {
    L.push('');
    L.push('WRITTEN');
    for (const w of r.written) L.push(`  ${w}`);
  }
  L.push('');
  L.push(`NEXT: ${r.nextStep}`);
  return L.join('\n');
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const dir = args._[0];
  if (!dir || (!args.theme && !args['theme-json'])) {
    process.stderr.write(
      'usage: node scripts/pbir/apply-theme.mjs <reportDir> --theme <themePath> [--name Fluent2] [--apply] [--json]\n'
    );
    process.exit(2);
  }
  let r;
  try {
    r = applyTheme(dir, {
      themePath: typeof args.theme === 'string' ? args.theme : undefined,
      themeJson: typeof args['theme-json'] === 'string' ? args['theme-json'] : undefined,
      themeName: typeof args.name === 'string' ? args.name : undefined,
      dryRun: !args.apply,
    });
  } catch (err) {
    fail(String(err && err.message ? err.message : err));
    return;
  }
  process.stdout.write(args.json ? JSON.stringify(r, null, 2) + '\n' : formatApply(r) + '\n');
}

if (isMain(import.meta.url)) main();
