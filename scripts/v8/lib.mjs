/**
 * Deterministic, dependency-free Fluent UI React v8 theme engine.
 *
 * Why this exists
 * ---------------
 * Generating a v8 theme normally means running `@fluentui/react`'s
 * `ThemeGenerator` in a browser: `getColorFromString` needs a DOM `Document`,
 * and `createTheme` drags in the whole React package. Neither is available to a
 * CLI, an MCP tool, or a CI check. This module reimplements the exact colour
 * maths and the exact derivation graph so a theme can be produced, audited and
 * converted from plain Node 18+ with no npm install.
 *
 * Grounding
 * ---------
 * Every constant, table and derivation here is taken from `data/theming.json`,
 * a verified extract of `@fluentui/react@8.125.7` / `@fluentui/theme@2.7.2`
 * source. Nothing is invented: where the research could not confirm a value it
 * is `null` and listed under `unverified`, and this module surfaces that rather
 * than filling the gap with a guess. Citations below name the upstream
 * file/symbol each block reproduces.
 *
 * Public surface
 * --------------
 *   generateV8Theme({ primaryColor, textColor, backgroundColor, isInverted })
 *   v8ThemeToV9({ theme })
 *   v9ToV8Theme({ brandRamp })
 *   auditV8Theme(theme)
 * plus the colour utilities and emitters the CLIs use.
 */

import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

/** True when the module at `importMetaUrl` is the entry point Node was started with. */
export function isMain(importMetaUrl) {
  if (!process.argv[1]) return false;
  try {
    return pathToFileURL(resolve(process.argv[1])).href === importMetaUrl;
  } catch {
    return false;
  }
}

/** Every failure a user can cause is one of these, so CLIs never print a stack. */
export class V8ThemeError extends Error {
  constructor(message) {
    super(message);
    this.name = 'V8ThemeError';
  }
}

// ---------------------------------------------------------------------------
// Verified research data
// ---------------------------------------------------------------------------

/**
 * The single source of truth. Loaded once; callers must not mutate it, so the
 * accessors below always hand back copies.
 */
export const DATA = JSON.parse(readFileSync(join(HERE, 'data', 'theming.json'), 'utf8'));

/** IPalette slot names, in the order the research extract lists them (50 slots). */
export const PALETTE_SLOTS = Object.keys(DATA.palette);

/** ISemanticColors + ISemanticTextColors slot names (103 slots). */
export const SEMANTIC_SLOTS = Object.keys(DATA.semanticColors);

/** `DefaultPalette` from packages/theme/src/colors/DefaultPalette.ts (light). */
export function defaultPalette() {
  const out = {};
  for (const slot of PALETTE_SLOTS) out[slot] = DATA.palette[slot].light;
  return out;
}

/** DefaultEffects / DefaultSpacing / DefaultFontStyles sizes, all verified. */
export function defaultEffects() {
  return { ...DATA.effects };
}
export function defaultSpacing() {
  return { ...DATA.spacing };
}
export function defaultFontWeights() {
  return { ...DATA.fontWeights };
}
/**
 * Only `fontSize` and `fontWeight` are emitted. The research verified the type
 * ramp sizes but not the `fontFamily` strings `createFontStyles` builds, and
 * inventing a family string would be shipping an unverified value as fact.
 * `createTheme` supplies the families at runtime.
 */
export function defaultFonts() {
  const out = {};
  for (const [slot, spec] of Object.entries(DATA.fonts)) out[slot] = { ...spec };
  return out;
}

// ---------------------------------------------------------------------------
// Colour primitives
//   packages/react/src/utilities/color/{consts,rgb2hsv,hsv2rgb,hsv2hsl}.ts
// ---------------------------------------------------------------------------

const MAX_COLOR_RGB = 255;
const MAX_COLOR_SATURATION = 100;
const MAX_COLOR_VALUE = 100;
const MAX_COLOR_ALPHA = 100;

/** color/consts.ts `clamp` - note the (value, max, min) argument order. */
function clamp(n, max, min = 0) {
  return n < min ? min : n > max ? max : n;
}

function componentToHex(c) {
  const hex = Math.round(clamp(c, 255)).toString(16);
  return hex.length === 1 ? '0' + hex : hex;
}

/** color/rgb2hex.ts - returns the six digits WITHOUT a leading '#'. */
export function rgb2hex(r, g, b) {
  return [componentToHex(r), componentToHex(g), componentToHex(b)].join('');
}

/**
 * color/rgb2hsv.ts. The `Math.round` calls make h integer degrees and s/v
 * integer percent; that rounding is lossy and is what makes v8's generated
 * ramps reproducible bit-for-bit, so it must not be "improved".
 */
export function rgb2hsv(r, g, b) {
  let h = 0;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;

  if (delta === 0) h = 0;
  else if (r === max) h = ((g - b) / delta) % 6;
  else if (g === max) h = (b - r) / delta + 2;
  else h = (r - g) / delta + 4;

  h = Math.round(h * 60);
  if (h < 0) h += 360;

  const s = Math.round((max === 0 ? 0 : delta / max) * 100);
  const v = Math.round((max / MAX_COLOR_RGB) * 100);
  return { h, s, v };
}

/** color/hsv2rgb.ts. */
export function hsv2rgb(h, s, v) {
  s = s / 100;
  v = v / 100;

  let rgb = [0, 0, 0];
  const c = v * s;
  const hh = h / 60;
  const x = c * (1 - Math.abs((hh % 2) - 1));
  const m = v - c;

  switch (Math.floor(hh)) {
    case 0:
      rgb = [c, x, 0];
      break;
    case 1:
      rgb = [x, c, 0];
      break;
    case 2:
      rgb = [0, c, x];
      break;
    case 3:
      rgb = [0, x, c];
      break;
    case 4:
      rgb = [x, 0, c];
      break;
    case 5:
      rgb = [c, 0, x];
      break;
    // h === 360 lands here; upstream leaves rgb empty, we clamp to the h=0 case
    // so a caller can never receive NaN channels.
    default:
      rgb = [c, x, 0];
      break;
  }

  return {
    r: Math.round(MAX_COLOR_RGB * (rgb[0] + m)),
    g: Math.round(MAX_COLOR_RGB * (rgb[1] + m)),
    b: Math.round(MAX_COLOR_RGB * (rgb[2] + m)),
  };
}

/** color/hsv2hsl.ts. `s` can divide by zero for greys, hence the NaN guard. */
export function hsv2hsl(h, s, v) {
  s /= MAX_COLOR_SATURATION;
  v /= MAX_COLOR_VALUE;

  let l = (2 - s) * v;
  const sl = (s * v) / (l <= 1 ? l : 2 - l);
  l /= 2;

  return { h, s: (Number.isNaN(sl) ? 0 : sl) * 100, l: l * 100 };
}

/** hsl -> hsv, needed to walk a lightness ramp (v9 brand ramps are lightness-ordered). */
export function hsl2hsv(h, s, l) {
  s /= 100;
  l /= 100;
  const v = l + s * Math.min(l, 1 - l);
  const sv = v === 0 ? 0 : 2 * (1 - l / v);
  return { h, s: clamp(sv * 100, 100), v: clamp(v * 100, 100) };
}

/**
 * color/getColorFromRGBA.ts - builds the `IColor` record every other routine
 * passes around: rgb + hsv + hex + alpha, all at once.
 */
export function colorFromRgba({ r, g, b, a = MAX_COLOR_ALPHA }) {
  const { h, s, v } = rgb2hsv(r, g, b);
  const hex = rgb2hex(r, g, b);
  const str = a === MAX_COLOR_ALPHA ? `#${hex}` : `rgba(${r}, ${g}, ${b}, ${a / MAX_COLOR_ALPHA})`;
  return { r, g, b, a, h, s, v, hex, str, t: MAX_COLOR_ALPHA - a };
}

const HEX3 = /^#?([0-9a-f])([0-9a-f])([0-9a-f])$/i;
const HEX6 = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i;
const HEX8 = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i;
const RGB_FN = /^rgba?\(\s*([0-9.]+)\s*,\s*([0-9.]+)\s*,\s*([0-9.]+)\s*(?:,\s*([0-9.]*)\s*)?\)$/i;

