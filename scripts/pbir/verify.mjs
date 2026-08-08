/**
 * fluent_pbir_verify / verify.mjs
 *
 * Proves a Fluent 2 adoption actually landed. Counting pages and visuals cannot
 * detect the failure this tooling exists to fix: a run that changes nothing
 * passes a count check. V5 (the theme-effectiveness matrix) is the assertion
 * that catches it.
 *
 * V1 report.json parses and themeCollection.customTheme has {name, type,
 *    reportVersionAtImport} with type == RegisteredResources
 * V2 customTheme.name matches a resourcePackages item of type CustomTheme whose
 *    path exists on disk
 * V3 reportVersionAtImport.visual/page/report equal the computed MAX versions
 * V4 the registered theme's own `name` matches the expected theme and it
 *    carries a reportThemeSchema $schema
 * V5 theme-effectiveness ratio per theme-owned key >= target (default 0.90)
 * V6 data visuals with an inline container fontFamily/fontSize == 0
 * V7 every visual.json still parses and keeps its required keys
 * V8 counts equal the baseline (pages, visuals, bookmarks) when one is supplied
 * V9 no identifier changed versus the baseline identity hash
 *
 * Usage:
 *   node scripts/pbir/verify.mjs <reportDir> [--expected-theme <path>]
 *        [--baseline <path>] [--write-baseline <path>] [--target 0.9]
 *        [--keys background,border,visualHeader,title] [--strict-typography] [--json]
 */

import { existsSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  isMain,
  loadReport,
  dataVisuals,
  readJsonFile,
  themeOwnedProperties,
  registeredTheme,
  registeredResourcesPackage,
  censusInlineOverrides,
  effectivenessMatrix,
  formatEffectiveness,
  computeReportVersionAtImport,
  identityHash,
  parseArgs,
  toList,
  fail,
  DEFAULT_KEYS,
} from './lib.mjs';

const REQUIRED_VISUAL_KEYS = ['$schema', 'name', 'position'];

function check(id, title, pass, detail) {
  return { id, title, pass: !!pass, detail };
}

/** Emit a baseline object that V8/V9 compare against. */
export function makeBaseline(reportDir) {
  const model = loadReport(reportDir);
  return {
    reportDir: model.dir,
    generatedAt: new Date().toISOString(),
    pages: model.pages.length,
    visuals: model.visuals.length,
    dataVisuals: dataVisuals(model).length,
    bookmarks: model.bookmarks.length,
    identityHash: identityHash(model),
  };
}

/**
 * @param {string} reportDir
 * @param {{expectedThemePath?: string, baseline?: object, baselinePath?: string,
 *          target?: number, keys?: string[], strictTypography?: boolean}} [opts]
 */
