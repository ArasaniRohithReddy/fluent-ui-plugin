/**
 * Self-test for the Fluent UI v8 theme engine.
 *
 * Prints `ok` / `FAIL` per check and exits non-zero on any failure. Uses a
 * scratch directory next to this script (never a system temp path) for the
 * checks that need real files on disk.
 *
 * What it proves:
 *   1  colour maths      hex/rgb/hsv/hsl round trips, the lossy integer
 *                        rounding v8 depends on, and contrast against six
 *                        externally known reference ratios
 *   2  default theme     generateV8Theme() reproduces all 50 documented
 *                        DefaultPalette values and all 103 semanticColors
 *   3  derivation        every semantic slot equals the palette slot the
 *                        research says it derives from
 *   4  shade algorithm   getShade / getBackgroundShade reproduce the ramp the
 *                        research documents for #0078d4
 *   5  generation        a custom brand repaints only the nine theme* slots
 *   6  v8 -> v9          lossy slots are reported, not dropped
 *   7  v9 -> v8          anchors are adopted, non-round-trippable parts declared
 *   8  audit             catches missing slots, contrast failures and hardcoded
 *                        values, and passes the stock theme
 *   9  errors            bad input produces a V8ThemeError, never a raw throw
 *  10  CLIs              all three scripts run end to end and exit correctly
 *
 * Usage: node scripts/v8/selftest.mjs [--keep]
 */

import { mkdirSync, writeFileSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import {
  DATA,
  PALETTE_SLOTS,
  SEMANTIC_SLOTS,
  FABRIC_SLOT_RULES,
  V9_BRAND_STOPS,
  V8ThemeError,
  Shade,
  parseColor,
  rgb2hsv,
  hsv2rgb,
  hsv2hsl,
  hsl2hsv,
  rgb2hex,
  contrastRatio,
  relativeLuminance,
  isDark,
  getShade,
  getBackgroundShade,
  createThemeRules,
  setBaseSlot,
  getThemeAsJson,
  createV8Theme,
  makeSemanticColors,
  generateV8Theme,
  v8ThemeToV9,
  v9ToV8Theme,
  auditV8Theme,
  toCreateThemeSnippet,
  toV9ThemeSnippet,
  parseArgs,
  defaultPalette,
} from './lib.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const WORK = join(HERE, '.selftest-work');
const args = parseArgs(process.argv.slice(2));

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
  ok(
    name,
    JSON.stringify(actual) === JSON.stringify(expected),
    `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`
  );
}

function near(name, actual, expected, tolerance) {
  ok(
    name,
    Math.abs(actual - expected) <= tolerance,
    `expected ${expected} +/- ${tolerance}, got ${actual}`
  );
}

function throwsV8(name, fn, needle) {
  let err = null;
  try {
    fn();
  } catch (e) {
    err = e;
  }
  if (!err) return ok(name, false, 'no error thrown');
  const isTyped = err instanceof V8ThemeError;
  const matches = !needle || String(err.message).toLowerCase().includes(needle.toLowerCase());
  ok(name, isTyped && matches, `got ${err.name}: ${err.message}`);
}

function section(title) {
  process.stdout.write(`\n${title}\n`);
}

// ---------------------------------------------------------------------------
// 1. Colour maths
// ---------------------------------------------------------------------------

section('1  colour primitives');

eq('parseColor #0078d4 -> rgb', (() => {
  const c = parseColor('#0078d4');
  return [c.r, c.g, c.b];
})(), [0, 120, 212]);

eq('parseColor #fff expands to 3-digit shorthand', parseColor('#fff').hex, 'ffffff');
eq('parseColor accepts a bare hex without #', parseColor('0078d4').hex, '0078d4');
eq('parseColor rgba() keeps alpha as v8 percent', parseColor('rgba(0,0,0,.4)').a, 40);
eq('parseColor #rrggbbaa keeps alpha', parseColor('#00000066').a, 40);

// rgb2hsv rounds to integer degrees/percent; #0078d4 is the worked example in
// the research, so these three numbers pin the whole pipeline.
eq('rgb2hsv(#0078d4)', rgb2hsv(0, 120, 212), { h: 206, s: 100, v: 83 });
eq('hsv2rgb round trips the rounded hsv', hsv2rgb(206, 100, 83), { r: 0, g: 120, b: 212 });
near('hsv2hsl(#0078d4).l', hsv2hsl(206, 100, 83).l, 41.5, 0.001);
eq('hsv2hsl of a grey has zero saturation', Math.round(hsv2hsl(0, 0, 50).s), 0);

const roundTrip = hsl2hsv(206, 100, 41.5);
near('hsl2hsv inverts hsv2hsl (value)', roundTrip.v, 83, 0.6);
near('hsl2hsv inverts hsv2hsl (saturation)', roundTrip.s, 100, 0.6);

