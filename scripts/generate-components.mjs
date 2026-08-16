#!/usr/bin/env node
/**
 * Regenerate mcp/data/fluent-components.json from primary upstream sources.
 *
 * Sources (all public, all fetched at run time):
 *   1. https://storybooks.fluentui.dev/react/index.json  - the Storybook index.
 *      Every `type: "docs"` entry has a companion LLM markdown page at
 *      /react/llms/<id without the --docs suffix>.txt containing the real
 *      react-docgen prop table, slots, best practices and compiling examples.
 *   2. microsoft/fluentui .../react-components/etc/react-components.api.md -
 *      the API-Extractor report. It maps every symbol the suite re-exports to
 *      the package that actually owns it, which is the only reliable way to
 *      know whether `import { X } from '@fluentui/react-components'` resolves.
 *   3. @fluentui/web-components custom-elements.json (via unpkg) - the custom
 *      elements manifest. Every `fluent-*` tag and its kebab-case attributes are
 *      read from here, so a hand-typed tag like `<fluent-textarea>` (which does
 *      not exist; the real tag is `fluent-text-area`) can no longer survive.
 *   4. @fluentui-copilot/react-copilot dist/index.d.ts plus each of its 32
 *      sub-package d.ts files (via unpkg) - the AI suite. ai.fluentui.dev is
 *      Entra-gated and was never a usable source, but the npm tarballs are
 *      public, so the AI records are grounded like everything else.
 *   5. @fluentui/react-icons (via unpkg) - only to confirm the `Icon` record's
 *      exports exist.
 *
 * The npm registry API itself is blocked in some environments; unpkg.com and
 * data.jsdelivr.com serve the same tarball contents and are used instead.
 *
 * The script is re-runnable and idempotent: hand-authored fields that cannot
 * be regenerated (category, a11y prose, web-component tags, Storybook/site
 * links, AI-suite records) are merged forward from the existing file; every
 * API fact (props, slots, imports, samples, maturity) is replaced from source.
 *
 * Usage:
 *   node scripts/generate-components.mjs [--cache <dir>] [--offline] [--out <file>] [--dry-run]
 *
 *   --cache <dir>  Cache downloaded pages in <dir> (re-used on later runs).
 *   --offline      Fail instead of hitting the network; requires --cache.
 *   --out <file>   Write somewhere else (default mcp/data/fluent-components.json).
 *   --dry-run      Print the summary, write nothing.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');

const STORYBOOK = 'https://storybooks.fluentui.dev/react';
const API_MD =
  'https://raw.githubusercontent.com/microsoft/fluentui/master/packages/react-components/react-components/etc/react-components.api.md';
const UNPKG = 'https://unpkg.com';
const JSDELIVR = 'https://data.jsdelivr.com/v1/packages/npm';
const WC_PACKAGE = '@fluentui/web-components';
const COPILOT_UMBRELLA = '@fluentui-copilot/react-copilot';
const ICONS_PACKAGE = '@fluentui/react-icons';
const CONCURRENCY = 5;
const POLITE_DELAY_MS = 120;

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

const argv = process.argv.slice(2);
const flag = (name) => argv.includes(name);
const opt = (name, fallback) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
};

const CACHE_DIR = opt('--cache', null);
const OFFLINE = flag('--offline');
const DRY_RUN = flag('--dry-run');
const OUT = path.resolve(ROOT, opt('--out', 'mcp/data/fluent-components.json'));

if (OFFLINE && !CACHE_DIR) {
  console.error('--offline requires --cache <dir>');
  process.exit(1);
}
if (CACHE_DIR) fs.mkdirSync(CACHE_DIR, { recursive: true });

// ---------------------------------------------------------------------------
// Curated knowledge the upstream sources do not carry.
// ---------------------------------------------------------------------------

/**
 * Records we ship that have no counterpart in ANY public source we can read.
 * Everything that used to sit here (the whole @fluentui-copilot suite, `Icon`)
 * is now read from the published npm tarballs via unpkg, so this is empty -
 * but the mechanism stays, because the next unverifiable record must be
 * declared deliberately rather than merged in silently.
 */
const UNVERIFIABLE_PREFIXES = [];
const UNVERIFIABLE_NAMES = new Set();

/**
 * Names we shipped that are NOT exported by any package in the suite. Generated
 * code using them renders nothing, so the record is retired into the real
 * export's `siteGuidance` rather than left in place or silently deleted.
 *
 * `LatencyLoader` is deliberately NOT here: it is a real export of
 * @fluentui-copilot/react-latency, it is just not re-exported by the umbrella,
 * so the fix is the import path, not the name.
 */
const RETIRED_RECORDS = {
  Suggestions: {
    target: 'Suggestion',
    reason:
      'Suggestions is the AI site pattern name, not an export. The real exports are Suggestion and ' +
      'SuggestionList, from @fluentui-copilot/react-suggestions.',
  },
  Sensitivity: {
    target: 'SensitivityLabel',
    reason:
      'Sensitivity is the AI site pattern name, not an export. The real exports are SensitivityLabel, ' +
      'SensitivityIcon and SensitivityTooltip, from @fluentui-copilot/react-sensitivity-label.',
  },
};

/** React component shapes a `export declare const X: …` can take in the AI suite. */
const COMPONENT_TYPE_HEAD =
  /^(?:React(?:_\d+)?\.)?(?:ForwardRefComponent(?:_\d+)?|ForwardRefExoticComponent|FunctionComponent|FC|ComponentType|MemoExoticComponent)\s*</;