export function verifyReport(reportDir, opts = {}) {
  const model = loadReport(reportDir);
  const target = opts.target ?? 0.9;
  const checks = [];

  // ---- V1
  const ct = model.themeCollection && model.themeCollection.customTheme;
  const v1ok =
    !!ct &&
    typeof ct.name === 'string' &&
    ct.name.length > 0 &&
    ct.type === 'RegisteredResources' &&
    !!ct.reportVersionAtImport &&
    typeof ct.reportVersionAtImport === 'object' &&
    ['visual', 'page', 'report'].every((k) => typeof ct.reportVersionAtImport[k] === 'string');
  checks.push(
    check(
      'V1',
      'report.json parses and themeCollection.customTheme is complete',
      v1ok,
      ct
        ? `customTheme = ${JSON.stringify(ct)}`
        : 'themeCollection.customTheme is missing: no custom theme is registered'
    )
  );

  // ---- V2
  const pkg = registeredResourcesPackage(model);
  const items = pkg && Array.isArray(pkg.items) ? pkg.items : [];
  const item = ct ? items.find((i) => i && i.type === 'CustomTheme' && i.name === ct.name) : null;
  const themeAbs = item
    ? join(model.dir, 'StaticResources', 'RegisteredResources', item.path)
    : null;
  const v2ok = !!item && !!themeAbs && existsSync(themeAbs);
  checks.push(
    check(
      'V2',
      'customTheme.name matches a CustomTheme resource item whose file exists',
      v2ok,
      !pkg
        ? 'no RegisteredResources package in resourcePackages'
        : !item
          ? `no CustomTheme item named "${ct ? ct.name : '(none)'}" in the RegisteredResources package (items: ${items
              .map((i) => `${i.type}:${i.name}`)
              .join(', ')})`
          : `${item.name} -> ${item.path} ${existsSync(themeAbs) ? 'exists' : 'MISSING on disk'}`
    )
  );

  // ---- V3
  const computed = computeReportVersionAtImport(model);
  const actual = (ct && ct.reportVersionAtImport) || {};
  const v3parts = ['visual', 'page', 'report'].map((k) => ({
    part: k,
    expected: computed[k],
    actual: actual[k] ?? null,
    ok: actual[k] === computed[k],
  }));
  checks.push(
    check(
      'V3',
      'reportVersionAtImport equals the computed MAX schema versions',
      v3parts.every((p) => p.ok),
      v3parts.map((p) => `${p.part}: expected ${p.expected}, found ${p.actual ?? '(missing)'}`).join('; ')
    )
  );

  // ---- V4
  const themeInfo = registeredTheme(model);
  let expectedTheme = null;
  if (opts.expectedThemePath) {
    const f = readJsonFile(opts.expectedThemePath);
    expectedTheme = f && f.json ? f.json : null;
  }
  const themeJson = themeInfo ? themeInfo.json : null;
  const themeSchema = themeJson && typeof themeJson.$schema === 'string' ? themeJson.$schema : '';
  const hasThemeSchema = /reportThemeSchema/i.test(themeSchema);
  const nameMatches = expectedTheme
    ? String(themeJson && themeJson.name) === String(expectedTheme.name)
    : !!(themeJson && typeof themeJson.name === 'string' && themeJson.name.length > 0);
  checks.push(
    check(
      'V4',
      expectedTheme
        ? `the registered theme is "${expectedTheme.name}" and declares a reportThemeSchema $schema`
        : 'the registered theme has a name and declares a reportThemeSchema $schema',
      nameMatches && hasThemeSchema,
      `registered theme name = ${themeJson ? JSON.stringify(themeJson.name) : '(unreadable)'}; ` +
        `$schema = ${themeSchema ? themeSchema : '(none)'}` +
        (expectedTheme ? `; expected name = ${JSON.stringify(expectedTheme.name)}` : '')
    )
  );

  // ---- V5
  const owned = themeOwnedProperties(expectedTheme || themeJson);
  const keys = opts.keys && opts.keys.length ? opts.keys : DEFAULT_KEYS;
  const census = censusInlineOverrides(model, owned);
  const matrix = effectivenessMatrix(census, owned, keys);
  const v5ok = Object.values(matrix).every((m) => m.ratio >= target);
  checks.push(
    check(
      'V5',
      `theme-effectiveness ratio >= ${target} for every theme-owned key`,
      v5ok,
      '\n' + formatEffectiveness(matrix, target)
    )
  );

  // ---- V6
  const t = census.typography;
  const v6count = opts.strictTypography
    ? t.visualsWithInlineFontFamily + t.visualsWithInlineFontSize
    : t.containerFontFamily + t.containerFontSize;
  checks.push(
    check(
      'V6',
      opts.strictTypography
        ? 'no data visual carries an inline fontFamily or fontSize anywhere'
        : 'no data visual carries an inline container fontFamily or fontSize',
      v6count === 0,
      `container fontFamily=${t.containerFontFamily} fontSize=${t.containerFontSize}; ` +
        `data-role objects fontFamily=${t.dataObjectFontFamily} fontSize=${t.dataObjectFontSize}` +
        (opts.strictTypography
          ? ''
          : '. Data-role fonts live under visual.objects and are only cleared with includeDataObjectTypography.')
    )
  );

  // ---- V7
  const broken = model.visuals.filter((v) => v.parseError || !v.json);
  const missingKeys = model.visuals
    .filter((v) => v.json)
    .filter((v) => REQUIRED_VISUAL_KEYS.some((k) => !(k in v.json)))
    .map((v) => v.relPath);
  const structurallyOdd = model.visuals
    .filter((v) => v.json)
    .filter((v) => !v.json.visual && !v.json.visualGroup)
    .map((v) => v.relPath);
  checks.push(
    check(
      'V7',
      'every visual.json parses and keeps its required keys',
      broken.length === 0 && missingKeys.length === 0 && structurallyOdd.length === 0,
      `unparsable=${broken.length} missingRequiredKeys=${missingKeys.length} neitherVisualNorVisualGroup=${structurallyOdd.length}` +
        (broken.length ? ` :: ${broken.slice(0, 5).map((b) => b.relPath).join(', ')}` : '') +
        (missingKeys.length ? ` :: ${missingKeys.slice(0, 5).join(', ')}` : '') +
        (structurallyOdd.length ? ` :: ${structurallyOdd.slice(0, 5).join(', ')}` : '')
    )
  );

  // ---- V8 / V9
  let baseline = opts.baseline ?? null;
  if (!baseline && opts.baselinePath) {
    const f = readJsonFile(opts.baselinePath);
    baseline = f && f.json ? f.json : null;
  }
  const counts = {
    pages: model.pages.length,
    visuals: model.visuals.length,
    bookmarks: model.bookmarks.length,
  };
  if (baseline) {
    const diffs = ['pages', 'visuals', 'bookmarks']
      .filter((k) => baseline[k] !== undefined && baseline[k] !== counts[k])
      .map((k) => `${k}: baseline ${baseline[k]} != now ${counts[k]}`);
    checks.push(
      check(
        'V8',
        'page, visual and bookmark counts equal the baseline',
        diffs.length === 0,
        diffs.length ? diffs.join('; ') : `pages=${counts.pages} visuals=${counts.visuals} bookmarks=${counts.bookmarks}`
      )
    );
    const nowHash = identityHash(model);
    checks.push(
      check(
        'V9',
        'no identifier changed versus the baseline',
        baseline.identityHash === nowHash,
        `baseline ${baseline.identityHash ?? '(none)'} vs now ${nowHash}`
      )
    );
  } else {
    checks.push(
      check('V8', 'page, visual and bookmark counts equal the baseline', true, 'skipped: no baseline supplied')
    );
    checks.push(
      check('V9', 'no identifier changed versus the baseline', true, 'skipped: no baseline supplied')
    );
  }

  return {
    reportDir: model.dir,
    generatedAt: new Date().toISOString(),
    target,
    keys,
    counts,
    identityHash: identityHash(model),
    effectiveness: matrix,
    typography: census.typography,
    checks,
    passed: checks.filter((c) => c.pass).length,
    failed: checks.filter((c) => !c.pass).length,
    ok: checks.every((c) => c.pass),
  };
}

