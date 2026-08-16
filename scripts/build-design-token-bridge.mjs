#!/usr/bin/env node
/**
 * build-design-token-bridge.mjs — the design-name -> code-token bridge.
 *
 * WHY THIS EXISTS
 * ---------------
 * mcp/data/design-guidance.json carries Microsoft's *design-site* names
 * ("Large" corner radius, "size120" spacing, "Body 1" text). mcp/data/
 * fluent-tokens.json carries the *code* names shipped by @fluentui/react-theme
 * (borderRadiusLarge, spacingHorizontalM, fontSizeBase300). Nothing connected
 * them, and the two radius scales are OFFSET BY ONE STEP:
 *
 *     design "Large"   = 8px  ->  code borderRadiusLarge  = 6px   (WRONG)
 *                                 code borderRadiusXLarge = 8px   (right)
 *
 * An agent that read the guidance and wrote tokens.borderRadiusLarge got 6px
 * and no error. So every mapping here is matched BY VALUE, never by name, and
 * every row where the design name and the code name disagree is flagged.
 *
 * WHAT IT WRITES (idempotent — safe to re-run)
 *   mcp/data/fluent-tokens.json    -> designNameBridge  (the machine-readable
 *                                     index both tools resolve against)
 *   mcp/data/design-guidance.json  -> per-row codeToken/codeValue/valueMatch/
 *                                     nameCollisionWarning on the shapes,
 *                                     layout, typography, color and
 *                                     accessibility topics, plus the two
 *                                     get-started topics.
 *
 * Both files are CRLF with the trailing-newline convention each one already
 * uses; writeData() preserves that byte-for-byte.
 *
 * Run:  node scripts/build-design-token-bridge.mjs [--check]
 *       --check  computes everything and reports, but writes nothing.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const TOKENS_PATH = join(ROOT, 'mcp', 'data', 'fluent-tokens.json');
const GUIDANCE_PATH = join(ROOT, 'mcp', 'data', 'design-guidance.json');
const CHECK_ONLY = process.argv.includes('--check');

const CAPTURED_AT = '2026-08-16';
const SHAPES_URL = 'https://fluent2.microsoft.design/shapes';
const LAYOUT_URL = 'https://fluent2.microsoft.design/layout';
const TYPE_URL = 'https://fluent2.microsoft.design/typography';
const COLOR_URL = 'https://fluent2.microsoft.design/color';
const A11Y_URL = 'https://fluent2.microsoft.design/accessibility';

const problems = [];
const fail = (m) => problems.push(m);

// ---------------------------------------------------------------------------
// IO that preserves each file's existing byte convention.
// ---------------------------------------------------------------------------
function readData(path) {
  const raw = readFileSync(path, 'utf8');
  return { raw, json: JSON.parse(raw), trailingNewline: /\r?\n$/.test(raw) };
}

function writeData(path, json, trailingNewline) {
  const body = JSON.stringify(json, null, 2).split('\n').join('\r\n') + (trailingNewline ? '\r\n' : '');
  if (CHECK_ONLY) return body.length;
  writeFileSync(path, body, 'utf8');
  return body.length;
}

// ---------------------------------------------------------------------------
// Value helpers. Everything is matched on the NUMBER, not the string.
// ---------------------------------------------------------------------------

/** "8 pixels" | "8px" | 8 | "0" -> 8 ; anything non-px (e.g. "50%") -> null. */
function px(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string') return null;
  const s = value.trim();
  if (s === '0') return 0;
  const m = /^(-?\d+(?:\.\d+)?)\s*(px|pixel|pixels|pt|dp)?$/i.exec(s);
  if (!m) return null;
  if (m[2] && !/^(px|pixel|pixels)$/i.test(m[2])) return null;
  return Number(m[1]);
}

/** Every key at every depth of a token subtree — leaves AND group keys. */
function allKeys(node, out = new Set()) {
  if (!node || typeof node !== 'object') return out;
  for (const [k, v] of Object.entries(node)) {
    out.add(k);
    if (v && typeof v === 'object' && !Array.isArray(v)) allKeys(v, out);
  }
  return out;
}

/** Find the token in `map` whose value is exactly `wantPx` pixels. */
function tokenByPx(map, wantPx) {
  const hits = Object.entries(map).filter(([, v]) => px(v) === wantPx);
  if (!hits.length) return null;
  hits.sort((a, b) => a[0].length - b[0].length);
  return { token: hits[0][0], value: hits[0][1] };
}

const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '');

/** "Caption 2 Strong" -> "caption2Strong" — the code ramp's own key convention. */
function camelKey(name) {
  const parts = String(name).split(/[\s\-_]+/).filter(Boolean);
  return parts
    .map((p, i) => (i === 0 ? p.toLowerCase() : p[0].toUpperCase() + p.slice(1)))
    .join('');
}

/** PascalCase a design name so it can be compared with a code token suffix. */
function pascal(name) {
  return String(name)
    .split(/[\s\-_]+/)
    .filter(Boolean)
    .map((p) => (/^[A-Z0-9]+$/.test(p) ? p : p[0].toUpperCase() + p.slice(1)))
    .join('');
}

// ---------------------------------------------------------------------------
// Load.
// ---------------------------------------------------------------------------
const tokensFile = readData(TOKENS_PATH);
const guidanceFile = readData(GUIDANCE_PATH);
const T = tokensFile.json;
const G = guidanceFile.json;

const TOKEN_KEYS = allKeys({
  typography: T.typography,
  spacing: T.spacing,
  borderRadius: T.borderRadius,
  strokeWidth: T.strokeWidth,
  shadow: T.shadow,
  motion: T.motion,
});
for (const k of Object.keys(T.color.semanticLight)) TOKEN_KEYS.add(k);

const colorLight = T.color.semanticLight;
const requireColor = (name) => {
  if (!(name in colorLight)) fail(`color token does not exist: ${name}`);
  return name;
};
const colorFamily = (prefix) => {
  const list = Object.keys(colorLight).filter((k) => k.startsWith(prefix));
  if (!list.length) fail(`no colour tokens start with ${prefix}`);
  return list;
};

const entries = [];
const addEntry = (e) => {
  entries.push(e);
  return e;
};

// ===========================================================================
// 1. CORNER RADIUS — the offset that started all of this.
// ===========================================================================
const radiusRows = G.topics.shapes.values.cornerRadius;
const radiusEnrichment = new Map();

