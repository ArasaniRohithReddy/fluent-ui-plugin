/**
 * fluent_pbir_audit / audit.mjs
 *
 * Read-only census of a PBIR report. Never writes.
 *
 * Usage:
 *   node scripts/pbir/audit.mjs <reportDir> [--json] [--theme <themePath>]
 *                               [--top 20] [--max-overlaps 50]
 */

import {
  isMain,
  loadReport,
  dataVisuals,
  themeOwnedProperties,
  registeredTheme,
  registeredResourcesPackage,
  censusInlineOverrides,
  effectivenessMatrix,
  formatEffectiveness,
  bookmarkFormattingIndex,
  geometryFindings,
  computeReportVersionAtImport,
  histogram,
  identityHash,
  dirSize,
  readJsonFile,
  parseArgs,
  DEFAULT_KEYS,
  fail,
} from './lib.mjs';

/**
 * Build the audit report object.
 * @param {string} reportDir
 * @param {{themePath?: string, top?: number, maxOverlaps?: number, keys?: string[]}} [opts]
 */
export function auditReport(reportDir, opts = {}) {
  const model = loadReport(reportDir);
  const top = opts.top ?? 20;

  const themeInfo = registeredTheme(model);
  let themeJson = themeInfo && themeInfo.json ? themeInfo.json : null;
  let themeSource = themeInfo && themeInfo.exists ? themeInfo.relPath : null;
  if (opts.themePath) {
    const f = readJsonFile(opts.themePath);
    if (f && f.json) {
      themeJson = f.json;
      themeSource = opts.themePath;
    }
  }

  const owned = themeOwnedProperties(themeJson);
  const census = censusInlineOverrides(model, owned);
  const keys = opts.keys && opts.keys.length ? opts.keys : DEFAULT_KEYS;
  const matrix = effectivenessMatrix(census, owned, keys);
  const bookmarkIndex = bookmarkFormattingIndex(model);
  const geometry = geometryFindings(model, { maxOverlaps: opts.maxOverlaps ?? 50 });
  const dv = dataVisuals(model);

  const visualSchemaHist = histogram(model.visuals.map((v) => v.schemaVersion));
  const pageSchemaHist = histogram(model.pages.map((p) => p.schemaVersion));
  const computed = computeReportVersionAtImport(model);

  const pkg = registeredResourcesPackage(model);

  return {
    reportDir: model.dir,
    generatedAt: new Date().toISOString(),
    sizeBytes: dirSize(model.dir),
    counts: {
      pages: model.pages.length,
      visualFiles: model.visuals.length,
      dataVisuals: dv.length,
      visualGroups: model.visuals.filter((v) => v.isGroup).length,
      isHidden: model.visuals.filter((v) => v.isHidden).length,
      withParentGroupName: model.visuals.filter((v) => v.parentGroupName).length,
      bookmarks: model.bookmarks.length,
      unparsableVisuals: model.visuals.filter((v) => v.parseError).length,
    },
    pages: model.pages.map((p) => ({
      name: p.name,
      displayName: p.displayName,
      dir: p.dirName,
      width: p.width,
      height: p.height,
      schemaVersion: p.schemaVersion,
      visuals: p.visuals.length,
      dataVisuals: p.visuals.filter((v) => v.json && v.json.visual).length,
      groups: p.visuals.filter((v) => v.isGroup).length,
    })),
    visualTypes: histogram(
      model.visuals.map((v) => v.visualType ?? (v.isGroup ? '(visualGroup)' : '(no visual node)'))
    ),
    schemaVersions: {
      visualContainer: { histogram: visualSchemaHist, max: computed.visual },
      page: { histogram: pageSchemaHist, max: computed.page },
      report: model.report.schemaVersion,
      bookmark: histogram(model.bookmarks.map((b) => b.schemaVersion)),
    },
    computedReportVersionAtImport: computed,
    themeCollection: model.themeCollection,
    resourcePackages: model.resourcePackages.map((p) => ({
      name: p.name,
      type: p.type,
      items: (p.items || []).map((i) => ({ name: i.name, path: i.path, type: i.type })),
    })),
    registeredResourcesPackagePresent: !!pkg,
    registeredTheme: themeInfo
      ? {
          customThemeName: themeInfo.customTheme.name,
          itemNameMatches: themeInfo.nameMatchesItem,
          path: themeInfo.relPath,
          fileExists: themeInfo.exists,
          themeOwnName: themeInfo.json ? (themeInfo.json.name ?? null) : null,
          themeSchema: themeInfo.json ? (themeInfo.json.$schema ?? null) : null,
        }
      : null,
    themeUsedForOwnership: themeSource,
    themeOwnedKeys: owned.toJSON(),
    inlineOverrides: {
      dataVisuals: census.dataVisualCount,
      themeOwnedInstances: census.ownedInstances,
      visualsPerCard: census.perCardVisuals,
      visualsPerCardThemeOwned: census.perCardOwnedVisuals,
      instancesPerCard: census.perCardInstances,
      instancesPerProperty: Object.fromEntries(
        Object.entries(census.perPropertyInstances).slice(0, Math.max(top, 40))
      ),
    },
    typography: census.typography,
    hardcodedColors: census.colors.slice(0, top),
    bookmarks: {
      count: model.bookmarks.length,
      capturingFormatting: bookmarkIndex.bookmarksCapturing,
      visualsWithCapturedFormatting: bookmarkIndex.byVisual.size,
    },
    geometry: {
      outOfBoundsCount: geometry.outOfBounds.length,
      outOfBounds: geometry.outOfBounds.slice(0, top),
      overlapCount: geometry.overlapCount,
      significantOverlapCount: geometry.significantOverlapCount,
      overlaps: geometry.overlaps.slice(0, top),
    },
    effectiveness: matrix,
    identityHash: identityHash(model),
  };
}