/**
 * The Node-safe replacement for color/getColorFromString.ts, which resolves CSS
 * named colours by writing to a DOM element. Named colours are rejected with a
 * clear message instead of silently becoming black.
 */
export function parseColor(input, label = 'color') {
  if (typeof input !== 'string' || input.trim() === '') {
    throw new V8ThemeError(`${label}: expected a colour string, got ${JSON.stringify(input)}`);
  }
  const s = input.trim();

  const m8 = HEX8.exec(s);
  if (m8) {
    return colorFromRgba({
      r: parseInt(m8[1], 16),
      g: parseInt(m8[2], 16),
      b: parseInt(m8[3], 16),
      a: Math.round((parseInt(m8[4], 16) / 255) * 100),
    });
  }
  const m6 = HEX6.exec(s);
  if (m6) {
    return colorFromRgba({
      r: parseInt(m6[1], 16),
      g: parseInt(m6[2], 16),
      b: parseInt(m6[3], 16),
    });
  }
  const m3 = HEX3.exec(s);
  if (m3) {
    return colorFromRgba({
      r: parseInt(m3[1] + m3[1], 16),
      g: parseInt(m3[2] + m3[2], 16),
      b: parseInt(m3[3] + m3[3], 16),
    });
  }
  const fn = RGB_FN.exec(s);
  if (fn) {
    const a = fn[4] === undefined || fn[4] === '' ? 1 : Number(fn[4]);
    if (!Number.isFinite(a)) throw new V8ThemeError(`${label}: bad alpha in "${s}"`);
    return colorFromRgba({
      r: clamp(Math.round(Number(fn[1])), 255),
      g: clamp(Math.round(Number(fn[2])), 255),
      b: clamp(Math.round(Number(fn[3])), 255),
      a: Math.round(clamp(a, 1) * 100),
    });
  }
  if (/^[a-z]+$/i.test(s)) {
    throw new V8ThemeError(
      `${label}: CSS named colours such as "${s}" need a DOM to resolve; pass a hex value like #0078d4`
    );
  }
  throw new V8ThemeError(`${label}: "${s}" is not a valid hex or rgb()/rgba() colour`);
}