/** Generic function components: `<T>(props: XProps<T> & …) => JSXElement`. */
const GENERIC_COMPONENT = /^<[^)]*>\s*\(\s*props:\s*([A-Za-z_$][\w$]*)/;

/**
 * Custom-element class name -> catalog record name. The two vocabularies do not
 * line up (`Tablist` vs `TabList`, `TextInput` vs `Input`, `DropdownOption` vs
 * `Option`), and `AnchorButton` has no React counterpart at all - React uses
 * `<Button as="a">`. `null` means "real tag, no React record": it is reported
 * under meta.webComponents.unmappedTags instead of being attached to a guess.
 */
const WC_CLASS_TO_COMPONENT = {
  Accordion: 'Accordion', AccordionItem: 'AccordionItem', AnchorButton: null,
  Avatar: 'Avatar', Badge: 'Badge', Button: 'Button', Checkbox: 'Checkbox',
  CompoundButton: 'CompoundButton', CounterBadge: 'CounterBadge', Dialog: 'Dialog',
  DialogBody: 'DialogBody', Divider: 'Divider', Drawer: 'Drawer', DrawerBody: 'DrawerBody',
  Dropdown: 'Dropdown', DropdownOption: 'Option', Field: 'Field', Image: 'Image',
  Label: 'Label', Link: 'Link', Listbox: 'Listbox', Menu: 'Menu', MenuButton: 'MenuButton',
  MenuItem: 'MenuItem', MenuList: 'MenuList', MessageBar: 'MessageBar',
  ProgressBar: 'ProgressBar', Radio: 'Radio', RadioGroup: 'RadioGroup',
  RatingDisplay: 'RatingDisplay', Slider: 'Slider', Spinner: 'Spinner', Switch: 'Switch',
  Tab: 'Tab', Tablist: 'TabList', Text: 'Text', TextArea: 'Textarea', TextInput: 'Input',
  ToggleButton: 'ToggleButton', Tooltip: 'Tooltip', Tree: 'Tree', TreeItem: 'TreeItem',
};

/**
 * The AI site documents patterns under human prose names ("Chat input"). Those
 * shipped as separate records keyed by a sentence, so an MCP consumer keying on
 * `name` got a sentence back. Fold each one into the code-identifier record it
 * duplicates, preserving its site guidance under `siteGuidance`.
 */
const PROSE_TARGET = {
  'Chat input': 'ChatInput',
  'Chat output': 'CopilotChat',
  'Citations and references': 'Citation',
  'Copilot message': 'CopilotMessage',
  'User message': 'UserMessage',
  'System message': 'SystemMessage',
  'Prompt starters': 'PromptStarter',
  'Copilot FRE': 'FirstRunExperience',
  'Entity cards': 'EntityCard',
  'Ghost text': 'GhostText',
};

/** Categories for components the current file does not carry yet. */
const CATEGORY_BY_NAME = {
  ColorPicker: 'Selection', ColorArea: 'Selection', ColorSlider: 'Selection',
  AlphaSlider: 'Selection', ColorSwatch: 'Selection',
  Overflow: 'Layout & Surfaces', OverflowItem: 'Layout & Surfaces',
  Portal: 'Layout & Surfaces', toMountNodeProps: 'Layout & Surfaces',
  RatingDisplay: 'Data display',
  InteractionTag: 'Data display', InteractionTagPrimary: 'Data display',
  InteractionTagSecondary: 'Data display',
  Calendar: 'Forms & Inputs', DatePicker: 'Forms & Inputs', TimePicker: 'Forms & Inputs',
  CarouselNav: 'Data display',
};
const CATEGORY_BY_TITLE_PREFIX = [
  ['Components/Button/', 'Actions'],
  ['Components/Card/', 'Layout & Surfaces'],
  ['Components/Badge/', 'Data display'],
  ['Components/Tag/', 'Data display'],
  ['Components/Menu/', 'Navigation'],
  ['Components/Carousel/', 'Data display'],
  ['Components/Portal/', 'Layout & Surfaces'],
  ['Compat Components/', 'Forms & Inputs'],
  ['Preview Components/Menu/', 'Navigation'],
  ['Motion/', 'Motion'],
  ['Utilities/', 'Utilities'],
  ['Migration Shims/', 'Migration shims'],
];

/** Props every docgen table carries because of Tabster; huge and never useful. */
const NOISE_PROPS = new Set(['focusgroup', 'focusgroupstart']);

/** Preferred example section names, in order, when picking the code sample. */
const SAMPLE_PREFERENCE = ['Default', 'Basic', 'Default List', 'Default Toast Options'];

const MAX_TYPE_LEN = 260;
const MAX_SAMPLE_LINES = 44;
const MAX_SAMPLE_CHARS = 2200;
const MAX_LOCAL_DECL_CHARS = 1400;

// ---------------------------------------------------------------------------
// Fetching
// ---------------------------------------------------------------------------

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchText(url, cacheKey) {
  const cacheFile = CACHE_DIR ? path.join(CACHE_DIR, cacheKey) : null;
  if (cacheFile && fs.existsSync(cacheFile)) return fs.readFileSync(cacheFile, 'utf8');
  if (OFFLINE) throw new Error(`offline and not cached: ${cacheKey}`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  const text = await res.text();
  if (cacheFile) fs.writeFileSync(cacheFile, text);
  return text;
}

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
      if (!CACHE_DIR || !OFFLINE) await sleep(POLITE_DELAY_MS);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

const fetchJson = async (url, key) => JSON.parse(await fetchText(url, key));

/** npm's own registry is blocked in some environments; jsdelivr serves the same metadata. */
async function resolveLatest(pkg) {
  const meta = await fetchJson(`${JSDELIVR}/${pkg}`, `_dist-tags-${pkg.replace(/[@/]/g, '_')}.json`);
  return meta.tags.latest;
}

// ---------------------------------------------------------------------------
// Web Components - the custom elements manifest
// ---------------------------------------------------------------------------

/**
 * Read every registered `fluent-*` tag straight out of the shipped manifest.
 * Hand-maintained tags rot silently: we shipped `<fluent-textarea>`, which has
 * never existed in v2 or v3 (the real tag is `fluent-text-area`), so generated
 * markup rendered an unknown element and displayed nothing.
 */
async function loadWebComponents() {
  const version = await resolveLatest(WC_PACKAGE);
  const manifestUrl = `${UNPKG}/${WC_PACKAGE}@${version}/custom-elements.json`;
  const manifest = await fetchJson(manifestUrl, `_wc-custom-elements-${version}.json`);
  const listing = await fetchJson(
    `${JSDELIVR}/${WC_PACKAGE}@${version}?structure=flat`,
    `_wc-files-${version}.json`
  );
  // The manifest's module paths do not always match the published tarball
  // (it claims dist/esm/text-area/, the tarball ships dist/esm/textarea/), so
  // the registration subpath is resolved against the real file list.
  const defineDirs = new Set(
    listing.files
      .map((f) => f.name)
      .filter((f) => /\/define\.js$/.test(f))
      .map((f) => f.replace('/dist/esm/', '').replace('/define.js', ''))
  );

  const byClass = new Map();
  for (const mod of manifest.modules || []) {
    for (const d of mod.declarations || []) {
      if (!d.tagName) continue;
      // Attributes appear twice: once from the class fields (authoritative,
      // kebab-case, carries `fieldName`) and once from JSDoc @attr tags, which
      // upstream sometimes writes in camelCase (`ariaDescribedby`). Keep the
      // real ones and only fall back to doc entries that are already kebab.
      const real = (d.attributes || []).filter((a) => a.fieldName);
      const taken = new Set(real.map((a) => a.name));
      const extra = (d.attributes || []).filter(
        (a) => !a.fieldName && !/[A-Z]/.test(a.name) && !taken.has(a.name)
      );
      const attributes = [...real, ...extra].map((a) => {
        const attr = { name: a.name };
        const type = (a.parsedType && a.parsedType.text) || (a.type && a.type.text);
        if (type) attr.type = String(type).replace(/\s*\|\s*undefined(?=\s*(\||$))/g, '').trim();
        if (a.default !== undefined) attr.default = String(a.default);
        return attr;
      });
      const manifestDir = String(mod.path).replace(/^\.\/dist\/esm\//, '').split('/')[0];
      const bare = d.tagName.replace(/^fluent-/, '');
      const dir = [manifestDir, bare.replace(/-/g, ''), bare.split('-').slice(-1)[0]].find((c) =>
        defineDirs.has(c)
      );
      byClass.set(d.name, {
        tag: d.tagName,
        className: d.name,
        define: dir ? `import '${WC_PACKAGE}/${dir}/define.js';` : null,
        attributes,
      });
    }
  }
  return { version, manifestUrl, byClass };
}

// ---------------------------------------------------------------------------
// TypeScript .d.ts parsing (used for the AI suite, which has no Storybook)
// ---------------------------------------------------------------------------

/**
 * Replace block comments with `/*@n@*\/` markers. A doc comment such as
 * "the message's contents" contains an apostrophe, and any structural scanner
 * that treats it as a string delimiter desynchronises for the rest of the file.
 */
function maskComments(src) {
  const docs = [];
  const out = src.replace(/\/\*[\s\S]*?\*\//g, (m) => {
    docs.push(m);
    return `/*@${docs.length - 1}@*/`;
  });
  return { src: out, docs };
}

function balancedEnd(text, start, open, close) {
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    if (text[i] === open) depth++;
    else if (text[i] === close) { depth--; if (!depth) return i; }
  }
  return -1;
}

/** End index of a type expression starting at `start` (stops at a top-level `;`). */
function typeExprEnd(src, start) {
  let depth = 0;
  let quote = null;
  for (let i = start; i < src.length; i++) {
    const c = src[i];
    if (quote) {
      if (c === '\\') { i++; continue; }
      if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') { quote = c; continue; }
    if ('{([<'.includes(c)) depth++;
    else if ('})]>'.includes(c)) depth--;
    else if (c === ';' && depth <= 0) return i;
  }
  return src.length;
}

function declaredType(src, name) {
  const m = new RegExp(`(?:export )?declare type ${name}\\s*=`, 'm').exec(src);
  if (!m) return null;
  const start = m.index + m[0].length;
  return src.slice(start, typeExprEnd(src, start)).trim();
}

/** Follow `type AProps = BProps;` aliases. */
function resolveType(src, name, seen = new Set()) {
  if (!name || seen.has(name)) return null;
  seen.add(name);
  const body = declaredType(src, name);
  if (body && /^[A-Za-z_$][\w$]*$/.test(body)) return resolveType(src, body, seen);
  return body;
}

function typeMembers(objText, docs) {
  const inner = objText.slice(1, -1);
  const out = [];
  let i = 0;
  while (i < inner.length) {
    const m = inner.slice(i).match(/^\s*(?:\/\*@(\d+)@\*\/)?\s*(?:readonly\s+)?([A-Za-z_$][\w$]*)(\?)?\s*:/);
    if (!m) {
      const nl = inner.indexOf('\n', i);
      if (nl < 0) break;
      i = nl + 1;
      continue;
    }
    const valueStart = i + m[0].length;
    let j = valueStart;
    let depth = 0;
    let quote = null;
    for (; j < inner.length; j++) {
      const c = inner[j];
      if (quote) {
        if (c === '\\') { j++; continue; }
        if (c === quote) quote = null;
        continue;
      }
      if (c === '"' || c === "'" || c === '`') { quote = c; continue; }
      if ('{([<'.includes(c)) depth++;
      else if ('})]>'.includes(c)) depth--;
      else if ((c === ';' || c === ',') && depth <= 0) break;
    }
    const doc = m[1] !== undefined ? cleanJsDoc(docs[Number(m[1])]) : '';
    out.push({
      name: m[2],
      optional: !!m[3],
      type: inner.slice(valueStart, j).replace(/\s+/g, ' ').trim(),
      doc,
    });
    i = j + 1;
  }
  return out;
}

function cleanJsDoc(raw) {
  if (!raw) return '';
  return String(raw)
    .replace(/^\/\*+/, '')
    .replace(/\*+\/$/, '')
    .split('\n')
    .map((l) => l.replace(/^\s*\*?\s?/, ''))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Top-level `{ … }` operands of an intersection, skipping generic arguments. */
function topLevelObjects(expr) {
  const objs = [];
  let i = 0;
  while (i < expr.length) {
    const c = expr[i];
    if (c === '{') {
      const end = balancedEnd(expr, i, '{', '}');
      if (end < 0) break;
      objs.push(expr.slice(i, end + 1));
      i = end + 1;
    } else if (c === '<' || c === '(') {
      const end = balancedEnd(expr, i, c, c === '<' ? '>' : ')');
      if (end < 0) break;
      i = end + 1;
    } else i++;
  }
  return objs;
}

/** Bare identifiers intersected into a props type (`CopilotMode & { … }`). */
function intersectedNames(expr) {
  return expr
    .split(/&(?![^<]*>)/)
    .map((part) => part.trim())
    .filter((part) => /^[A-Za-z_$][\w$]*$/.test(part));
}

// ---------------------------------------------------------------------------
// The AI (Copilot) suite - read from the published npm tarballs
// ---------------------------------------------------------------------------

/**
 * ai.fluentui.dev is Entra-gated (401), so the AI records used to be flagged
 * "cannot be confirmed or refuted". The npm tarball is public: the umbrella
 * barrel names every re-export and its owning sub-package, and each sub-package
 * d.ts carries the real props and slots. Components that exist in a sub-package
 * but are NOT re-exported by the umbrella are recorded as such - importing them
 * from the umbrella does not resolve.
 */
async function loadCopilotSuite() {
  const version = await resolveLatest(COPILOT_UMBRELLA);
  const barrelUrl = `${UNPKG}/${COPILOT_UMBRELLA}@${version}/dist/index.d.ts`;
  const barrel = await fetchText(barrelUrl, `_copilot-barrel-${version}.d.ts`);
  const pkgJson = await fetchJson(
    `${UNPKG}/${COPILOT_UMBRELLA}@${version}/package.json`,
    `_copilot-pkg-${version}.json`
  );

  const umbrellaExports = new Set();
  const ownerOf = new Map();
  for (const line of barrel.split(/\r?\n/)) {
    let m = line.match(/^import \{ ([A-Za-z_$][\w$]*) \} from '([^']+)';$/);
    if (m) { ownerOf.set(m[1], m[2]); continue; }
    m = line.match(/^export \{ ([A-Za-z_$][\w$]*) \}$/);
    if (m) umbrellaExports.add(m[1]);
  }

  // Pin each sub-package to the version this umbrella release depends on so the
  // catalog describes one coherent install rather than a moving target.
  const subPackages = Object.entries(pkgJson.dependencies || {})
    .filter(([name]) => name.startsWith('@fluentui-copilot/'))
    .map(([name, range]) => ({ name, version: String(range).replace(/^[\^~]/, '') }));

  const sources = await mapLimit(subPackages, CONCURRENCY, async (p) => {
    const url = `${UNPKG}/${p.name}@${p.version}/dist/index.d.ts`;
    try {
      return { ...p, url, text: await fetchText(url, `_copilot-${p.name.split('/')[1]}-${p.version}.d.ts`) };
    } catch {
      return { ...p, url, text: null };
    }
  });

  const components = [];
  const nonComponents = [];
  const exportIndex = new Map();
  for (const sub of sources) {
    if (!sub.text) continue;
    const { src, docs } = maskComments(sub.text);
    for (const m of src.matchAll(/export declare (?:const|function|class) ([A-Za-z_$][\w$]*)/g)) {
      if (!exportIndex.has(m[1])) {
        exportIndex.set(m[1], { pkg: sub.name, umbrella: umbrellaExports.has(m[1]) });
      }
    }
    const consts = [...src.matchAll(/(?:\/\*@(\d+)@\*\/\s*)?export declare const ([A-Z][\w$]*)\s*:\s*([^;=]+);/g)];
    for (const c of consts) {
      const name = c[2];
      const declType = c[3].replace(/\s+/g, ' ').trim();
      const doc = c[1] !== undefined ? cleanJsDoc(docs[Number(c[1])]) : '';
      const deprecated = (doc.match(/@deprecated\s*([^@]*)/i) || [])[1];
      const generic = GENERIC_COMPONENT.exec(declType);
      if (!COMPONENT_TYPE_HEAD.test(declType) && !generic) {
        // Not a component, but not noise either: CopilotTheme is a value you
        // spread onto CopilotProvider. Record what it actually is rather than
        // inventing a component record for it.
        if (
          !/ClassNames$/.test(name) &&
          !/^[A-Z][A-Z0-9_]+$/.test(name) &&
          !/^(?:string|Context<|Provider<|SlotClassNames<)/.test(declType)
        ) {
          nonComponents.push({ name, package: sub.name, type: declType, umbrellaExport: umbrellaExports.has(name) });
        }
        continue;
      }
      const propsTypeName =
        (generic && generic[1]) || (declType.match(/<\s*([A-Za-z_$][\w$]*)\s*>/) || [])[1] || null;
      const propsBody = propsTypeName ? resolveType(src, propsTypeName) : null;

      const own = [];
      const seenProp = new Set();
      const collect = (expr) => {
        for (const obj of topLevelObjects(expr)) {
          for (const mem of typeMembers(obj, docs)) {
            if (seenProp.has(mem.name)) continue;
            seenProp.add(mem.name);
            own.push(mem);
          }
        }
      };
      if (propsBody) {
        collect(propsBody);
        for (const alias of intersectedNames(propsBody)) {
          const body = resolveType(src, alias);
          if (body && body.trim().startsWith('{')) collect(body);
        }
      }

      const slotsTypeName =
        (propsBody && (propsBody.match(/ComponentProps<(\w+)>/) || [])[1]) || `${name}Slots`;
      const slotsBody = resolveType(src, slotsTypeName);
      const slots = slotsBody && slotsBody.trim().startsWith('{')
        ? typeMembers(slotsBody, docs).map((s) => s.name)
        : [];

      const deprecated2 = deprecated;
      components.push({
        name,
        subPackage: sub.name,
        subPackageVersion: sub.version,
        subPackageUrl: sub.url,
        umbrellaExport: umbrellaExports.has(name),
        description: describeFromDoc(doc, name),
        propsType: propsTypeName,
        // A props type declared in another package (ButtonProps, TextPresetProps)
        // cannot be read from this file - say so instead of shipping an empty
        // prop list that reads as "this component takes no props".
        propsTypeExternal: !!propsTypeName && !propsBody,
        deprecated: deprecated2 ? deprecated2.trim() : null,
        keyProps: own.map((m) => copilotProp(m, slots)),
        slots,
      });
    }
  }
  components.sort((a, b) => a.name.localeCompare(b.name));

  // A retirement map that has gone stale is worse than none: it would delete a
  // component that upstream has since shipped.
  const live = new Set(components.map((c) => c.name));
  const stale = Object.keys(RETIRED_RECORDS).filter((n) => live.has(n));
  if (stale.length) {
    throw new Error(`RETIRED_RECORDS lists ${stale.join(', ')}, but the suite now exports them.`);
  }
  return { version, barrelUrl, umbrellaExports, ownerOf, subPackages, components, exportIndex, nonComponents };
}

function describeFromDoc(doc, name) {
  if (!doc) return '';
  const text = doc.replace(/@\w+[^@]*/g, '').trim();
  if (!text || new RegExp(`^${name}\\s*(Props|Component)?$`, 'i').test(text)) return '';
  return text;
}

function copilotProp(member, slots) {
  const prop = { name: member.name, type: normalizeType(member.type), required: !member.optional };
  const def = (member.doc || '').match(/@default\s+(\S[^@]*)/);
  if (def) prop.default = def[1].trim();
  const desc = describeFromDoc(member.doc, member.name);
  if (desc) prop.description = desc;
  const dep = (member.doc || '').match(/@deprecated\s*([^@]*)/i);
  if (dep) prop.deprecated = (dep[1] || '').trim() || 'Deprecated upstream.';
  if (slots.includes(member.name) || isSlotType(member.type)) prop.slot = true;
  return prop;
}

// ---------------------------------------------------------------------------
// @fluentui/react-icons - just enough to confirm the Icon record
// ---------------------------------------------------------------------------

async function verifyIcons(sampleIcons) {
  const version = await resolveLatest(ICONS_PACKAGE);
  const base = `${UNPKG}/${ICONS_PACKAGE}@${version}`;
  const found = new Map();
  const bundle = await fetchText(`${base}/lib/utils/bundleIcon.d.ts`, `_icons-bundleIcon-${version}.d.ts`);
  if (/export declare const bundleIcon/.test(bundle)) {
    found.set('bundleIcon', `${base}/lib/utils/bundleIcon.d.ts`);
  }
  const index = await fetchText(`${base}/lib/index.d.ts`, `_icons-index-${version}.d.ts`);
  const chunks = [...new Set([...index.matchAll(/\.\/icons\/(chunk-\d+)\.js/g)].map((m) => m[1]))];
  const wanted = sampleIcons.filter((n) => n !== 'bundleIcon');
  for (const chunk of chunks) {
    if (wanted.every((n) => found.has(n))) break;
    const text = await fetchText(`${base}/lib/icons/${chunk}.d.ts`, `_icons-${chunk}-${version}.d.ts`);
    for (const n of wanted) {
      if (!found.has(n) && new RegExp(`export declare const ${n}\\s*:`).test(text)) {
        found.set(n, `${base}/lib/icons/${chunk}.d.ts`);
      }
    }
  }
  return { version, found, packageUrl: `${base}/package.json` };
}

// ---------------------------------------------------------------------------
// api.md - the authoritative "which package owns this export" map
// ---------------------------------------------------------------------------

function parseApiMd(text) {
  const ownerOf = new Map(); // symbol -> owning package
  const suiteExports = new Set(); // symbols re-exported from @fluentui/react-components
  for (const line of text.split('\n')) {
    let m = line.match(/^import \{ ([A-Za-z_$][\w$]*) \} from '([^']+)';$/);
    if (m) { ownerOf.set(m[1], m[2]); continue; }
    m = line.match(/^export \{ ([A-Za-z_$][\w$]*) \}$/);
    if (m) { suiteExports.add(m[1]); continue; }
    m = line.match(/^export (?:declare )?(?:const|function|type|interface|class) ([A-Za-z_$][\w$]*)/);
    if (m) suiteExports.add(m[1]);
  }
  return { ownerOf, suiteExports };
}

// ---------------------------------------------------------------------------
// Markdown parsing
// ---------------------------------------------------------------------------

/** Split a page into headed sections, ignoring headings inside fenced code. */
function parsePage(text) {
  const lines = text.split(/\r?\n/);
  const sections = [];
  let intro = [];
  let cur = null;
  let inCode = false;
  for (const raw of lines) {
    if (/^\s*```/.test(raw)) {
      inCode = !inCode;
      (cur ? cur.lines : intro).push(raw);
      continue;
    }
    const m = !inCode && raw.match(/^(#{1,4})\s+(.+?)\s*$/);
    if (m) {
      cur = { level: m[1].length, name: m[2], lines: [] };
      sections.push(cur);
      continue;
    }
    (cur ? cur.lines : intro).push(raw);
  }
  const titleSection = sections.find((s) => s.level === 1);
  const title = titleSection ? titleSection.name : '';
  // Description: first non-empty paragraph after the H1, before the next heading.
  const descLines = [];
  if (titleSection) {
    for (const l of titleSection.lines) {
      if (!l.trim()) { if (descLines.length) break; continue; }
      descLines.push(l.trim());
    }
  }
  return { title, description: descLines.join(' ').trim(), sections, intro };
}

const PROP_HEADER = /^\|\s*Name\s*\|\s*Type\s*\|\s*Required\s*\|\s*Default\s*\|\s*Description\s*\|\s*$/;

/**
 * Parse a docgen prop table. Rows can wrap across lines (a `Default` cell may
 * contain a paragraph), and the Type cell contains raw `|` characters, so rows
 * are re-joined by their `| \`name\` |` start marker and the Type cell is
 * delimited by its backticks rather than by splitting on `|`.
 */
function parsePropTable(lines) {
  let start = -1;
  for (let i = 0; i < lines.length; i++) {
    if (PROP_HEADER.test(lines[i])) { start = i; break; }
    if (/^#{1,4}\s/.test(lines[i])) break;
  }
  if (start < 0) return null;
  let i = start + 1;
  if (!/^\|[-\s|]+\|$/.test(lines[i] || '')) return null;
  i++;

  const rows = [];
  let buf = null;
  for (; i < lines.length; i++) {
    const line = lines[i];
    if (/^\|\s*`/.test(line)) {
      if (buf) rows.push(buf);
      buf = line;
    } else if (buf !== null) {
      if (/^\s*$/.test(line) && buf.trimEnd().endsWith('|')) { rows.push(buf); buf = null; continue; }
      if (/^#{1,4}\s/.test(line) || /^\s*```/.test(line)) break;
      buf += ' ' + line.trim();
    }
  }
  if (buf) rows.push(buf);

  const props = [];
  for (const row of rows) {
    const parsed = parsePropRow(row.replace(/\s+/g, ' ').trim());
    if (parsed) props.push(parsed);
  }
  return props;
}

function parsePropRow(row) {
  const head = row.match(/^\|\s*`([^`]+)`\s*\|\s*`([^`]*)`\s*\|\s*(Yes|No)\s*\|(.*)$/);
  if (!head) return null;
  const [, name, rawType, required, rest] = head;
  // Do NOT trim before slicing: an empty Default cell renders as "|  |  |", and
  // trimming first eats the leading space that makes the " | " separator findable.
  let tail = rest.replace(/\s*\|\s*$/, ' ');
  const sep = tail.indexOf(' | ');
  const rawDefault = (sep >= 0 ? tail.slice(0, sep) : tail).trim();
  const rawDesc = (sep >= 0 ? tail.slice(sep + 3) : '').trim();

  const prop = { name, type: normalizeType(rawType), required: required === 'Yes' };
  if (rawDefault) prop.default = rawDefault;
  const { description, deprecated } = splitDeprecated(rawDesc);
  if (description) prop.description = description;
  if (deprecated) prop.deprecated = deprecated;
  if (isSlotType(rawType) || isSlotType(prop.type) || SLOT_NAME_HINTS.has(name)) prop.slot = true;
  return prop;
}

function splitDeprecated(desc) {
  if (!desc) return { description: '', deprecated: null };
  const m = desc.match(/@deprecated\s*(.*)$/i);
  if (!m) return { description: desc, deprecated: null };
  return {
    description: desc.slice(0, m.index).trim(),
    deprecated: (m[1] || '').trim() || 'Deprecated upstream.',
  };
}

const isSlotType = (t) =>
  /WithSlotShorthandValue<|(?:^|[^\w])Slot</.test(t) || /\bPresenceMotionSlotProps\b|\bMotionSlotProps\b/.test(t);

/** Props that are slots by contract but whose docgen type shows no Slot<>. */
const SLOT_NAME_HINTS = new Set(['mountNode']);

const UNION_LITERAL =
  /^(?:"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|-?\d+(?:\.\d+)?|true|false|null|undefined)$/;

function rejoinLiteralUnion(t) {
  const parts = t.split(/\s*\|\s*|\s+/).filter(Boolean);
  if (parts.length < 2 || !parts.every((p) => UNION_LITERAL.test(p))) return null;
  return parts.join(' | ');
}

/**
 * Docgen renders literal unions with the `|` separators stripped
 * (`"small" "medium"`), while structural types keep theirs. Restore the union
 * pipes and collapse the enormous inlined slot shorthand back to `Slot<'tag'>`,
 * which is the type name the public API actually uses.
 */
function normalizeType(raw) {
  let t = String(raw).trim();
  if (!t) return t;

  t = t.replace(/NonNullable<WithSlotShorthandValue<\{ as\?: "([\w-]+)"; \}[\s\S]*?& \{ \.\.\.; \}> \| null>/g, "NonNullable<Slot<'$1'>>");
  t = t.replace(/WithSlotShorthandValue<\{ as\?: "([\w-]+)"; \}[\s\S]*?& \{ \.\.\.; \}> \| null/g, "Slot<'$1'>");
  t = t.replace(/\(\{ as\?: "([\w-]+)"; \}[\s\S]*?& \{ \.\.\.; \}\)/g, "Slot<'$1'>");
  t = t.replace(/WithSlotShorthandValue<\{ as\?: "([\w-]+)"; \}[\s\S]*?& \{ \.\.\.; \}>/g, "Slot<'$1'>");
  t = t.replace(/NonNullable<WithSlotShorthandValue<([\w.]+)> \| null>/g, 'NonNullable<Slot<$1>>');
  t = t.replace(/WithSlotShorthandValue<([\w.]+)> \| null/g, 'Slot<$1>');
  t = t.replace(/WithSlotShorthandValue<([\w.]+)>/g, 'Slot<$1>');

  // Re-join adjacent literals into a real union. Docgen prints literal unions
  // with the pipes stripped ("small" "medium", or 16 20 24 for numeric unions)
  // while keeping them in structural types, so this cannot be a blanket split.
  const rejoined = rejoinLiteralUnion(t);
  t = rejoined !== null ? rejoined : t.replace(/"((?:[^"\\]|\\.)*)"\s+(?=")/g, '"$1" | ');

  t = t.replace(/\s+/g, ' ').trim();
  if (t.length > MAX_TYPE_LEN) t = t.slice(0, MAX_TYPE_LEN - 1).trimEnd() + '\u2026';
  return t;
}

/** `### Do` / `### Don't` bullets under Best practices / Accessibility. */
function parseBestPractices(sections, idx) {
  const parent = sections[idx];
  const out = { do: [], dont: [] };
  for (let i = idx + 1; i < sections.length && sections[i].level > parent.level; i++) {
    const key = /^Do$/i.test(sections[i].name) ? 'do' : /^Don'?t$/i.test(sections[i].name) ? 'dont' : null;
    if (!key) continue;
    for (const l of sections[i].lines) {
      const m = l.match(/^-\s+(.*\S)\s*$/);
      if (m) out[key].push(m[1].replace(/\*\*/g, '').trim());
    }
  }
  return out.do.length || out.dont.length ? out : null;
}

function codeBlocks(lines) {
  const blocks = [];
  let cur = null;
  for (const l of lines) {
    const fence = l.match(/^\s*```(\w*)/);
    if (fence) {
      if (cur) { blocks.push(cur); cur = null; }
      else if (/^(tsx|jsx|ts|js)?$/.test(fence[1] || '')) cur = { lang: fence[1] || 'tsx', code: [] };
      continue;
    }
    if (cur) cur.code.push(l);
  }
  return blocks.map((b) => ({ lang: b.lang, code: b.code.join('\n') }));
}

// ---------------------------------------------------------------------------
// Samples and imports
// ---------------------------------------------------------------------------

function parseImports(code) {
  const map = new Map(); // package -> Set<identifier>
  const re = /import\s+(?:type\s+)?\{([\s\S]*?)\}\s*from\s*["'](@fluentui[^"']*)["']/g;
  let m;
  while ((m = re.exec(code))) {
    const pkg = m[2];
    const set = map.get(pkg) || new Set();
    for (const raw of m[1].split(',')) {
      const id = raw.trim().split(/\s+as\s+/).pop().trim();
      if (/^[A-Za-z_$][\w$]*$/.test(id)) set.add(id);
    }
    map.set(pkg, set);
  }
  return map;
}

/** Pull the JSX a story returns, dedented, plus the local consts it references. */
function extractSnippet(code) {
  const raw = bestReturnedJsx(code);
  if (!raw) return null;
  let snippet = dedent(raw).trim();
  if (!snippet.startsWith('<')) return null;

  snippet = unwrapLayout(snippet);
  snippet = capSnippet(snippet);

  const locals = localDeclarations(code, snippet);
  return { snippet, locals };
}

/** The JSX element a story renders directly, e.g. `dispatchToast(<Toast>…</Toast>)`. */
function extractElementSnippet(code, tagName) {
  const raw = findJsxElement(code, tagName);
  if (!raw) return null;
  const snippet = capSnippet(unwrapLayout(dedent(raw).trim()));
  return { snippet, locals: localDeclarations(code, snippet) };
}

function dedent(text) {
  const lines = text.split('\n');
  const body = lines.slice(1).filter((l) => l.trim());
  if (!body.length) return text;
  const ind = Math.min(...body.map((l) => l.match(/^\s*/)[0].length));
  return [lines[0], ...lines.slice(1).map((l) => l.slice(ind))].join('\n');
}

/**
 * Scan every `return <expr>;` in the file and keep the largest JSX one. Taking
 * the textually last `return` picks up helper functions declared after the
 * story, and a naive regex cannot cope with JSX spanning dozens of lines.
 */
function bestReturnedJsx(code) {
  let best = null;
  const re = /\breturn\b/g;
  let m;
  while ((m = re.exec(code))) {
    let i = m.index + 6;
    while (i < code.length && /\s/.test(code[i])) i++;
    const end = scanToStatementEnd(code, i);
    if (end < 0) continue;
    let expr = code.slice(i, end).trim();
    while (expr.startsWith('(') && expr.endsWith(')')) expr = expr.slice(1, -1).trim();
    if (!expr.startsWith('<')) continue;
    if (!best || expr.length > best.length) best = expr;
  }
  return best;
}

/** Index of the `;` that ends the expression starting at `start`, or -1. */
function scanToStatementEnd(code, start) {
  let depth = 0;
  let quote = null;
  for (let i = start; i < code.length; i++) {
    const ch = code[i];
    if (quote) {
      if (ch === '\\') { i++; continue; }
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') { quote = ch; continue; }
    if (ch === '(' || ch === '[' || ch === '{') { depth++; continue; }
    if (ch === ')' || ch === ']' || ch === '}') { depth--; if (depth < 0) return -1; continue; }
    if (ch === ';' && depth === 0) return i;
  }
  return -1;
}

/** Balanced source of the first `<Tag …>…</Tag>` (or `<Tag … />`) in `code`. */
function findJsxElement(code, tagName) {
  const openRe = new RegExp(`<${tagName}(?=[\\s/>])`, 'g');
  const m = openRe.exec(code);
  if (!m) return null;
  const start = m.index;
  const tagEnd = scanTagEnd(code, start);
  if (tagEnd < 0) return null;
  if (code[tagEnd - 1] === '/') return code.slice(start, tagEnd + 1);

  let depth = 1;
  let i = tagEnd + 1;
  const tagRe = new RegExp(`<(/?)${tagName}(?=[\\s/>])`, 'g');
  tagRe.lastIndex = i;
  let t;
  while ((t = tagRe.exec(code))) {
    if (t[1] === '/') {
      depth--;
      if (depth === 0) return code.slice(start, code.indexOf('>', t.index) + 1);
    } else {
      const e = scanTagEnd(code, t.index);
      if (e >= 0 && code[e - 1] !== '/') depth++;
    }
  }
  return null;
}

function scanTagEnd(code, start) {
  let quote = null;
  let brace = 0;
  for (let i = start; i < code.length; i++) {
    const ch = code[i];
    if (quote) {
      if (ch === '\\') { i++; continue; }
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') { quote = ch; continue; }
    if (ch === '{') { brace++; continue; }
    if (ch === '}') { brace--; continue; }
    if (ch === '>' && brace === 0) return i;
  }
  return -1;
}

/**
 * Stories wrap their content in a layout `<div className={styles.root}>` or a
 * fragment. Strip one such wrapper so the sample leads with the component being
 * documented instead of scaffolding.
 */
function unwrapLayout(snippet) {
  for (let pass = 0; pass < 2; pass++) {
    const lines = snippet.split('\n');
    if (lines.length < 3) break;
    const first = lines[0].trim();
    const last = lines[lines.length - 1].trim();
    const isFragment = first === '<>' && last === '</>';
    const isDiv = /^<div(\s+className=\{[^{}]*\})?>$/.test(first) && last === '</div>';
    if (!isFragment && !isDiv) break;
    const inner = lines.slice(1, -1);
    if (!inner.some((l) => l.trim())) break;
    const ind = Math.min(...inner.filter((l) => l.trim()).map((l) => l.match(/^\s*/)[0].length));
    snippet = inner.map((l) => l.slice(ind)).join('\n').trim();
  }
  return snippet;
}

/** Match `<Tag ...>` opens against `</Tag>` closes so a cut sample still balances. */
function openTagStack(text) {
  const stack = [];
  const re = /<(\/?)([A-Za-z][\w.]*)((?:"[^"]*"|'[^']*'|\{[^{}]*\}|[^>"'{}])*?)(\/?)>/g;
  let m;
  while ((m = re.exec(text))) {
    const lineStart = text.lastIndexOf('\n', m.index) + 1;
    const indent = text.slice(lineStart).match(/^\s*/)[0];
    if (m[1] === '/') {
      const i = stack.map((s) => s.tag).lastIndexOf(m[2]);
      if (i >= 0) stack.splice(i);
    } else if (!m[4]) {
      stack.push({ tag: m[2], indent });
    }
  }
  return stack;
}

function capSnippet(snippet) {
  const lines = snippet.split('\n');
  if (lines.length <= MAX_SAMPLE_LINES && snippet.length <= MAX_SAMPLE_CHARS) return snippet;

  let end = Math.min(lines.length, MAX_SAMPLE_LINES);
  while (end > 4 && lines.slice(0, end).join('\n').length > MAX_SAMPLE_CHARS) end--;
  // Never cut inside an unterminated tag.
  while (end > 4 && !/>\s*$/.test(lines.slice(0, end).join('\n'))) end--;

  const kept = lines.slice(0, end).join('\n');
  const open = openTagStack(kept);
  const closers = open
    .reverse()
    .map((o) => `${o.indent}</${o.tag}>`);
  const marker = (open.length ? open[0].indent : '') + '  {/* \u2026 truncated; full example at sourceUrl */}';
  return [kept, marker, ...closers].join('\n');
}

/**
 * Top-level declarations the snippet renders as JSX. Story files define local
 * helpers (`const BannerCard = (props) => …`) and bundled icons that are not
 * importable from anywhere, so a sample that uses them is only honest if it
 * carries their real source with it.
 */
function localDeclarations(code, snippet) {
  const seen = new Set();
  const found = [];
  let queue = jsxTags(snippet);
  let budget = 6;
  while (queue.length && budget-- > 0) {
    const next = [];
    for (const name of queue) {
      if (seen.has(name)) continue;
      seen.add(name);
      const decl = findTopLevelDeclaration(code, name);
      if (!decl) continue;
      found.push(decl);
      // A local helper can render further local helpers; pulling only the first
      // level leaves the sample referencing something it never defines.
      for (const t of jsxTags(decl.text)) if (!seen.has(t)) next.push(t);
    }
    queue = next;
  }
  return found.sort((a, b) => a.index - b.index).map((d) => d.text);
}

function findTopLevelDeclaration(code, name) {
  const re = new RegExp(`^(?:const|let)\\s+${name}\\s*(?::[^=]+)?=|^function\\s+${name}\\s*\\(`, 'm');
  const m = re.exec(code);
  if (!m) return null;
  const start = m.index;
  let end;
  if (m[0].startsWith('function')) {
    const brace = code.indexOf('{', start);
    if (brace < 0) return null;
    end = matchBrace(code, brace);
    if (end < 0) return null;
    end += 1;
  } else {
    end = scanToStatementEnd(code, code.indexOf('=', start) + 1);
    if (end < 0) return null;
    end += 1;
  }
  const text = code.slice(start, end);
  if (text.length > MAX_LOCAL_DECL_CHARS) return null;
  return { index: start, text };
}

function matchBrace(code, open) {
  let depth = 0;
  let quote = null;
  for (let i = open; i < code.length; i++) {
    const ch = code[i];
    if (quote) {
      if (ch === '\\') { i++; continue; }
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') { quote = ch; continue; }
    if (ch === '{') depth++;
    else if (ch === '}') { depth--; if (depth === 0) return i; }
  }
  return -1;
}

// A JSX opener is `<Name` at a non-identifier boundary. Requiring that boundary
// keeps TypeScript type arguments (`<DataGridBody<Item>>`, `useOverflowMenu<HTMLButtonElement>()`)
// out of the tag list.
const JSX_TAG = /(^|[^\w>])<([A-Z][\w$]*(?:\.[A-Z][\w$]*)?)(?=[\s/>])/g;
const jsxTags = (s) => [...new Set([...String(s).matchAll(JSX_TAG)].map((m) => m[2].split('.')[0]))];

function referencedIdentifiers(snippet) {
  return new Set([...String(snippet).matchAll(/\b([A-Za-z_$][\w$]*)\b/g)].map((m) => m[1]));
}

function buildImport(importMap, snippet, locals, mustInclude, ownerOf, suiteExports) {
  const referenced = referencedIdentifiers(snippet + '\n' + locals.join('\n'));
  const declared = new Set(locals.map((l) => (l.match(/^const ([A-Z][\w$]*)/) || [])[1]).filter(Boolean));
  const byPkg = new Map();
  const add = (pkg, id) => {
    if (!pkg || declared.has(id)) return;
    const set = byPkg.get(pkg) || new Set();
    set.add(id);
    byPkg.set(pkg, set);
  };
  for (const [pkg, ids] of importMap) for (const id of ids) if (referenced.has(id)) add(pkg, id);
  for (const id of mustInclude) {
    if (declared.has(id)) continue;
    const already = [...byPkg.values()].some((s) => s.has(id));
    if (already) continue;
    if (suiteExports.has(id)) add('@fluentui/react-components', id);
    else if (ownerOf.has(id)) add(ownerOf.get(id), id);
  }
  const order = (p) => (p === '@fluentui/react-components' ? 0 : p === '@fluentui/react-icons' ? 2 : 1);
  return [...byPkg.entries()]
    .sort((a, b) => order(a[0]) - order(b[0]) || a[0].localeCompare(b[0]))
    .map(([pkg, ids]) => `import { ${[...ids].sort().join(', ')} } from '${pkg}';`)
    .join('\n');
}

// ---------------------------------------------------------------------------
// Maturity
// ---------------------------------------------------------------------------

function maturityFor(title, pkg) {
  if (pkg) {
    if (/-preview$/.test(pkg)) return 'preview';
    if (/-compat$/.test(pkg)) return 'compat';
    if (/migration-v\d+-v9/.test(pkg)) return 'migration';
  }
  if (title.startsWith('Compat Components/')) return 'compat';
  if (title.startsWith('Preview Components/')) return 'preview';
  if (title.startsWith('Migration Shims/')) return 'migration';
  if (title.startsWith('Utilities/')) return 'utility';
  if (title.startsWith('Theme/')) return 'utility';
  if (title.startsWith('Motion/')) {
    if (/\(preview\)/.test(title)) return 'preview';
    return title.startsWith('Motion/APIs/') ? 'stable' : 'utility';
  }
  if (title.startsWith('Components/')) return 'stable';
  return 'utility';
}

function categoryFor(name, title, maturity) {
  if (CATEGORY_BY_NAME[name]) return CATEGORY_BY_NAME[name];
  for (const [prefix, cat] of CATEGORY_BY_TITLE_PREFIX) if (title.startsWith(prefix)) return cat;
  if (maturity === 'migration') return 'Migration shims';
  if (maturity === 'utility') return 'Utilities';
  return 'Data display';
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const indexRaw = await fetchText(`${STORYBOOK}/index.json`, '_index.json');
  const index = JSON.parse(indexRaw);
  const apiMd = await fetchText(API_MD, '_react-components.api.md');
  const { ownerOf, suiteExports } = parseApiMd(apiMd);

  const docs = Object.values(index.entries).filter(
    (e) => e.type === 'docs' && !e.title.startsWith('Concepts/') && !e.title.startsWith('Theme/')
  );

  const pages = await mapLimit(docs, CONCURRENCY, async (entry) => {
    const id = entry.id.replace(/--docs$/, '');
    const text = await fetchText(`${STORYBOOK}/llms/${id}.txt`, `${id}.txt`);
    return { entry, id, text };
  });

  const generated = [];
  const skipped = [];
  const pageRecordNames = new Set();
  const emittedSubNames = new Map(); // name -> owning record id

  for (const { entry, id, text } of pages) {
    const page = parsePage(text);
    const title = page.title || entry.title;
    const segments = title.split('/');
    const leaf = segments[segments.length - 1];
    const name = leaf.replace(/\s+/g, '');

    const propsIdx = page.sections.findIndex((s) => s.level === 2 && /^Props$/i.test(s.name));
    const props = propsIdx >= 0 ? parsePropTable(page.sections[propsIdx].lines) : null;

    const examplesIdx = page.sections.findIndex((s) => s.level === 2 && /^Examples$/i.test(s.name));
    const examples = [];
    if (examplesIdx >= 0) {
      for (let i = examplesIdx + 1; i < page.sections.length && page.sections[i].level > 2; i++) {
        if (page.sections[i].level !== 3) continue;
        const blocks = codeBlocks(page.sections[i].lines);
        if (blocks.length) examples.push({ name: page.sections[i].name, code: blocks[0].code });
      }
    }

    const allImports = new Map();
    for (const ex of examples) {
      for (const [pkg, ids] of parseImports(ex.code)) {
        const set = allImports.get(pkg) || new Set();
        for (const i of ids) set.add(i);
        allImports.set(pkg, set);
      }
    }

    const isIdentifier = /^[A-Za-z_$][\w$]*$/.test(name);
    const importedSomewhere = [...allImports.values()].some((s) => s.has(name));
    const realExport = isIdentifier && (importedSomewhere || suiteExports.has(name) || ownerOf.has(name));
    if (!realExport) {
      // A docs heading is not proof that an export exists. Emitting a record for
      // one produces exactly the failure this rewrite exists to remove: an
      // `import { X } from '@fluentui/react-components'` that does not resolve.
      skipped.push(`${title} (no matching export named "${name}")`);
      continue;
    }
    if (!props && !importedSomewhere && !suiteExports.has(name)) {
      skipped.push(`${title} (no props table)`);
      continue;
    }

    const pkg = resolvePackage(name, allImports, ownerOf, suiteExports);
    const maturity = maturityFor(title, pkg);
    const sourceUrl = `${STORYBOOK}/?path=/docs/${entry.id}`;
    const docsSourceUrl = `${STORYBOOK}/llms/${id}.txt`;

    const bestIdx = page.sections.findIndex(
      (s) => s.level === 2 && /^(Best practices|Accessibility)$/i.test(s.name)
    );
    const bestPractices = bestIdx >= 0 ? parseBestPractices(page.sections, bestIdx) : null;

    const sample = buildSample(examples, allImports, name, ownerOf, suiteExports);

    const subSections = collectSubcomponents(page.sections);

    const record = {
      id,
      name,
      maturity,
      description: page.description,
      npmPackage: pkg,
      reactImport: sample.reactImport || defaultImport(name, pkg, suiteExports),
      keyProps: (props || []).filter((p) => !NOISE_PROPS.has(p.name)),
      slots: (props || []).filter((p) => p.slot).map((p) => p.name),
      sample: sample.sample,
      sampleName: sample.sampleName,
      sampleNote: sample.sampleNote,
      subcomponents: subSections.map((s) => s.name),
      verified: true,
      sourceUrl,
      docsSourceUrl,
      _title: title,
    };
    if (bestPractices) record.bestPractices = bestPractices;
    if (!record.slots.length) delete record.slots;
    if (!record.subcomponents.length) delete record.subcomponents;
    if (!record.sample) { delete record.sample; delete record.sampleName; }
    if (!record.sampleNote) delete record.sampleNote;
    generated.push(record);
    pageRecordNames.add(name);

    for (const sub of subSections) {
      // A subcomponent that has its own docs page (MenuList, CarouselNav), that
      // repeats the page's own component (Tree/Tree), or that a sibling page
      // already documented (MenuItem lives on both Menu and MenuList) must not
      // become a second record under the same name - `name` is what callers key on.
      if (sub.name === name) continue;
      if (emittedSubNames.has(sub.name)) continue;
      const subIsExport =
        [...allImports.values()].some((s) => s.has(sub.name)) ||
        suiteExports.has(sub.name) ||
        ownerOf.has(sub.name);
      if (!subIsExport) {
        // e.g. Text documents a `Presets` subcomponent heading; there is no
        // `Presets` export - the real exports are Display, Title1, Body1, ...
        skipped.push(`${title}/${sub.name} (subcomponent heading with no matching export)`);
        continue;
      }
      const subProps = (parsePropTable(sub.lines) || []).filter((p) => !NOISE_PROPS.has(p.name));
      const subPkg = resolvePackage(sub.name, allImports, ownerOf, suiteExports) || pkg;
      const subSample = buildSample(examples, allImports, sub.name, ownerOf, suiteExports);
      const subRecord = {
        id: `${id}#${sub.name}`,
        name: sub.name,
        maturity: maturityFor(title, subPkg),
        description: sub.description || `${sub.name} - subcomponent of ${name}.`,
        npmPackage: subPkg,
        reactImport: subSample.reactImport || defaultImport(sub.name, subPkg, suiteExports),
        keyProps: subProps,
        slots: subProps.filter((p) => p.slot).map((p) => p.name),
        parent: name,
        sample: subSample.sample,
        sampleName: subSample.sampleName,
        sampleNote: subSample.sampleNote,
        verified: true,
        sourceUrl,
        docsSourceUrl,
        _title: `${title}/${sub.name}`,
      };
      if (!subRecord.slots.length) delete subRecord.slots;
      if (!subRecord.sample) { delete subRecord.sample; delete subRecord.sampleName; }
      if (!subRecord.sampleNote) delete subRecord.sampleNote;
      generated.push(subRecord);
      emittedSubNames.set(sub.name, subRecord.id);
    }
  }

  // Subcomponent records for names that later turned out to have their own page
  // (page order is not guaranteed) are redundant - drop them.
  for (let i = generated.length - 1; i >= 0; i--) {
    const g = generated[i];
    if (g.parent && pageRecordNames.has(g.name)) generated.splice(i, 1);
  }

  // The AI suite has no Storybook, so it comes straight from the npm tarballs.
  const copilot = await loadCopilotSuite();
  const suiteRecords = copilot.components.map((c) => copilotRecord(c, copilot));
  generated.push(...suiteRecords);

  // `Icon` is @fluentui/react-icons, outside the Storybook. Confirm the exact
  // symbols our sample uses rather than asserting the package from memory.
  const iconSymbols = ['AddRegular', 'AddFilled', 'bundleIcon'];
  const icons = await verifyIcons(iconSymbols);
  const iconsOk = iconSymbols.every((s) => icons.found.has(s));
  if (iconsOk) generated.push(iconRecord(icons, iconSymbols));

  const wc = await loadWebComponents();

  const merged = mergeWithExisting(generated, skipped, {
    wc, copilot, icons: iconsOk ? icons : null, suiteExports,
  });
  report(merged, generated, skipped, wc, copilot);

  if (DRY_RUN) {
    console.log('\n--dry-run: nothing written.');
    return;
  }
  fs.writeFileSync(OUT, JSON.stringify(merged.data, null, 2) + '\n');
  console.log(`\nwrote ${path.relative(ROOT, OUT)} (${(fs.statSync(OUT).size / 1024).toFixed(0)} KB)`);
}

const kebab = (s) => String(s).replace(/([a-z0-9])([A-Z])/g, '$1-$2').replace(/\s+/g, '-').toLowerCase();

function copilotRecord(c, suite) {
  const from = c.umbrellaExport ? COPILOT_UMBRELLA : c.subPackage;
  const notes = [];
  if (!c.umbrellaExport) {
    notes.push(
      `Exported by ${c.subPackage} but NOT re-exported by ${COPILOT_UMBRELLA}@${suite.version} - ` +
        'import it from the sub-package.'
    );
  }
  if (c.propsTypeExternal) {
    notes.push(
      `Props are \`${c.propsType}\`, declared outside ${c.subPackage}, so keyProps is empty here - ` +
        'that is a limit of this source, not a statement that the component takes no props.'
    );
  }
  const rec = {
    id: `copilot-${kebab(c.name)}`,
    name: c.name,
    category: 'AI / Copilot',
    maturity: c.deprecated ? 'deprecated' : 'preview',
    description: c.description,
    npmPackage: from,
    subPackage: c.subPackage,
    subPackageVersion: c.subPackageVersion,
    umbrellaExport: c.umbrellaExport,
    propsType: c.propsType,
    reactImport: `import { ${c.name} } from '${from}';`,
    // The umbrella works but pulls the whole suite; the types live in the
    // sub-packages, and a few components are ONLY in the sub-package.
    reactImportTreeShakable: `import { ${c.name} } from '${c.subPackage}';`,
    keyProps: c.keyProps,
    slots: c.slots,
    verified: true,
    sourceUrl: c.subPackageUrl,
    suiteSourceUrl: suite.barrelUrl,
    _title: `AI Copilot/${c.name}`,
  };
  if (c.deprecated) rec.deprecated = c.deprecated;
  if (notes.length) rec.note = notes.join(' ');
  if (!rec.slots.length) delete rec.slots;
  if (!rec.description) delete rec.description;
  if (!rec.propsType) delete rec.propsType;
  return rec;
}

function iconRecord(icons, symbols) {
  return {
    id: 'icons-icon',
    name: 'Icon',
    category: 'Data display',
    maturity: 'stable',
    description:
      'Fluent 2 icons ship as individual React components (Regular and Filled variants per icon, at ' +
      'several sizes) from @fluentui/react-icons. There is no generic <Icon> component - import the ' +
      'icon you need, or pair a Regular/Filled couple with bundleIcon.',
    npmPackage: ICONS_PACKAGE,
    reactImport: `import { ${symbols.join(', ')} } from '${ICONS_PACKAGE}';`,
    keyProps: [
      { name: 'className', type: 'string', required: false, description: 'Style the icon with makeStyles; size and color follow font-size and color.' },
      { name: 'primaryFill', type: 'string', required: false, description: 'Overrides the fill; prefer inheriting currentColor so the icon follows the theme.' },
      { name: 'aria-label', type: 'string', required: false, description: 'Required when the icon is the only content of an interactive element.' },
      { name: 'aria-hidden', type: 'boolean', required: false, description: 'Set on decorative icons that sit next to a visible label.' },
    ],
    sample: 'const Add = bundleIcon(AddFilled, AddRegular);\n\n<Add aria-hidden />',
    verified: true,
    sourceUrl: icons.packageUrl,
    _title: 'Icons/Icon',
  };
}

function resolvePackage(name, allImports, ownerOf, suiteExports) {
  if (suiteExports.has(name)) return '@fluentui/react-components';
  for (const [pkg, ids] of allImports) {
    if (pkg === '@fluentui/react-components' || pkg === '@fluentui/react-icons') continue;
    if (ids.has(name)) return pkg;
  }
  if (ownerOf.has(name)) return ownerOf.get(name);
  for (const [pkg, ids] of allImports) if (ids.has(name)) return pkg;
  for (const pkg of allImports.keys()) {
    if (pkg !== '@fluentui/react-components' && pkg !== '@fluentui/react-icons') return pkg;
  }
  return '@fluentui/react-components';
}

function defaultImport(name, pkg, suiteExports) {
  const from = suiteExports.has(name) ? '@fluentui/react-components' : pkg || '@fluentui/react-components';
  return `import { ${name} } from '${from}';`;
}

function buildSample(examples, allImports, name, ownerOf, suiteExports) {
  const candidates = [];
  const push = (ex, snip, kind) => {
    if (!snip || !snip.snippet) return;
    const prefRank = SAMPLE_PREFERENCE.indexOf(ex.name);
    const importMap = parseImports(ex.code);
    const must = new Set([name, ...jsxTags(snip.snippet)]);
    const reactImport = buildImport(importMap, snip.snippet, snip.locals, must, ownerOf, suiteExports);
    const declared = new Set(
      [...(snip.locals.join('\n')).matchAll(/^\s*(?:const|let|function)\s+([A-Z][\w$]*)/gm)].map((m) => m[1])
    );
    // A tag the record neither imports nor carries the source for is a sample
    // the reader cannot run - the exact failure mode this rewrite removes.
    const unresolved = jsxTags(snip.snippet).filter(
      (t) => !declared.has(t) && !new RegExp(`\\b${t}\\b`).test(reactImport)
    );
    candidates.push({
      ex,
      snip,
      reactImport,
      unresolved: unresolved.length,
      usesComponent: new RegExp(`<${name}(?=[\\s/>])`).test(snip.snippet),
      // `<Nav>` is never rendered directly - `<NavDrawer>`/`<NavItem>` are. A
      // sample from the same family still teaches the API; an unrelated one does not.
      usesRelated: new RegExp(`<${name}[A-Z]`).test(snip.snippet),
      truncated: snip.snippet.includes('truncated; full example at sourceUrl'),
      prefRank: prefRank < 0 ? SAMPLE_PREFERENCE.length : prefRank,
      kind,
      len: snip.snippet.length,
    });
  };
  for (const ex of examples) {
    push(ex, extractSnippet(ex.code), 'story');
    if (/^[A-Z]/.test(name)) push(ex, extractElementSnippet(ex.code, name), 'element');
  }
  if (!candidates.length) return { sample: null, sampleName: null, reactImport: null, sampleNote: null };

  // A sample that does not render the component it documents teaches nothing,
  // and a short complete example beats a preferred-but-clipped one.
  candidates.sort(
    (a, b) =>
      Number(b.usesComponent) - Number(a.usesComponent) ||
      a.unresolved - b.unresolved ||
      Number(b.usesRelated) - Number(a.usesRelated) ||
      Number(a.truncated) - Number(b.truncated) ||
      a.prefRank - b.prefRank ||
      (a.kind === b.kind ? 0 : a.kind === 'story' ? -1 : 1) ||
      a.len - b.len
  );
  const best = candidates[0];
  const { ex, snip, reactImport } = best;
  const sample = snip.locals.length ? `${snip.locals.join('\n\n')}\n\n${snip.snippet}` : snip.snippet;
  // Some documented components are only ever shown through a sibling (`<Nav>`
  // never appears as JSX - every example renders `<NavDrawer>`). Saying so beats
  // shipping a sample whose tags do not match the record's name.
  const sampleNote =
    /^[A-Z]/.test(name) && !best.usesComponent
      ? `No upstream example renders <${name}> directly; this sample is the closest documented usage from the same page.`
      : null;
  return { sample, sampleName: ex.name, reactImport, sampleNote };
}

function collectSubcomponents(sections) {
  const idx = sections.findIndex((s) => s.level === 2 && /^Subcomponents$/i.test(s.name));
  if (idx < 0) return [];
  const out = [];
  for (let i = idx + 1; i < sections.length && sections[i].level > 2; i++) {
    if (sections[i].level !== 3) continue;
    const name = sections[i].name.replace(/\s+/g, '');
    if (!/^[A-Za-z_$][\w$]*$/.test(name)) continue;
    const lines = [...sections[i].lines];
    const description = (sections[i].lines.find((l) => l.trim()) || '').trim();
    for (let j = i + 1; j < sections.length && sections[j].level > 3; j++) lines.push(...sections[j].lines);
    out.push({ name, description, lines });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Merge with the hand-authored file
// ---------------------------------------------------------------------------

const HAND_AUTHORED_KEYS = [
  'category', 'a11y', 'docs', 'slug', 'storybookUrl', 'note',
  'siteComponent', 'apiComponents', 'public', 'stability', 'package', 'siteGuidance',
  'retiredNames',
];

function mergeWithExisting(generated, skipped, ctx) {
  const existingRaw = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : { components: [] };
  const existing = existingRaw.components || [];
  const before = existing.length;

  const isUnverifiable = (c) =>
    UNVERIFIABLE_NAMES.has(c.name) ||
    UNVERIFIABLE_PREFIXES.some((p) => (c.reactImport || '').includes(p) || (c.npmPackage || '').startsWith(p));

  // 1. Fold every prose-named record, and every record whose name is not a real
  //    export, into the code-identifier record it duplicates or was mistaken for.
  const byName = new Map(existing.map((c) => [c.name, c]));
  const folds = [
    ...existing.filter((c) => /\s/.test(c.name)).map((c) => ({ rec: c, kind: 'prose' })),
    ...existing.filter((c) => RETIRED_RECORDS[c.name]).map((c) => ({ rec: c, kind: 'retired' })),
  ];
  const foldedInto = [];
  const createdFromProse = [];
  const retired = [];
  for (const { rec: p, kind } of folds) {
    const retirement = RETIRED_RECORDS[p.name];
    const targetName = retirement ? retirement.target : PROSE_TARGET[p.name] || (p.apiComponents || [])[0];
    if (!targetName) throw new Error(`record "${p.name}" has no code-identifier target`);
    let target = byName.get(targetName);
    if (!target) {
      target = { ...p, name: targetName };
      delete target.siteGuidance;
      delete target.sample;
      byName.set(targetName, target);
      existing.push(target);
      createdFromProse.push(`${p.name} -> ${targetName}`);
    } else if (kind === 'prose') {
      foldedInto.push(`${p.name} -> ${targetName}`);
    }
    if (kind === 'retired') retired.push(`${p.name} -> ${targetName}`);
    target.siteComponent = true;
    target.siteGuidance = {
      name: p.name,
      slug: p.slug,
      description: p.description,
      a11y: p.a11y,
      note: p.note,
      // A retired record's sample renders a tag that does not exist, so it is
      // deliberately not carried forward.
      sample: kind === 'retired' ? undefined : p.sample,
      storybookUrl: p.storybookUrl,
      docs: p.docs,
      apiComponents: p.apiComponents,
    };
    if (retirement) {
      target.retiredNames = [...(target.retiredNames || []), { was: p.name, reason: retirement.reason }];
    }
    for (const k of Object.keys(target.siteGuidance)) {
      if (target.siteGuidance[k] === undefined) delete target.siteGuidance[k];
    }
    if (!target.apiComponents && p.apiComponents) target.apiComponents = p.apiComponents;
    if (!target.storybookUrl && p.storybookUrl) target.storybookUrl = p.storybookUrl;
    if (!target.slug && p.slug) target.slug = p.slug;
  }
  const foldedNames = new Set(folds.map((f) => f.rec.name));
  const survivors = existing.filter((c) => !foldedNames.has(c.name));

  // 2. Anything hand-authored with no upstream counterpart is either a known
  //    unverifiable record or a bug - fail loudly rather than shipping it as
  //    if it were grounded.
  const genByName = new Map();
  for (const g of generated) if (!genByName.has(g.name)) genByName.set(g.name, g);
  const genIds = new Set(generated.map((g) => g.id));
  const orphans = survivors.filter(
    (c) => !genIds.has(c.id) && !genByName.has(c.name) && !isUnverifiable(c)
  );
  if (orphans.length) {
    throw new Error(
      `${orphans.length} hand-authored component(s) have no upstream counterpart and are not on the ` +
        `unverifiable allowlist: ${orphans.map((o) => o.name).join(', ')}`
    );
  }

  // 3. Generated facts win; hand-authored prose is carried forward.
  const out = [];
  const usedExisting = new Set();
  const previousTags = new Map();
  const pkgScope = (p) => String(p || '').split('/')[0];
  // The AI-suite `Attachment` and the V0 migration shim `Attachment` are
  // unrelated components with the same name. Matching on the bare name would
  // hand one of them the other's category, prose and links.
  const compatible = (hand, g) => {
    const handPkg =
      hand.npmPackage ||
      (hand.package && hand.package.name) ||
      (String(hand.reactImport || '').match(/from '([^']+)'/) || [])[1] ||
      '';
    if (!handPkg || !g.npmPackage) return true;
    return pkgScope(handPkg) === pkgScope(g.npmPackage);
  };
  for (const g of generated) {
    // Match on the stable id first. Two records legitimately share the name
    // `List`, so name-only matching would hand the V0 shim the v9 component's
    // hand-authored accessibility prose on the next regeneration.
    const hand =
      survivors.find((c) => c.id === g.id && !usedExisting.has(c)) ||
      survivors.find((c) => c.name === g.name && !c.id && compatible(c, g) && !usedExisting.has(c)) ||
      survivors.find((c) => c.name === g.name && compatible(c, g) && !usedExisting.has(c)) ||
      null;
    if (hand) usedExisting.add(hand);
    if (hand && hand.webComponent) previousTags.set(g.id, hand.webComponent);
    const rec = { ...g };
    if (hand) for (const k of HAND_AUTHORED_KEYS) if (hand[k] !== undefined) rec[k] = hand[k];
    // The AI suite has no Storybook examples to mine, so a hand-authored sample
    // is the only one there is - carry it, but only after checking every tag it
    // renders is a real export (that is how <LatencyLoader> shipped).
    if (!rec.sample && hand && hand.sample) {
      rec.sample = hand.sample;
      rec.sampleName = hand.sampleName || 'Hand-authored';
      rec._carried = true;
    }
    // A few upstream pages jump straight from the H1 to the prop table. Prefer
    // the hand-authored summary there rather than shipping an empty field.
    if (!rec.description) {
      rec.description =
        (hand && hand.description) ||
        `${g.name} — documented under "${g._title}" in the Fluent UI React Storybook; that page carries no summary paragraph.`;
    }
    rec.category = rec.category || categoryFor(g.name, g._title, g.maturity);
    if (rec.webComponent === undefined) rec.webComponent = null;
    delete rec._title;
    out.push(orderKeys(rec));
  }

  // Samples carried over from hand-authored records were never checked against a
  // real export list - that is how `<LatencyLoader>` shipped under an import that
  // does not resolve. Rebuild their import from the real export index, then hold
  // every sample (generated or carried) to one rule: each tag it renders is
  // either imported by the record or declared inside the sample.
  const recByName = new Map();
  for (const r of out) if (!recByName.has(r.name)) recByName.set(r.name, r);
  const resolveTagPackage = (tag) => {
    const rec = recByName.get(tag);
    if (rec && rec.npmPackage) return rec.npmPackage;
    const ai = ctx.copilot.exportIndex.get(tag);
    if (ai) return ai.umbrella ? COPILOT_UMBRELLA : ai.pkg;
    if (ctx.suiteExports.has(tag)) return '@fluentui/react-components';
    if (/(?:Regular|Filled|Color)$/.test(tag)) return ICONS_PACKAGE;
    return null;
  };
  const droppedSamples = [];
  for (const r of out) {
    const guidanceSample = r.siteGuidance && r.siteGuidance.sample;
    if ((r._carried && r.sample) || guidanceSample) {
      const both = [r.sample, guidanceSample].filter(Boolean).join('\n');
      const declared = declaredInSample(both);
      const tags = jsxTags(both).filter((t) => !declared.has(t));
      if (tags.every((t) => resolveTagPackage(t))) {
        r.reactImport = importForTags(r, tags, resolveTagPackage);
      }
    }
    delete r._carried;
    for (const key of ['', 'siteGuidance']) {
      const holder = key ? r[key] : r;
      if (!holder || !holder.sample) continue;
      const declared = declaredInSample(holder.sample);
      const unresolved = jsxTags(holder.sample).filter(
        (t) => !declared.has(t) && !new RegExp(`\\b${t}\\b`).test(r.reactImport || '')
      );
      if (!unresolved.length) continue;
      droppedSamples.push(`${r.name}${key ? '.siteGuidance' : ''}: <${unresolved.join('>, <')}>`);
      delete holder.sample;
      if (!key) delete r.sampleName;
    }
  }

  // 4. Anything still unmatched has no public source at all. Every record that
  //    used to land here is now read from an npm tarball, so this should stay
  //    empty; if something appears, it is flagged rather than quietly shipped.
  const unverified = [];
  for (const c of survivors) {
    if (usedExisting.has(c)) continue;
    const rec = { ...c };
    rec.id = rec.id || slugId(rec);
    rec.maturity = rec.maturity || 'preview';
    rec.verified = false;
    rec.sourceUrl = null;
    rec.verificationNote =
      'No public source (Fluent UI Storybook, API-Extractor report, or npm tarball via unpkg) could ' +
      'confirm or refute this record. Carried forward from earlier hand-authored research - treat as ' +
      'unverified. See meta.unverified.';
    if (!rec.npmPackage) {
      rec.npmPackage = rec.package && rec.package.name
        ? rec.package.name
        : (rec.reactImport || '').match(/from '([^']+)'/)?.[1] || null;
    }
    for (const p of rec.keyProps || []) if (p.required === undefined) p.required = false;
    unverified.push(orderKeys(rec));
  }
  out.push(...unverified);

  // 5. Web-component tags come only from the shipped custom elements manifest.
  //    Anything we used to claim that the manifest does not register is cleared.
  const wcApplied = [];
  const wcCleared = [];
  const wcByComponent = new Map();
  for (const [cls, entry] of ctx.wc.byClass) {
    const target = Object.prototype.hasOwnProperty.call(WC_CLASS_TO_COMPONENT, cls)
      ? WC_CLASS_TO_COMPONENT[cls]
      : undefined;
    if (target) wcByComponent.set(target, entry);
  }
  const attached = new Set();
  for (const r of out) {
    const entry = wcByComponent.get(r.name);
    const had = previousTags.get(r.id) || null;
    if (entry) {
      attached.add(entry.tag);
      r.webComponent = `<${entry.tag}>`;
      if (entry.define) r.webComponentDefine = entry.define;
      if (entry.attributes.length) r.webComponentAttributes = entry.attributes;
      if (had && had !== r.webComponent) wcApplied.push(`${r.name}: ${had} -> ${r.webComponent}`);
    } else {
      if (had) wcCleared.push(`${r.name}: ${had}`);
      r.webComponent = null;
      delete r.webComponentDefine;
      delete r.webComponentAttributes;
    }
  }
  // A tag can go unattached two ways: no React counterpart exists at all, or the
  // React export exists but the Storybook never documented it, so there is no
  // record to hang it on. Those are different facts and are reported as such.
  const wcUnmapped = [...ctx.wc.byClass.entries()]
    .filter(([, e]) => !attached.has(e.tag))
    .map(([cls, e]) => {
      const target = Object.prototype.hasOwnProperty.call(WC_CLASS_TO_COMPONENT, cls)
        ? WC_CLASS_TO_COMPONENT[cls]
        : undefined;
      return {
        tag: e.tag,
        className: cls,
        reactExport: target && ctx.suiteExports.has(target) ? target : null,
        reason: !target
          ? 'No React v9 counterpart (React composes this with an existing component).'
          : ctx.suiteExports.has(target)
            ? `${target} is exported by @fluentui/react-components but the Storybook does not document ` +
              'it, so there is no record to attach the tag to.'
            : `No catalog record named ${target}.`,
      };
    });

  const collisions = {};
  for (const c of out) (collisions[c.name] = collisions[c.name] || []).push(c.id);
  for (const c of out) {
    const ids = collisions[c.name];
    if (ids.length < 2) delete c.nameCollision;
    else c.nameCollision = ids.filter((i) => i !== c.id);
  }
  // Re-order after the collision pass so a second run over this file produces a
  // byte-identical result.
  for (let i = 0; i < out.length; i++) out[i] = orderKeys(out[i]);

  const counts = { stable: 0, preview: 0, compat: 0, migration: 0, utility: 0, deprecated: 0 };
  for (const c of out) counts[c.maturity] = (counts[c.maturity] || 0) + 1;

  const data = {
    meta: buildMeta(out, counts, skipped, ctx, { wcUnmapped, droppedSamples, retired }),
    components: out,
  };
  return {
    data, before, after: out.length, foldedInto, createdFromProse, retired, unverified, counts,
    collisions, wcApplied, wcCleared, wcUnmapped, droppedSamples,
  };
}

const KEY_ORDER = [
  'id', 'name', 'category', 'maturity', 'description', 'npmPackage', 'package', 'subPackage',
  'subPackageVersion', 'umbrellaExport', 'reactImport', 'reactImportTreeShakable',
  'webComponent', 'webComponentDefine', 'webComponentAttributes',
  'keyProps', 'slots', 'subcomponents', 'parent', 'a11y', 'bestPractices',
  'sample', 'sampleName', 'sampleNote', 'apiComponents', 'siteComponent', 'siteGuidance', 'slug', 'docs',
  'storybookUrl', 'public', 'stability', 'note', 'retiredNames', 'nameCollision', 'verified',
  'verificationNote', 'sourceUrl', 'suiteSourceUrl', 'docsSourceUrl',
];

function orderKeys(rec) {
  const out = {};
  for (const k of KEY_ORDER) if (rec[k] !== undefined) out[k] = rec[k];
  for (const k of Object.keys(rec)) if (out[k] === undefined && rec[k] !== undefined) out[k] = rec[k];
  return out;
}

/** Import statement covering exactly the tags a sample renders, per real package. */
function importForTags(rec, tags, resolvePackage) {
  const byPkg = new Map();
  const add = (pkg, id) => {
    if (!pkg) return;
    const set = byPkg.get(pkg) || new Set();
    set.add(id);
    byPkg.set(pkg, set);
  };
  add(rec.npmPackage, rec.name);
  for (const t of tags) add(resolvePackage(t), t);
  const order = (p) => (p === rec.npmPackage ? 0 : p === '@fluentui/react-components' ? 1 : p === ICONS_PACKAGE ? 3 : 2);
  return [...byPkg.entries()]
    .sort((a, b) => order(a[0]) - order(b[0]) || a[0].localeCompare(b[0]))
    .map(([pkg, ids]) => `import { ${[...ids].sort().join(', ')} } from '${pkg}';`)
    .join('\n');
}

const declaredInSample = (sample) =>
  new Set([...String(sample).matchAll(/^\s*(?:const|let|function)\s+([A-Z][\w$]*)/gm)].map((m) => m[1]));

const slugId = (c) =>
  'unverified-' + String(c.name).replace(/([a-z0-9])([A-Z])/g, '$1-$2').replace(/\s+/g, '-').toLowerCase();

/**
 * Hand-authored records import only their headline component while their sample
 * renders several (`<CopilotChat>` around `<UserMessage>`). Widen the import so
 * the sample is at least self-consistent.
 */
function buildMeta(components, counts, skipped, ctx, extras) {
  const unverified = components.filter((c) => c.verified === false);
  const aiComponents = components.filter((c) => c.category === 'AI / Copilot');
  return {
    title: 'Microsoft Fluent 2 (Fluent UI React v9) component catalog',
    fluentVersion: 'Fluent 2 / Fluent UI React v9',
    reactPackage: '@fluentui/react-components',
    webComponentsPackage: WC_PACKAGE,
    webComponentsPackageVersion: ctx.wc.version,
    generatedBy: 'scripts/generate-components.mjs',
    generatedAt: new Date().toISOString().slice(0, 10),
    sources: [
      {
        id: 'storybook-llms',
        url: `${STORYBOOK}/index.json`,
        detail:
          'Storybook index; every docs entry has a companion LLM markdown page at ' +
          `${STORYBOOK}/llms/<id>.txt carrying the react-docgen prop table (Name/Type/Required/` +
          'Default/Description), Subcomponents, Best practices and compiling Examples.',
        pagesRead: components.filter((c) => c.docsSourceUrl).length,
      },
      {
        id: 'api-extractor',
        url: API_MD,
        detail:
          'API-Extractor report for @fluentui/react-components. Maps every re-exported symbol to ' +
          'the package that owns it, which is how reactImport is resolved rather than assumed.',
      },
      {
        id: 'custom-elements-manifest',
        url: ctx.wc.manifestUrl,
        detail:
          `Custom elements manifest shipped in ${WC_PACKAGE}@${ctx.wc.version}. Every fluent-* tag, ` +
          'its kebab-case attributes and its registration subpath are read from here; a tag that is ' +
          'not in the manifest is cleared rather than carried forward.',
        tagsDeclared: ctx.wc.byClass.size,
      },
      {
        id: 'copilot-npm',
        url: ctx.copilot.barrelUrl,
        detail:
          `${COPILOT_UMBRELLA}@${ctx.copilot.version} rollup d.ts plus each of its ` +
          `${ctx.copilot.subPackages.length} @fluentui-copilot/* sub-package d.ts files (props and ` +
          'slots come from the sub-packages). ai.fluentui.dev is Entra-gated and is not a usable ' +
          'source; the npm tarball is public and is.',
        componentsFound: ctx.copilot.components.length,
      },
      ...(ctx.icons
        ? [{
            id: 'react-icons-npm',
            url: ctx.icons.packageUrl,
            detail:
              `${ICONS_PACKAGE}@${ctx.icons.version}; used only to confirm the symbols the Icon record ` +
              'names actually exist (bundleIcon plus the sample icons).',
          }]
        : []),
    ],
    componentsCatalogued: components.length,
    maturityCounts: counts,
    fieldNotes: [
      'maturity: stable | preview | compat | migration | utility | deprecated. Derived from the ' +
        'Storybook title path (Components/ = stable, Compat Components/ = compat, Preview ' +
        'Components/ + Motion "(preview)" = preview, Migration Shims/ = migration, Utilities/ = ' +
        'utility) and corrected by the resolved package suffix (-preview / -compat). Every ' +
        '@fluentui-copilot/* package is 0.x, so the whole AI suite is preview.',
      'keyProps[].required mirrors the upstream Required column verbatim (React v9) or the absence ' +
        'of `?` on the declared member (AI suite).',
      'keyProps[].slot and slots[] list the slot props (types containing Slot<>/WithSlotShorthandValue<>), ' +
        'which the previous catalog omitted entirely.',
      'reactImport is derived from the identifiers the sample actually uses plus the package that ' +
        'owns the component, so the import always covers the sample.',
      'webComponent / webComponentDefine / webComponentAttributes come from the custom elements ' +
        'manifest. Attribute names are kebab-case (icon-only, disabled-focusable) and deliberately ' +
        'do NOT mirror the React camelCase prop names.',
      'AI-suite records carry both imports: reactImport (umbrella, or the sub-package when the ' +
        'umbrella does not re-export the component) and reactImportTreeShakable (always the ' +
        'sub-package). umbrellaExport:false means importing from @fluentui-copilot/react-copilot ' +
        'will NOT resolve.',
      'Docgen strips props inherited from native HTML elements (disabled, placeholder, min/max/step). ' +
        'Their absence from keyProps is a limitation of the source table, not a statement that the ' +
        'prop does not exist - the samples show them in use.',
      'verified: true means the record was read from the sources above at generatedAt. verified: ' +
        'false means no public source could confirm or refute it; see verificationNote.',
    ],
    webComponents: {
      package: WC_PACKAGE,
      version: ctx.wc.version,
      manifest: ctx.wc.manifestUrl,
      tagsDeclared: ctx.wc.byClass.size,
      tagsMappedToRecords: components.filter((c) => c.webComponent).length,
      unmappedTags: extras.wcUnmapped,
      unmappedNote:
        'Registered tags with no record to attach to. Each entry says whether a React v9 export of ' +
        'that name exists (the Storybook simply never documented it) or whether React composes the ' +
        'behaviour differently - fluent-anchor-button is the anchor variant of Button, which React ' +
        'writes as <Button as="a">.',
      registration:
        'v3 registers nothing by default. Import the element you use, e.g. ' +
        `import '${WC_PACKAGE}/textarea/define.js'; - see each record's webComponentDefine.`,
    },
    aiSuite: {
      umbrella: COPILOT_UMBRELLA,
      version: ctx.copilot.version,
      subPackages: ctx.copilot.subPackages,
      componentsCatalogued: aiComponents.length,
      subPackageOnly: components.filter((c) => c.umbrellaExport === false).map((c) => c.name),
      deprecated: components
        .filter((c) => c.category === 'AI / Copilot' && c.maturity === 'deprecated')
        .map((c) => ({ name: c.name, useInstead: c.deprecated })),
      nonComponentExports: ctx.copilot.nonComponents,
      support:
        'Every @fluentui-copilot/* package is 0.x and its README states "For internal use only. ' +
        'External use is not supported at this time." Published publicly and installable, but treat ' +
        'as an internal preview surface: APIs can change without notice.',
      docsAccess:
        'https://ai.fluentui.dev returns 401 and redirects to an Entra-gated app, so it is not a ' +
        'usable source. The API facts here come from the public npm tarball instead.',
      retired: Object.entries(RETIRED_RECORDS).map(([was, r]) => ({
        was,
        useInstead: r.target,
        reason: r.reason,
      })),
    },
    unverified: {
      count: unverified.length,
      names: unverified.map((c) => c.name),
      reason: unverified.length
        ? 'No public source (Storybook, API-Extractor report, or npm tarball via unpkg) could confirm ' +
          'or refute these records.'
        : 'None. Every record in this catalog was read from a public source at generatedAt.',
    },
    skippedPages: skipped,
    notes: [
      'All components must be rendered inside a <FluentProvider theme={...}> to receive tokens.',
      'webComponent is the Fluent Web Components v3 custom-element tag when one exists; null means ' +
        'the manifest registers no tag for this component (use the React component).',
      'Records are keyed by `id` (the Storybook docs id, "<page>#<Subcomponent>", or "copilot-<name>"). ' +
        '`name` is the real export name and is NOT unique - see nameCollision (e.g. Components/List ' +
        'vs Migration Shims/V0/List, and the AI-suite Attachment and Textarea vs their v9 namesakes).',
    ],
  };
}

function report(merged, generated, skipped, wc, copilot) {
  const {
    before, after, counts, foldedInto, createdFromProse, retired, unverified, collisions,
    wcApplied, wcCleared, wcUnmapped, droppedSamples,
  } = merged;
  console.log(`components: ${before} -> ${after}`);
  console.log('maturity:', JSON.stringify(counts));
  console.log(`generated from upstream: ${generated.length}`);
  console.log(`web components: ${WC_PACKAGE}@${wc.version}, ${wc.byClass.size} tags declared`);
  console.log(`  tags corrected: ${wcApplied.length ? wcApplied.join('; ') : 'none'}`);
  console.log(`  tags cleared (not in manifest): ${wcCleared.length ? wcCleared.join('; ') : 'none'}`);
  console.log(`  tags with no React record: ${wcUnmapped.map((u) => `${u.tag} (${u.reactExport ? 'export ' + u.reactExport + ' exists, undocumented' : 'no React counterpart'})`).join(', ') || 'none'}`);
  console.log(
    `AI suite: ${COPILOT_UMBRELLA}@${copilot.version}, ${copilot.components.length} components across ` +
      `${copilot.subPackages.length} sub-packages`
  );
  console.log(`  sub-package-only (not re-exported by the umbrella): ${copilot.components.filter((c) => !c.umbrellaExport).map((c) => c.name).join(', ') || 'none'}`);
  console.log(`retired phantom records: ${retired.length ? retired.join(', ') : 'none'}`);
  console.log(`unverified carried forward: ${unverified.length} (${unverified.map((u) => u.name).join(', ') || 'none'})`);
  console.log(`prose records folded: ${foldedInto.length} -> ${foldedInto.join(', ') || 'none'}`);
  console.log(`prose records promoted to code names: ${createdFromProse.length} -> ${createdFromProse.join(', ') || 'none'}`);
  console.log(`samples dropped (unknown tag): ${droppedSamples.length} -> ${droppedSamples.join('; ') || 'none'}`);
  const dupes = Object.entries(collisions).filter(([, ids]) => ids.length > 1);
  console.log(`name collisions: ${dupes.length} -> ${dupes.map(([n, ids]) => `${n} (${ids.join(' | ')})`).join('; ')}`);
  console.log(`skipped non-component pages: ${skipped.length}`);
}

main().catch((err) => {
  console.error(err.stack || String(err));
  process.exit(1);
});