for (const row of radiusRows) {
  const wantPx = px(row.value);
  const expected = 'borderRadius' + pascal(row.token);
  const expectedExists = TOKEN_KEYS.has(expected);
  let codeToken = null;
  let codeValue = null;
  let valueMatch = 'none';
  let reason;

  if (wantPx !== null) {
    const hit = tokenByPx(T.borderRadius, wantPx);
    if (hit) {
      codeToken = hit.token;
      codeValue = hit.value;
      valueMatch = 'exact';
    } else {
      reason = `No borderRadius token in @fluentui/react-theme has the value ${wantPx}px.`;
    }
  } else if (/^50\s*%$/.test(String(row.value))) {
    // 50% and 10000px are different numbers that produce the same shape. Saying
    // "exact" here would be a lie the value check would catch anyway.
    codeToken = 'borderRadiusCircular';
    codeValue = T.borderRadius.borderRadiusCircular;
    valueMatch = 'equivalent';
    reason =
      'The site states 50%; the code token is a 10000px radius, which clamps to a full round on any realistic ' +
      'box. Same rendered shape, different literal — do not treat 10000px and 50% as interchangeable numbers.';
  } else {
    reason = `Design value "${row.value}" is not a pixel value and has no borderRadius token.`;
  }

  const nameCollision = !!codeToken && codeToken !== expected;
  const trap = nameCollision && expectedExists;
  const expectedValue = expectedExists ? T.borderRadius[expected] : null;
  const warning = !nameCollision
    ? undefined
    : trap
      ? `NAME COLLISION: the design site calls this "${row.token}" (${row.value}), but tokens.${expected} exists and is ` +
        `${expectedValue} — a different step. Writing tokens.${expected} compiles and silently renders ${expectedValue}. ` +
        `The token that actually yields ${row.value} is tokens.${codeToken}.`
      : `The design name "${row.token}" is not the code name: use tokens.${codeToken}. There is no tokens.${expected}.`;

  const e = {
    id: `cornerRadius:${row.token}`,
    topic: 'shapes',
    kind: 'cornerRadius',
    designName: row.token,
    designLabel: `${row.token} corner radius`,
    designValue: row.value,
    designUsage: row.usage,
    codeToken,
    codeValue,
    valueMatch,
    ...(reason ? { reason } : {}),
    nameCollision,
    ...(nameCollision
      ? {
          collisionSeverity: trap ? 'silent-value-trap' : 'naming-only',
          expectedCodeName: expected,
          ...(expectedExists ? { expectedCodeNameActualValue: expectedValue } : { expectedCodeNameExists: false }),
          warning,
        }
      : {}),
    ...(codeToken ? { griffel: `tokens.${codeToken}`, cssVar: `--${codeToken}` } : {}),
    lookupKeys: [
      `${row.token} corner radius`,
      `corner radius ${row.token}`,
      `${row.token} radius`,
      `borderRadius${pascal(row.token)}`,
      row.token,
      ...(wantPx !== null ? [`${wantPx}px corner radius`, `${wantPx}px radius`] : []),
    ],
    docUrl: SHAPES_URL,
  };
  addEntry(e);
  radiusEnrichment.set(row.token, e);
}

const radiusOrphans = Object.entries(T.borderRadius)
  .filter(([name]) => ![...radiusEnrichment.values()].some((e) => e.codeToken === name))
  .map(([name, value]) => ({ codeToken: name, value }));

// ===========================================================================
// 2. STROKE THICKNESS — the scale that lines up. Mapped anyway so the tools
//    can prove alignment instead of leaving the caller to assume it.
// ===========================================================================
const strokeRows = G.topics.shapes.values.strokeThickness;
const strokeEnrichment = new Map();

for (const row of strokeRows) {
  const wantPx = px(row.web);
  const expected = 'strokeWidth' + pascal(row.token);
  const hit = wantPx === null ? null : tokenByPx(T.strokeWidth, wantPx);
  const mobilePx = px(row.mobile);
  const mobileDiffers = mobilePx !== null && mobilePx !== wantPx;

  const e = {
    id: `strokeWidth:${row.token}`,
    topic: 'shapes',
    kind: 'strokeWidth',
    designName: row.token,
    designLabel: `${row.token} stroke`,
    designValue: row.web,
    designValuePlatform: 'web',
    ...(mobileDiffers
      ? {
          mobileDesignValue: row.mobile,
          mobileNote:
            `The site publishes ${row.mobile} for mobile and ${row.web} for web. This mapping is the WEB value; ` +
            'mcp/data/fluent-tokens.json is the web (v9) token set. For iOS/Android use fluent_native_component.',
        }
      : {}),
    codeToken: hit ? hit.token : null,
    codeValue: hit ? hit.value : null,
    valueMatch: hit ? 'exact' : 'none',
    ...(hit ? {} : { reason: `No strokeWidth token has the value ${row.web}.` }),
    nameCollision: !!hit && hit.token !== expected,
    ...(hit ? { griffel: `tokens.${hit.token}`, cssVar: `--${hit.token}` } : {}),
    lookupKeys: [`${row.token} stroke`, `stroke ${row.token}`, `${row.token} stroke width`, expected],
    docUrl: SHAPES_URL,
  };
  addEntry(e);
  strokeEnrichment.set(row.token, e);
}

// ===========================================================================
// 3. SPACING — sizeNNN does not exist in code at all.
// ===========================================================================
const spacingRows = G.topics.layout.values.spacingRamp;
const spacingEnrichment = new Map();

for (const row of spacingRows) {
  const wantPx = px(row.px);
  const h = wantPx === null ? null : tokenByPx(T.spacing.horizontal, wantPx);
  const v = wantPx === null ? null : tokenByPx(T.spacing.vertical, wantPx);

  const e = {
    id: `spacing:${row.token}`,
    topic: 'layout',
    kind: 'spacing',
    designName: row.token,
    designLabel: `${row.token} (${wantPx}px spacing)`,
    designValue: `${wantPx}px`,
    designPx: wantPx,
    codeToken: h ? h.token : null,
    codeTokens: h && v ? { horizontal: h.token, vertical: v.token } : undefined,
    codeValue: h ? h.value : null,
    valueMatch: h ? 'exact' : 'none',
    ...(h
      ? {}
      : {
          reason:
            `No spacing token in @fluentui/react-theme has the value ${wantPx}px. The code ramp is ` +
            '0/2/4/6/8/10/12/16/20/24/32px (None, XXS, XS, SNudge, S, MNudge, M, L, XL, XXL, XXXL) and stops at 32px — ' +
            `${row.token} has no code equivalent. Use a raw ${wantPx}px value and say so, or pick an adjacent step ` +
            'deliberately; do not invent a token name.',
        }),
    // Every sizeNNN name collides: none of them exist as tokens.
    nameCollision: true,
    collisionSeverity: 'does-not-compile',
    expectedCodeName: row.token,
    expectedCodeNameExists: false,
    warning:
      `"${row.token}" is a design-language / Figma variable name, not a Griffel token. tokens.${row.token} does not ` +
      'exist and --' + row.token + ' is never emitted by FluentProvider' +
      (h ? `. The ${wantPx}px code tokens are tokens.${h.token} and tokens.${v.token}.` : '.'),
    ...(h ? { griffel: `tokens.${h.token}`, cssVar: `--${h.token}` } : {}),
    lookupKeys: [
      row.token,
      `${row.token} spacing`,
      ...(wantPx !== null
        ? [`${wantPx}px spacing`, `${wantPx}px horizontal spacing`, `${wantPx}px vertical spacing`, `spacing ${wantPx}px`]
        : []),
    ],
    docUrl: LAYOUT_URL,
  };
  for (const k of Object.keys(e)) if (e[k] === undefined) delete e[k];
  addEntry(e);
  spacingEnrichment.set(row.token, e);
}

const spacingOrphans = Object.entries(T.spacing.horizontal)
  .filter(([name]) => ![...spacingEnrichment.values()].some((e) => e.codeToken === name))
  .map(([name, value]) => ({ codeToken: name, value }));

// ===========================================================================
// 4. TYPE RAMP (web) — connect to the ramp + the three token families.
// ===========================================================================
const WEIGHT_BY_NAME = { Regular: 400, Semibold: 600, Bold: 700, Medium: 500 };
const typeRows = G.topics.typography.values.typeRamp.web;
const typeEnrichment = new Map();

const byValue = (map, wanted) => {
  const hit = Object.entries(map).find(([, v]) => String(v) === String(wanted) || px(v) === px(wanted));
  return hit ? hit[0] : null;
};