/** Non-throwing probe used by the auditor, which meets `transparent` and shadows. */
export function tryParseColor(input) {
  try {
    return parseColor(input);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Contrast (WCAG 2.2)
// ---------------------------------------------------------------------------

function channelLuminance(c8) {
  const c = c8 / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/** WCAG 2.x relative luminance. Alpha is ignored: WCAG is defined on composites. */
export function relativeLuminance(color) {
  const c = typeof color === 'string' ? parseColor(color) : color;
  return (
    0.2126 * channelLuminance(c.r) + 0.7152 * channelLuminance(c.g) + 0.0722 * channelLuminance(c.b)
  );
}

/** WCAG contrast ratio, 1..21, rounded to 2dp so results compare stably. */
export function contrastRatio(a, b) {
  const l1 = relativeLuminance(a);
  const l2 = relativeLuminance(b);
  const hi = Math.max(l1, l2);
  const lo = Math.min(l1, l2);
  return Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100;
}

/** color/shades.ts `isDark` - drives the automatic `isInverted` decision. */
export function isDark(color) {
  const c = typeof color === 'string' ? parseColor(color) : color;
  return hsv2hsl(c.h, c.s, c.v).l < 50;
}

// ---------------------------------------------------------------------------
// Shading - packages/react/src/utilities/color/shades.ts
// ---------------------------------------------------------------------------

// Verbatim from shades.ts. The BG tables are ordered opposite to the FG tables,
// which is why getBackgroundShade indexes BlackTintTableBG from the far end.
const WhiteShadeTableBG = [0.027, 0.043, 0.082, 0.145, 0.184, 0.216, 0.349, 0.537];
const BlackTintTableBG = [0.537, 0.45, 0.349, 0.216, 0.184, 0.145, 0.082, 0.043];
const WhiteShadeTable = [0.537, 0.349, 0.216, 0.184, 0.145, 0.082, 0.043, 0.027];
const BlackTintTable = [0.537, 0.45, 0.349, 0.216, 0.184, 0.145, 0.082, 0.043];
const LumTintTable = [0.88, 0.77, 0.66, 0.55, 0.44, 0.33, 0.22, 0.11];
const LumShadeTable = [0.11, 0.22, 0.33, 0.44, 0.55, 0.66, 0.77, 0.88];
const ColorTintTable = [0.96, 0.84, 0.7, 0.4, 0.12];
const ColorShadeTable = [0.1, 0.24, 0.44];

const LowLuminanceThreshold = 0.2;
const HighLuminanceThreshold = 0.8;

/** `Shade` enum from shades.ts. */
export const Shade = {
  Unshaded: 0,
  Shade1: 1,
  Shade2: 2,
  Shade3: 3,
  Shade4: 4,
  Shade5: 5,
  Shade6: 6,
  Shade7: 7,
  Shade8: 8,
};

function isValidShade(shade) {
  return typeof shade === 'number' && shade >= Shade.Unshaded && shade <= Shade.Shade8;
}

/** shades.ts `_darken` - deliberately leaves saturation alone. */
function darken(hsv, factor) {
  return { h: hsv.h, s: hsv.s, v: clamp(hsv.v - hsv.v * factor, 100, 0) };
}

/** shades.ts `_lighten` - washes out saturation as well as raising value. */
function lighten(hsv, factor) {
  return {
    h: hsv.h,
    s: clamp(hsv.s - hsv.s * factor, 100, 0),
    v: clamp(hsv.v + (100 - hsv.v) * factor, 100, 0),
  };
}

const isWhite = (c) => c.r === MAX_COLOR_RGB && c.g === MAX_COLOR_RGB && c.b === MAX_COLOR_RGB;
const isBlack = (c) => c.r === 0 && c.g === 0 && c.b === 0;

/**
 * shades.ts `getShade`. Five mutually exclusive branches: pure white, pure
 * black, very light, very dark, and the default mid range where shades 1-5 are
 * tints and 6-8 are shades.
 */
export function getShade(color, shade, isInverted = false) {
  if (!color) return null;
  if (shade === Shade.Unshaded || !isValidShade(shade)) return color;

  const hsl = hsv2hsl(color.h, color.s, color.v);
  let hsv = { h: color.h, s: color.s, v: color.v };
  const tableIndex = shade - 1;

  // Inverted themes swap which direction "soften" means, so a dark background
  // still gets a readable ramp.
  let soften = lighten;
  let strongen = darken;
  if (isInverted) {
    soften = darken;
    strongen = lighten;
  }

  if (isWhite(color)) {
    hsv = darken(hsv, WhiteShadeTable[tableIndex]);
  } else if (isBlack(color)) {
    hsv = lighten(hsv, BlackTintTable[tableIndex]);
  } else if (hsl.l / 100 > HighLuminanceThreshold) {
    hsv = strongen(hsv, LumShadeTable[tableIndex]);
  } else if (hsl.l / 100 < LowLuminanceThreshold) {
    hsv = soften(hsv, LumTintTable[tableIndex]);
  } else if (tableIndex < ColorTintTable.length) {
    hsv = soften(hsv, ColorTintTable[tableIndex]);
  } else {
    hsv = strongen(hsv, ColorShadeTable[tableIndex - ColorTintTable.length]);
  }

  return colorFromRgba({ ...hsv2rgb(hsv.h, hsv.s, hsv.v), a: color.a });
}

/**
 * shades.ts `getBackgroundShade`. Backgrounds are ramped differently: the given
 * colour is treated as the extreme end, so every shade moves one way only.
 */
export function getBackgroundShade(color, shade, isInverted = false) {
  if (!color) return null;
  if (shade === Shade.Unshaded || !isValidShade(shade)) return color;

  const tableIndex = shade - 1;
  let hsv = { h: color.h, s: color.s, v: color.v };
  hsv = isInverted
    ? lighten(hsv, BlackTintTableBG[BlackTintTableBG.length - 1 - tableIndex])
    : darken(hsv, WhiteShadeTableBG[tableIndex]);

  return colorFromRgba({ ...hsv2rgb(hsv.h, hsv.s, hsv.v), a: color.a });
}

// ---------------------------------------------------------------------------
// The theme rules graph
//   packages/react/src/components/ThemeGenerator/{ThemeRulesStandard,ThemeGenerator}.ts
// ---------------------------------------------------------------------------

export const BASE_SLOTS = ['primaryColor', 'backgroundColor', 'foregroundColor'];

/**
 * The 23 FabricSlots with the (base, shade, isBackgroundShade) triple taken from
 * the ACTUAL `_makeFabricSlotRule` calls in ThemeRulesStandard.ts. The `Shade`
 * enum comments in that file disagree with the calls and are wrong; the calls
 * win.
 */
export const FABRIC_SLOT_RULES = [
  ['themePrimary', 'primaryColor', Shade.Unshaded, false],
  ['themeLighterAlt', 'primaryColor', Shade.Shade1, false],
  ['themeLighter', 'primaryColor', Shade.Shade2, false],
  ['themeLight', 'primaryColor', Shade.Shade3, false],
  ['themeTertiary', 'primaryColor', Shade.Shade4, false],
  ['themeSecondary', 'primaryColor', Shade.Shade5, false],
  ['themeDarkAlt', 'primaryColor', Shade.Shade6, false],
  ['themeDark', 'primaryColor', Shade.Shade7, false],
  ['themeDarker', 'primaryColor', Shade.Shade8, false],
  ['neutralLighterAlt', 'backgroundColor', Shade.Shade1, true],
  ['neutralLighter', 'backgroundColor', Shade.Shade2, true],
  ['neutralLight', 'backgroundColor', Shade.Shade3, true],
  ['neutralQuaternaryAlt', 'backgroundColor', Shade.Shade4, true],
  ['neutralQuaternary', 'backgroundColor', Shade.Shade5, true],
  ['neutralTertiaryAlt', 'backgroundColor', Shade.Shade6, true],
  ['neutralTertiary', 'foregroundColor', Shade.Shade3, false],
  ['neutralSecondary', 'foregroundColor', Shade.Shade4, false],
  ['neutralSecondaryAlt', 'foregroundColor', Shade.Shade4, false],
  ['neutralPrimaryAlt', 'foregroundColor', Shade.Shade5, false],
  ['neutralPrimary', 'foregroundColor', Shade.Unshaded, false],
  ['neutralDark', 'foregroundColor', Shade.Shade7, false],
  ['black', 'foregroundColor', Shade.Shade8, false],
  ['white', 'backgroundColor', Shade.Unshaded, true],
];

/** ThemeRulesStandard.ts base-slot seed colours. */
export const BASE_SLOT_DEFAULTS = {
  primaryColor: '#0078d4',
  backgroundColor: '#ffffff',
  foregroundColor: '#323130',
};

/**
 * `themeRulesStandardCreator()` + `ThemeGenerator.insureSlots(rules, false)`.
 *
 * Every fabric slot is pre-seeded with its hand-tuned DefaultPalette value and
 * marked customised. That is the whole trick behind the official designer: a
 * base colour the user never touched keeps Microsoft's tuned neutrals, because
 * `insureSlots` runs with overwriteCustomColor=false and leaves customised
 * slots alone.
 */
export function createThemeRules() {
  const rules = {};
  for (const base of BASE_SLOTS) {
    rules[base] = {
      name: base,
      color: parseColor(BASE_SLOT_DEFAULTS[base], base),
      isCustomized: true,
      inherits: null,
      dependentRules: [],
    };
  }
  for (const [name, base, asShade, isBackgroundShade] of FABRIC_SLOT_RULES) {
    const seed = DATA.palette[name].light;
    const rule = {
      name,
      color: parseColor(seed, name),
      isCustomized: true,
      inherits: base,
      asShade,
      isBackgroundShade,
      dependentRules: [],
    };
    rules[name] = rule;
    rules[base].dependentRules.push(rule);
  }
  return rules;
}

/**
 * `ThemeGenerator.setSlot(...)` with overwriteCustomColor=true: re-derives every
 * rule that inherits from `baseName`, which is how one brand hex repaints the
 * nine theme* slots while the neutrals stay put.
 */
export function setBaseSlot(rules, baseName, color, isInverted = false) {
  const base = rules[baseName];
  if (!base) throw new V8ThemeError(`unknown base slot "${baseName}"`);
  base.color = color;
  base.isCustomized = true;
  for (const dep of base.dependentRules) {
    dep.color = dep.isBackgroundShade
      ? getBackgroundShade(color, dep.asShade, isInverted)
      : getShade(color, dep.asShade, isInverted);
    dep.isCustomized = true;
  }
  return rules;
}

/**
 * `ThemeGenerator.getThemeAsJson(rules)`, restricted to the 23 FabricSlots.
 * Upstream also emits primaryColor/backgroundColor/foregroundColor and their
 * shade1..8 companions, which are not IPalette slots and must not reach
 * createTheme. Uses `color.hex` rather than `color.str` so output is always
 * '#rrggbb' instead of echoing whatever string the user typed.
 */
export function getThemeAsJson(rules) {
  const out = {};
  for (const [name] of FABRIC_SLOT_RULES) out[name] = `#${rules[name].color.hex}`;
  return out;
}

// ---------------------------------------------------------------------------
// createTheme / makeSemanticColors
//   packages/theme/src/{createTheme,mergeThemes}.ts + utilities/makeSemanticColors.ts
// ---------------------------------------------------------------------------

/**
 * The semantic slots that are hard-coded rather than derived from the palette.
 * Light values come from data/theming.json; the dark values are the ones the
 * research recorded in each slot's `note` ("Invariant; dark #xxxxxx"), i.e. the
 * literals makeSemanticColors picks when isInverted is true.
 */
const INVARIANT_SEMANTIC = {
  errorText: { light: '#a4262c', dark: '#F1707B' },
  messageText: { light: '#323130', dark: '#F3F2F1' },
  messageLink: { light: '#005A9E', dark: '#6CB8F6' },
  messageLinkHovered: { light: '#004578', dark: '#82C7FF' },
  infoBackground: { light: '#f3f2f1', dark: '#323130' },
  infoIcon: { light: '#605e5c', dark: '#C8C6C4' },
  errorBackground: { light: '#FDE7E9', dark: '#442726' },
  errorIcon: { light: '#A80000', dark: '#F1707B' },
  blockingBackground: { light: '#FDE7E9', dark: '#442726' },
  // Shipped bug: identical to blockingBackground, so the icon is invisible.
  // Reproduced for fidelity; auditV8Theme reports it.
  blockingIcon: { light: '#FDE7E9', dark: '#442726' },
  warningBackground: { light: '#FFF4CE', dark: '#433519' },
  // Unusual but shipped: grey, not amber.
  warningIcon: { light: '#797775', dark: '#C8C6C4' },
  severeWarningBackground: { light: '#FED9CC', dark: '#4F2A0F' },
  severeWarningIcon: { light: '#D83B01', dark: '#FCE100' },
  successBackground: { light: '#DFF6DD', dark: '#393D1B' },
  successIcon: { light: '#107C10', dark: '#92C353' },
  // Deprecated trio, still emitted because ITheme still declares them.
  warningHighlight: { light: '#ffb900', dark: '#fff100' },
  warningText: { light: '#323130', dark: '#F3F2F1' },
  successText: { light: '#107C10', dark: '#92c353' },
  // Literal keyword in both schemes, not a colour.
  primaryButtonBorder: { light: 'transparent', dark: 'transparent' },
};

/** Slots whose value comes from effects rather than from the palette. */
const EFFECT_BACKED_SEMANTIC = {
  cardShadow: 'elevation4',
  cardShadowHovered: 'elevation8',
};

export const DEPRECATED_SEMANTIC_SLOTS = SEMANTIC_SLOTS.filter((s) =>
  /DEPRECATED/i.test(DATA.semanticColors[s].note || '')
);

/**
 * `makeSemanticColors(palette, effects, overrides, isInverted)`.
 *
 * Driven by the verified `derivesFrom` table rather than a hand-copied switch,
 * so all 103 slots are covered and none can silently drift.
 */
export function makeSemanticColors(palette, effects, overrides, isInverted = false) {
  const out = {};
  for (const slot of SEMANTIC_SLOTS) {
    const spec = DATA.semanticColors[slot];
    if (spec.derivesFrom) {
      const value = palette[spec.derivesFrom];
      if (value === undefined) {
        throw new V8ThemeError(
          `palette slot "${spec.derivesFrom}" is missing but semanticColors.${slot} derives from it`
        );
      }
      out[slot] = value;
    } else if (EFFECT_BACKED_SEMANTIC[slot]) {
      out[slot] = effects[EFFECT_BACKED_SEMANTIC[slot]];
    } else if (INVARIANT_SEMANTIC[slot]) {
      out[slot] = isInverted ? INVARIANT_SEMANTIC[slot].dark : INVARIANT_SEMANTIC[slot].light;
    } else {
      throw new V8ThemeError(`no derivation recorded for semanticColors.${slot}`);
    }
  }

  // Second pass: on an inverted theme the hover shadow becomes a hairline
  // border instead of a drop shadow, because shadows read as noise on dark.
  if (isInverted) out.cardShadowHovered = '0 0 1px ' + out.variantBorderHovered;

  // User overrides win last, matching mergeThemes' precedence.
  return { ...out, ...(overrides || {}) };
}

/**
 * `createTheme(partial)`: fill from the defaults, then layer the partial on top,
 * then recompute semanticColors from the merged palette.
 *
 * The upstream pitfall this deliberately avoids: mergeThemes recomputes
 * semanticColors from `partial.palette` ONLY, so a partial palette leaves
 * unmapped semantics on default blue. Here the palette is always completed from
 * DefaultPalette first, and the completion is reported.
 */
export function createV8Theme(partial = {}) {
  if (partial === null || typeof partial !== 'object') {
    throw new V8ThemeError('createV8Theme expects an object');
  }
  const supplied = partial.palette || {};
  const unknown = Object.keys(supplied).filter((k) => !PALETTE_SLOTS.includes(k));
  if (unknown.length) {
    throw new V8ThemeError(`unknown palette slot(s): ${unknown.join(', ')}`);
  }
  const unknownSemantic = Object.keys(partial.semanticColors || {}).filter(
    (k) => !SEMANTIC_SLOTS.includes(k)
  );
  if (unknownSemantic.length) {
    throw new V8ThemeError(`unknown semanticColors slot(s): ${unknownSemantic.join(', ')}`);
  }

  const palette = { ...defaultPalette(), ...supplied };
  const filledFromDefault = PALETTE_SLOTS.filter((s) => supplied[s] === undefined);

  // createTheme: "if palette.themePrimary is set without palette.accent, accent
  // is auto-set to themePrimary".
  let accentDerivedFromPrimary = false;
  if (supplied.themePrimary !== undefined && supplied.accent === undefined) {
    palette.accent = supplied.themePrimary;
    accentDerivedFromPrimary = true;
  }

  const isInverted = partial.isInverted === true;
  const effects = { ...defaultEffects(), ...(partial.effects || {}) };
  const fonts = { ...defaultFonts(), ...(partial.fonts || {}) };
  const spacing = { ...defaultSpacing(), ...(partial.spacing || {}) };
  const semanticColors = makeSemanticColors(palette, effects, partial.semanticColors, isInverted);

  return {
    palette,
    semanticColors,
    fonts,
    fontWeights: defaultFontWeights(),
    effects,
    spacing,
    isInverted,
    disableGlobalClassNames: partial.disableGlobalClassNames === true,
    meta: {
      generator: 'scripts/v8',
      verifiedVersions: DATA.meta.verifiedVersions,
      filledFromDefaultPalette: filledFromDefault,
      accentDerivedFromPrimary,
    },
  };
}

// ---------------------------------------------------------------------------
// generateV8Theme
// ---------------------------------------------------------------------------

/**
 * Reproduce the official theming-designer recipe:
 *   themeRulesStandardCreator -> insureSlots(false) -> setSlot(base, colour,
 *   overwriteCustomColor=true) -> getThemeAsJson -> createTheme.
 *
 * @param {object}  [opts]
 * @param {string}  [opts.primaryColor]     brand hex; omit to keep DefaultPalette's theme ramp
 * @param {string}  [opts.textColor]        foreground hex; omit to keep the tuned neutrals
 * @param {string}  [opts.backgroundColor]  background hex; omit to keep the tuned neutrals
 * @param {boolean} [opts.isInverted]       defaults to isDark(backgroundColor)
 */
export function generateV8Theme(opts = {}) {
  if (opts === null || typeof opts !== 'object') {
    throw new V8ThemeError('generateV8Theme expects an object');
  }
  const { primaryColor, textColor, backgroundColor } = opts;

  const primary = primaryColor === undefined ? null : parseColor(primaryColor, 'primaryColor');
  const foreground = textColor === undefined ? null : parseColor(textColor, 'textColor');
  const background =
    backgroundColor === undefined ? null : parseColor(backgroundColor, 'backgroundColor');

  const isInverted =
    typeof opts.isInverted === 'boolean'
      ? opts.isInverted
      : background
        ? isDark(background)
        : false;

  const rules = createThemeRules();
  // Order is irrelevant: the three base slots own disjoint sets of fabric slots.
  if (primary) setBaseSlot(rules, 'primaryColor', primary, isInverted);
  if (background) setBaseSlot(rules, 'backgroundColor', background, isInverted);
  if (foreground) setBaseSlot(rules, 'foregroundColor', foreground, isInverted);

  const generated = getThemeAsJson(rules);
  const theme = createV8Theme({ palette: generated, isInverted });

  const warnings = [];
  if (primary) {
    // The single most surprising behaviour: the generated ramp is NOT
    // DefaultPalette even for #0078d4, because DefaultPalette is hand-tuned.
    const drift = FABRIC_SLOT_RULES.map(([name]) => name).filter(
      (name) =>
        generated[name].toLowerCase() !== String(DATA.palette[name].light || '').toLowerCase()
    );
    if (primaryColor.toLowerCase() === BASE_SLOT_DEFAULTS.primaryColor && drift.length) {
      warnings.push(
        `generating from ${BASE_SLOT_DEFAULTS.primaryColor} does not reproduce DefaultPalette: ` +
          `${drift.join(', ')} differ because DefaultPalette is hand-tuned, not generated. ` +
          `Call generateV8Theme() with no primaryColor to get DefaultPalette exactly.`
      );
    }
  }
  if (isInverted && !background) {
    warnings.push(
      'isInverted:true on its own does not invert the palette - createTheme returns the same light ' +
        'neutrals and only the ~20 invariant semantic slots change. Supply backgroundColor and ' +
        'textColor for a real dark theme.'
    );
  }
  if (isInverted) {
    warnings.push(
      'Microsoft\u2019s own dark sample also overrides 13 semanticColors and 15 component styles, ' +
        'so palette + isInverted alone is not a finished dark theme.'
    );
  }
  const untouchedStatus = PALETTE_SLOTS.filter(
    (s) => !FABRIC_SLOT_RULES.some(([name]) => name === s)
  );
  if (primary || background || foreground) {
    warnings.push(
      `${untouchedStatus.length} palette slots are never generated (accent, the translucents and ` +
        `the 24 status colours) and fall back to DefaultPalette, exactly as the official designer does.`
    );
  }

  return {
    theme,
    baseColors: {
      primaryColor: primary ? `#${primary.hex}` : BASE_SLOT_DEFAULTS.primaryColor,
      backgroundColor: background ? `#${background.hex}` : BASE_SLOT_DEFAULTS.backgroundColor,
      foregroundColor: foreground ? `#${foreground.hex}` : BASE_SLOT_DEFAULTS.foregroundColor,
      isInverted,
    },
    generatedSlots: generated,
    warnings,
  };
}

// ---------------------------------------------------------------------------
// v8 -> v9
// ---------------------------------------------------------------------------

/**
 * v9 BrandVariants stops. Positions 40/60/70/80 are the ones a v8 theme can
 * anchor, via the four high-confidence paletteToV9 rows
 * (themeDarker->colorBrandBackgroundPressed, themeDark->...Selected,
 * themeDarkAlt->...Hover, themePrimary->colorBrandBackground) read back through
 * createLightTheme's brand[] indices.
 *
 * The research lists "v9 brand ramp positional mapping" under `unverified`, so
 * every stop is tagged and the whole ramp is reported as inferred.
 */
export const V9_BRAND_STOPS = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120, 130, 140, 150, 160];

const V9_BRAND_ANCHORS = { 80: 'themePrimary', 70: 'themeDarkAlt', 60: 'themeDark', 40: 'themeDarker' };

// Extrapolation ends for the stops no v8 slot can reach. v9 ramps run dark->light.
const RAMP_MIN_LIGHTNESS = 4;
const RAMP_MAX_LIGHTNESS = 96;

/**
 * Build the 16-stop ramp: place the four anchors, then walk HSL lightness
 * linearly between them, extrapolating to near-black at stop 10 and near-white
 * at stop 160. Hue and saturation are carried from themePrimary so the ramp
 * stays one family.
 */
export function buildV9BrandRamp(palette) {
  const anchors = [];
  for (const stop of V9_BRAND_STOPS) {
    const slot = V9_BRAND_ANCHORS[stop];
    if (!slot) continue;
    const value = palette[slot];
    const c = value && tryParseColor(value);
    if (c) anchors.push({ stop, color: c, lightness: hsv2hsl(c.h, c.s, c.v).l, slot });
  }
  if (!anchors.length) {
    throw new V8ThemeError('cannot build a v9 brand ramp: palette has no themePrimary/theme* slots');
  }
  anchors.sort((a, b) => a.stop - b.stop);

  const primary = tryParseColor(palette.themePrimary) || anchors[anchors.length - 1].color;
  const first = anchors[0];
  const last = anchors[anchors.length - 1];
  const ends = [
    { stop: V9_BRAND_STOPS[0], lightness: Math.min(RAMP_MIN_LIGHTNESS, first.lightness) },
    {
      stop: V9_BRAND_STOPS[V9_BRAND_STOPS.length - 1],
      lightness: Math.max(RAMP_MAX_LIGHTNESS, last.lightness),
    },
  ];
  const knots = [ends[0], ...anchors, ends[1]].filter(
    (k, i, arr) => arr.findIndex((o) => o.stop === k.stop) === i
  );
  knots.sort((a, b) => a.stop - b.stop);

  const ramp = {};
  const provenance = {};
  for (const stop of V9_BRAND_STOPS) {
    const anchor = anchors.find((a) => a.stop === stop);
    if (anchor) {
      ramp[stop] = `#${anchor.color.hex}`;
      provenance[stop] = { source: 'v8-anchor', from: anchor.slot, confidence: 'inferred-position' };
      continue;
    }
    let lo = knots[0];
    let hi = knots[knots.length - 1];
    for (const k of knots) {
      if (k.stop <= stop) lo = k;
      if (k.stop >= stop) {
        hi = k;
        break;
      }
    }
    const span = hi.stop - lo.stop || 1;
    const t = (stop - lo.stop) / span;
    const l = lo.lightness + (hi.lightness - lo.lightness) * t;
    const hsv = hsl2hsv(primary.h, hsv2hsl(primary.h, primary.s, primary.v).s, l);
    const rgb = hsv2rgb(hsv.h, hsv.s, hsv.v);
    ramp[stop] = `#${rgb2hex(rgb.r, rgb.g, rgb.b)}`;
    provenance[stop] = { source: 'interpolated', from: null, confidence: 'inferred' };
  }
  return { ramp, provenance };
}

const LOSSY_CONFIDENCE = new Set(['medium', 'low']);

// Two v8 slots often map to one v9 token. Resolve by how well-evidenced the
// mapping is, then by specificity (a semanticColors slot describes a use, a
// palette slot only a colour), then by order so the result is stable.
const CONFIDENCE_RANK = { high: 3, medium: 2, low: 1 };
const KIND_RANK = { semanticColors: 1, palette: 0 };
const claimScore = (kind, confidence) =>
  (CONFIDENCE_RANK[confidence] || 0) * 10 + (KIND_RANK[kind] || 0);

/**
 * Convert a v8 theme to a v9 brand ramp plus token overrides.
 *
 * Nothing is dropped silently: every slot that has no v9 token, that maps at
 * less than high confidence, that collides with another slot on the same token,
 * or that carries a non-colour value ends up in `lossy` with a reason.
 */
export function v8ThemeToV9({ theme } = {}) {
  if (!theme || typeof theme !== 'object') {
    throw new V8ThemeError('v8ThemeToV9 expects { theme }');
  }
  const palette = theme.palette || {};
  const semanticColors = theme.semanticColors || {};
  if (!Object.keys(palette).length) {
    throw new V8ThemeError('v8ThemeToV9: theme.palette is empty - nothing to convert');
  }

  const tokens = {};
  const lossyBySlot = new Map();
  const conflicts = [];
  const owners = new Map();

  /** One entry per slot; a slot can be lossy for more than one reason. */
  const flag = (kind, slot, entry, reason) => {
    const key = `${kind}.${slot}`;
    const existing = lossyBySlot.get(key);
    if (existing) {
      existing.reasons.push(reason);
      existing.reason = existing.reasons.join('; ');
      return;
    }
    lossyBySlot.set(key, { kind, slot, ...entry, reasons: [reason], reason });
  };

  const record = (kind, slot, value, mapping) => {
    if (value === undefined || value === null) {
      flag(kind, slot, { v9Token: null }, 'slot absent from the source theme');
      return;
    }
    const token = mapping ? mapping.v9Token : null;
    const confidence = mapping ? mapping.confidence : 'low';
    if (!token) {
      flag(kind, slot, { value, v9Token: null, confidence }, 'no v9 token equivalent');
      return;
    }
    const parsed = tryParseColor(value);
    if (!parsed) {
      // Shadows and the `transparent` keyword are not colours at all; a v9
      // colour token cannot hold them.
      flag(
        kind,
        slot,
        { value, v9Token: token, confidence },
        'value is not a colour (shadow or CSS keyword) - set the v9 token by hand'
      );
      return;
    }
    if (parsed.a !== 100) {
      // Most v9 colour tokens are opaque hex; the alpha survives only if the
      // consuming token is one of the few alpha-aware ones.
      flag(
        kind,
        slot,
        { value, v9Token: token, confidence },
        'value is translucent - confirm the v9 token accepts an rgba value'
      );
    }
    const prior = owners.get(token);
    const claim = { kind, slot, value, confidence, score: claimScore(kind, confidence) };
    if (prior && prior.value.toLowerCase() !== String(value).toLowerCase()) {
      // Ties keep the incumbent, so the output does not depend on iteration order.
      const winner = claim.score > prior.score ? claim : prior;
      const loser = winner === claim ? prior : claim;
      conflicts.push({
        v9Token: token,
        winner: `${winner.kind}.${winner.slot}`,
        winnerValue: winner.value,
        winnerConfidence: winner.confidence,
        loser: `${loser.kind}.${loser.slot}`,
        loserValue: loser.value,
        loserConfidence: loser.confidence,
      });
      flag(
        loser.kind,
        loser.slot,
        { value: loser.value, v9Token: token, confidence: loser.confidence },
        `collides with ${winner.kind}.${winner.slot} on the same v9 token; that value won`
      );
      tokens[token] = winner.value;
      owners.set(token, winner);
      return;
    }
    tokens[token] = value;
    owners.set(token, claim);
    if (LOSSY_CONFIDENCE.has(confidence)) {
      flag(
        kind,
        slot,
        { value, v9Token: token, confidence },
        `mapping confidence is ${confidence} - review before shipping`
      );
    }
  };

  for (const slot of PALETTE_SLOTS) record('palette', slot, palette[slot], DATA.paletteToV9[slot]);
  for (const slot of SEMANTIC_SLOTS) {
    record('semanticColors', slot, semanticColors[slot], DATA.semanticToV9[slot]);
  }

  const { ramp, provenance } = buildV9BrandRamp(palette);

  // Things v9 has no concept of at all, straight from the research.
  const structural = DATA.unmappable.v8ToV9.filter(
    (s) => !PALETTE_SLOTS.includes(s) && !SEMANTIC_SLOTS.includes(s)
  );
  for (const key of structural) {
    if (theme[key] !== undefined || key.startsWith('fontWeights.')) {
      flag(
        'theme',
        key,
        { v9Token: null, confidence: 'low' },
        'no v9 equivalent (research: unmappable.v8ToV9)'
      );
    }
  }

  const lossy = [...lossyBySlot.values()];

  return {
    brandRamp: ramp,
    brandRampProvenance: provenance,
    tokenOverrides: tokens,
    isInverted: theme.isInverted === true,
    lossy,
    conflicts,
    summary: {
      paletteSlots: PALETTE_SLOTS.length,
      semanticSlots: SEMANTIC_SLOTS.length,
      tokensProduced: Object.keys(tokens).length,
      lossyCount: lossy.length,
      byConfidence: countBy(lossy, (l) => l.confidence || 'n/a'),
    },
    warnings: [
      'The v9 brand ramp positions are INFERRED. The research lists "v9 brand ramp positional ' +
        'mapping" under `unverified`; only stops 40/60/70/80 are anchored to real v8 slots and the ' +
        'other twelve are interpolated. Compare against a real BrandVariants before shipping.',
      'v9 resolves hover/pressed/selected from the ramp itself, so a token override that fights the ' +
        'ramp will look inconsistent. Prefer shipping the ramp and overriding as little as possible.',
    ],
  };
}

// ---------------------------------------------------------------------------
// v9 -> v8
// ---------------------------------------------------------------------------

/**
 * Rebuild a v8 theme from a v9 brand ramp.
 *
 * This direction is genuinely lossy. A v9 theme's neutrals are computed from
 * v9's own grey ramp, which has no v8 counterpart, and v9 has no equivalent for
 * theme.components, schemes, spacing or the 24 v8 status colours. So: take the
 * brand hue from the ramp, then let the verified v8 shade algorithm rebuild the
 * nine theme* slots, and keep DefaultPalette for everything else.
 */
export function v9ToV8Theme({ brandRamp, isInverted = false, backgroundColor, textColor } = {}) {
  if (!brandRamp) throw new V8ThemeError('v9ToV8Theme expects { brandRamp }');

  const normalized = {};
  if (Array.isArray(brandRamp)) {
    if (brandRamp.length !== V9_BRAND_STOPS.length) {
      throw new V8ThemeError(
        `brandRamp array must have ${V9_BRAND_STOPS.length} stops, got ${brandRamp.length}`
      );
    }
    V9_BRAND_STOPS.forEach((stop, i) => (normalized[stop] = brandRamp[i]));
  } else if (typeof brandRamp === 'object') {
    for (const [k, v] of Object.entries(brandRamp)) {
      const stop = Number(String(k).replace(/[^0-9]/g, ''));
      if (V9_BRAND_STOPS.includes(stop)) normalized[stop] = v;
    }
  } else {
    throw new V8ThemeError('brandRamp must be an object keyed by stop or a 16-item array');
  }

  const missing = V9_BRAND_STOPS.filter((s) => !normalized[s]);
  // Only stop 80 is load-bearing: it is the brand colour every v8 slot derives from.
  if (!normalized[80]) {
    throw new V8ThemeError(
      'brandRamp is missing stop 80, which is colorBrandBackground and the only stop v8 can treat ' +
        'as themePrimary'
    );
  }

  const primary = parseColor(normalized[80], 'brandRamp[80]');
  const generated = generateV8Theme({
    primaryColor: `#${primary.hex}`,
    backgroundColor,
    textColor,
    isInverted,
  });

  // Where the ramp supplies a stop v8 also anchors, prefer the real value over
  // the algorithmically derived one - it is the user's actual brand colour.
  const palette = { ...generated.theme.palette };
  const adopted = [];
  for (const [stop, slot] of Object.entries(V9_BRAND_ANCHORS)) {
    const value = normalized[stop];
    if (!value) continue;
    const c = tryParseColor(value);
    if (!c) continue;
    palette[slot] = `#${c.hex}`;
    adopted.push({ stop: Number(stop), slot });
  }
  const theme = createV8Theme({ palette, isInverted });

  const derivedBySlot = FABRIC_SLOT_RULES.map(([name]) => name).filter(
    (name) => !adopted.some((a) => a.slot === name)
  );

  return {
    theme,
    adoptedFromRamp: adopted.sort((a, b) => a.stop - b.stop),
    derivedFromShadeAlgorithm: derivedBySlot,
    unusedRampStops: V9_BRAND_STOPS.filter(
      (s) => normalized[s] && !Object.keys(V9_BRAND_ANCHORS).includes(String(s))
    ),
    missingRampStops: missing,
    cannotRoundTrip: {
      neutrals:
        'v9 neutrals come from v9\u2019s own grey ramp; v8 neutrals here are DefaultPalette (or the ' +
        'shade algorithm when backgroundColor/textColor are supplied), not the v9 originals.',
      statusColors:
        'The 24 v8 status colours (yellow/orange/red/magenta/purple/blue/teal/green families) plus ' +
        'accent, blackTranslucent40 and whiteTranslucent40 have no ramp source and stay at DefaultPalette.',
      tokens: DATA.unmappable.v9ToV8,
    },
    warnings: [
      'Positional meaning of the ramp stops is INFERRED (research: unverified). Only stop 80 is ' +
        'treated as load-bearing.',
      'A v8 -> v9 -> v8 round trip is not identity: the twelve interpolated stops carry no v8 ' +
        'information, and the neutrals never survive the trip.',
    ],
  };
}

// ---------------------------------------------------------------------------
// Audit
// ---------------------------------------------------------------------------

/** WCAG 2.2: 1.4.3 needs 4.5:1 for body text, 1.4.11 needs 3:1 for UI components. */
const TEXT_CONTRAST_MIN = 4.5;
const NON_TEXT_CONTRAST_MIN = 3;

/**
 * Pairs worth checking. `kind` picks the threshold; the optional fourth element
 * is a waiver, which downgrades a failure to info while still printing the
 * ratio. Three waivers exist, and each has a reason a designer can check:
 *   disabled    - WCAG 2.2 1.4.3 and 1.4.11 both exempt disabled controls
 *   decorative  - 1.4.11 exempts purely decorative graphics; Fluent's default
 *                 dividers are 1.19:1 and are not meant to be perceived as UI
 *   upstreamBug - the shipped v8 default is broken (see blockingIcon); reported
 *                 once as its own finding rather than twice
 * Without waivers the stock Microsoft theme would fail its own audit, and a
 * tool that cries wolf on the reference theme gets ignored.
 */
const CONTRAST_PAIRS = [
  ['bodyText', 'bodyBackground', 'text'],
  ['bodySubtext', 'bodyBackground', 'text'],
  ['bodyTextChecked', 'bodyBackgroundChecked', 'text'],
  ['link', 'bodyBackground', 'text'],
  ['linkHovered', 'bodyBackground', 'text'],
  ['actionLink', 'bodyBackground', 'text'],
  ['buttonText', 'buttonBackground', 'text'],
  ['buttonTextHovered', 'buttonBackgroundHovered', 'text'],
  ['buttonTextPressed', 'buttonBackgroundPressed', 'text'],
  ['primaryButtonText', 'primaryButtonBackground', 'text'],
  ['primaryButtonTextHovered', 'primaryButtonBackgroundHovered', 'text'],
  ['primaryButtonTextPressed', 'primaryButtonBackgroundPressed', 'text'],
  ['accentButtonText', 'accentButtonBackground', 'text'],
  ['inputText', 'inputBackground', 'text'],
  ['inputPlaceholderText', 'inputBackground', 'text'],
  ['inputForegroundChecked', 'inputBackgroundChecked', 'text'],
  ['menuItemText', 'menuBackground', 'text'],
  ['menuItemTextHovered', 'menuItemBackgroundHovered', 'text'],
  ['listText', 'listBackground', 'text'],
  ['messageText', 'infoBackground', 'text'],
  ['errorText', 'bodyBackground', 'text'],
  ['messageLink', 'infoBackground', 'text'],
  ['errorIcon', 'errorBackground', 'nonText'],
  ['warningIcon', 'warningBackground', 'nonText'],
  ['severeWarningIcon', 'severeWarningBackground', 'nonText'],
  ['successIcon', 'successBackground', 'nonText'],
  ['blockingIcon', 'blockingBackground', 'nonText', 'upstreamBug'],
  ['infoIcon', 'infoBackground', 'nonText'],
  ['inputBorder', 'inputBackground', 'nonText'],
  ['inputBorderHovered', 'inputBackground', 'nonText'],
  ['inputFocusBorderAlt', 'inputBackground', 'nonText'],
  ['buttonBorder', 'buttonBackground', 'nonText'],
  ['focusBorder', 'bodyBackground', 'nonText'],
  ['menuIcon', 'menuBackground', 'nonText'],
  ['bodyDivider', 'bodyBackground', 'nonText', 'decorative'],
  ['bodyFrameDivider', 'bodyFrameBackground', 'nonText', 'decorative'],
  ['menuDivider', 'menuBackground', 'nonText', 'decorative'],
  ['variantBorder', 'bodyBackground', 'nonText', 'decorative'],
  ['disabledText', 'disabledBackground', 'text', 'disabled'],
  ['disabledBodyText', 'bodyBackground', 'text', 'disabled'],
  ['disabledSubtext', 'bodyBackground', 'text', 'disabled'],
  ['buttonTextDisabled', 'buttonBackgroundDisabled', 'text', 'disabled'],
  ['primaryButtonTextDisabled', 'primaryButtonBackgroundDisabled', 'text', 'disabled'],
  ['disabledBorder', 'disabledBackground', 'nonText', 'disabled'],
];

/** Why a failing pair is not counted as an error. */
const WAIVER_REASON = {
  disabled: 'disabled states are exempt under WCAG 2.2 1.4.3 / 1.4.11',
  decorative: 'decorative divider, exempt under WCAG 2.2 1.4.11',
  upstreamBug: 'this is the shipped v8 default, reported separately as a known upstream bug',
};

function countBy(list, keyFn) {
  const out = {};
  for (const item of list) {
    const k = keyFn(item);
    out[k] = (out[k] || 0) + 1;
  }
  return out;
}

/**
 * Validate a user's existing v8 theme.
 *
 * Three questions: is it complete, is it legible, and is any value pasted in
 * rather than derived (the usual cause of a theme that half-changes when the
 * brand colour changes).
 */
export function auditV8Theme(theme) {
  if (!theme || typeof theme !== 'object') {
    throw new V8ThemeError('auditV8Theme expects a theme object');
  }
  const palette = theme.palette && typeof theme.palette === 'object' ? theme.palette : {};
  const semanticColors =
    theme.semanticColors && typeof theme.semanticColors === 'object' ? theme.semanticColors : {};
  if (!Object.keys(palette).length && !Object.keys(semanticColors).length) {
    throw new V8ThemeError(
      'theme has neither a `palette` nor a `semanticColors` object - is this a v8 theme?'
    );
  }
  const isInverted = theme.isInverted === true;

  const findings = [];
  const add = (severity, code, message, extra = {}) =>
    findings.push({ severity, code, message, ...extra });

  // --- completeness -------------------------------------------------------
  const missingPalette = PALETTE_SLOTS.filter((s) => palette[s] === undefined);
  const missingSemantic = SEMANTIC_SLOTS.filter((s) => semanticColors[s] === undefined);
  const unknownPalette = Object.keys(palette).filter((s) => !PALETTE_SLOTS.includes(s));
  const unknownSemantic = Object.keys(semanticColors).filter((s) => !SEMANTIC_SLOTS.includes(s));

  if (missingPalette.length) {
    add(
      'error',
      'palette-incomplete',
      `${missingPalette.length} of ${PALETTE_SLOTS.length} palette slots are missing. mergeThemes ` +
        `recomputes semanticColors from the supplied palette only, so the gaps stay default blue.`,
      { slots: missingPalette }
    );
  }
  if (missingSemantic.length && Object.keys(semanticColors).length) {
    add(
      'info',
      'semantic-incomplete',
      `${missingSemantic.length} of ${SEMANTIC_SLOTS.length} semanticColors are absent; createTheme ` +
        `derives them, so this is only a problem for a pre-baked theme file.`,
      { slots: missingSemantic }
    );
  }
  for (const slot of unknownPalette) {
    add('error', 'palette-unknown-slot', `palette.${slot} is not an IPalette slot`, { slot });
  }
  for (const slot of unknownSemantic) {
    add('error', 'semantic-unknown-slot', `semanticColors.${slot} is not an ISemanticColors slot`, {
      slot,
    });
  }

  // --- parseability -------------------------------------------------------
  for (const [slot, value] of Object.entries(palette)) {
    if (!PALETTE_SLOTS.includes(slot)) continue;
    if (typeof value !== 'string' || (!tryParseColor(value) && !/^rgba?\(/i.test(String(value)))) {
      add('error', 'palette-unparseable', `palette.${slot} = ${JSON.stringify(value)} is not a colour`, {
        slot,
        value,
      });
    }
  }

  // --- contrast -----------------------------------------------------------
  const contrast = [];
  for (const [fg, bg, kind, waiver] of CONTRAST_PAIRS) {
    const fgValue = semanticColors[fg];
    const bgValue = semanticColors[bg];
    if (fgValue === undefined || bgValue === undefined) continue;
    const fgColor = tryParseColor(fgValue);
    const bgColor = tryParseColor(bgValue);
    if (!fgColor || !bgColor) continue;
    const ratio = contrastRatio(fgColor, bgColor);
    const min = kind === 'text' ? TEXT_CONTRAST_MIN : NON_TEXT_CONTRAST_MIN;
    const pass = ratio >= min;
    contrast.push({
      foreground: fg,
      background: bg,
      kind,
      ratio,
      required: min,
      pass,
      waiver: waiver || null,
      exempt: !!waiver,
    });
    if (!pass) {
      add(
        waiver ? 'info' : 'error',
        waiver ? 'contrast-waived' : 'contrast-fail',
        `${fg} on ${bg} is ${ratio}:1, below the ${min}:1 WCAG 2.2 AA minimum` +
          (waiver ? ` (${WAIVER_REASON[waiver]})` : ''),
        { foreground: fg, background: bg, ratio, required: min, waiver: waiver || null }
      );
    }
  }

  // --- derived vs hardcoded ----------------------------------------------
  const overridden = [];
  const hardcoded = [];
  const paletteValues = new Map();
  for (const [slot, value] of Object.entries(palette)) {
    if (typeof value === 'string') paletteValues.set(value.toLowerCase(), slot);
  }
  for (const slot of SEMANTIC_SLOTS) {
    const value = semanticColors[slot];
    if (value === undefined) continue;
    const spec = DATA.semanticColors[slot];
    if (!spec.derivesFrom) continue;
    const expected = palette[spec.derivesFrom];
    if (expected === undefined) continue;
    if (String(value).toLowerCase() === String(expected).toLowerCase()) continue;
    const entry = { slot, value, derivesFrom: spec.derivesFrom, expected };
    if (paletteValues.has(String(value).toLowerCase())) {
      // Still a palette colour, just not the documented one - a deliberate
      // re-point, which survives a brand change.
      entry.matchesPaletteSlot = paletteValues.get(String(value).toLowerCase());
      overridden.push(entry);
      add(
        'info',
        'semantic-repointed',
        `semanticColors.${slot} uses palette.${entry.matchesPaletteSlot} instead of the documented ` +
          `palette.${spec.derivesFrom}`,
        entry
      );
    } else {
      hardcoded.push(entry);
      add(
        'warn',
        'semantic-hardcoded',
        `semanticColors.${slot} = ${value} is not any palette slot, so it will NOT change when the ` +
          `brand colour does (should derive from palette.${spec.derivesFrom} = ${expected})`,
        entry
      );
    }
  }

  // Palette theme* slots that the shade algorithm would not produce. Informational:
  // DefaultPalette itself is hand-tuned and fails this on two slots.
  const handTuned = [];
  const primary = tryParseColor(palette.themePrimary);
  if (primary) {
    const rules = createThemeRules();
    setBaseSlot(rules, 'primaryColor', primary, isInverted);
    const derived = getThemeAsJson(rules);
    for (const [name, base] of FABRIC_SLOT_RULES) {
      if (base !== 'primaryColor' || name === 'themePrimary') continue;
      const actual = palette[name];
      if (actual === undefined) continue;
      if (String(actual).toLowerCase() !== derived[name].toLowerCase()) {
        handTuned.push({ slot: name, actual, wouldGenerate: derived[name] });
      }
    }
    if (handTuned.length) {
      add(
        'info',
        'ramp-hand-tuned',
        `${handTuned.length} theme* slot(s) differ from what getShade(themePrimary) generates. ` +
          `DefaultPalette is itself hand-tuned, so this is expected for the stock theme.`,
        { slots: handTuned }
      );
    }
  }

  // --- shipped upstream quirks worth surfacing ---------------------------
  if (
    semanticColors.blockingIcon !== undefined &&
    semanticColors.blockingBackground !== undefined &&
    String(semanticColors.blockingIcon).toLowerCase() ===
      String(semanticColors.blockingBackground).toLowerCase()
  ) {
    add(
      'warn',
      'known-upstream-bug',
      'semanticColors.blockingIcon equals blockingBackground, so the blocking icon is invisible. ' +
        'This is the shipped v8 default, not something this theme introduced.',
      { slot: 'blockingIcon' }
    );
  }
  const usedDeprecated = DEPRECATED_SEMANTIC_SLOTS.filter((s) => semanticColors[s] !== undefined);
  if (usedDeprecated.length) {
    add('info', 'deprecated-slots-present', `${usedDeprecated.length} deprecated semantic slot(s) present`, {
      slots: usedDeprecated.map((s) => ({ slot: s, note: DATA.semanticColors[s].note })),
    });
  }
  if (isInverted) {
    const invertedButLight = tryParseColor(palette.white) && !isDark(palette.white);
    if (invertedButLight) {
      add(
        'error',
        'inverted-with-light-palette',
        'isInverted is true but palette.white is a light colour. isInverted alone does not invert ' +
          'the palette; supply a real inverted palette.'
      );
    }
  }

  const errors = findings.filter((f) => f.severity === 'error');
  const warnings = findings.filter((f) => f.severity === 'warn');
  return {
    ok: errors.length === 0,
    summary: {
      paletteSlotsPresent: PALETTE_SLOTS.length - missingPalette.length,
      paletteSlotsExpected: PALETTE_SLOTS.length,
      semanticSlotsPresent: SEMANTIC_SLOTS.length - missingSemantic.length,
      semanticSlotsExpected: SEMANTIC_SLOTS.length,
      contrastChecks: contrast.length,
      contrastFailures: contrast.filter((c) => !c.pass && !c.exempt).length,
      hardcodedSlots: hardcoded.length,
      repointedSlots: overridden.length,
      errors: errors.length,
      warnings: warnings.length,
      bySeverity: countBy(findings, (f) => f.severity),
    },
    missing: { palette: missingPalette, semanticColors: missingSemantic },
    contrast,
    hardcoded,
    repointed: overridden,
    handTuned,
    findings,
  };
}

// ---------------------------------------------------------------------------
// Emitters
// ---------------------------------------------------------------------------

function tsKey(key) {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key) ? key : JSON.stringify(key);
}

function tsObject(obj, indent) {
  const pad = ' '.repeat(indent);
  const inner = Object.entries(obj)
    .map(([k, v]) => `${pad}  ${tsKey(k)}: ${JSON.stringify(v)},`)
    .join('\n');
  return `{\n${inner}\n${pad}}`;
}

/**
 * A `createTheme({...})` snippet the user can paste.
 *
 * semanticColors are omitted unless asked for: createTheme derives all 103 from
 * the palette, so shipping them freezes the theme against future v8 fixes.
 */
export function toCreateThemeSnippet(theme, { includeSemanticColors = false, name = 'appTheme' } = {}) {
  const lines = [];
  lines.push(`// Generated by scripts/v8 against @fluentui/react@${DATA.meta.verifiedVersions['@fluentui/react']}.`);
  lines.push(`import { createTheme, type Theme } from '@fluentui/react';`);
  lines.push('');
  lines.push(`export const ${name}: Theme = createTheme({`);
  lines.push(`  palette: ${tsObject(theme.palette, 2)},`);
  if (includeSemanticColors) {
    lines.push(`  // Pinned on purpose. Drop this block to let createTheme derive them.`);
    lines.push(`  semanticColors: ${tsObject(theme.semanticColors, 2)},`);
  }
  lines.push(`  isInverted: ${theme.isInverted === true},`);
  lines.push('});');
  lines.push('');
  lines.push('// Usage: <ThemeProvider theme={' + name + '}>...</ThemeProvider>');
  lines.push('// Keep the theme object module-level; an inline literal re-merges on every render.');
  return lines.join('\n');
}

/** A v9 `createLightTheme(brand)` snippet from a converted ramp. */
export function toV9ThemeSnippet(conversion, { name = 'appTheme' } = {}) {
  const fn = conversion.isInverted ? 'createDarkTheme' : 'createLightTheme';
  const lines = [];
  lines.push('// Generated by scripts/v8 convert-theme.mjs.');
  lines.push('// WARNING: brand ramp stop positions are inferred, not verified. Review before shipping.');
  lines.push(`import { ${fn}, type BrandVariants, type Theme } from '@fluentui/react-components';`);
  lines.push('');
  lines.push(`export const brand: BrandVariants = ${tsObject(conversion.brandRamp, 0)};`);
  lines.push('');
  lines.push(`export const ${name}: Theme = {`);
  lines.push(`  ...${fn}(brand),`);
  const overrides = Object.entries(conversion.tokenOverrides).filter(
    ([token]) => !token.startsWith('colorBrandBackground')
  );
  if (overrides.length) {
    lines.push('  // Overrides carried across from the v8 theme. Delete any that fight the ramp.');
    for (const [token, value] of overrides) lines.push(`  ${tsKey(token)}: ${JSON.stringify(value)},`);
  }
  lines.push('};');
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// CLI helpers (same shape as scripts/pbir)
// ---------------------------------------------------------------------------

/** Minimal argv parser: --flag, --key value, --key=value, plus positionals. */
export function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) {
      out._.push(a);
      continue;
    }
    const eq = a.indexOf('=');
    if (eq > -1) {
      out[a.slice(2, eq)] = a.slice(eq + 1);
      continue;
    }
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) out[key] = true;
    else {
      out[key] = next;
      i++;
    }
  }
  return out;
}

export function fail(message) {
  process.stderr.write(`error: ${message}\n`);
  process.exit(1);
}

/** Read and parse a JSON file with a message a user can act on. */
export function readJson(path) {
  let text;
  try {
    text = readFileSync(path, 'utf8');
  } catch (err) {
    throw new V8ThemeError(`cannot read ${path}: ${err && err.code === 'ENOENT' ? 'no such file' : err.message}`);
  }
  try {
    return JSON.parse(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text);
  } catch (err) {
    throw new V8ThemeError(`${path} is not valid JSON: ${err.message}`);
  }
}