eq('rgb2hex pads single digits', rgb2hex(0, 8, 212), '0008d4');
ok('isDark(#1b1a19) is true', isDark('#1b1a19'));
ok('isDark(#ffffff) is false', !isDark('#ffffff'));

// Externally known WCAG reference ratios - these are not produced by this code.
eq('contrast black on white is 21:1', contrastRatio('#000000', '#ffffff'), 21);
eq('contrast white on white is 1:1', contrastRatio('#ffffff', '#ffffff'), 1);
eq('contrast #767676 on white is 4.54:1', contrastRatio('#767676', '#ffffff'), 4.54);
eq('contrast #777777 on white is 4.48:1', contrastRatio('#777777', '#ffffff'), 4.48);
near('contrast pure red on white is 4.00:1', contrastRatio('#ff0000', '#ffffff'), 4.0, 0.01);
near('contrast pure blue on white is 8.59:1', contrastRatio('#0000ff', '#ffffff'), 8.59, 0.01);
ok('contrast is symmetric', contrastRatio('#0078d4', '#ffffff') === contrastRatio('#ffffff', '#0078d4'));
near('relativeLuminance(white) is 1', relativeLuminance('#ffffff'), 1, 1e-9);
near('relativeLuminance(black) is 0', relativeLuminance('#000000'), 0, 1e-9);

// ---------------------------------------------------------------------------
// 2. The shade algorithm
// ---------------------------------------------------------------------------

section('2  shade algorithm (color/shades.ts)');

const brand = parseColor('#0078d4');
// The two values the research names explicitly as proof the generated ramp is
// NOT DefaultPalette.
eq('getShade(#0078d4, 1) is #f3f9fd', `#${getShade(brand, Shade.Shade1).hex}`, '#f3f9fd');
eq('getShade(#0078d4, 2) is #d0e7f8', `#${getShade(brand, Shade.Shade2).hex}`, '#d0e7f8');
eq('getShade(colour, Unshaded) is the identity', getShade(brand, Shade.Unshaded), brand);
eq('getShade with an out-of-range shade is the identity', getShade(brand, 99), brand);
eq('getShade(null) is null', getShade(null, Shade.Shade1), null);

// White and black take dedicated branches.
eq('getShade(#ffffff, 1) darkens via WhiteShadeTable', `#${getShade(parseColor('#ffffff'), Shade.Shade1).hex}`, '#767676');
eq('getShade(#000000, 1) lightens via BlackTintTable', `#${getShade(parseColor('#000000'), Shade.Shade1).hex}`, '#898989');

// getBackgroundShade on white is exactly how DefaultPalette's neutral ramp is
// meant to be produced; slot 1 must land on the documented neutralLighterAlt.
const white = parseColor('#ffffff');
eq(
  'getBackgroundShade(#ffffff, 1) is #f8f8f8',
  `#${getBackgroundShade(white, Shade.Shade1).hex}`,
  '#f8f8f8'
);
eq('getBackgroundShade(colour, Unshaded) is the identity', getBackgroundShade(white, Shade.Unshaded), white);
ok(
  'getBackgroundShade inverted lightens instead of darkening',
  getBackgroundShade(parseColor('#1b1a19'), Shade.Shade1, true).v > parseColor('#1b1a19').v
);
ok(
  'isInverted swaps soften and strongen in getShade',
  `#${getShade(brand, Shade.Shade1, true).hex}` !== `#${getShade(brand, Shade.Shade1, false).hex}`
);

// Every shade of a mid-tone colour must stay in gamut and be a real hex.
let gamutOk = true;
for (let s = 1; s <= 8; s++) {
  const c = getShade(brand, s);
  if (!/^[0-9a-f]{6}$/.test(c.hex) || c.r < 0 || c.r > 255 || c.g < 0 || c.g > 255 || c.b < 0 || c.b > 255) {
    gamutOk = false;
  }
}
ok('all eight shades stay in gamut', gamutOk);

// ---------------------------------------------------------------------------
// 3. The default theme reproduces the documented data
// ---------------------------------------------------------------------------

section('3  default theme vs documented DefaultPalette');

const stock = generateV8Theme();
eq('generateV8Theme() takes no required arguments', typeof stock.theme, 'object');
eq('palette has all 50 IPalette slots', Object.keys(stock.theme.palette).length, 50);
eq('PALETTE_SLOTS matches the research extract', PALETTE_SLOTS.length, Object.keys(DATA.palette).length);

const paletteDrift = PALETTE_SLOTS.filter(
  (slot) => stock.theme.palette[slot] !== DATA.palette[slot].light
);
eq('every one of the 50 palette slots equals its documented default', paletteDrift, []);