for (const row of typeRows) {
  const rampKey = camelKey(row.name);
  const ramp = T.typography.ramp[rampKey];
  const weight = WEIGHT_BY_NAME[row.weight] ?? null;
  const fontSizeToken = byValue(T.typography.fontSizes, row.size);
  const lineHeightToken = byValue(T.typography.lineHeights, row.lineHeight);
  const fontWeightToken =
    weight === null ? null : Object.entries(T.typography.fontWeights).find(([, v]) => v === weight)?.[0] ?? null;

  if (!ramp) fail(`type ramp step "${row.name}" has no code ramp key (tried ${rampKey})`);

  const mismatches = {};
  if (ramp && px(ramp.fontSize) !== px(row.size)) {
    mismatches.fontSize = { design: row.size, code: ramp.fontSize, codeToken: fontSizeToken };
  }
  if (ramp && px(ramp.lineHeight) !== px(row.lineHeight)) {
    mismatches.lineHeight = {
      design: row.lineHeight,
      code: ramp.lineHeight,
      codeToken: byValue(T.typography.lineHeights, ramp.lineHeight),
      note:
        `No lineHeight token has the value ${row.lineHeight}. The shipped ${rampKey} style is ${ramp.lineHeight} ` +
        '(the code package wins at runtime); the site\'s number is not reachable through a token.',
    };
  }
  if (ramp && weight !== null && ramp.fontWeight !== weight) {
    mismatches.fontWeight = { design: `${row.weight} (${weight})`, code: ramp.fontWeight, codeToken: fontWeightToken };
  }
  const hasMismatch = Object.keys(mismatches).length > 0;

  const e = {
    id: `typeRamp:${row.name}`,
    topic: 'typography',
    kind: 'typeRamp',
    designName: row.name,
    designLabel: `${row.name} (web type ramp)`,
    designValue: `${row.size} / ${row.lineHeight} / ${row.weight}`,
    codeToken: ramp ? rampKey : null,
    codeStyle: ramp ? `typographyStyles.${rampKey}` : null,
    codeTokens: {
      fontSize: fontSizeToken,
      lineHeight: hasMismatch && mismatches.lineHeight ? mismatches.lineHeight.codeToken : lineHeightToken,
      fontWeight: fontWeightToken,
    },
    codeValue: ramp ? { fontSize: ramp.fontSize, lineHeight: ramp.lineHeight, fontWeight: ramp.fontWeight } : null,
    valueMatch: !ramp ? 'none' : hasMismatch ? 'partial' : 'exact',
    ...(hasMismatch
      ? {
          mismatches,
          reason:
            `The site's published values and the shipped ${rampKey} style disagree on ` +
            `${Object.keys(mismatches).join(', ')}. Everything else matches. The npm package is what renders.`,
        }
      : {}),
    // "Body 1" -> body1 is a casing/space difference, not a different step.
    nameCollision: false,
    nameNormalization: 'spaces removed and camelCased: "' + row.name + '" -> ' + rampKey,
    usage:
      `Prefer the composed style (typographyStyles.${rampKey}, or the <Text> / <Title3> components) over pasting the ` +
      'three tokens by hand — the composed style also carries fontFamily.',
    lookupKeys: [row.name, rampKey, `${row.name} text`, `${row.name} type ramp`],
    docUrl: TYPE_URL,
  };
  addEntry(e);
  typeEnrichment.set(row.name, e);
}

const rampOrphans = Object.keys(T.typography.ramp)
  .filter((k) => ![...typeEnrichment.values()].some((e) => e.codeToken === k))
  .map((k) => ({ codeToken: k, value: T.typography.ramp[k] }));

// ===========================================================================
// 5. COLOUR — the topic named no tokens at all. Families are derived from the
//    dataset, so every name here provably exists.
// ===========================================================================
const paletteHues = [
  ...new Set(Object.keys(colorLight).map((k) => /^colorPalette([A-Z][a-z]+)/.exec(k)?.[1]).filter(Boolean)),
].sort();

const colorEntries = [
  {
    designName: 'Neutral',
    designLabel: 'Neutral palette',
    what: 'Surfaces, text and layout — the greys that ground the UI and carry component state.',
    primary: requireColor('colorNeutralBackground1'),
    representative: [
      requireColor('colorNeutralBackground1'),
      requireColor('colorNeutralBackground2'),
      requireColor('colorNeutralForeground1'),
      requireColor('colorNeutralForeground2'),
      requireColor('colorNeutralForegroundDisabled'),
      requireColor('colorNeutralStroke1'),
      requireColor('colorNeutralStrokeAccessible'),
    ],
    families: ['colorNeutralBackground*', 'colorNeutralForeground*', 'colorNeutralStroke*'],
    count: colorFamily('colorNeutral').length,
    lookupKeys: ['neutral palette', 'neutral colors', 'neutral colours', 'neutral tokens'],
  },
  {
    designName: 'Brand',
    designLabel: 'Brand palette',
    what: 'Product recognition: primary buttons, CTAs, selected states. The 16-slot brand ramp feeds these.',
    primary: requireColor('colorBrandBackground'),
    representative: [
      requireColor('colorBrandBackground'),
      requireColor('colorBrandBackgroundHover'),
      requireColor('colorBrandBackgroundPressed'),
      requireColor('colorBrandBackgroundSelected'),
      requireColor('colorBrandForeground1'),
      requireColor('colorBrandForegroundLink'),
      requireColor('colorBrandStroke1'),
      requireColor('colorNeutralForegroundOnBrand'),
      requireColor('colorCompoundBrandBackground'),
      requireColor('colorCompoundBrandForeground1'),
      requireColor('colorCompoundBrandStroke'),
    ],
    families: ['colorBrand*', 'colorCompoundBrand*'],
    count: colorFamily('colorBrand').length + colorFamily('colorCompoundBrand').length,
    note:
      'A custom brand comes from createLightTheme/createDarkTheme over a BrandVariants ramp — see ' +
      'fluent_generate_theme. Never hand-write a brand hex into a component.',
    lookupKeys: ['brand palette', 'brand colors', 'brand colours', 'brand tokens'],
  },
  {
    designName: 'Shared',
    designLabel: 'Shared palette',
    what: 'The M365-wide accent hues used by avatars, calendars and badges.',
    primary: requireColor('colorPaletteBerryBackground2'),
    representative: [
      requireColor('colorPaletteBerryBackground2'),
      requireColor('colorPaletteBerryForeground2'),
      requireColor('colorPaletteBerryBorderActive'),
    ],
    families: paletteHues.map((h) => `colorPalette${h}*`),
    hues: paletteHues,
    count: colorFamily('colorPalette').length,
    note:
      `${paletteHues.length} hue families ship as colorPalette<Hue>Background|Foreground|Border<n>. Most hues ship the ` +
      'Background2 / Foreground2 / BorderActive trio; Red, Green, Yellow, Berry, Marigold and the Dark/Light sets ship more.',
    lookupKeys: ['shared palette', 'shared colors', 'shared colours', 'accent palette'],
  },
  {
    designName: 'Semantic status',
    designLabel: 'Semantic status colours',
    what: 'Feedback and urgency: danger = red, caution = yellow, positive = green.',
    primary: requireColor('colorStatusDangerBackground3'),
    representative: [
      requireColor('colorStatusDangerBackground3'),
      requireColor('colorStatusDangerForeground1'),
      requireColor('colorStatusWarningBackground3'),
      requireColor('colorStatusWarningForeground1'),
      requireColor('colorStatusSuccessBackground3'),
      requireColor('colorStatusSuccessForeground1'),
    ],
    families: ['colorStatusDanger*', 'colorStatusWarning*', 'colorStatusSuccess*'],
    designNameToCodeName: {
      danger: 'colorStatusDanger* (red)',
      caution: 'colorStatusWarning* — the site says "caution", the code says Warning',
      positive: 'colorStatusSuccess* — the site says "positive", the code says Success',
    },
    count:
      colorFamily('colorStatusDanger').length +
      colorFamily('colorStatusWarning').length +
      colorFamily('colorStatusSuccess').length,
    nameCollision: true,
    collisionSeverity: 'naming-only',
    warning:
      'The site\'s words are danger / caution / positive; the token names are Danger / Warning / Success. ' +
      'There is no colorStatusCaution* or colorStatusPositive*.',
    note: 'Never signal status with colour alone — pair it with an icon or text (WCAG 1.4.1).',
    lookupKeys: ['semantic status', 'status colors', 'status colours', 'caution color', 'positive color', 'danger color'],
  },
  {
    designName: 'Interaction states',
    designLabel: 'Interaction state colours',
    what: 'Rest -> Hover -> Pressed / Selected darken in sequence; focus thickens the stroke instead.',
    primary: requireColor('colorNeutralBackground1Hover'),
    representative: [
      requireColor('colorNeutralBackground1Hover'),
      requireColor('colorNeutralBackground1Pressed'),
      requireColor('colorNeutralBackground1Selected'),
      requireColor('colorSubtleBackgroundHover'),
      requireColor('colorStrokeFocus1'),
      requireColor('colorStrokeFocus2'),
    ],
    families: ['*Hover', '*Pressed', '*Selected', 'colorStrokeFocus1/2'],
    count: Object.keys(colorLight).filter((k) => /(Hover|Pressed|Selected)$/.test(k)).length,
    note:
      'The state is a SUFFIX on the rest token, not a separate family: colorNeutralBackground1 -> ' +
      'colorNeutralBackground1Hover. Focus uses the two-tone colorStrokeFocus1/colorStrokeFocus2 outline.',
    lookupKeys: ['interaction states', 'hover color', 'pressed color', 'selected color', 'focus stroke'],
  },
];