export function formatVerify(r) {
  const L = [];
  L.push(`PBIR verify: ${r.reportDir}`);
  L.push(`target effectiveness ${r.target}  keys ${r.keys.join(',')}`);
  L.push('');
  for (const c of r.checks) {
    L.push(`${c.pass ? 'PASS' : 'FAIL'}  ${c.id}  ${c.title}`);
    if (c.detail) {
      for (const line of String(c.detail).split('\n')) L.push(`        ${line}`);
    }
  }
  L.push('');
  L.push('THEME-EFFECTIVENESS MATRIX');
  L.push(formatEffectiveness(r.effectiveness, r.target));
  L.push('');
  L.push(`${r.ok ? 'VERIFY PASSED' : 'VERIFY FAILED'}: ${r.passed} passed, ${r.failed} failed`);
  return L.join('\n');
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const dir = args._[0];
  if (!dir) {
    process.stderr.write(
      'usage: node scripts/pbir/verify.mjs <reportDir> [--expected-theme <path>] [--baseline <path>] [--write-baseline <path>] [--target 0.9] [--keys a,b] [--strict-typography] [--json]\n'
    );
    process.exit(2);
  }
  if (typeof args['write-baseline'] === 'string') {
    try {
      const b = makeBaseline(dir);
      const out = resolve(args['write-baseline']);
      writeFileSync(out, JSON.stringify(b, null, 2) + '\n', 'utf8');
      process.stdout.write(`baseline written to ${out}\n${JSON.stringify(b, null, 2)}\n`);
      process.exit(0);
    } catch (err) {
      fail(String(err && err.message ? err.message : err));
      return;
    }
  }
  let r;
  try {
    r = verifyReport(dir, {
      expectedThemePath: typeof args['expected-theme'] === 'string' ? args['expected-theme'] : undefined,
      baselinePath: typeof args.baseline === 'string' ? args.baseline : undefined,
      target: args.target ? Number(args.target) : undefined,
      keys: toList(args.keys),
      strictTypography: !!args['strict-typography'],
    });
  } catch (err) {
    fail(String(err && err.message ? err.message : err));
    return;
  }
  process.stdout.write(args.json ? JSON.stringify(r, null, 2) + '\n' : formatVerify(r) + '\n');
  process.exit(r.ok ? 0 : 1);
}

if (isMain(import.meta.url)) main();