eq('semanticColors has all 103 slots', Object.keys(stock.theme.semanticColors).length, 103);
eq('SEMANTIC_SLOTS matches the research extract', SEMANTIC_SLOTS.length, 103);
const missingSemantic = SEMANTIC_SLOTS.filter((s) => stock.theme.semanticColors[s] === undefined);
eq('no semantic slot is missing', missingSemantic, []);

const semanticDrift = SEMANTIC_SLOTS.filter(
  (slot) =>
    String(stock.theme.semanticColors[slot]).toLowerCase() !==
    String(DATA.semanticColors[slot].light).toLowerCase()
);
eq('every one of the 103 semanticColors equals its documented default', semanticDrift, []);

eq('fontWeights are the documented five', Object.keys(stock.theme.fontWeights).length, 5);
eq('effects carry the four elevations and three radii', Object.keys(stock.theme.effects).length, 7);
eq('spacing carries the five documented steps', Object.keys(stock.theme.spacing).length, 5);
eq('the type ramp has thirteen slots', Object.keys(stock.theme.fonts).length, 13);
ok(
  'fonts intentionally omit fontFamily (unverified by the research)',
  Object.values(stock.theme.fonts).every((f) => f.fontFamily === undefined)
);

// ---------------------------------------------------------------------------
// 4. Derivation
// ---------------------------------------------------------------------------

section('4  semanticColors derive from the documented palette slot');

const derivedWrong = SEMANTIC_SLOTS.filter((slot) => {
  const from = DATA.semanticColors[slot].derivesFrom;
  if (!from) return false;
  return stock.theme.semanticColors[slot] !== stock.theme.palette[from];
});
eq('every derivesFrom link holds', derivedWrong, []);

eq('cardShadow comes from effects.elevation4', stock.theme.semanticColors.cardShadow, DATA.effects.elevation4);
eq('cardShadowHovered comes from effects.elevation8', stock.theme.semanticColors.cardShadowHovered, DATA.effects.elevation8);
eq('primaryButtonBorder is the literal keyword', stock.theme.semanticColors.primaryButtonBorder, 'transparent');

const inverted = createV8Theme({ isInverted: true });
eq(
  'an inverted theme swaps cardShadowHovered for a hairline border',
  inverted.semanticColors.cardShadowHovered,
  '0 0 1px ' + inverted.semanticColors.variantBorderHovered
);
eq('inverted flips the invariant errorText', inverted.semanticColors.errorText, '#F1707B');
eq('inverted leaves primaryButtonBorder alone', inverted.semanticColors.primaryButtonBorder, 'transparent');
ok(
  'isInverted alone does NOT invert the palette (documented v8 behaviour)',
  inverted.palette.white === '#ffffff'
);

eq(
  'a user semanticColors override wins over the derivation',
  createV8Theme({ semanticColors: { bodyText: '#112233' } }).semanticColors.bodyText,
  '#112233'
);
eq(
  'createTheme auto-sets accent from themePrimary',
  createV8Theme({ palette: { themePrimary: '#8a2be2' } }).palette.accent,
  '#8a2be2'
);
eq(
  'an explicit accent is not overwritten',
  createV8Theme({ palette: { themePrimary: '#8a2be2', accent: '#ff0000' } }).palette.accent,
  '#ff0000'
);

// ---------------------------------------------------------------------------
// 5. Generating from a brand colour
// ---------------------------------------------------------------------------

section('5  generation from a brand colour');

const fromDefaultBrand = generateV8Theme({ primaryColor: '#0078d4' });
eq('themePrimary is the brand colour verbatim', fromDefaultBrand.generatedSlots.themePrimary, '#0078d4');
eq('the generated ramp has all 23 FabricSlots', Object.keys(fromDefaultBrand.generatedSlots).length, 23);
eq('FABRIC_SLOT_RULES declares 23 slots', FABRIC_SLOT_RULES.length, 23);

// The research is explicit that this differs from DefaultPalette because
// DefaultPalette is hand-tuned. Asserting the difference (not equality) is what
// keeps this honest.
eq('generating from #0078d4 yields themeLighterAlt #f3f9fd', fromDefaultBrand.generatedSlots.themeLighterAlt, '#f3f9fd');
eq('generating from #0078d4 yields themeLighter #d0e7f8', fromDefaultBrand.generatedSlots.themeLighter, '#d0e7f8');
ok(
  'the generated ramp is warned about because it is not DefaultPalette',
  fromDefaultBrand.warnings.some((w) => w.includes('hand-tuned'))
);
eq(
  'the neutrals survive a brand-only change',
  FABRIC_SLOT_RULES.filter(([, base]) => base !== 'primaryColor')
    .map(([name]) => name)
    .filter((name) => fromDefaultBrand.generatedSlots[name] !== DATA.palette[name].light),
  []
);
eq(
  'exactly the eight derived theme* slots move',
  FABRIC_SLOT_RULES.filter(([, base]) => base === 'primaryColor')
    .map(([name]) => name)
    .filter((name) => fromDefaultBrand.generatedSlots[name] !== DATA.palette[name].light).length,
  8
);