for (const c of colorEntries) {
  addEntry({
    id: `color:${norm(c.designName)}`,
    topic: 'color',
    kind: 'color',
    designName: c.designName,
    designLabel: c.designLabel,
    designValue: c.what,
    codeToken: c.primary,
    codeValue: colorLight[c.primary],
    codeTokens: c.representative,
    codeTokenFamilies: c.families,
    tokenCount: c.count,
    // A palette is a family, not a single value: there is no number to match.
    valueMatch: 'family',
    reason:
      'A design-site palette name maps to a token FAMILY, not to one value. codeToken is a representative member; ' +
      'codeTokens lists the ones worth knowing and codeTokenFamilies the prefixes. Resolve exact values with ' +
      'fluent_list_tokens { category: "color" }.',
    nameCollision: !!c.nameCollision,
    ...(c.nameCollision ? { collisionSeverity: c.collisionSeverity, warning: c.warning } : {}),
    ...(c.hues ? { hues: c.hues } : {}),
    ...(c.designNameToCodeName ? { designNameToCodeName: c.designNameToCodeName } : {}),
    ...(c.note ? { note: c.note } : {}),
    griffel: `tokens.${c.primary}`,
    cssVar: `--${c.primary}`,
    lookupKeys: c.lookupKeys,
    docUrl: COLOR_URL,
  });
}

// ===========================================================================
// 6. THEMES — the accessibility topic listed four adjectives and no objects.
//    A theme is not a token, so these carry codeSymbol, not codeToken.
// ===========================================================================
const FLUENT_THEMES = ['webLightTheme', 'webDarkTheme', 'teamsLightTheme', 'teamsDarkTheme', 'teamsHighContrastTheme'];
const themeEntries = [
  {
    designName: 'light',
    codeSymbol: 'webLightTheme',
    tokenSet: 'semanticLight',
    usage: '<FluentProvider theme={webLightTheme}>',
  },
  {
    designName: 'dark',
    codeSymbol: 'webDarkTheme',
    tokenSet: 'semanticDark',
    usage: '<FluentProvider theme={webDarkTheme}>',
  },
  {
    designName: 'high-contrast',
    codeSymbol: 'teamsHighContrastTheme',
    tokenSet: 'semanticHighContrast',
    usage: '<FluentProvider theme={teamsHighContrastTheme}>',
    caution:
      'This is the only high-contrast theme upstream exports and it is the legacy Teams one. On Windows, ' +
      'browser forced-colors mode is what users actually get: ship webLightTheme/webDarkTheme and handle ' +
      '@media (forced-colors: active). Reach for teamsHighContrastTheme only when a host mirrors the Teams HC setting.',
  },
  {
    designName: 'branded',
    codeSymbol: 'createLightTheme(brandVariants) / createDarkTheme(brandVariants)',
    tokenSet: 'generated from a 16-slot BrandVariants ramp (slots 10..160, brand at 80)',
    usage: 'const light = createLightTheme(myBrand); <FluentProvider theme={light}>',
    note: 'fluent_generate_theme turns one brand hex into the ramp plus both themes.',
  },
];

for (const t of themeEntries) {
  addEntry({
    id: `theme:${t.designName}`,
    topic: 'accessibility',
    kind: 'theme',
    designName: t.designName,
    designLabel: `${t.designName} theme`,
    designValue: t.designName,
    // Deliberately null: a theme object is not a design token, and pretending
    // otherwise would break the "every codeToken exists in fluent-tokens.json"
    // invariant that makes this bridge trustworthy.
    codeToken: null,
    codeSymbol: t.codeSymbol,
    codePackage: '@fluentui/react-components',
    webComponentsPackage: '@fluentui/tokens (setTheme(...) for @fluentui/web-components v3)',
    tokenSet: t.tokenSet,
    usage: t.usage,
    valueMatch: 'symbol',
    reason:
      'A theme is an object of resolved token values, not a token, so it has no entry in fluent-tokens.json ' +
      'under a token name. The values it resolves to are ' +
      (t.tokenSet.startsWith('semantic') ? `mcp/data/fluent-tokens.json -> color.${t.tokenSet}.` : 'generated at runtime.'),
    nameCollision: true,
    collisionSeverity: 'naming-only',
    warning:
      `The design site calls this "${t.designName}"; the exported symbol is ${t.codeSymbol}. ` +
      'There is no theme named "light"/"dark"/"high-contrast"/"branded" in the package.',
    ...(t.caution ? { caution: t.caution } : {}),
    ...(t.note ? { note: t.note } : {}),
    allThemeExports: FLUENT_THEMES,
    lookupKeys: [
      `${t.designName} theme`,
      `theme ${t.designName}`,
      t.designName === 'high-contrast' ? 'high contrast theme' : `${t.designName} mode`,
      ...(t.designName === 'dark' ? ['dark mode theme', 'dark theme object'] : []),
      ...(t.designName === 'high-contrast' ? ['high contrast', 'hc theme'] : []),
    ],
    docUrl: A11Y_URL,
  });
}

// ===========================================================================
// Validate before writing. A bridge that names a token that does not exist is
// worse than no bridge.
// ===========================================================================
for (const e of entries) {
  if (e.codeToken && !TOKEN_KEYS.has(e.codeToken)) fail(`${e.id}: codeToken "${e.codeToken}" does not exist`);
  for (const t of Array.isArray(e.codeTokens) ? e.codeTokens : Object.values(e.codeTokens ?? {})) {
    if (t && !TOKEN_KEYS.has(t)) fail(`${e.id}: codeTokens member "${t}" does not exist`);
  }
  if (e.valueMatch === 'exact' && e.kind !== 'typeRamp') {
    if (px(e.designValue) !== px(e.codeValue)) fail(`${e.id}: exact match but ${e.designValue} != ${e.codeValue}`);
  }
  if (!e.codeToken && !e.codeSymbol && !e.reason) fail(`${e.id}: unmapped without a reason`);
}

const collisionsByCodeToken = {};
for (const e of entries) {
  if (e.collisionSeverity === 'silent-value-trap' && e.expectedCodeName) {
    collisionsByCodeToken[e.expectedCodeName] = {
      value: e.expectedCodeNameActualValue,
      designSiteSays: `The design site's "${e.designName}" ${e.kind} is ${e.designValue}, which is tokens.${e.codeToken} — not this token.`,
      warning: e.warning,
      correctTokenForDesignName: e.codeToken,
      docUrl: e.docUrl,
    };
  }
}
// The other side of the same trap: the token that IS right carries a note too,
// so a caller who lands on it from either direction sees the offset.
for (const e of entries) {
  if (e.collisionSeverity === 'silent-value-trap' && e.codeToken && !collisionsByCodeToken[e.codeToken]) {
    collisionsByCodeToken[e.codeToken] = {
      value: e.codeValue,
      designSiteSays: `This token is what the design site calls "${e.designName}" (${e.designValue}) — the names are offset by one step.`,
      warning: e.warning,
      correctTokenForDesignName: e.codeToken,
      docUrl: e.docUrl,
    };
  }
}