/** Human-readable rendering of the audit object. */
export function formatAudit(a) {
  const L = [];
  const kb = (n) => `${(n / 1024 / 1024).toFixed(2)} MB`;
  L.push(`PBIR audit: ${a.reportDir}`);
  L.push(`size ${kb(a.sizeBytes)}  generated ${a.generatedAt}`);
  L.push('');
  L.push('COUNTS');
  for (const [k, v] of Object.entries(a.counts)) L.push(`  ${k.padEnd(22)} ${v}`);
  L.push('');
  L.push('PAGES (canvas size is per page, never assumed)');
  L.push(
    `  ${'page'.padEnd(40)} ${'w x h'.padEnd(13)} ${'schema'.padEnd(7)} ${'visuals'.padStart(7)} ${'data'.padStart(5)}`
  );
  for (const p of a.pages) {
    const label = (p.displayName || p.name).slice(0, 40);
    L.push(
      `  ${label.padEnd(40)} ${`${p.width}x${p.height}`.padEnd(13)} ${String(p.schemaVersion ?? '-').padEnd(7)} ${String(p.visuals).padStart(7)} ${String(p.dataVisuals).padStart(5)}`
    );
  }
  L.push('');
  L.push('VISUAL TYPES');
  for (const [k, v] of Object.entries(a.visualTypes)) L.push(`  ${k.padEnd(34)} ${v}`);
  L.push('');
  L.push('SCHEMA VERSIONS');
  L.push(
    `  visualContainer  ${JSON.stringify(a.schemaVersions.visualContainer.histogram)}  max=${a.schemaVersions.visualContainer.max}`
  );
  L.push(
    `  page             ${JSON.stringify(a.schemaVersions.page.histogram)}  max=${a.schemaVersions.page.max}`
  );
  L.push(`  report           ${a.schemaVersions.report}`);
  L.push(`  computed reportVersionAtImport = ${JSON.stringify(a.computedReportVersionAtImport)}`);
  L.push('');
  L.push('THEME WIRING');
  L.push(`  themeCollection  ${JSON.stringify(a.themeCollection)}`);
  L.push(`  RegisteredResources package present: ${a.registeredResourcesPackagePresent}`);
  for (const p of a.resourcePackages) {
    L.push(`  package ${p.name} (${p.type}) items=${p.items.length}`);
    for (const i of p.items) L.push(`     - ${i.type.padEnd(12)} name=${i.name}  path=${i.path}`);
  }
  if (a.registeredTheme) {
    const t = a.registeredTheme;
    L.push(
      `  registered theme: name=${t.customThemeName} itemNameMatches=${t.itemNameMatches} fileExists=${t.fileExists} themeOwnName=${t.themeOwnName}`
    );
  }
  L.push('');
  L.push('INLINE OVERRIDES (the reason a theme does nothing)');
  L.push(`  data visuals (visual node present): ${a.inlineOverrides.dataVisuals}`);
  L.push(`  theme-owned property instances:     ${a.inlineOverrides.themeOwnedInstances}`);
  L.push(`  ${'card'.padEnd(20)} ${'visuals'.padStart(8)} ${'themeOwned'.padStart(11)} ${'instances'.padStart(10)}`);
  for (const card of Object.keys(a.inlineOverrides.visualsPerCard)) {
    L.push(
      `  ${card.padEnd(20)} ${String(a.inlineOverrides.visualsPerCard[card]).padStart(8)} ${String(
        a.inlineOverrides.visualsPerCardThemeOwned[card] ?? 0
      ).padStart(11)} ${String(a.inlineOverrides.instancesPerCard[card] ?? 0).padStart(10)}`
    );
  }
  L.push('');
  L.push('  top card.property instances');
  for (const [k, v] of Object.entries(a.inlineOverrides.instancesPerProperty).slice(0, 25)) {
    L.push(`    ${k.padEnd(40)} ${v}`);
  }
  L.push('');
  L.push('TYPOGRAPHY (inline fonts defeat theme textClasses)');
  for (const [k, v] of Object.entries(a.typography)) L.push(`  ${k.padEnd(26)} ${v}`);
  L.push('');
  L.push('TOP HARDCODED COLOR LITERALS');
  for (const c of a.hardcodedColors) L.push(`  ${c.color}  ${c.count}`);
  L.push('');
  L.push('BOOKMARKS');
  L.push(`  count ${a.bookmarks.count}`);
  L.push(`  visuals whose formatting a bookmark captured: ${a.bookmarks.visualsWithCapturedFormatting}`);
  for (const b of a.bookmarks.capturingFormatting) {
    L.push(
      `   - ${b.displayName ?? b.name}: ${b.visualsWithFormatting} visual(s), cards ${b.cards.join(', ') || '(none)'}`
    );
  }
  if (a.bookmarks.visualsWithCapturedFormatting > 0) {
    L.push(
      '  WARNING: a bookmark that captured the old formatting snaps it back after the inline override is cleared.'
    );
  }
  L.push('');
  L.push('GEOMETRY (per-page canvas)');
  L.push(`  out of bounds: ${a.geometry.outOfBoundsCount}`);
  for (const o of a.geometry.outOfBounds.slice(0, 10)) {
    L.push(
      `   - ${o.pageDisplayName} ${o.visual} (${o.visualType}) rect=${o.rect.x},${o.rect.y} ${o.rect.w}x${o.rect.h} canvas=${o.canvas.width}x${o.canvas.height} sides=${o.sides.join('/')}`
    );
  }
  L.push(`  overlapping pairs: ${a.geometry.overlapCount} (significant: ${a.geometry.significantOverlapCount})`);
  for (const o of a.geometry.overlaps.slice(0, 10)) {
    L.push(
      `   - ${o.pageDisplayName}: ${o.a.visual} (${o.a.visualType}) x ${o.b.visual} (${o.b.visualType}) ${o.overlap.width}x${o.overlap.height} ratio=${o.overlap.areaRatioOfSmaller}`
    );
  }
  L.push('');
  L.push('THEME-EFFECTIVENESS MATRIX  (1 - overridden/dataVisuals, target 0.90)');
  L.push(formatEffectiveness(a.effectiveness));
  L.push('');
  L.push(`identityHash ${a.identityHash}`);
  return L.join('\n');
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const dir = args._[0];
  if (!dir) {
    process.stderr.write(
      'usage: node scripts/pbir/audit.mjs <reportDir> [--json] [--theme <path>] [--top N]\n'
    );
    process.exit(2);
  }
  let a;
  try {
    a = auditReport(dir, {
      themePath: typeof args.theme === 'string' ? args.theme : undefined,
      top: args.top ? Number(args.top) : undefined,
      maxOverlaps: args['max-overlaps'] ? Number(args['max-overlaps']) : undefined,
    });
  } catch (err) {
    fail(String(err && err.message ? err.message : err));
    return;
  }
  process.stdout.write(args.json ? JSON.stringify(a, null, 2) + '\n' : formatAudit(a) + '\n');
}

if (isMain(import.meta.url)) main();
