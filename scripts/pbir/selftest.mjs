/**
 * Self-test for the PBIR tooling.
 *
 * Builds a synthetic PBIR report in a scratch directory next to this script
 * (never a system temp path), then asserts the four engines behave:
 *   - audit counts pages, visuals, groups, schema versions and overrides
 *   - apply-theme APPENDS to the existing RegisteredResources package and
 *     computes reportVersionAtImport from the MAX schema versions
 *   - normalize-inline deletes exactly the theme-owned inline overrides and
 *     nothing else (every other file stays byte-identical)
 *   - verify catches a bad reportVersionAtImport and a low effectiveness ratio
 *
 * Exits non-zero on the first failure summary.
 *
 * Usage: node scripts/pbir/selftest.mjs [--keep]
 */

import { mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { join, dirname, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { walk, parseArgs, sha256 } from './lib.mjs';
import { auditReport } from './audit.mjs';
import { applyTheme } from './apply-theme.mjs';
import { normalizeInline } from './normalize-inline.mjs';
import { verifyReport, makeBaseline } from './verify.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '.selftest-work');
const REPORT = join(ROOT, 'Synthetic.Report');

let passed = 0;
const failures = [];

function ok(name, condition, detail) {
  if (condition) {
    passed++;
    process.stdout.write(`  ok   ${name}\n`);
  } else {
    failures.push(`${name}${detail ? ` :: ${detail}` : ''}`);
    process.stdout.write(`  FAIL ${name}${detail ? ` :: ${detail}` : ''}\n`);
  }
}

function eq(name, actual, expected) {
  ok(name, JSON.stringify(actual) === JSON.stringify(expected), `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

// ---------------------------------------------------------------------------
// Fixture
// ---------------------------------------------------------------------------

const S = (kind, version) =>
  `https://developer.microsoft.com/json-schemas/fabric/item/report/definition/${kind}/${version}/schema.json`;

const lit = (raw) => ({ expr: { Literal: { Value: raw } } });
const color = (hex) => ({ solid: { color: { expr: { Literal: { Value: `'${hex}'` } } } } });

function write(path, obj) {
  mkdirSync(dirname(path), { recursive: true });
  // Real PBIR files are CRLF, 2-space, no trailing newline. Use that here so the
  // style-preserving writer is exercised against the shape it meets in the wild.
  writeFileSync(path, JSON.stringify(obj, null, 2).replace(/\n/g, '\r\n'), 'utf8');
}

function buildFixture() {
  rmSync(ROOT, { recursive: true, force: true });

  write(join(REPORT, 'definition', 'report.json'), {
    $schema: S('report', '3.3.0'),
    themeCollection: {
      baseTheme: {
        name: 'CY24SU10',
        reportVersionAtImport: { visual: '1.8.95', report: '2.0.95', page: '1.3.95' },
        type: 'SharedResources',
      },
    },
    resourcePackages: [
      {
        name: 'RegisteredResources',
        type: 'RegisteredResources',
        items: [{ name: 'logo-1234.png', path: 'logo-1234.png', type: 'Image' }],
      },
      {
        name: 'SharedResources',
        type: 'SharedResources',
        items: [{ name: 'CY24SU10', path: 'BaseThemes/CY24SU10.json', type: 'BaseTheme' }],
      },
    ],
    settings: { useStylableVisualContainerHeader: true },
  });

  write(join(REPORT, 'definition', 'pages', 'pages.json'), {
    $schema: S('pagesMetadata', '1.1.0'),
    pageOrder: ['pageOne', 'pageTwo'],
    activePageName: 'pageOne',
  });

  // Page one: 1350x1142.
  write(join(REPORT, 'definition', 'pages', 'pageOne', 'page.json'), {
    $schema: S('page', '2.1.0'),
    name: 'pageOne',
    displayName: 'Overview',
    displayOption: 'FitToWidth',
    height: 1142,
    width: 1350,
    visualInteractions: [{ source: 'vCard1', target: 'vCard2', type: 'NoFilter' }],
  });

  // A visualGroup container with NO `visual` node (a quarter of real files).
  write(join(REPORT, 'definition', 'pages', 'pageOne', 'visuals', 'vGroup', 'visual.json'), {
    $schema: S('visualContainer', '2.7.0'),
    name: 'vGroup',
    position: { x: 10, y: 10, z: 1000, height: 200, width: 400, tabOrder: -1 },
    visualGroup: { displayName: 'Group 1', groupMode: 'ScaleMode' },
  });

  // The heavily overridden card.
  write(join(REPORT, 'definition', 'pages', 'pageOne', 'visuals', 'vCard1', 'visual.json'), {
    $schema: S('visualContainer', '2.7.0'),
    name: 'vCard1',
    position: { x: 20, y: 20, z: 2000, height: 120, width: 300, tabOrder: 0 },
    visual: {
      visualType: 'card',
      objects: {
        labels: [
          {
            properties: {
              fontFamily: lit("'Arial'"),
              fontSize: lit('14D'),
              color: color('#FF0000'),
            },
          },
        ],
      },
      visualContainerObjects: {
        background: [
          {
            properties: {
              show: lit('false'),
              color: color('#E6E6E6'),
              transparency: lit('0D'),
            },
          },
        ],
        border: [{ properties: { show: lit('false'), color: color('#CCCCCC') } }],
        visualHeader: [{ properties: { show: lit('false') } }],
        title: [
          {
            properties: {
              show: lit('true'),
              text: lit("'Total sales'"),
              fontFamily: lit("'''Segoe UI'', wf_segoe-ui_normal, helvetica, arial, sans-serif'"),
              fontSize: lit('28D'),
              fontColor: color('#001F45'),
              heading: lit("'Heading2'"),
            },
          },
        ],
        general: [{ properties: { altText: lit("'Total sales card'"), keepLayerOrder: lit('true') } }],
        visualLink: [{ properties: { show: lit('true'), type: lit("'Bookmark'") } }],
      },
      drillFilterOtherVisuals: true,
    },
    parentGroupName: 'vGroup',
  });

  // Newest schema version in the report, only a border override.
  write(join(REPORT, 'definition', 'pages', 'pageOne', 'visuals', 'vCard2', 'visual.json'), {
    $schema: S('visualContainer', '2.10.0'),
    name: 'vCard2',
    position: { x: 360, y: 20, z: 2100, height: 120, width: 300, tabOrder: 1 },
    visual: {
      visualType: 'card',
      visualContainerObjects: {
        border: [{ properties: { show: lit('true'), color: color('#E6E6E6'), width: lit('2L') } }],
      },
    },
  });

  // Nothing theme-owned: only content. Must stay byte-identical.
  write(join(REPORT, 'definition', 'pages', 'pageOne', 'visuals', 'vText1', 'visual.json'), {
    $schema: S('visualContainer', '2.5.0'),
    name: 'vText1',
    position: { x: 20, y: 200, z: 2200, height: 60, width: 500, tabOrder: 2 },
    visual: {
      visualType: 'textbox',
      visualContainerObjects: {
        title: [{ properties: { text: lit("'Section header'") } }],
        general: [{ properties: { altText: lit("'Section header text'") } }],
      },
    },
  });

  // Page two: a different canvas size (never assume 1280x720).
  write(join(REPORT, 'definition', 'pages', 'pageTwo', 'page.json'), {
    $schema: S('page', '2.2.0'),
    name: 'pageTwo',
    displayName: 'Detail',
    displayOption: 'FitToWidth',
    height: 1537,
    width: 1850,
  });

  // Captured by a bookmark, so normalize must skip it by default.
  write(join(REPORT, 'definition', 'pages', 'pageTwo', 'visuals', 'vSlicer', 'visual.json'), {
    $schema: S('visualContainer', '2.9.0'),
    name: 'vSlicer',
    position: { x: 30, y: 30, z: 3000, height: 200, width: 250, tabOrder: 0 },
    visual: {
      visualType: 'slicer',
      visualContainerObjects: {
        background: [{ properties: { show: lit('true'), color: color('#F2F3F4') } }],
        border: [{ properties: { show: lit('false') } }],
      },
    },
  });

  // Hidden, with a header override.
  write(join(REPORT, 'definition', 'pages', 'pageTwo', 'visuals', 'vImage', 'visual.json'), {
    $schema: S('visualContainer', '2.8.0'),
    name: 'vImage',
    position: { x: 300, y: 30, z: 3100, height: 100, width: 100, tabOrder: 1 },
    isHidden: true,
    visual: {
      visualType: 'image',
      visualContainerObjects: {
        visualHeader: [{ properties: { show: lit('false') } }],
      },
    },
  });

  // Sticks out past the right edge of the 1850-wide canvas.
  write(join(REPORT, 'definition', 'pages', 'pageTwo', 'visuals', 'vOob', 'visual.json'), {
    $schema: S('visualContainer', '2.7.0'),
    name: 'vOob',
    position: { x: 1800, y: 40, z: 3200, height: 80, width: 300, tabOrder: 2 },
    visual: {
      visualType: 'card',
      visualContainerObjects: {
        background: [{ properties: { show: lit('false') } }],
      },
    },
  });

  write(join(REPORT, 'definition', 'bookmarks', 'bookmarks.json'), {
    $schema: S('bookmarksMetadata', '1.0.0'),
    items: [{ name: 'bm1' }],
  });
  write(join(REPORT, 'definition', 'bookmarks', 'bm1.bookmark.json'), {
    $schema: S('bookmark', '2.1.0'),
    displayName: 'Slicer open',
    name: 'bm1',
    explorationState: {
      version: '1.3',
      activeSection: 'pageTwo',
      sections: {
        pageTwo: {
          visualContainers: {
            vSlicer: {
              singleVisual: {
                visualType: 'slicer',
                objects: {},
                vcObjects: {
                  background: [{ properties: { show: lit('true'), color: color('#F2F3F4') } }],
                },
              },
            },
            vImage: { singleVisual: { visualType: 'image', objects: {} } },
          },
        },
      },
    },
  });

  mkdirSync(join(REPORT, 'StaticResources', 'RegisteredResources'), { recursive: true });
  writeFileSync(join(REPORT, 'StaticResources', 'RegisteredResources', 'logo-1234.png'), 'PNGDATA');
}

/** Fluent-shaped theme with a per-visual-type declaration to exercise scoping. */
function fluentTheme() {
  return {
    $schema:
      'https://raw.githubusercontent.com/microsoft/powerbi-desktop-samples/main/Report%20Theme%20JSON%20Schema/reportThemeSchema-2.156.json',
    name: 'Fluent 2',
    dataColors: ['#0F6CBD', '#107C10', '#CA5010'],
    background: '#FFFFFF',
    foreground: '#242424',
    textClasses: {
      title: { fontFace: 'Segoe UI Semibold', fontSize: 14, color: '#242424' },
      label: { fontFace: 'Segoe UI', fontSize: 12, color: '#242424' },
    },
    visualStyles: {
      '*': {
        '*': {
          background: [{ show: true, color: { solid: { color: '#FFFFFF' } }, transparency: 0 }],
          border: [{ show: false, color: { solid: { color: '#D1D1D1' } }, radius: 8, width: 1 }],
          visualHeader: [
            { show: true, foreground: { solid: { color: '#242424' } }, transparency: 0 },
          ],
          title: [
            {
              show: true,
              fontColor: { solid: { color: '#242424' } },
              fontSize: 14,
              fontFamily: 'Segoe UI Semibold',
              alignment: 'left',
            },
          ],
        },
      },
      // Declared only for tableEx: must NOT be treated as owned on other types.
      tableEx: { '*': { visualHeader: [{ showOptionsMenu: false }] } },
    },
  };
}

function snapshot(dir) {
  const map = new Map();
  for (const f of walk(dir)) {
    map.set(relative(dir, f).split(sep).join('/'), sha256(readFileSync(f)));
  }
  return map;
}

function changedFiles(before, after) {
  const out = [];
  for (const [k, v] of after) if (before.get(k) !== v) out.push(k);
  for (const k of before.keys()) if (!after.has(k)) out.push(`${k} (deleted)`);
  return out.sort();
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

function testAudit() {
  process.stdout.write('audit\n');
  const a = auditReport(REPORT);
  eq('pages', a.counts.pages, 2);
  eq('visual files', a.counts.visualFiles, 7);
  eq('data visuals', a.counts.dataVisuals, 6);
  eq('visual groups (visualGroup with no visual node)', a.counts.visualGroups, 1);
  eq('isHidden', a.counts.isHidden, 1);
  eq('parentGroupName', a.counts.withParentGroupName, 1);
  eq('bookmarks', a.counts.bookmarks, 1);
  eq('max visualContainer version', a.schemaVersions.visualContainer.max, '2.10.0');
  eq('max page version', a.schemaVersions.page.max, '2.2.0');
  eq('report version', a.schemaVersions.report, '3.3.0');
  eq('computed reportVersionAtImport', a.computedReportVersionAtImport, {
    visual: '2.10.0',
    page: '2.2.0',
    report: '3.3.0',
  });
  eq('per-page canvas is read per page', a.pages.map((p) => `${p.width}x${p.height}`), [
    '1350x1142',
    '1850x1537',
  ]);
  eq('background overrides', a.inlineOverrides.visualsPerCard.background, 3);
  eq('border overrides', a.inlineOverrides.visualsPerCard.border, 3);
  eq('visualHeader overrides', a.inlineOverrides.visualsPerCard.visualHeader, 2);
  eq('title overrides', a.inlineOverrides.visualsPerCard.title, 2);
  eq('title overrides the theme owns (vText1 is content only)', a.inlineOverrides.visualsPerCardThemeOwned.title, 1);
  eq('visualType histogram counts the group separately', a.visualTypes['(visualGroup)'], 1);
  eq('container fontFamily', a.typography.containerFontFamily, 1);
  eq('data-role fontFamily', a.typography.dataObjectFontFamily, 1);
  ok(
    'hardcoded colors are collected',
    a.hardcodedColors.some((c) => c.color === '#E6E6E6'),
    JSON.stringify(a.hardcodedColors)
  );
  eq('out of bounds detected against the real page width', a.geometry.outOfBoundsCount, 1);
  eq('out of bounds visual', a.geometry.outOfBounds[0].visual, 'vOob');
  eq('bookmark formatting capture found', a.bookmarks.visualsWithCapturedFormatting, 1);
  eq('no theme registered yet', a.registeredTheme, null);
  eq('effectiveness is low before any fix', a.effectiveness.border.ratio, Number((1 - 3 / 6).toFixed(4)));
}

function testApplyTheme() {
  process.stdout.write('apply-theme\n');
  const dry = applyTheme(REPORT, { themeJson: fluentTheme(), themeName: 'Fluent2', dryRun: true });
  eq('dry run writes nothing', dry.written, []);
  ok(
    'dry run still reports the append',
    dry.changes.some((c) => c.kind === 'append-resource-item'),
    JSON.stringify(dry.changes)
  );
  const beforeReport = readFileSync(join(REPORT, 'definition', 'report.json'), 'utf8');

  const res = applyTheme(REPORT, { themeJson: fluentTheme(), themeName: 'Fluent2', dryRun: false });
  eq('computed reportVersionAtImport', res.reportVersionAtImport, {
    visual: '2.10.0',
    page: '2.2.0',
    report: '3.3.0',
  });
  ok('dry run really did not write', beforeReport === beforeReport, '');
  ok('theme file exists', existsSync(join(REPORT, 'StaticResources', 'RegisteredResources', 'Fluent2.json')));

  const report = JSON.parse(readFileSync(join(REPORT, 'definition', 'report.json'), 'utf8'));
  const pkgs = report.resourcePackages.filter((p) => p.type === 'RegisteredResources');
  eq('exactly one RegisteredResources package', pkgs.length, 1);
  eq('the existing image item survived', pkgs[0].items.filter((i) => i.type === 'Image').length, 1);
  const themeItem = pkgs[0].items.find((i) => i.type === 'CustomTheme');
  eq('CustomTheme item name has no .json', themeItem.name, 'Fluent2');
  eq('CustomTheme item path has .json', themeItem.path, 'Fluent2.json');
  eq('customTheme.name matches the item name', report.themeCollection.customTheme.name, themeItem.name);
  eq('customTheme.type', report.themeCollection.customTheme.type, 'RegisteredResources');
  eq('customTheme.reportVersionAtImport', report.themeCollection.customTheme.reportVersionAtImport, {
    visual: '2.10.0',
    page: '2.2.0',
    report: '3.3.0',
  });
  eq('baseTheme untouched', report.themeCollection.baseTheme.name, 'CY24SU10');
  eq('SharedResources package untouched', report.resourcePackages.filter((p) => p.type === 'SharedResources').length, 1);

  const second = applyTheme(REPORT, { themeJson: fluentTheme(), themeName: 'Fluent2', dryRun: false });
  const report2 = JSON.parse(readFileSync(join(REPORT, 'definition', 'report.json'), 'utf8'));
  const items2 = report2.resourcePackages.find((p) => p.type === 'RegisteredResources').items;
  eq('re-applying does not duplicate the item', items2.filter((i) => i.type === 'CustomTheme').length, 1);
  ok(
    're-applying reports the item as already present',
    second.changes.some((c) => c.kind === 'resource-item-already-present')
  );
}

function testNormalize() {
  process.stdout.write('normalize-inline\n');
  const before = snapshot(REPORT);

  const census = normalizeInline(REPORT, { policy: 'report' });
  eq('policy=report never writes', census.dryRun, true);
  eq('policy=report deletes nothing', census.summary.deleted, 0);
  ok('policy=report still produces a census ledger', census.ledger.length > 0, String(census.ledger.length));
  eq('policy=report left the tree untouched', changedFiles(before, snapshot(REPORT)), []);

  const dry = normalizeInline(REPORT, { policy: 'theme-wins', dryRun: true });
  eq('dry run leaves the tree untouched', changedFiles(before, snapshot(REPORT)), []);
  eq(
    'dry run projects the fix, minus the bookmark-protected slicer',
    Object.fromEntries(Object.entries(dry.effectivenessAfter).map(([k, m]) => [k, m.ratio])),
    { background: 0.8333, border: 0.8333, visualHeader: 1, title: 1 }
  );

  const res = normalizeInline(REPORT, { policy: 'theme-wins', dryRun: false });
  const after = snapshot(REPORT);
  const changed = changedFiles(before, after);
  eq(
    'only the visuals with theme-owned overrides changed',
    changed,
    [
      'definition/pages/pageOne/visuals/vCard1/visual.json',
      'definition/pages/pageOne/visuals/vCard2/visual.json',
      'definition/pages/pageTwo/visuals/vImage/visual.json',
      'definition/pages/pageTwo/visuals/vOob/visual.json',
    ]
  );
  eq('identifiers unchanged', res.identity.unchanged, true);

  const card1 = JSON.parse(
    readFileSync(join(REPORT, 'definition', 'pages', 'pageOne', 'visuals', 'vCard1', 'visual.json'), 'utf8')
  );
  const vco = card1.visual.visualContainerObjects;
  eq('background card removed entirely', vco.background, undefined);
  eq('border card removed entirely', vco.border, undefined);
  eq('visualHeader card removed entirely', vco.visualHeader, undefined);
  const titleProps = Object.keys(vco.title[0].properties).sort();
  eq('title keeps only content and semantics', titleProps, ['heading', 'text']);
  ok('general card is protected', !!vco.general, JSON.stringify(Object.keys(vco)));
  ok('visualLink card is protected', !!vco.visualLink, JSON.stringify(Object.keys(vco)));
  eq(
    'data-role objects are never touched',
    Object.keys(card1.visual.objects.labels[0].properties).sort(),
    ['color', 'fontFamily', 'fontSize']
  );
  eq('name preserved', card1.name, 'vCard1');
  eq('parentGroupName preserved', card1.parentGroupName, 'vGroup');
  eq('position preserved', card1.position.x, 20);
  eq('$schema preserved', card1.$schema, S('visualContainer', '2.7.0'));
  eq('drillFilterOtherVisuals preserved', card1.visual.drillFilterOtherVisuals, true);

  const card2raw = readFileSync(
    join(REPORT, 'definition', 'pages', 'pageOne', 'visuals', 'vCard2', 'visual.json'),
    'utf8'
  );
  const card2 = JSON.parse(card2raw);
  eq('an emptied visualContainerObjects is removed', card2.visual.visualContainerObjects, undefined);
  ok('CRLF is preserved on rewritten files', card2raw.includes('\r\n'), 'no CRLF found');
  ok('no trailing newline added', !/\n$/.test(card2raw), JSON.stringify(card2raw.slice(-6)));

  const slicerChanged = changed.includes('definition/pages/pageTwo/visuals/vSlicer/visual.json');
  ok('the bookmark-captured visual was skipped', !slicerChanged);
  ok('bookmark-captured visuals are reported', res.bookmarkedVisuals.some((b) => b.visual === 'vSlicer'));
  ok(
    'the skip is recorded in the ledger with a reason',
    res.ledger.some((e) => e.visual === 'vSlicer' && e.decision === 'skip-bookmarked' && /bookmark/i.test(e.reason))
  );

  ok(
    'the ledger records before and after for every delete',
    res.ledger
      .filter((e) => e.decision === 'delete')
      .every((e) => e.after === null && e.before !== undefined && e.file && e.key && e.property)
  );
  ok(
    'a per-type-only theme declaration does not leak to other visual types',
    !res.ledger.some((e) => e.property === 'showOptionsMenu'),
    JSON.stringify(res.ledger.filter((e) => e.property === 'showOptionsMenu'))
  );

  const forced = normalizeInline(REPORT, {
    policy: 'theme-wins',
    dryRun: true,
    includeBookmarked: true,
  });
  ok(
    'includeBookmarked normalizes the bookmarked visual',
    forced.ledger.some((e) => e.visual === 'vSlicer' && e.decision === 'delete')
  );
}

function testVerify() {
  process.stdout.write('verify\n');
  const theme = join(REPORT, 'StaticResources', 'RegisteredResources', 'Fluent2.json');
  const good = verifyReport(REPORT, { expectedThemePath: theme });
  const byId = Object.fromEntries(good.checks.map((c) => [c.id, c]));
  ok('V1 passes', byId.V1.pass, byId.V1.detail);
  ok('V2 passes', byId.V2.pass, byId.V2.detail);
  ok('V3 passes', byId.V3.pass, byId.V3.detail);
  ok('V4 passes', byId.V4.pass, byId.V4.detail);
  ok(
    'V5 still fails while the bookmark-protected slicer keeps its override (1 of 6 visuals, ratio 0.8333)',
    !byId.V5.pass,
    byId.V5.detail
  );
  ok('V6 passes', byId.V6.pass, byId.V6.detail);
  ok('V7 passes', byId.V7.pass, byId.V7.detail);

  // The one remaining override is the bookmark-protected slicer; forcing it
  // through must lift every ratio to 1.00.
  normalizeInline(REPORT, { policy: 'theme-wins', dryRun: false, includeBookmarked: true });
  const after = verifyReport(REPORT, { expectedThemePath: theme });
  const byId2 = Object.fromEntries(after.checks.map((c) => [c.id, c]));
  ok('V5 passes once every theme-owned override is cleared', byId2.V5.pass, byId2.V5.detail);
  eq('every effectiveness ratio is 1.00', Object.values(after.effectiveness).map((m) => m.ratio), [1, 1, 1, 1]);

  const baseline = makeBaseline(REPORT);
  const withBaseline = verifyReport(REPORT, { expectedThemePath: theme, baseline });
  const byId3 = Object.fromEntries(withBaseline.checks.map((c) => [c.id, c]));
  ok('V8 passes against a matching baseline', byId3.V8.pass, byId3.V8.detail);
  ok('V9 passes against a matching baseline', byId3.V9.pass, byId3.V9.detail);
  ok('verify overall passes', withBaseline.ok, JSON.stringify(withBaseline.checks.filter((c) => !c.pass)));

  // V3 must catch a stale reportVersionAtImport (the real-world failure mode).
  const reportPath = join(REPORT, 'definition', 'report.json');
  const original = readFileSync(reportPath, 'utf8');
  const broken = JSON.parse(original);
  broken.themeCollection.customTheme.reportVersionAtImport.visual = '2.7.0';
  writeFileSync(reportPath, JSON.stringify(broken, null, 2).replace(/\n/g, '\r\n'), 'utf8');
  const badVersion = verifyReport(REPORT, { expectedThemePath: theme });
  const bv = Object.fromEntries(badVersion.checks.map((c) => [c.id, c]));
  ok('V3 catches a stale reportVersionAtImport', !bv.V3.pass, bv.V3.detail);
  ok('verify reports failure overall', !badVersion.ok);

  // V2 must catch a customTheme.name that has no matching resource item.
  const orphan = JSON.parse(original);
  orphan.themeCollection.customTheme.name = 'NotRegistered';
  writeFileSync(reportPath, JSON.stringify(orphan, null, 2).replace(/\n/g, '\r\n'), 'utf8');
  const orphanRes = verifyReport(REPORT, { expectedThemePath: theme });
  ok(
    'V2 catches a customTheme with no matching resource item',
    !orphanRes.checks.find((c) => c.id === 'V2').pass
  );

  writeFileSync(reportPath, original, 'utf8');

  // V8/V9 must catch a mutated identifier.
  const shifted = { ...baseline, visuals: baseline.visuals + 1, identityHash: 'deadbeef' };
  const drift = verifyReport(REPORT, { expectedThemePath: theme, baseline: shifted });
  const dv = Object.fromEntries(drift.checks.map((c) => [c.id, c]));
  ok('V8 catches a count drift', !dv.V8.pass, dv.V8.detail);
  ok('V9 catches an identity drift', !dv.V9.pass, dv.V9.detail);
}

function testLowEffectivenessIsCaught() {
  process.stdout.write('verify catches a theme that changed nothing\n');
  // Rebuild a pristine fixture, register the theme, and DO NOT normalize.
  buildFixture();
  applyTheme(REPORT, { themeJson: fluentTheme(), themeName: 'Fluent2', dryRun: false });
  const theme = join(REPORT, 'StaticResources', 'RegisteredResources', 'Fluent2.json');
  const r = verifyReport(REPORT, { expectedThemePath: theme });
  const byId = Object.fromEntries(r.checks.map((c) => [c.id, c]));
  ok('V1 to V4 pass on a correctly wired but inert theme', byId.V1.pass && byId.V2.pass && byId.V3.pass && byId.V4.pass);
  ok('V5 catches the inert theme', !byId.V5.pass, byId.V5.detail);
  ok('V6 catches inline container fonts', !byId.V6.pass, byId.V6.detail);
  ok('overall verify fails', !r.ok);
}

function testCodec() {
  process.stdout.write('literal codec\n');
  const { decodeLiteralValue, encodeLiteralValue, decodeInline, maxVersion, compareVersions } = libRefs;
  eq('decode quoted string', decodeLiteralValue("'#E6E6E6'"), '#E6E6E6');
  eq('decode escaped quote', decodeLiteralValue("'it''s'"), "it's");
  eq('decode double', decodeLiteralValue('28D'), 28);
  eq('decode long', decodeLiteralValue('3L'), 3);
  eq('decode bool', decodeLiteralValue('true'), true);
  eq('decode null', decodeLiteralValue('null'), null);
  eq('encode string', encodeLiteralValue("it's"), "'it''s'");
  eq('encode int', encodeLiteralValue(8), '8L');
  eq('encode float', encodeLiteralValue(1.5), '1.5D');
  eq('encode bool', encodeLiteralValue(false), 'false');
  eq('decode solid color', decodeInline(color('#0F6CBD')), { kind: 'color', value: '#0F6CBD' });
  eq('decode theme color', decodeInline({ solid: { color: { expr: { ThemeDataColor: { ColorId: 0, Percent: 0 } } } } }).kind, 'themeColor');
  eq('2.10.0 beats 2.9.0', maxVersion(['2.7.0', '2.10.0', '2.9.0', '2.5.0']), '2.10.0');
  eq('compareVersions', compareVersions('2.10.0', '2.9.0'), 1);
}

function testPolicyVariants() {
  process.stdout.write('policy variants (visualTypes filter, remap-colors)\n');
  // Fixture is pristine with the theme registered and nothing normalized yet.
  const before = snapshot(REPORT);

  const onlyCards = normalizeInline(REPORT, {
    policy: 'theme-wins',
    dryRun: false,
    visualTypes: ['card'],
  });
  const changed = changedFiles(before, snapshot(REPORT));
  eq(
    'visualTypes restricts the change set to card visuals',
    changed,
    [
      'definition/pages/pageOne/visuals/vCard1/visual.json',
      'definition/pages/pageOne/visuals/vCard2/visual.json',
      'definition/pages/pageTwo/visuals/vOob/visual.json',
    ]
  );
  ok(
    'skipped visual types are counted',
    onlyCards.summary.skippedVisualType >= 1,
    String(onlyCards.summary.skippedVisualType)
  );
  ok(
    'the image visual kept its header override',
    !!JSON.parse(
      readFileSync(join(REPORT, 'definition', 'pages', 'pageTwo', 'visuals', 'vImage', 'visual.json'), 'utf8')
    ).visual.visualContainerObjects.visualHeader
  );

  // remap-colors is the anti-pattern path: it must rewrite the hex and say so.
  buildFixture();
  applyTheme(REPORT, { themeJson: fluentTheme(), themeName: 'Fluent2', dryRun: false });
  const remap = normalizeInline(REPORT, { policy: 'remap-colors', dryRun: true });
  const remapped = remap.ledger.filter((e) => e.decision === 'remap');
  ok('remap-colors rewrites inline hex colors', remapped.length > 0, String(remapped.length));
  ok(
    'remap-colors flags itself as an anti-pattern in the ledger',
    remapped.every((e) => /ANTI-PATTERN/.test(e.reason))
  );
  ok(
    'remap-colors maps #E6E6E6 to the nearest theme color',
    remapped.some((e) => e.before === '#E6E6E6' && e.after !== '#E6E6E6' && /^#/.test(String(e.after))),
    JSON.stringify(remapped.slice(0, 3))
  );
  eq('remap-colors deletes nothing', remap.summary.deleted, 0);
  eq(
    'remap-colors leaves the theme inert, so effectiveness does not move',
    remap.effectivenessAfter.background.ratio,
    remap.effectivenessBefore.background.ratio
  );
}

let libRefs;

async function main() {
  const args = parseArgs(process.argv.slice(2));
  libRefs = await import('./lib.mjs');

  process.stdout.write('PBIR self-test\n\n');
  testCodec();
  buildFixture();
  testAudit();
  testApplyTheme();
  testNormalize();
  testVerify();
  testLowEffectivenessIsCaught();
  testPolicyVariants();

  if (!args.keep) rmSync(ROOT, { recursive: true, force: true });
  else process.stdout.write(`\nfixture kept at ${ROOT}\n`);

  process.stdout.write(`\n${failures.length ? 'SELFTEST FAILED' : 'SELFTEST PASSED'}: ${passed} ok, ${failures.length} failed\n`);
  if (failures.length) {
    for (const f of failures) process.stdout.write(`  - ${f}\n`);
    process.exit(1);
  }
  process.exit(0);
}

main().catch((err) => {
  process.stderr.write(`selftest crashed: ${err && err.stack ? err.stack : err}\n`);
  process.exit(1);
});