const counts = {
  entries: entries.length,
  mapped: entries.filter((e) => e.codeToken || e.codeSymbol).length,
  unmapped: entries.filter((e) => !e.codeToken && !e.codeSymbol).length,
  exact: entries.filter((e) => e.valueMatch === 'exact').length,
  partial: entries.filter((e) => e.valueMatch === 'partial').length,
  equivalent: entries.filter((e) => e.valueMatch === 'equivalent').length,
  nameCollisions: entries.filter((e) => e.nameCollision).length,
  silentValueTraps: entries.filter((e) => e.collisionSeverity === 'silent-value-trap').length,
  doesNotCompile: entries.filter((e) => e.collisionSeverity === 'does-not-compile').length,
};

const bridge = {
  $meta: {
    title: 'Design-site name -> code token bridge',
    what:
      'Resolves the names Microsoft publishes on fluent2.microsoft.design (design-site names such as "Large" corner ' +
      'radius, "size120" spacing, "Body 1" text, "dark" theme) to the token names that actually ship in ' +
      '@fluentui/react-theme / @fluentui/tokens — matched by VALUE, never by name.',
    why:
      'The two radius scales are OFFSET BY ONE STEP. The design site\'s "Large" is 8px; tokens.borderRadiusLarge is ' +
      '6px. Writing the design name as a token name compiles and silently renders the wrong value. Only None, Small ' +
      'and Medium line up.',
    method:
      'Generated from mcp/data/design-guidance.json (design names + published values) against mcp/data/' +
      'fluent-tokens.json (code names + shipped values). A row maps only when a token carries the same number; where ' +
      'no token does, codeToken is null and a reason says why. Colour palettes map to a family, and themes to an ' +
      'exported symbol, so those carry valueMatch "family"/"symbol" instead of a number.',
    generatedBy: 'scripts/build-design-token-bridge.mjs',
    generatedAt: CAPTURED_AT,
    sources: {
      designNames: 'mcp/data/design-guidance.json (topics: shapes, layout, typography, color, accessibility)',
      codeTokens: `mcp/data/fluent-tokens.json (@fluentui/react-theme ${T.meta?.packageVersions?.['@fluentui/react-theme'] ?? ''})`,
      docBase: 'https://fluent2.microsoft.design',
    },
    counts,
    biggestTrap:
      'borderRadiusLarge. The design site says Large = 8 pixels; the token is 6px. The 8px token is ' +
      'borderRadiusXLarge, and the 12px "X-Large" is borderRadius2XLarge.',
    resolveWith: 'fluent_get_token { name: "Large corner radius" } or { name: "size120" }',
    valueMatchLegend: {
      exact: 'the code token carries the same number the design site publishes',
      partial: 'some attributes match and at least one does not — see mismatches',
      equivalent: 'different literal, same rendered result — see reason',
      family: 'a design palette name maps to a token family, not one value',
      symbol: 'maps to an exported code symbol (a theme object), not a token',
      none: 'no token carries this value — see reason. Do NOT substitute the nearest one silently',
    },
    collisionSeverityLegend: {
      'silent-value-trap': 'the design name IS a real token name with a DIFFERENT value — compiles, renders wrong',
      'does-not-compile': 'the design name is not a token at all — tokens.<name> is undefined',
      'naming-only': 'the same thing under a different name; no value risk',
    },
  },
  collisionsByCodeToken,
  unmappedCodeTokens: {
    note: 'Real code tokens with no row on the design site. Legitimate to use — just not documented there.',
    borderRadius: radiusOrphans,
    spacingHorizontal: spacingOrphans,
    typographyRamp: rampOrphans.map((r) => r.codeToken),
  },
  entries,
};

// ===========================================================================
// Write the bridge into fluent-tokens.json (last key, stable position).
// ===========================================================================
const nextTokens = {};
for (const [k, v] of Object.entries(T)) if (k !== 'designNameBridge') nextTokens[k] = v;
nextTokens.designNameBridge = bridge;

// ===========================================================================
// Enrich design-guidance.json rows in place — BOTH copies of each table (the
// dataset stores every table twice: topic.values.X and topic.X).
// ===========================================================================
/**
 * The dataset stores every table TWICE — topic.values.X and topic.X — and the
 * two copies do not always have the same shape (typography.values.typeRamp is
 * an object keyed by platform; typography.typeRamp is the web array itself).
 * Both copies have to be enriched or half the readers get the old data.
 */
const asRows = (node, key) => (Array.isArray(node) ? node : Array.isArray(node?.[key]) ? node[key] : []);

const enrichRow = (row, e) => {
  if (!row || !e) return;
  row.codeToken = e.codeToken;
  if (e.codeTokens) row.codeTokens = e.codeTokens;
  row.codeValue = e.codeValue;
  row.valueMatch = e.valueMatch;
  if (e.griffel) row.griffel = e.griffel;
  if (e.reason) row.codeTokenNote = e.reason;
  if (e.warning) row.nameCollisionWarning = e.warning;
  else delete row.nameCollisionWarning;
};

const shapes = G.topics.shapes;
for (const row of asRows(shapes.values.cornerRadius, 'scale')) enrichRow(row, radiusEnrichment.get(row.token));
for (const row of asRows(shapes.cornerRadius, 'scale')) enrichRow(row, radiusEnrichment.get(row.token));
for (const row of asRows(shapes.values.strokeThickness)) enrichRow(row, strokeEnrichment.get(row.token));
for (const row of asRows(shapes.strokeThickness)) enrichRow(row, strokeEnrichment.get(row.token));

shapes.codeTokenBridge = {
  note:
    'Corner-radius design names and code token names are OFFSET BY ONE STEP above Medium. Read codeToken on each ' +
    'row — never turn the design name into a token name yourself.',
  cornerRadiusOffset: [...radiusEnrichment.values()]
    .filter((e) => e.collisionSeverity === 'silent-value-trap')
    .map((e) => `${e.designName} (${e.designValue}) -> tokens.${e.codeToken}; tokens.${e.expectedCodeName} is ${e.expectedCodeNameActualValue}`),
  codeTokensWithoutDesignRow: radiusOrphans,
  strokeWidthAligns: true,
  resolveWith: 'fluent_get_token { name: "Large corner radius" }',
};

const layout = G.topics.layout;
for (const row of asRows(layout.values.spacingRamp, 'values')) enrichRow(row, spacingEnrichment.get(row.token));
for (const row of asRows(layout.spacingRamp, 'values')) enrichRow(row, spacingEnrichment.get(row.token));
layout.codeTokenBridge = {
  note:
    'NONE of the sizeNNN names exist in code. FluentProvider emits spacingHorizontal*/spacingVertical*; tokens.size120 ' +
    'is undefined. Each row carries the real token for its px value, or codeToken: null where the code ramp has no step.',
  codeRamp: '0 / 2 / 4 / 6 / 8 / 10 / 12 / 16 / 20 / 24 / 32px (None, XXS, XS, SNudge, S, MNudge, M, L, XL, XXL, XXXL)',
  designStepsWithNoCodeToken: [...spacingEnrichment.values()].filter((e) => !e.codeToken).map((e) => `${e.designName} (${e.designPx}px)`),
  codeTokensWithoutDesignRow: spacingOrphans,
  resolveWith: 'fluent_get_token { name: "size120" }',
};