const purple = generateV8Theme({ primaryColor: '#8a2be2' });
eq('a different brand lands on themePrimary', purple.theme.palette.themePrimary, '#8a2be2');
eq('the brand colour also becomes semanticColors.link', purple.theme.semanticColors.link, '#8a2be2');
eq('primaryButtonBackground follows the brand', purple.theme.semanticColors.primaryButtonBackground, '#8a2be2');
eq('the 27 non-generated slots fall back to DefaultPalette', purple.theme.palette.greenDark, DATA.palette.greenDark.light);

const dark = generateV8Theme({
  primaryColor: '#2899f5',
  backgroundColor: '#1b1a19',
  textColor: '#f3f2f1',
});
ok('a dark background switches isInverted on automatically', dark.baseColors.isInverted === true);
eq('white follows the supplied background', dark.theme.palette.white, '#1b1a19');
eq('neutralPrimary follows the supplied text colour', dark.theme.palette.neutralPrimary, '#f3f2f1');
ok('a dark theme is warned about needing more than a palette', dark.warnings.some((w) => w.includes('component styles')));
ok(
  'inverted background shades get lighter, not darker',
  !isDark(dark.theme.palette.neutralLighterAlt) === false &&
    parseColor(dark.theme.palette.neutralLighterAlt).v > parseColor('#1b1a19').v
);

ok(
  'isInverted without a background colour is warned about',
  generateV8Theme({ isInverted: true }).warnings.some((w) => w.includes('does not invert'))
);

// The rules graph itself is deterministic and idempotent.
const rulesA = getThemeAsJson(setBaseSlot(createThemeRules(), 'primaryColor', brand, false));
const rulesB = getThemeAsJson(setBaseSlot(createThemeRules(), 'primaryColor', brand, false));
eq('the rules graph is deterministic', rulesA, rulesB);
eq('an untouched rules graph is exactly DefaultPalette\u2019s 23 fabric slots',
  Object.entries(getThemeAsJson(createThemeRules())).filter(([k, v]) => v !== DATA.palette[k].light),
  []
);

// ---------------------------------------------------------------------------
// 6. v8 -> v9
// ---------------------------------------------------------------------------

section('6  v8 -> v9 conversion');

const toV9 = v8ThemeToV9({ theme: stock.theme });
eq('the brand ramp has 16 stops', Object.keys(toV9.brandRamp).length, 16);
eq('V9_BRAND_STOPS is the canonical list', V9_BRAND_STOPS.length, 16);
eq('stop 80 is themePrimary', toV9.brandRamp[80], stock.theme.palette.themePrimary);
eq('stop 70 is themeDarkAlt', toV9.brandRamp[70], stock.theme.palette.themeDarkAlt);
eq('stop 60 is themeDark', toV9.brandRamp[60], stock.theme.palette.themeDark);
eq('stop 40 is themeDarker', toV9.brandRamp[40], stock.theme.palette.themeDarker);
eq('four stops are anchored to real v8 slots',
  V9_BRAND_STOPS.filter((s) => toV9.brandRampProvenance[s].source === 'v8-anchor').length, 4);
eq('the other twelve are declared interpolated',
  V9_BRAND_STOPS.filter((s) => toV9.brandRampProvenance[s].source === 'interpolated').length, 12);