const typography = G.topics.typography;
for (const row of asRows(typography.values.typeRamp, 'web')) enrichRow(row, typeEnrichment.get(row.name));
for (const row of asRows(typography.typeRamp, 'web')) enrichRow(row, typeEnrichment.get(row.name));
typography.codeTokenBridge = {
  note:
    'Each web ramp step carries its code ramp key plus the fontSize/lineHeight/fontWeight tokens that compose it. ' +
    'Prefer typographyStyles.<key> (or the <Text>/<Title3> components) over pasting the three tokens.',
  platformScope:
    'codeToken is attached to the WEB ramp only — mcp/data/fluent-tokens.json is the web (v9) token set. The windows/' +
    'macOS/iOS/android ramps on this page are native and deliberately unmapped; use fluent_native_component.',
  disagreements: [...typeEnrichment.values()]
    .filter((e) => e.valueMatch === 'partial')
    .map((e) => `${e.designName}: ${Object.keys(e.mismatches).join(', ')} (site ${e.designValue} vs shipped ${JSON.stringify(e.codeValue)})`),
  codeRampStepsWithoutDesignRow: rampOrphans.map((r) => r.codeToken),
  resolveWith: 'fluent_get_token { name: "Body 1" }',
};

const color = G.topics.color;
const colorBridgeRows = entries
  .filter((e) => e.kind === 'color')
  .map((e) => ({
    designName: e.designName,
    codeToken: e.codeToken,
    codeTokens: e.codeTokens,
    codeTokenFamilies: e.codeTokenFamilies,
    tokenCount: e.tokenCount,
    ...(e.designNameToCodeName ? { designNameToCodeName: e.designNameToCodeName } : {}),
    ...(e.warning ? { nameCollisionWarning: e.warning } : {}),
    ...(e.note ? { note: e.note } : {}),
  }));
color.codeTokenBridge = {
  note:
    'The palette names on this page are families, not values. These are the real token names behind each one; ' +
    `${Object.keys(colorLight).length} alias tokens ship per theme.`,
  palettes: colorBridgeRows,
  themeTokenSets: 'color.semanticLight / semanticDark / semanticHighContrast in mcp/data/fluent-tokens.json',
  resolveWith: 'fluent_list_tokens { category: "color", theme: "light" } — or fluent_get_token for one alias',
};
color.values.codeTokens = colorBridgeRows;

const a11y = G.topics.accessibility;
const themeRows = entries
  .filter((e) => e.kind === 'theme')
  .map((e) => ({
    designName: e.designName,
    codeSymbol: e.codeSymbol,
    codePackage: e.codePackage,
    tokenSet: e.tokenSet,
    usage: e.usage,
    nameCollisionWarning: e.warning,
    ...(e.caution ? { caution: e.caution } : {}),
    ...(e.note ? { note: e.note } : {}),
  }));
// `themes` keeps its published string[] shape; the objects arrive alongside it
// so nothing that already reads this topic changes meaning.
a11y.values.themeObjects = themeRows;
a11y.codeTokenBridge = {
  note:
    'The four theme names on this page are adjectives, not exports. These are the objects to pass to FluentProvider.',
  themes: themeRows,
  allThemeExports: FLUENT_THEMES,
  resolveWith: 'fluent_get_token { name: "dark theme" }',
};

G.$meta.designToCodeTokenBridge = {
  what:
    'Design-site names on these pages now carry the code token that actually produces the stated value, matched by ' +
    'value rather than by name.',
  topics: ['shapes', 'layout', 'typography', 'color', 'accessibility'],
  rowFields: ['codeToken', 'codeTokens', 'codeValue', 'valueMatch', 'griffel', 'codeTokenNote', 'nameCollisionWarning'],
  index: 'mcp/data/fluent-tokens.json -> designNameBridge (single source of truth; this file is generated from it)',
  biggestTrap: bridge.$meta.biggestTrap,
  resolveWith: 'fluent_get_token resolves design-side names too, e.g. { name: "Large corner radius" } or { name: "size120" }',
  generatedBy: 'scripts/build-design-token-bridge.mjs',
};

// ===========================================================================
// PHASE 2 — the two uncovered get-started routes.
//
// LICENSING: facts and structured data only (names, versions, packages, URLs,
// ordered steps). Descriptive prose from the source pages is paraphrased or
// omitted, and docUrl always travels with the record. See NOTICE.
// ===========================================================================
const CDN = 'https://fluent2websitecdn.azureedge.net/cdn/';

G.topics['get-started-design'] = {
  title: 'Get started: design (Figma UI kits)',
  summary:
    'Route record for the "Start designing" page: which Figma UI kits exist and where each one lives, how the kit ' +
    'library is tiered, the click-path that switches the libraries on, and the five variable groups the design-language ' +
    'file publishes — each mapped to the code token family it becomes.',
  keyPoints: [
    'The Fluent 2 UI kits are hosted in Figma; there are three platform Core kits — Web, iOS and Android.',
    'The kits are organised in four tiers: Fluent 2 design language, Fluent 2 Core UI Kits, Copilot UI Kits, Labs UI Kits.',
    'The design-language file is the styling source of truth for five variable groups (see figmaVariables.groups).',
    'Enable a kit from the library picker inside Figma\'s Assets panel; Account settings can switch them on for every new draft.',
    'Component properties and variants in the kits are meant to line up with the code library props.',
    'Figma variables are what make light/dark switching work in the kits.',
    'The variable groups are the design-side names — see figmaVariables.codeTokenBridge before writing any of them as a token.',
  ],
  sections: [
    { heading: 'Fluent 2 in Figma', text: 'Where the kits are hosted and the three platform Core kits.' },
    { heading: 'UI kit organization', text: 'The four tiers and the role each one plays.' },
    { heading: 'Enabling the libraries', text: 'Turning the kits on for a file, and for every future draft.' },
    { heading: 'Designing with Fluent', text: 'Where components live in the Assets panel and how variants map to code props.' },
    { heading: 'Styling with Figma Variables', text: 'The variable groups the design-language file publishes.' },
  ],
  uiKits: [
    { name: 'Fluent 2 Web UI Kit', platform: 'web', url: 'https://aka.ms/Fluent2Toolkits/Web/Figma' },
    { name: 'Fluent 2 iOS UI Kit', platform: 'ios', url: 'https://aka.ms/Fluent2Toolkits/iOS/Figma' },
    { name: 'Fluent 2 Android UI Kit', platform: 'android', url: 'https://aka.ms/Fluent2Toolkits/Android/Figma' },
  ],
  kitTiers: [
    {
      tier: 'Fluent 2 design language',
      role: 'The styling source of truth.',
      publishes: ['color', 'stroke width', 'corner radius', 'spacing', 'size'],
    },
    { tier: 'Fluent 2 Core UI Kits', role: 'Building blocks kept aligned with the code libraries.', platforms: ['web', 'ios', 'android'] },
    { tier: 'Copilot UI Kits', role: 'AI components and patterns layered on top of Core.', platforms: ['web', 'ios', 'android'] },
    { tier: 'Labs UI Kits', role: 'Partner-contributed experimental kits.', platforms: ['web', 'mobile'] },
  ],
  enablingLibraries: {
    steps: [
      'Open the Assets panel in the Figma file.',
      'Open the library picker from that panel.',
      'Switch on the Fluent 2 UI kits you need.',
      'To keep them on for every new draft, do it from Account settings instead of per file.',
    ],
    alsoAvailable: ['Fluent Iconography kit', 'Fluent Emoji kits'],
    moreKits: 'https://www.figma.com/@microsoft',
  },
  designingWithFluent: {
    componentsLiveIn: 'Assets panel',
    nestingDepth: 'Components are kept at most two levels deep.',
    variants: 'Variants and component properties carry the configuration, and are intended to map to the code props.',
    figmaHelp: 'https://help.figma.com/hc/en-us/articles/5579474826519-Explore-component-properties',
  },
  figmaVariables: {
    file: 'Fluent 2 design language',
    scope: 'global and alias variables, for web and mobile',
    supports: ['light/dark mode switching', 'Fluent and Copilot styling'],
    groups: [
      { group: 'color', codeTokenFamily: 'color* (colorNeutral*, colorBrand*, colorPalette*, colorStatus*)', caution: null },
      { group: 'stroke width', codeTokenFamily: 'strokeWidthThin | Thick | Thicker | Thickest', caution: null },
      {
        group: 'corner radius',
        codeTokenFamily: 'borderRadius*',
        caution:
          'The design names are OFFSET from the code names above Medium: design "Large" (8px) is ' +
          'tokens.borderRadiusXLarge, not tokens.borderRadiusLarge (6px).',
      },
      {
        group: 'spacing',
        codeTokenFamily: 'spacingHorizontal* / spacingVertical*',
        caution: 'Horizontal and vertical are separate token families in code; Figma exposes one spacing scale.',
      },
      {
        group: 'size',
        codeTokenFamily: 'spacingHorizontal* / spacingVertical* (by value)',
        caution:
          'The sizeNNN names do not exist in code at all — tokens.size120 is undefined. The 12px tokens are ' +
          'spacingHorizontalM / spacingVerticalM, and the ramp has no code token above 32px.',
      },
    ],
    codeTokenBridge:
      'fluent-tokens.json -> designNameBridge maps every one of these design names to the code token that produces ' +
      'the same value. Resolve one with fluent_get_token { name: "Large corner radius" }.',
  },
  links: [
    { label: 'Fluent 2 Web UI Kit (Figma)', url: 'https://aka.ms/Fluent2Toolkits/Web/Figma' },
    { label: 'Fluent 2 iOS UI Kit (Figma)', url: 'https://aka.ms/Fluent2Toolkits/iOS/Figma' },
    { label: 'Fluent 2 Android UI Kit (Figma)', url: 'https://aka.ms/Fluent2Toolkits/Android/Figma' },
    { label: 'Microsoft in the Figma community', url: 'https://www.figma.com/@microsoft' },
    { label: 'Figma: explore component properties', url: 'https://help.figma.com/hc/en-us/articles/5579474826519-Explore-component-properties' },
  ],
  images: [
    { asset: CDN + 'get-started-design.DAxCWgKV.webp', section: 'Start designing' },
    { asset: CDN + 'get-started-design-ui-kit.tlSCvd64.png', section: 'UI kit organization' },
    { asset: CDN + 'get-started-design-enabling.UenZnDSN.png', section: 'Enabling the libraries' },
    { asset: CDN + 'get-started-design-designing-01.D7cv4djS.webp', section: 'Designing with Fluent' },
    { asset: CDN + 'get-started-design-designing-02.C9_tBb0r.webp', section: 'Designing with Fluent' },
    { asset: CDN + 'get-started-design-styling.Dif2EeP5.png', section: 'Styling with Figma Variables' },
  ],
  values: {
    uiKitCount: 3,
    kitTierCount: 4,
    figmaVariableGroups: ['color', 'stroke width', 'corner radius', 'spacing', 'size'],
  },
  relatedTools: ['fluent_figma_guidance', 'fluent_get_token', 'fluent_list_tokens'],
  licensing:
    'Facts and structured data only — kit names, tier names, ordered steps, variable group names, links and image ' +
    'URLs. Descriptive sentences from the source page are paraphrased or omitted; read the page at docUrl for its own ' +
    'wording. See NOTICE.',
  docUrl: 'https://fluent2.microsoft.design/get-started/design',
  httpStatus: 200,
  accessStatus: 'public',
  capturedAt: CAPTURED_AT,
};