ok('every ramp stop is a valid hex', V9_BRAND_STOPS.every((s) => /^#[0-9a-f]{6}$/.test(toV9.brandRamp[s])));
ok(
  'the ramp is monotonically lighter from stop 10 to 160',
  V9_BRAND_STOPS.every((s, i, arr) => {
    if (i === 0) return true;
    const prev = parseColor(toV9.brandRamp[arr[i - 1]]);
    const cur = parseColor(toV9.brandRamp[s]);
    return hsv2hsl(cur.h, cur.s, cur.v).l >= hsv2hsl(prev.h, prev.s, prev.v).l - 0.5;
  })
);
ok('the inferred ramp position is warned about', toV9.warnings.some((w) => w.includes('INFERRED')));

ok('some v9 tokens were produced', toV9.summary.tokensProduced > 40);
eq('colorBrandBackground comes from the brand', toV9.tokenOverrides.colorBrandBackground, '#0078d4');
eq('colorNeutralForeground1 comes from bodyText', toV9.tokenOverrides.colorNeutralForeground1, stock.theme.semanticColors.bodyText);

ok('lossy slots are reported, not dropped', toV9.summary.lossyCount > 0);
const lossySlots = new Set(toV9.lossy.map((l) => `${l.kind}.${l.slot}`));
// Every slot the research says has no v9 token must appear in `lossy`.
const nullMapped = PALETTE_SLOTS.filter((s) => DATA.paletteToV9[s] && DATA.paletteToV9[s].v9Token === null);
eq('every null-mapped palette slot is reported lossy',
  nullMapped.filter((s) => !lossySlots.has(`palette.${s}`)), []);
const nullSemantic = SEMANTIC_SLOTS.filter((s) => DATA.semanticToV9[s] && DATA.semanticToV9[s].v9Token === null);
eq('every null-mapped semantic slot is reported lossy',
  nullSemantic.filter((s) => !lossySlots.has(`semanticColors.${s}`)), []);
ok('themeSecondary (no v9 equivalent) is reported', lossySlots.has('palette.themeSecondary'));
ok('themeTertiary (no v9 equivalent) is reported', lossySlots.has('palette.themeTertiary'));
ok('blockingIcon (no v9 equivalent) is reported', lossySlots.has('semanticColors.blockingIcon'));
ok('cardShadow is reported as a non-colour value',
  toV9.lossy.some((l) => l.slot === 'cardShadow' && /not a colour/.test(l.reason)));
ok('blackTranslucent40 is reported as translucent',
  toV9.lossy.some((l) => l.slot === 'blackTranslucent40' && /translucent/.test(l.reason)));
ok('primaryButtonBorder=transparent is reported',
  toV9.lossy.some((l) => l.slot === 'primaryButtonBorder'));
ok('every medium/low confidence mapping is reported',
  toV9.lossy.filter((l) => l.confidence === 'medium' || l.confidence === 'low').length >= 40);
ok('confidence counts are summarised', typeof toV9.summary.byConfidence === 'object');
ok('every lossy entry carries a reason', toV9.lossy.every((l) => typeof l.reason === 'string' && l.reason.length > 0));
eq('a slot is reported at most once, with its reasons merged',
  toV9.lossy.length, new Set(toV9.lossy.map((l) => `${l.kind}.${l.slot}`)).size);
ok('a slot lossy for two reasons keeps both',
  toV9.lossy.some((l) => l.reasons.length > 1));

// Collisions must be surfaced rather than silently overwritten, and the
// better-evidenced mapping must win regardless of iteration order.
const collided = v8ThemeToV9({
  theme: createV8Theme({ palette: { ...defaultPalette(), neutralDark: '#123456' } }),
});
ok('token collisions are reported', collided.conflicts.length > 0);
ok('the losing side of a collision is also in lossy',
  collided.lossy.some((l) => /collides with/.test(l.reason)));
ok('a low-confidence slot never beats a high-confidence one',
  collided.conflicts.every(
    (c) => (c.winnerConfidence === c.loserConfidence) || c.winnerConfidence === 'high' ||
      (c.winnerConfidence === 'medium' && c.loserConfidence === 'low')
  ));
const purpleToV9 = v8ThemeToV9({ theme: purple.theme });
eq('colorBrandBackground keeps themePrimary, not the medium-confidence palette.blue',
  purpleToV9.tokenOverrides.colorBrandBackground, '#8a2be2');
eq('colorNeutralForeground1 keeps the high-confidence bodyText',
  purpleToV9.tokenOverrides.colorNeutralForeground1, purple.theme.semanticColors.bodyText);

const v9Snippet = toV9ThemeSnippet(toV9);
ok('the v9 snippet imports createLightTheme', v9Snippet.includes('createLightTheme'));
ok('the v9 snippet carries the inferred-ramp warning', v9Snippet.includes('inferred'));

// ---------------------------------------------------------------------------
// 7. v9 -> v8
// ---------------------------------------------------------------------------

section('7  v9 -> v8 conversion');

const backToV8 = v9ToV8Theme({ brandRamp: toV9.brandRamp });
eq('themePrimary is recovered from stop 80', backToV8.theme.palette.themePrimary, '#0078d4');
eq('four slots are adopted straight from the ramp', backToV8.adoptedFromRamp.length, 4);
eq('the other nineteen come from the shade algorithm', backToV8.derivedFromShadeAlgorithm.length, 19);
eq('the result is a complete 50-slot palette', Object.keys(backToV8.theme.palette).length, 50);
eq('the result carries all 103 semanticColors', Object.keys(backToV8.theme.semanticColors).length, 103);
ok('what cannot round-trip is stated for neutrals', /grey ramp/.test(backToV8.cannotRoundTrip.neutrals));
ok('what cannot round-trip is stated for status colours', /status colours/.test(backToV8.cannotRoundTrip.statusColors));
ok('the unreachable v9 token list is carried through', backToV8.cannotRoundTrip.tokens.length > 50);
ok('the lossy round trip is warned about', backToV8.warnings.some((w) => w.includes('not identity')));

// A round trip must restore the four anchored slots and is allowed to lose the rest.
eq('round trip restores themeDarker', backToV8.theme.palette.themeDarker, stock.theme.palette.themeDarker);
eq('round trip restores themeDark', backToV8.theme.palette.themeDark, stock.theme.palette.themeDark);
ok(
  'round trip does NOT restore themeSecondary (declared unreachable)',
  backToV8.derivedFromShadeAlgorithm.includes('themeSecondary')
);

eq('a 16-item array is accepted', v9ToV8Theme({ brandRamp: V9_BRAND_STOPS.map((s) => toV9.brandRamp[s]) }).theme.palette.themePrimary, '#0078d4');
const sparse = v9ToV8Theme({ brandRamp: { 80: '#0078d4' } });
eq('a ramp with only stop 80 still works', sparse.theme.palette.themePrimary, '#0078d4');
eq('missing stops are reported', sparse.missingRampStops.length, 15);
eq('a dark target inverts the generated neutrals',
  v9ToV8Theme({ brandRamp: { 80: '#2899f5' }, backgroundColor: '#1b1a19', textColor: '#f3f2f1' }).theme.palette.white,
  '#1b1a19');

// ---------------------------------------------------------------------------
// 8. Audit
// ---------------------------------------------------------------------------

section('8  audit');

const stockAudit = auditV8Theme(stock.theme);
ok('the stock theme audits clean', stockAudit.ok, JSON.stringify(stockAudit.summary));
eq('the stock theme reports 50 palette slots present', stockAudit.summary.paletteSlotsPresent, 50);
eq('the stock theme reports 103 semantic slots present', stockAudit.summary.semanticSlotsPresent, 103);
ok('a useful number of contrast pairs are checked', stockAudit.summary.contrastChecks >= 30);
eq('the stock theme has no non-exempt contrast failure', stockAudit.summary.contrastFailures, 0);
eq('the stock theme has nothing hardcoded', stockAudit.summary.hardcodedSlots, 0);
ok('the shipped blockingIcon bug is surfaced',
  stockAudit.findings.some((f) => f.code === 'known-upstream-bug'));
ok('deprecated slots are surfaced',
  stockAudit.findings.some((f) => f.code === 'deprecated-slots-present'));
ok('DefaultPalette is flagged as hand-tuned rather than generated',
  stockAudit.findings.some((f) => f.code === 'ramp-hand-tuned' && f.severity === 'info'));

const partial = auditV8Theme({ palette: { themePrimary: '#0078d4' } });
ok('a partial palette fails the audit', !partial.ok);
eq('the missing palette slots are counted', partial.missing.palette.length, 49);
ok('the mergeThemes trap is explained',
  partial.findings.some((f) => f.code === 'palette-incomplete' && /mergeThemes/.test(f.message)));

const lowContrast = createV8Theme({ semanticColors: { bodyText: '#cccccc' } });
const lowAudit = auditV8Theme(lowContrast);
ok('a low-contrast bodyText fails', !lowAudit.ok);
ok('the failing pair is named with its ratio',
  lowAudit.contrast.some((c) => c.foreground === 'bodyText' && !c.pass && c.ratio < 4.5));
ok('bodyText is also reported as hardcoded',
  lowAudit.hardcoded.some((h) => h.slot === 'bodyText'));
ok('the hardcoded finding explains the brand-change consequence',
  lowAudit.findings.some((f) => f.code === 'semantic-hardcoded' && /NOT change/.test(f.message)));

const repointed = createV8Theme({ semanticColors: { bodyText: DATA.palette.neutralDark.light } });
const repointedAudit = auditV8Theme(repointed);
eq('re-pointing to another palette slot is info, not an error', repointedAudit.summary.hardcodedSlots, 0);
eq('and it is counted as re-pointed', repointedAudit.summary.repointedSlots, 1);
ok('a re-pointed theme still passes', repointedAudit.ok);

const disabledOnly = auditV8Theme(createV8Theme({}));
ok('disabled-state pairs are waived, not failures',
  disabledOnly.contrast.some((c) => c.waiver === 'disabled' && !c.pass) && disabledOnly.ok);
ok('decorative dividers are waived, not failures',
  disabledOnly.contrast.some((c) => c.waiver === 'decorative' && !c.pass) && disabledOnly.ok);
ok('the shipped blockingIcon bug is waived in contrast but reported as a bug',
  disabledOnly.contrast.some((c) => c.foreground === 'blockingIcon' && c.waiver === 'upstreamBug') &&
    disabledOnly.findings.some((f) => f.code === 'known-upstream-bug'));
ok('every waived failure still prints its ratio',
  disabledOnly.contrast.filter((c) => !c.pass).every((c) => typeof c.ratio === 'number'));

const badInverted = auditV8Theme({ palette: defaultPalette(), semanticColors: {}, isInverted: true });
ok('isInverted with a light palette is an error',
  badInverted.findings.some((f) => f.code === 'inverted-with-light-palette'));

const unknownSlot = auditV8Theme({ palette: { ...defaultPalette(), notASlot: '#000000' } });
ok('an unknown palette slot is an error',
  unknownSlot.findings.some((f) => f.code === 'palette-unknown-slot'));
const unparseable = auditV8Theme({ palette: { ...defaultPalette(), themePrimary: 'not-a-colour' } });
ok('an unparseable palette value is an error',
  unparseable.findings.some((f) => f.code === 'palette-unparseable'));

// ---------------------------------------------------------------------------
// 9. Error handling
// ---------------------------------------------------------------------------

section('9  error handling');

throwsV8('an invalid hex is rejected', () => parseColor('#zzzz'), 'not a valid hex');
throwsV8('an empty colour is rejected', () => parseColor(''), 'expected a colour string');
throwsV8('a non-string colour is rejected', () => parseColor(42), 'expected a colour string');
throwsV8('a CSS named colour explains why it cannot work', () => parseColor('rebeccapurple'), 'named colours');
throwsV8('generateV8Theme rejects a bad brand', () => generateV8Theme({ primaryColor: 'nope!' }), 'not a valid hex');
throwsV8('createV8Theme rejects an unknown palette slot', () => createV8Theme({ palette: { nope: '#000' } }), 'unknown palette slot');
throwsV8('createV8Theme rejects an unknown semantic slot', () => createV8Theme({ semanticColors: { nope: '#000' } }), 'unknown semanticColors slot');
throwsV8('createV8Theme rejects a non-object', () => createV8Theme('nope'), 'expects an object');
throwsV8('auditV8Theme rejects a non-theme', () => auditV8Theme({ hello: 'world' }), 'is this a v8 theme');
throwsV8('auditV8Theme rejects null', () => auditV8Theme(null), 'expects a theme object');
throwsV8('v8ThemeToV9 rejects a missing theme', () => v8ThemeToV9({}), 'expects { theme }');
throwsV8('v8ThemeToV9 rejects an empty palette', () => v8ThemeToV9({ theme: { palette: {} } }), 'palette is empty');
throwsV8('v9ToV8Theme rejects a missing ramp', () => v9ToV8Theme({}), 'expects { brandRamp }');
throwsV8('v9ToV8Theme rejects a ramp without stop 80', () => v9ToV8Theme({ brandRamp: { 10: '#000000' } }), 'missing stop 80');
throwsV8('v9ToV8Theme rejects a wrong-length array', () => v9ToV8Theme({ brandRamp: ['#000000'] }), 'must have 16 stops');
throwsV8(
  'makeSemanticColors names the palette slot it needed',
  () => {
    const incomplete = { ...defaultPalette() };
    delete incomplete.white;
    return makeSemanticColors(incomplete, DATA.effects, undefined, false);
  },
  'palette slot "white" is missing'
);

// ---------------------------------------------------------------------------
// 10. Snippets and CLIs
// ---------------------------------------------------------------------------

section('10  snippets and CLIs');

const snippet = toCreateThemeSnippet(stock.theme, { name: 'brandTheme' });
ok('the snippet calls createTheme', snippet.includes('createTheme({'));
ok('the snippet names the export', snippet.includes('export const brandTheme'));
ok('the snippet omits semanticColors by default', !snippet.includes('semanticColors:'));
ok('the snippet cites the verified version',
  snippet.includes(DATA.meta.verifiedVersions['@fluentui/react']));
ok('the snippet warns about inline theme objects', snippet.includes('re-merges'));
ok('--full pins semanticColors',
  toCreateThemeSnippet(stock.theme, { includeSemanticColors: true }).includes('semanticColors:'));

rmSync(WORK, { recursive: true, force: true });
mkdirSync(WORK, { recursive: true });

const node = process.execPath;
function run(script, argv) {
  try {
    return { code: 0, stdout: execFileSync(node, [join(HERE, script), ...argv], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }), stderr: '' };
  } catch (err) {
    // A non-zero exit is a legitimate outcome to assert on, not a test error.
    return { code: err.status ?? 1, stdout: String(err.stdout || ''), stderr: String(err.stderr || '') };
  }
}

const themeJson = join(WORK, 'theme.json');
const themeTs = join(WORK, 'theme.ts');
const gen = run('generate-theme.mjs', ['--brand', '#8a2be2', '--out', themeJson, '--ts', themeTs]);
eq('generate-theme.mjs exits 0', gen.code, 0);
ok('generate-theme.mjs prints the ramp', gen.stdout.includes('GENERATED RAMP'));
ok('generate-theme.mjs wrote the JSON theme', existsSync(themeJson));
ok('generate-theme.mjs wrote the TS snippet', existsSync(themeTs));
const writtenTheme = JSON.parse(readFileSync(themeJson, 'utf8'));
eq('the written theme carries the brand', writtenTheme.palette.themePrimary, '#8a2be2');
eq('the written theme has 103 semanticColors', Object.keys(writtenTheme.semanticColors).length, 103);
ok('the written TS snippet compiles as a createTheme call',
  readFileSync(themeTs, 'utf8').includes('createTheme({'));

const genJson = run('generate-theme.mjs', ['--brand', '#0078d4', '--json']);
eq('generate-theme.mjs --json exits 0', genJson.code, 0);
ok('generate-theme.mjs --json emits parseable JSON', (() => {
  try {
    return JSON.parse(genJson.stdout).theme.palette.themePrimary === '#0078d4';
  } catch {
    return false;
  }
})());

const genBad = run('generate-theme.mjs', ['--brand', 'chartreuse']);
eq('generate-theme.mjs rejects a named colour with exit 1', genBad.code, 1);
ok('...and prints a friendly error, not a stack',
  genBad.stderr.startsWith('error:') && !genBad.stderr.includes('at '));

const auditRun = run('audit-theme.mjs', [themeJson]);
eq('audit-theme.mjs exits 0 on a clean theme', auditRun.code, 0);
ok('audit-theme.mjs prints PASS', auditRun.stdout.includes('AUDIT  PASS'));
ok('audit-theme.mjs prints the contrast section', auditRun.stdout.includes('WCAG 2.2 AA'));

const brokenPath = join(WORK, 'broken.json');
writeFileSync(brokenPath, JSON.stringify({ palette: { themePrimary: '#0078d4' } }, null, 2), 'utf8');
const auditBroken = run('audit-theme.mjs', [brokenPath]);
eq('audit-theme.mjs exits 1 on an incomplete theme', auditBroken.code, 1);
ok('...and says so', auditBroken.stdout.includes('AUDIT  FAIL'));

const auditMissing = run('audit-theme.mjs', [join(WORK, 'nope.json')]);
eq('audit-theme.mjs exits 1 on a missing file', auditMissing.code, 1);
ok('...with a readable message', auditMissing.stderr.includes('no such file'));

const notJsonPath = join(WORK, 'not.json');
writeFileSync(notJsonPath, '{ this is not json', 'utf8');
const auditNotJson = run('audit-theme.mjs', [notJsonPath]);
eq('audit-theme.mjs exits 1 on malformed JSON', auditNotJson.code, 1);
ok('...naming the file', auditNotJson.stderr.includes('not valid JSON'));

const rampPath = join(WORK, 'ramp.json');
const v9Ts = join(WORK, 'v9theme.ts');
const conv = run('convert-theme.mjs', ['to-v9', themeJson, '--out', rampPath, '--ts', v9Ts]);
eq('convert-theme.mjs to-v9 exits 0', conv.code, 0);
ok('convert-theme.mjs to-v9 prints the ramp', conv.stdout.includes('BRAND RAMP'));
ok('convert-theme.mjs to-v9 prints the lossy report', conv.stdout.includes('LOSSY'));
ok('convert-theme.mjs to-v9 wrote the conversion', existsSync(rampPath));
ok('convert-theme.mjs to-v9 wrote a v9 snippet', readFileSync(v9Ts, 'utf8').includes('BrandVariants'));

const back = run('convert-theme.mjs', ['to-v8', rampPath]);
eq('convert-theme.mjs to-v8 exits 0', back.code, 0);
ok('convert-theme.mjs to-v8 reports what it adopted', back.stdout.includes('ADOPTED FROM RAMP'));
ok('convert-theme.mjs to-v8 reports what cannot round-trip', back.stdout.includes('CANNOT ROUND-TRIP'));

const convBad = run('convert-theme.mjs', ['sideways', themeJson]);
eq('convert-theme.mjs rejects an unknown direction', convBad.code, 2);

const convNoRamp = run('convert-theme.mjs', ['to-v8', themeJson]);
eq('convert-theme.mjs to-v8 rejects a theme file as a ramp', convNoRamp.code, 1);
ok('...explaining that stop 80 is required', convNoRamp.stderr.includes('stop 80'));

if (!args.keep) rmSync(WORK, { recursive: true, force: true });

// ---------------------------------------------------------------------------

process.stdout.write(`\n${passed} passed, ${failures.length} failed\n`);
if (failures.length) {
  process.stdout.write('\nFAILURES\n');
  for (const f of failures) process.stdout.write(`  - ${f}\n`);
  process.exit(1);
}