G.topics['get-started-develop'] = {
  title: 'Get started: develop (platform picker and install)',
  summary:
    'Route record for the "Start developing" page: the five platforms Fluent 2 publishes a library for, and for each ' +
    'one the package name, the install command, the minimum toolchain and the setup entry point.',
  keyPoints: [
    'Five platforms are offered: React, Web Components, iOS, Android and Windows.',
    'React: @fluentui/react-components (Fluent UI React v9), styled with Griffel.',
    'Web Components: @fluentui/web-components (v3), built on FAST Element and shipped as JavaScript modules.',
    'iOS: fluentui-apple, via Swift Package Manager or the MicrosoftFluentUI CocoaPod.',
    'Android: com.microsoft.fluentui artifacts on Maven Central, whole-library or per-module.',
    'Windows has no Fluent UI package of its own on this page — it points at WinUI 3.',
    'Web Components take their theme from @fluentui/tokens via setTheme(), not from a React provider.',
  ],
  sections: [
    { heading: 'Pick your platform', text: 'React, Web Components, iOS, Android and Windows, each with its own install path.' },
    { heading: 'Tooling and requirements', text: 'Minimum toolchain per platform.' },
    { heading: 'Installing', text: 'Package manager commands per platform.' },
    { heading: 'Setting up your app', text: 'The theming entry point each library uses.' },
  ],
  platforms: [
    {
      id: 'react',
      label: 'React',
      library: 'Fluent UI React v9',
      package: '@fluentui/react-components',
      install: { npm: 'npm install @fluentui/react-components', yarn: 'yarn add @fluentui/react-components' },
      builtOn: ['React', 'TypeScript'],
      stylingEngine: { name: 'Griffel', what: 'CSS-in-JS; styles are inserted into the DOM as needed.', url: 'https://github.com/microsoft/griffel' },
      requirements: { node: 'https://nodejs.org/en/', packageManager: 'npm, yarn or another package manager' },
      setup: {
        provider: 'FluentProvider',
        importFrom: '@fluentui/react-components',
        themeProp: 'theme',
        builtInThemes: FLUENT_THEMES,
        steps: [
          'Import FluentProvider and a theme from @fluentui/react-components.',
          'Render FluentProvider once at the root of the app and pass the theme object to its theme prop.',
          'Render every other v9 component inside that provider.',
        ],
      },
      migration: {
        from: 'an older Fluent UI React version',
        url: 'https://react.fluentui.dev/?path=/docs/concepts-migration-getting-started--page',
        alsoUse: 'fluent_migration_guidance / fluent_v8_lookup for the v8 -> v9 symbol map',
      },
      links: [
        { label: 'Griffel', url: 'https://github.com/microsoft/griffel' },
        { label: 'Node.js', url: 'https://nodejs.org/en/' },
        { label: 'Yarn', url: 'https://yarnpkg.com/' },
        { label: 'fluentui repo', url: 'https://github.com/microsoft/fluentui' },
      ],
    },
    {
      id: 'web-components',
      label: 'Web Components',
      library: 'Fluent UI Web Components v3',
      package: '@fluentui/web-components',
      install: {
        npm: 'npm i @fluentui/web-components',
        yarn: 'yarn add @fluentui/web-components',
        pnpm: 'pnpm add @fluentui/web-components',
        cdn: 'A CDN distribution is available; without it a package manager and Node.js are needed.',
      },
      builtOn: ['FAST Element', 'TypeScript'],
      distributedAs: 'JavaScript modules',
      setup: {
        themeFunction: 'setTheme',
        themeFunctionFrom: '@fluentui/web-components',
        themeObjectFrom: '@fluentui/tokens',
        themingModel: 'Tokens are applied as CSS custom properties; setTheme swaps the values.',
        elementRegistration: {
          what: 'Named definition exports register a single element against the Fluent design system registry.',
          example: 'ButtonDefinition.define(FluentDesignSystem.registry)',
          importFrom: '@fluentui/web-components',
        },
        steps: [
          'Install the package with any package manager, or load the CDN build.',
          'Call setTheme with a theme object to apply Fluent token values.',
          'Register the elements you use, then place the <fluent-*> tags in markup.',
        ],
      },
    },
    {
      id: 'ios',
      label: 'iOS',
      library: 'Fluent UI Apple',
      repo: 'https://github.com/microsoft/fluentui-apple/',
      packages: { swiftPackageManager: 'https://github.com/microsoft/fluentui-apple.git', cocoaPods: "pod 'MicrosoftFluentUI'" },
      frameworks: ['UIKit', 'AppKit'],
      targets: ['iOS', 'iPadOS', 'macOS'],
      languages: ['Swift', 'Objective-C'],
      requirements: { ios: '14 or later', macOS: '10.15 or later', xcode: '14.1 or later', swift: '5.7.1 or later' },
      imports: { swift: 'import FluentUI', objectiveC: '#import <FluentUI/FluentUI-Swift.h>' },
      manualInstall: {
        xcodeProject: 'ios/FluentUI.xcodeproj',
        staticLibrary: 'libFluentUI.a',
        staticLibraryLocation: ['your project', 'your target', 'General', 'Frameworks, Libraries, and Embedded Content'],
        demoResourceBundle: 'FluentUIResources-iOS.bundle',
        demoResourceBundleLocation: ['your project', 'your target', 'Build Phases', 'Copy Bundle Resources'],
        steps: [
          'Clone or download the repo, then place the fluentui-apple folder inside your own project folder.',
          'Add the Xcode project named above to your workspace.',
          'Link the static library named above from the target setting named in staticLibraryLocation.',
          'For a demo environment, add the resource bundle named above under demoResourceBundleLocation.',
        ],
      },
      fluent2Note:
        'Fluent 2 lands one component at a time. Tokenizing a component removes its Fluent 1 counterpart from the ' +
        'library, so a project that still needs the older one has to pin an earlier version — the last one published ' +
        'before that tokenization.',
      releaseNotes: 'https://github.com/microsoft/fluentui-apple/releases',
      cocoaPodsGuide: 'https://guides.cocoapods.org/using/getting-started.html',
    },
    {
      id: 'android',
      label: 'Android',
      library: 'Fluent UI Android',
      repo: 'https://github.com/microsoft/fluentui-android',
      groupId: 'com.microsoft.fluentui',
      wholeLibraryArtifact: 'FluentUIAndroid',
      gradle: "implementation 'com.microsoft.fluentui:FluentUIAndroid:$version'",
      moduleExample: "implementation 'com.microsoft.fluentui:fluentui_drawer:$version'",
      modularSince: '0.0.12',
      repositories: { mavenCentral: 'required for 0.0.17 and later', jcenter: 'only works for 0.0.16 and earlier' },
      language: 'Kotlin',
      requirements: {
        minSdk: 21,
        compileSdk: 33,
        kotlin: '1.8.21',
        jetpackComposeBom: '2023.06.01',
        jetpackComposeCompiler: '1.4.7',
        duoSdk: '1.0.0-alpha01',
        androidStudio: 'Flamingo',
      },
      imports: { wholeLibrary: 'import com.microsoft.fluentui', singleComponent: 'import com.microsoft.fluentui.persona.AvatarView' },
      surfaceDuo: { mavenUrl: 'https://pkgs.dev.azure.com/MicrosoftDeviceSDK/DuoSDK-Public/_packaging/Duo-SDK-Feed/maven/v1', dependency: 'com.microsoft.device:dualscreen-layout:1.0.0-alpha01' },
      extraDependencies: [
        { whenUsing: 'PeoplePickerView', dependency: 'com.splitwise:tokenautocomplete:2.0.8' },
        { whenUsing: 'CalendarView or DateTimePickerDialog', dependency: 'com.jakewharton.threetenabp:threetenabp:1.1.0' },
      ],
      fluent2Note:
        'Fluent 2 arrives component by component here too, but the Fluent 1 version stays in the same module — the ' +
        'module is split into a tokenized folder (Fluent 2) and a non-tokenized one (Fluent 1). The import decides ' +
        'which generation is used, not the dependency. See fluent_native_component.',
      modularization: 'https://github.com/microsoft/fluentui-android#modularization',
      releaseNotes: 'https://github.com/microsoft/fluentui-android/releases',
      demos: 'https://github.com/microsoft/fluentui-android/tree/master/FluentUI.Demo',
    },
    {
      id: 'windows',
      label: 'Windows',
      library: 'WinUI 3',
      note: 'The page has no Fluent UI package for Windows: it points at WinUI, whose controls carry the Fluent design language.',
      docs: 'https://learn.microsoft.com/en-us/windows/apps/winui/winui3/',
      alsoUse: 'fluent_native_component { platform: "windows" } for the real control names.',
    },
  ],
  crossReferences: [
    'fluent_generate_code scaffolds a themed React v9 or Web Components app from this same setup.',
    'fluent_native_component resolves the real iOS/Android/Windows type names — never infer them from the web API.',
    'fluent_get_token { name: "dark theme" } resolves which theme object to pass to FluentProvider.',
  ],
  images: [{ asset: CDN + 'get-started-develop.DHHfwS_N.webp', section: 'Start developing' }],
  values: {
    platformCount: 5,
    platforms: ['react', 'web-components', 'ios', 'android', 'windows'],
    webPackages: ['@fluentui/react-components', '@fluentui/web-components', '@fluentui/tokens'],
  },
  relatedTools: ['fluent_generate_code', 'fluent_native_component', 'fluent_migration_guidance', 'fluent_get_token'],
  licensing:
    'Facts and structured data only — package names, install commands, version numbers, ordered steps, links and ' +
    'image URLs. Descriptive sentences from the source page are paraphrased or omitted; read the page at docUrl for ' +
    'its own wording. See NOTICE.',
  docUrl: 'https://fluent2.microsoft.design/get-started/develop',
  httpStatus: 200,
  accessStatus: 'public',
  capturedAt: CAPTURED_AT,
};

G.$meta.topicCount = Object.keys(G.topics).length;

// ---------------------------------------------------------------------------
if (problems.length) {
  console.error('BRIDGE BUILD FAILED — nothing written:');
  for (const p of problems) console.error('  - ' + p);
  process.exit(1);
}

const tokensBytes = writeData(TOKENS_PATH, nextTokens, tokensFile.trailingNewline);
const guidanceBytes = writeData(GUIDANCE_PATH, G, guidanceFile.trailingNewline);

console.log((CHECK_ONLY ? 'CHECK ONLY (nothing written)' : 'WROTE') + ':');
console.log('  mcp/data/fluent-tokens.json    ' + tokensBytes + ' bytes  (designNameBridge: ' + counts.entries + ' entries)');
console.log('  mcp/data/design-guidance.json  ' + guidanceBytes + ' bytes  (topics: ' + G.$meta.topicCount + ')');
console.log('  mapped ' + counts.mapped + '/' + counts.entries + ', unmapped ' + counts.unmapped +
  ', exact ' + counts.exact + ', partial ' + counts.partial + ', equivalent ' + counts.equivalent);
console.log('  name collisions ' + counts.nameCollisions + ' (silent value traps ' + counts.silentValueTraps +
  ', does-not-compile ' + counts.doesNotCompile + ')');
for (const e of entries.filter((x) => x.collisionSeverity === 'silent-value-trap')) {
  console.log('  TRAP  ' + e.designName + ' = ' + e.designValue + ' -> ' + e.codeToken +
    '   (tokens.' + e.expectedCodeName + ' is ' + e.expectedCodeNameActualValue + ')');
}
for (const e of entries.filter((x) => !x.codeToken && !x.codeSymbol)) {
  console.log('  UNMAPPED  ' + e.id + ' — ' + String(e.reason).slice(0, 100));
}
