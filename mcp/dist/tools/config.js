import { z } from 'zod';
import { resolve, join, dirname } from 'node:path';
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { textResult, DATA_DIR } from '../util.js';
/**
 * User-defined presets config (fluent.config.json) + persistent agent memory
 * (.fluent/memory.json). Zero-config safe: every tool falls back to built-in
 * Fluent 2 defaults and NEVER throws on missing / empty / corrupt files.
 * See research/config-design.md (§5 precedence, §5.3 defaults, §6 tool contracts).
 */
/** Canonical URL of the fluent.config.json JSON Schema (editor IntelliSense + validation). */
const SCHEMA_URL = 'https://raw.githubusercontent.com/ArasaniRohithReddy/fluent-ui-plugin/main/assets/schema/fluent.config.schema.json';
/**
 * Built-in Fluent 2 defaults (research/config-design.md §5.3). A zero-config
 * build is a valid Fluent 2 build (the stock webLightTheme look). Used as the
 * lowest-precedence source when neither config nor memory sets a value.
 */
const DEFAULTS = {
    brand: { color: '#0f6cbd', name: 'brand' },
    theme: { mode: 'light', base: 'web', highContrast: false },
    typography: {
        fontFamily: "'Segoe UI', 'Segoe UI Web (West European)', -apple-system, BlinkMacSystemFont, Roboto, 'Helvetica Neue', sans-serif",
        monospaceFontFamily: "Consolas, 'Courier New', Courier, monospace",
        baseSize: 14,
        scale: 1,
    },
    shape: { cornerRadius: 'medium', control: 'medium', card: 'xlarge' },
    density: { controlSize: 'medium', spacing: 'comfortable' },
    accessibility: {
        targetLevel: 'AA',
        minTargetSize: 24,
        minContrast: 4.5,
        minContrastLargeText: 3,
        minContrastNonText: 3,
        reducedMotion: 'respect',
        forcedColors: 'respect',
    },
    iconStyle: 'regular',
    targets: ['web-react'],
    // Which Fluent generation the project is on. Fluent 2 (v9) is the default, but
    // a Fluent 1 (v8) codebase needs different components, theming and imports —
    // and answering a v8 question with v9 guidance produces code that does not
    // compile, so this has to be declarable rather than assumed.
    fluentVersion: 'v9',
    migration: { from: 'none', strategy: 'incremental' },
    content: { capitalization: 'sentence' },
    // Per-surface presets. Every surface gets its own knobs so "apply Fluent 2"
    // means something concrete on Power BI, web, Power Apps, Power Pages and PCF.
    surfaces: {
        powerbi: {
            themeName: 'Fluent 2',
            // Clearing theme-defeating inline overrides is what actually makes a report
            // look like Fluent 2. ask | always | never.
            normalizeInline: 'ask',
            normalizeKeys: ['border', 'background', 'visualHeader', 'title', 'dropShadow', 'spacing'],
            normalizeFonts: true,
            preserveBookmarked: true,
            effectivenessTarget: 0.9,
            canvas: 'keep',
        },
        web: {
            framework: 'react-v9',
            styling: 'griffel',
            ssr: false,
            portalCompat: false,
        },
        powerapps: {
            controls: 'modern',
            themeSource: 'app-theme',
        },
        powerpages: {
            bootstrap: 'v5',
            tokenCss: true,
        },
        pcf: {
            controlType: 'virtual',
            platformLibraries: true,
        },
    },
    // How heavy work should be run, and whether agents may fan out to sub-agents.
    execution: {
        profile: 'balanced',
        model: 'inherit',
        reasoningEffort: 'inherit',
        contextTier: 'inherit',
        fanOut: 'ask',
        maxParallel: 4,
        escalateOnFailure: true,
        enforcement: 'advise',
    },
    // The team's own house rules, in their words. Enums cannot express things like
    // "never use red for anything but destructive actions" or "data grids are
    // compact, everything else is comfortable", so intake captures them verbatim
    // and every agent reads them back before building.
    guidelines: {
        // Things the team wants done. Free text, one rule per entry.
        rules: [],
        // Hard prohibitions. These outrank presets and inferred defaults; when a
        // request conflicts with one, say so instead of quietly overriding it.
        constraints: [],
        // Links to internal design docs, Figma files or brand portals.
        references: [],
    },
};
/** Look up the built-in default value at a dot-path (or undefined). */
function defaultAt(dotPath) {
    let node = DEFAULTS;
    for (const p of dotPath.split('.')) {
        if (node && typeof node === 'object')
            node = node[p];
        else
            return undefined;
    }
    return node;
}
/** Coerce a raw value to the type of the built-in default at dotPath (keeps written config schema-valid). */
function coerceForPath(dotPath, value) {
    const d = defaultAt(dotPath);
    if (typeof d === 'number' && typeof value !== 'number') {
        const n = Number(value);
        if (!Number.isNaN(n))
            return n;
    }
    if (typeof d === 'boolean' && typeof value !== 'boolean') {
        if (value === 'true')
            return true;
        if (value === 'false')
            return false;
    }
    return value;
}
// ---------------------------------------------------------------------------
// fs + path helpers (never throw; writes confined to projectDir)
// ---------------------------------------------------------------------------
/** Parse a JSON file, returning null on missing / empty / unreadable / corrupt. Never throws. */
function readJsonSafe(file) {
    return readJsonState(file).value;
}
function readJsonState(file) {
    let raw;
    try {
        if (!existsSync(file))
            return { exists: false, parsed: false, value: null };
        raw = readFileSync(file, 'utf8').trim();
    }
    catch (e) {
        return {
            exists: true,
            parsed: false,
            value: null,
            error: `unreadable: ${e instanceof Error ? e.message : String(e)}`,
        };
    }
    if (!raw)
        return { exists: false, parsed: false, value: null };
    let parsedValue;
    try {
        parsedValue = JSON.parse(raw);
    }
    catch (e) {
        return {
            exists: true,
            parsed: false,
            value: null,
            error: `not valid JSON: ${e instanceof Error ? e.message : String(e)}`,
        };
    }
    if (!parsedValue || typeof parsedValue !== 'object' || Array.isArray(parsedValue)) {
        return {
            exists: true,
            parsed: false,
            value: null,
            error: `expected a JSON object at the top level, found ${Array.isArray(parsedValue) ? 'an array' : typeof parsedValue}`,
        };
    }
    return { exists: true, parsed: true, value: parsedValue };
}
/** Write JSON (pretty, trailing newline), creating parent directories as needed. */
function writeJson(file, data) {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify(data, null, 2) + '\n', 'utf8');
}
/** Write JSON, catching real I/O errors. Returns null on success or an error message. Never throws. */
function tryWriteJson(file, data) {
    try {
        writeJson(file, data);
        return null;
    }
    catch (e) {
        return e instanceof Error ? e.message : String(e);
    }
}
/** Resolve the user's project root (defaults to the current working directory). */
function projectRoot(projectDir) {
    return resolve(projectDir && projectDir.trim() ? projectDir : process.cwd());
}
/** projectDir/fluent.config.json */
function configPathFor(root) {
    return join(root, 'fluent.config.json');
}
/** projectDir/.fluent/memory.json */
function memoryPathFor(root) {
    return join(root, '.fluent', 'memory.json');
}
function clone(v) {
    return JSON.parse(JSON.stringify(v));
}
/** Ensure a hex color has a leading '#', preserving the caller's casing. */
function ensureHash(hex) {
    const h = String(hex).trim();
    return h.startsWith('#') ? h : '#' + h;
}
function slugify(s) {
    return String(s)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 60);
}
function describeLocalOverlay() {
    const dir = join(DATA_DIR, 'local');
    const base = {
        dir,
        what: 'Guidance withheld from the published repo for licensing reasons (sign-in-gated Microsoft pages; see NOTICE). ' +
            'The published datasets ship the facts plus a docUrl; a reader who has access can keep the full text here and the ' +
            'tools merge it back at runtime.',
    };
    let names = [];
    try {
        if (!existsSync(dir))
            return { present: false, ...base, files: [], totalRecords: 0, note: 'Not present — this checkout returns exactly what a fresh clone returns.' };
        names = readdirSync(dir).filter((n) => n.toLowerCase().endsWith('.json')).sort();
    }
    catch (e) {
        return { present: false, ...base, files: [], totalRecords: 0, error: e instanceof Error ? e.message : String(e) };
    }
    if (!names.length) {
        return { present: false, ...base, files: [], totalRecords: 0, note: 'Directory exists but holds no overlay files — output matches a fresh clone.' };
    }
    const files = [];
    let totalRecords = 0;
    for (const file of names) {
        const state = readJsonState(join(dir, file));
        if (!state.parsed || !state.value) {
            files.push({ file, records: 0, error: state.error ?? 'unreadable' });
            continue;
        }
        const keys = Object.keys(state.value);
        totalRecords += keys.length;
        // Record names are the human titles/slugs the tools key on; listing a few
        // makes the coverage concrete without dumping the withheld content itself.
        files.push({ file, records: keys.length, keys: keys.slice(0, 12) });
    }
    return {
        present: true,
        ...base,
        files,
        totalRecords,
        note: `This checkout restores ${totalRecords} record(s) from ${files.length} overlay file(s). Responses built from them are ` +
            'marked $provenance.source:"local-overlay" (fluent_design_guidance). A fresh clone returns the published stub for ' +
            'those records instead — same facts and docUrl, no prose.',
        agentInstruction: 'When demoing or documenting output, state which records came from the overlay: a user of the published plugin ' +
            'cannot reproduce them. Never copy overlay text into the repo.',
    };
}
function randomId() {
    return 'decision-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
}
/** Segment names that could pollute Object.prototype — never walked into or assigned. */
const DANGEROUS_KEYS = new Set(['__proto__', 'prototype', 'constructor']);
/** True when a key is safe to assign onto a plain object (blocks prototype pollution). */
function isSafeKey(key) {
    return key !== '__proto__' && key !== 'prototype' && key !== 'constructor';
}
/** Set a nested value by dot-path, creating intermediate objects as needed. Refuses prototype-polluting paths. */
function setPath(obj, dotPath, value) {
    const parts = dotPath.split('.');
    if (parts.some((p) => DANGEROUS_KEYS.has(p)))
        return; // defense-in-depth vs prototype pollution
    let node = obj;
    for (let i = 0; i < parts.length - 1; i++) {
        const key = parts[i];
        if (!isSafeKey(key))
            return; // re-checked per segment so the guard always dominates the write
        if (!Object.prototype.hasOwnProperty.call(node, key) ||
            typeof node[key] !== 'object' ||
            node[key] === null ||
            Array.isArray(node[key])) {
            node[key] = {};
        }
        node = node[key];
    }
    const leaf = parts[parts.length - 1];
    if (!isSafeKey(leaf))
        return;
    node[leaf] = value;
}
/** Collect every leaf dot-path of an object (arrays are treated as leaves). */
function collectLeaves(obj, prefix = '', out = {}) {
    for (const [k, v] of Object.entries(obj)) {
        const path = prefix ? `${prefix}.${k}` : k;
        if (v && typeof v === 'object' && !Array.isArray(v)) {
            collectLeaves(v, path, out);
        }
        else {
            out[path] = 'default';
        }
    }
    return out;
}
/** The dot-paths that correspond to known Fluent 2 presets (leaves of DEFAULTS). */
const KNOWN_PRESET_PATHS = new Set(Object.keys(collectLeaves(DEFAULTS)));
function isKnownPresetPath(p) {
    return KNOWN_PRESET_PATHS.has(p);
}
// ---------------------------------------------------------------------------
// Value validation
// ---------------------------------------------------------------------------
//
// fluent_set_config used to write anything: `nope.nothere` was accepted as a
// setting and `brand.color = "not-a-color"` was persisted even though
// fluent_generate_theme and fluent_generate_powerbi_theme both hard-reject that
// value. Persisting a config every downstream tool refuses is worse than
// refusing the write, so keys are checked against the known preset schema and
// values against the SAME rules the consuming tools enforce.
/** The same hex rule fluent_generate_theme / fluent_generate_powerbi_theme use. */
const HEX_RE = /^#?[0-9a-fA-F]{6}$/;
/** The same identifier rule fluent_generate_theme uses for the exported theme name. */
const JS_IDENT_RE = /^[A-Za-z_$][A-Za-z0-9_$]*$/;
/** Enumerated presets. Mirrors the fluent_init_config zod enums (the authoritative list). */
const PRESET_ENUMS = {
    'theme.mode': ['light', 'dark', 'system'],
    'theme.base': ['web', 'teams'],
    'shape.cornerRadius': ['sharp', 'small', 'medium', 'large', 'xlarge', 'pill'],
    'shape.control': ['sharp', 'small', 'medium', 'large', 'xlarge', 'pill'],
    'shape.card': ['sharp', 'small', 'medium', 'large', 'xlarge', 'pill'],
    'density.controlSize': ['small', 'medium', 'large'],
    'density.spacing': ['compact', 'comfortable', 'spacious'],
    'accessibility.targetLevel': ['A', 'AA', 'AAA'],
    'accessibility.reducedMotion': ['respect', 'ignore'],
    'accessibility.forcedColors': ['respect', 'ignore'],
    iconStyle: ['regular', 'filled'],
    fluentVersion: ['v8', 'v9'],
    'migration.from': ['fluent-v8', 'mui', 'bootstrap', 'antd', 'chakra', 'css', 'none'],
    'content.capitalization': ['sentence', 'title'],
    'surfaces.powerbi.normalizeInline': ['ask', 'always', 'never'],
    'surfaces.powerbi.canvas': ['keep', 'fluent'],
    'surfaces.web.framework': ['react-v9', 'web-components'],
    'surfaces.web.styling': ['griffel', 'css-vars'],
    'surfaces.powerapps.controls': ['modern', 'classic'],
    'surfaces.powerapps.themeSource': ['app-theme', 'none'],
    'surfaces.pcf.controlType': ['virtual', 'standard'],
    'execution.profile': ['fast', 'balanced', 'thorough'],
    'execution.fanOut': ['ask', 'always', 'never'],
    'execution.enforcement': ['advise', 'enforce'],
};
/** Inclusive numeric ranges for the numeric presets. */
const PRESET_RANGES = {
    'typography.baseSize': [8, 72],
    'typography.scale': [0.5, 3],
    'accessibility.minTargetSize': [1, 200],
    'accessibility.minContrast': [1, 21],
    'accessibility.minContrastLargeText': [1, 21],
    'accessibility.minContrastNonText': [1, 21],
    'surfaces.powerbi.effectivenessTarget': [0, 1],
    'execution.maxParallel': [1, 64],
};
/** Known preset paths that look like the one the caller asked for. */
function nearestPaths(key, limit = 8) {
    const lower = key.toLowerCase();
    const leaf = lower.split('.').pop() ?? lower;
    const all = [...KNOWN_PRESET_PATHS];
    const scored = all
        .map((p) => {
        const pl = p.toLowerCase();
        let score = 0;
        if (pl === lower)
            score = 100;
        else if (pl.includes(lower) || lower.includes(pl))
            score = 60;
        else if (pl.endsWith('.' + leaf) || pl === leaf)
            score = 50;
        else if (pl.includes(leaf))
            score = 30;
        else if (leaf.length > 3 && pl.split('.').some((seg) => seg.startsWith(leaf.slice(0, 4))))
            score = 10;
        return { p, score };
    })
        .filter((s) => s.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, limit)
        .map((s) => s.p);
    return scored;
}
/** Validate (and normalize) a value for a known preset dot-path. */
function validatePreset(key, rawValue) {
    if (!isKnownPresetPath(key)) {
        const near = nearestPaths(key);
        return {
            ok: false,
            error: `"${key}" is not a known Fluent 2 preset. fluent_set_config only writes settings the plugin understands, because an unknown key is never read back by any tool.`,
            hint: near.length
                ? `Did you mean: ${near.join(', ')}?`
                : `Known top-level groups: ${Object.keys(DEFAULTS).join(', ')}. Call fluent_get_config to see every path.`,
        };
    }
    const def = defaultAt(key);
    if (Array.isArray(def)) {
        return {
            ok: false,
            error: `"${key}" is a list, and fluent_set_config only sets single values.`,
            hint: key === 'targets'
                ? 'Use fluent_init_config { targets: ["web-react", "powerbi"], force: true }.'
                : `Use fluent_init_config (it takes arrays for guidelines / constraints / references / targets), or edit fluent.config.json directly.`,
        };
    }
    const value = coerceForPath(key, rawValue);
    if (typeof def === 'number' && typeof value !== 'number') {
        return { ok: false, error: `"${key}" expects a number, got ${JSON.stringify(rawValue)}.` };
    }
    if (typeof def === 'boolean' && typeof value !== 'boolean') {
        return { ok: false, error: `"${key}" expects true or false, got ${JSON.stringify(rawValue)}.` };
    }
    if (typeof def === 'string' && typeof value !== 'string') {
        return { ok: false, error: `"${key}" expects a string, got ${JSON.stringify(rawValue)}.` };
    }
    if (typeof value === 'number') {
        if (!Number.isFinite(value))
            return { ok: false, error: `"${key}" must be a finite number.` };
        const range = PRESET_RANGES[key];
        if (range && (value < range[0] || value > range[1])) {
            return { ok: false, error: `"${key}" must be between ${range[0]} and ${range[1]}, got ${value}.` };
        }
    }
    // Colors: enforce the rule the theme generators enforce, and normalize to a
    // leading '#' so the stored value is directly usable.
    if (/(^|\.)color$/i.test(key) || key === 'brand.color') {
        if (typeof value !== 'string' || !HEX_RE.test(value.trim())) {
            return {
                ok: false,
                error: `"${key}" must be a 6-digit hex color like #0F6CBD, got ${JSON.stringify(rawValue)}. fluent_generate_theme and fluent_generate_powerbi_theme reject anything else, so persisting it would produce a config no tool can use.`,
            };
        }
        return { ok: true, value: ensureHash(value.trim()) };
    }
    if (key === 'brand.name' && typeof value === 'string' && !JS_IDENT_RE.test(value)) {
        return {
            ok: false,
            error: `"brand.name" is used as a JavaScript identifier for the exported theme (fluent_generate_theme), so it must match ${JS_IDENT_RE}. Got ${JSON.stringify(rawValue)}.`,
        };
    }
    const allowed = PRESET_ENUMS[key];
    if (allowed && typeof value === 'string' && !allowed.includes(value)) {
        return { ok: false, error: `"${key}" must be one of: ${allowed.join(' | ')}. Got ${JSON.stringify(rawValue)}.` };
    }
    if (typeof value === 'string' && !value.trim()) {
        return { ok: false, error: `"${key}" must not be empty.` };
    }
    return { ok: true, value };
}
/**
 * Deep-merge a source object onto a target, recording the winning source
 * ("config" | "memory") at each leaf dot-path. Top-level format metadata
 * ($schema, version) is ignored — it is not a design setting.
 */
function overlay(target, sources, src, srcName, prefix = '') {
    if (!src || typeof src !== 'object' || Array.isArray(src))
        return;
    for (const [k, v] of Object.entries(src)) {
        if (!isSafeKey(k))
            continue; // never copy prototype-polluting keys out of user JSON
        if (prefix === '' && (k === '$schema' || k === 'version'))
            continue;
        if (v === undefined || v === null)
            continue;
        const path = prefix ? `${prefix}.${k}` : k;
        if (Array.isArray(v) || typeof v !== 'object') {
            target[k] = Array.isArray(v) ? clone(v) : v;
            sources[path] = srcName;
        }
        else {
            if (!target[k] || typeof target[k] !== 'object' || Array.isArray(target[k])) {
                target[k] = {};
            }
            overlay(target[k], sources, v, srcName, path);
        }
    }
}
/**
 * Resolve the effective presets with precedence:
 * explicit fluent.config.json value > recorded memory value > built-in default.
 */
function resolveEffective(config, memory) {
    const resolved = clone(DEFAULTS);
    const sources = collectLeaves(DEFAULTS);
    const prefs = memory && typeof memory === 'object' ? memory.preferences : null;
    overlay(resolved, sources, prefs, 'memory');
    overlay(resolved, sources, config, 'config');
    return { config: resolved, sources };
}
/** A fresh, empty memory skeleton. */
function emptyMemory() {
    return { version: '1.0', updatedAt: new Date().toISOString(), preferences: {}, decisions: [] };
}
/** Coerce whatever is on disk into a well-formed memory object (never throws). */
function normalizeMemory(mem) {
    if (!mem || typeof mem !== 'object' || Array.isArray(mem))
        return emptyMemory();
    return {
        version: typeof mem.version === 'string' ? mem.version : '1.0',
        updatedAt: typeof mem.updatedAt === 'string' ? mem.updatedAt : new Date().toISOString(),
        preferences: mem.preferences && typeof mem.preferences === 'object' && !Array.isArray(mem.preferences)
            ? mem.preferences
            : {},
        decisions: Array.isArray(mem.decisions) ? mem.decisions : [],
    };
}
// ---------------------------------------------------------------------------
// Tool registration
// ---------------------------------------------------------------------------
export function registerConfig(server) {
    const projectDirArg = z
        .string()
        .optional()
        .describe("The user's project root that holds fluent.config.json and .fluent/memory.json. Defaults to the current working directory. Files are only ever read/written under this directory.");
    // 1) fluent_get_config -----------------------------------------------------
    server.registerTool('fluent_get_config', {
        title: 'Get resolved Fluent 2 presets (config + memory + defaults)',
        description: 'Read-only resolver for the effective Fluent 2 design presets. Merges fluent.config.json (user intent) over .fluent/memory.json (agent memory) over built-in Fluent 2 defaults, per field. Returns { configExists, configParsed, parseError?, memoryExists, memoryParsed, memoryParseError?, localOverlay, config: <resolved effective settings>, sources: { <dot-path>: "config"|"memory"|"default" } }. localOverlay answers "what would a fresh clone see?" in one call: whether this checkout carries mcp/data/local/ (guidance withheld from the published repo for licensing reasons — see NOTICE), which files it holds and how many records they restore. A file that exists but does not parse is reported as configExists:true with a parseError — never as absent — and the write tools refuse to touch it until it is fixed. The resolved config includes guidelines.rules / guidelines.constraints: the team\'s own house rules in their words. Honour them, and treat guidelines.constraints as outranking every preset and inferred default. Zero-config safe: with no files present it returns all-defaults (brand #0f6cbd, webLightTheme look) and never throws. Call this at the START of a build task to load context.',
        inputSchema: {
            projectDir: projectDirArg,
        },
    }, async ({ projectDir }) => {
        const root = projectRoot(projectDir);
        const cfgState = readJsonState(configPathFor(root));
        const memState = readJsonState(memoryPathFor(root));
        const { config: resolved, sources } = resolveEffective(cfgState.value, memState.value);
        const broken = (cfgState.exists && !cfgState.parsed) || (memState.exists && !memState.parsed);
        return textResult(JSON.stringify({
            configExists: cfgState.exists,
            configParsed: cfgState.parsed,
            ...(cfgState.error ? { parseError: `${configPathFor(root)}: ${cfgState.error}` } : {}),
            memoryExists: memState.exists,
            memoryParsed: memState.parsed,
            ...(memState.error ? { memoryParseError: `${memoryPathFor(root)}: ${memState.error}` } : {}),
            ...(broken
                ? {
                    agentInstruction: 'A file exists but could not be parsed, so its settings are NOT in the resolved config below. ' +
                        'fluent_set_config / fluent_remember will refuse to write until it is valid — do not "fix" it by ' +
                        'overwriting; show the user the parse error and let them repair or delete the file.',
                }
                : {}),
            projectDir: root,
            localOverlay: describeLocalOverlay(),
            config: resolved,
            sources,
        }, null, 2));
    });
    // 2) fluent_init_config ----------------------------------------------------
    server.registerTool('fluent_init_config', {
        title: 'Initialize a fluent.config.json presets file',
        description: 'Scaffold projectDir/fluent.config.json by merging the provided presets over the built-in Fluent 2 defaults (with a "$schema" reference for editor IntelliSense). Also creates an empty .fluent/memory.json skeleton if one does not exist. Alongside the structured presets it captures the team\'s own house rules verbatim via guidelines / constraints / references, since enums cannot express rules like "never use red except for destructive actions". Does NOT overwrite an existing fluent.config.json unless force:true. Use for the first-run onboarding offer when fluent_get_config reports configExists:false.',
        inputSchema: {
            projectDir: projectDirArg,
            brandColor: z
                .string()
                .regex(/^#?[0-9a-fA-F]{6}$/)
                .optional()
                .describe('Primary brand color (hex). Seeds brand.color (BrandVariants slot 80).'),
            targets: z
                .array(z.enum(['web-react', 'web-components', 'powerbi', 'powerapps', 'powerpages', 'pcf', 'ios', 'android', 'windows']))
                .optional()
                .describe('Build / adoption targets. Sets the targets array.'),
            fluentVersion: z
                .enum(['v8', 'v9'])
                .optional()
                .describe('Fluent generation this project uses: v8 (Fluent 1 / Office UI Fabric) or v9 (Fluent 2). Sets fluentVersion.'),
            accessibilityLevel: z
                .enum(['AA', 'AAA'])
                .optional()
                .describe('WCAG 2.2 conformance target. Sets accessibility.targetLevel.'),
            themeMode: z
                .enum(['light', 'dark', 'system'])
                .optional()
                .describe('Color mode. Sets theme.mode.'),
            shape: z
                .enum(['sharp', 'small', 'medium', 'large', 'xlarge', 'pill'])
                .optional()
                .describe('Global corner-radius personality. Sets shape.cornerRadius.'),
            controlSize: z
                .enum(['small', 'medium', 'large'])
                .optional()
                .describe('Default control size. Sets density.controlSize.'),
            iconStyle: z
                .enum(['regular', 'filled'])
                .optional()
                .describe('Default @fluentui/react-icons variant. Sets iconStyle.'),
            migrationFrom: z
                .enum(['fluent-v8', 'mui', 'bootstrap', 'antd', 'chakra', 'css', 'none'])
                .optional()
                .describe('Existing design system being migrated from. Sets migration.from.'),
            executionProfile: z
                .enum(['fast', 'balanced', 'thorough'])
                .optional()
                .describe('How heavy work should be run. "fast" = cheaper, sequential; "balanced" = default; "thorough" = strongest model, highest effort, parallel specialists. Sets execution.profile and derives execution.reasoningEffort / contextTier / maxParallel.'),
            fanOut: z
                .enum(['ask', 'always', 'never'])
                .optional()
                .describe('Whether agents may launch parallel sub-agents for large jobs. "ask" (default) confirms with the user each time and remembers the answer; "always" proceeds; "never" stays single-agent. Sets execution.fanOut.'),
            powerbiNormalizeInline: z
                .enum(['ask', 'always', 'never'])
                .optional()
                .describe('Power BI: whether to clear the inline visual overrides that defeat the theme (this is what actually makes a report look like Fluent 2). Sets surfaces.powerbi.normalizeInline.'),
            webFramework: z
                .enum(['react-v9', 'web-components'])
                .optional()
                .describe('Web: which Fluent 2 implementation to build with. Sets surfaces.web.framework.'),
            guidelines: z
                .array(z.string().min(1))
                .optional()
                .describe("The team's own house rules, in their words, one per entry (e.g. \"data grids are compact, everything else comfortable\"). Captured verbatim because enums cannot express them. Sets guidelines.rules."),
            constraints: z
                .array(z.string().min(1))
                .optional()
                .describe('Hard prohibitions, one per entry (e.g. "never use red except for destructive actions"). These outrank presets and inferred defaults. Sets guidelines.constraints.'),
            references: z
                .array(z.string().min(1))
                .optional()
                .describe('Links to internal design docs, Figma files or brand portals. Sets guidelines.references.'),
            force: z
                .boolean()
                .default(false)
                .describe('Overwrite an existing fluent.config.json when true.'),
            createDir: z
                .boolean()
                .default(false)
                .describe('Create projectDir even when its PARENT is missing too. Off by default: a typo used to materialize a whole directory tree at the drive root. One missing level under an existing parent is always created.'),
        },
    }, async ({ projectDir, brandColor, targets, accessibilityLevel, themeMode, shape, controlSize, iconStyle, migrationFrom, fluentVersion, executionProfile, fanOut, powerbiNormalizeInline, webFramework, guidelines, constraints, references, force, createDir, }) => {
        const root = projectRoot(projectDir);
        // A mistyped projectDir used to create the whole tree (C:\nope\nothere\zzz)
        // at the drive root and report success. Creating ONE missing level under
        // an existing parent is ordinary ("init a new project folder"); conjuring
        // several levels is a typo, so that needs an explicit opt-in.
        if (!existsSync(root)) {
            const parent = dirname(root);
            const parentExists = existsSync(parent);
            if (!parentExists && !createDir) {
                return textResult(JSON.stringify({
                    written: false,
                    error: `projectDir does not exist and neither does its parent: ${root}`,
                    hint: `Nothing above "${parent}" exists either, which usually means the path is a typo. Point projectDir at an existing project root, or pass createDir:true to create the whole tree deliberately.`,
                    projectDir: root,
                }, null, 2));
            }
            try {
                mkdirSync(root, { recursive: true });
            }
            catch (e) {
                return textResult(JSON.stringify({
                    written: false,
                    error: `could not create ${root}: ${e instanceof Error ? e.message : String(e)}`,
                    projectDir: root,
                }, null, 2));
            }
        }
        const cfgPath = configPathFor(root);
        const memPath = memoryPathFor(root);
        const cfgState = readJsonState(cfgPath);
        const existed = cfgState.exists;
        // Overwriting a file we could not parse destroys content we cannot show
        // the user first. force:true is an explicit "yes, replace it".
        if (existed && !cfgState.parsed && !force) {
            return textResult(JSON.stringify({
                written: false,
                configExists: true,
                parseError: `${cfgPath}: ${cfgState.error}`,
                error: 'fluent.config.json exists but could not be parsed. Refusing to overwrite it — the current contents would be lost.',
                hint: 'Fix or delete the file, or pass force:true to replace it deliberately.',
                configPath: cfgPath,
            }, null, 2));
        }
        // Always make sure a memory skeleton exists (records agent context later).
        let memoryCreated = false;
        const memState = readJsonState(memPath);
        if (!memState.exists) {
            if (!tryWriteJson(memPath, emptyMemory()))
                memoryCreated = true;
        }
        if (existed && !force) {
            return textResult(JSON.stringify({
                written: false,
                note: `fluent.config.json already exists at ${cfgPath}. Pass force:true to overwrite.`,
                configPath: cfgPath,
                memoryPath: memPath,
                memoryCreated,
                config: cfgState.value,
            }, null, 2));
        }
        const merged = clone(DEFAULTS);
        if (brandColor)
            merged.brand.color = ensureHash(brandColor);
        if (themeMode)
            merged.theme.mode = themeMode;
        if (shape)
            merged.shape.cornerRadius = shape;
        if (controlSize)
            merged.density.controlSize = controlSize;
        if (accessibilityLevel)
            merged.accessibility.targetLevel = accessibilityLevel;
        if (iconStyle)
            merged.iconStyle = iconStyle;
        if (targets && targets.length)
            merged.targets = targets;
        if (fluentVersion)
            merged.fluentVersion = fluentVersion;
        if (migrationFrom)
            merged.migration.from = migrationFrom;
        // Declaring a migration FROM Fluent 1 says nothing about which generation
        // the code is on today, and the answer is almost always still v8 mid-move.
        // Inferring it here stops us answering a v8 codebase with v9 imports.
        if (!fluentVersion && migrationFrom === 'fluent-v8')
            merged.fluentVersion = 'v8';
        if (executionProfile) {
            merged.execution.profile = executionProfile;
            // Derive the concrete knobs from the profile so users never hand-pick
            // model IDs, token counts, or a parallelism number.
            const derived = {
                fast: { reasoningEffort: 'medium', contextTier: 'default', maxParallel: 1 },
                balanced: { reasoningEffort: 'high', contextTier: 'default', maxParallel: 2 },
                thorough: { reasoningEffort: 'max', contextTier: 'long_context', maxParallel: 4 },
            };
            Object.assign(merged.execution, derived[executionProfile]);
        }
        if (fanOut)
            merged.execution.fanOut = fanOut;
        if (powerbiNormalizeInline)
            merged.surfaces.powerbi.normalizeInline = powerbiNormalizeInline;
        if (webFramework) {
            merged.surfaces.web.framework = webFramework;
            if (webFramework === 'web-components')
                merged.surfaces.web.styling = 'css-vars';
        }
        if (guidelines && guidelines.length)
            merged.guidelines.rules = guidelines;
        if (constraints && constraints.length)
            merged.guidelines.constraints = constraints;
        if (references && references.length)
            merged.guidelines.references = references;
        const content = { $schema: SCHEMA_URL, version: '1.0', ...merged };
        const werr = tryWriteJson(cfgPath, content);
        if (werr) {
            return textResult(JSON.stringify({ written: false, error: `Could not write ${cfgPath}: ${werr}`, configPath: cfgPath }, null, 2));
        }
        return textResult(JSON.stringify({
            written: true,
            overwritten: existed,
            configPath: cfgPath,
            memoryPath: memPath,
            memoryCreated,
            config: content,
        }, null, 2));
    });
    // 3) fluent_set_config -----------------------------------------------------
    server.registerTool('fluent_set_config', {
        title: 'Set a single fluent.config.json value',
        description: 'Set one preset by dot-path (e.g. "brand.color", "accessibility.targetLevel", "shape.card") in projectDir/fluent.config.json. The key must be a known Fluent 2 preset and the value must satisfy the SAME rule the consuming tool enforces — brand.color, for example, must be a 6-digit hex because fluent_generate_theme rejects anything else. Unknown keys and invalid values are refused with the nearest valid alternatives rather than persisted. If fluent.config.json exists but does not parse, the write is refused (the file is never silently replaced). Loads the existing config or starts a new one (with "$schema") if none exists, sets the value, writes it back, and returns the updated config. Keys containing "..", a path separator, or a prototype key ("__proto__"/"prototype"/"constructor") are rejected. Returns an error note instead of throwing on invalid input or write failure.',
        inputSchema: {
            projectDir: projectDirArg,
            key: z
                .string()
                .min(1)
                .describe('Dot-path of the setting to change, e.g. "brand.color" or "accessibility.targetLevel". Must be a known preset — call fluent_get_config to list them.'),
            value: z
                .union([z.string(), z.number(), z.boolean()])
                .describe('New value for the setting (string, number, or boolean). Validated against the setting\'s type, range or enum.'),
        },
    }, async ({ projectDir, key, value }) => {
        if (!key || key.includes('..') || key.includes('/') || key.includes('\\')) {
            return textResult(JSON.stringify({ error: 'Invalid key. Use a dot-path like "brand.color"; no "..", "/", or "\\".', key }, null, 2));
        }
        const parts = key.split('.');
        if (parts.some((p) => p.trim() === '')) {
            return textResult(JSON.stringify({ error: 'Invalid key. Dot-path segments must be non-empty (no leading/trailing/double dots).', key }, null, 2));
        }
        if (parts.some((p) => DANGEROUS_KEYS.has(p))) {
            return textResult(JSON.stringify({ error: 'Invalid key. Segments "__proto__", "prototype", and "constructor" are not allowed.', key }, null, 2));
        }
        const checked = validatePreset(key, value);
        if (!checked.ok) {
            return textResult(JSON.stringify({
                written: false,
                key,
                value,
                error: checked.error,
                ...(checked.hint ? { hint: checked.hint } : {}),
            }, null, 2));
        }
        const root = projectRoot(projectDir);
        const cfgPath = configPathFor(root);
        const state = readJsonState(cfgPath);
        // Refusing here is the whole point: the previous behaviour treated an
        // unparseable file as absent and replaced it with a two-key stub.
        if (state.exists && !state.parsed) {
            return textResult(JSON.stringify({
                written: false,
                configExists: true,
                parseError: `${cfgPath}: ${state.error}`,
                error: 'fluent.config.json exists but could not be parsed. Refusing to write — doing so would discard the file\'s current contents.',
                hint: 'Show the user the parse error and let them repair the file (or delete it), then retry.',
                key,
                configPath: cfgPath,
            }, null, 2));
        }
        const cfg = state.parsed && state.value ? state.value : { $schema: SCHEMA_URL };
        const coerced = checked.value;
        setPath(cfg, key, coerced);
        const werr = tryWriteJson(cfgPath, cfg);
        if (werr) {
            return textResult(JSON.stringify({ written: false, error: `Could not write ${cfgPath}: ${werr}`, key }, null, 2));
        }
        return textResult(JSON.stringify({ written: true, configPath: cfgPath, key, value: coerced, config: cfg }, null, 2));
    });
    // 4) fluent_remember -------------------------------------------------------
    server.registerTool('fluent_remember', {
        title: 'Record a design decision in agent memory',
        description: 'Record a design decision in projectDir/.fluent/memory.json so it is never re-asked. Stores { id, question, answer, scope, surface?, timestamp, source }. UPSERTS on id: recording the same decision again REPLACES the previous answer (keeping firstRecordedAt, bumping revision, and reporting previousAnswer) instead of leaving two decisions with the same id and contradictory answers. Creates the memory file if missing; refuses to write if it exists but does not parse. If the decision id is a known preset dot-path (e.g. "brand.color"), the effective value is also mirrored into memory.preferences. Never throws.',
        inputSchema: {
            projectDir: projectDirArg,
            question: z.string().min(1).describe('The clarification that was asked / resolved.'),
            answer: z.string().min(1).describe('The recorded answer or chosen value.'),
            id: z
                .string()
                .optional()
                .describe('Stable dedupe key. Pass a known preset dot-path (e.g. "brand.color") to also update memory.preferences. Slugified from the question when omitted.'),
            scope: z
                .enum(['global', 'surface', 'component', 'session'])
                .optional()
                .describe('Applicability of the decision. Defaults to "global".'),
            surface: z
                .string()
                .optional()
                .describe('Target the decision applies to (e.g. "web-react", "powerbi", "all").'),
            source: z
                .enum(['user', 'agent'])
                .optional()
                .describe('Whether a user answered or the agent chose a default. Defaults to "user".'),
        },
    }, async ({ projectDir, question, answer, id, scope, surface, source }) => {
        const root = projectRoot(projectDir);
        const memPath = memoryPathFor(root);
        const state = readJsonState(memPath);
        // A corrupt memory file used to be normalized away, silently discarding
        // every decision it held.
        if (state.exists && !state.parsed) {
            return textResult(JSON.stringify({
                written: false,
                memoryExists: true,
                memoryParseError: `${memPath}: ${state.error}`,
                error: '.fluent/memory.json exists but could not be parsed. Refusing to write — every recorded decision in it would be lost.',
                hint: 'Show the user the parse error and let them repair or delete the file, then retry.',
                memoryPath: memPath,
            }, null, 2));
        }
        const mem = normalizeMemory(state.value);
        const decisionId = id && id.trim() ? id.trim() : slugify(question) || randomId();
        const now = new Date().toISOString();
        const existingIndex = mem.decisions.findIndex((d) => d && d.id === decisionId);
        const existing = existingIndex >= 0 ? mem.decisions[existingIndex] : null;
        const decision = {
            id: decisionId,
            question,
            answer,
            scope: scope || 'global',
        };
        if (surface)
            decision.surface = surface;
        decision.timestamp = now;
        decision.source = source || 'user';
        let action = 'created';
        if (existing) {
            // Upsert. Two decisions with the same id and contradictory answers make
            // recall non-deterministic: the reader cannot tell which one is current.
            action = existing.answer === answer ? 'unchanged' : 'updated';
            decision.firstRecordedAt = existing.firstRecordedAt || existing.timestamp || now;
            decision.revision = (typeof existing.revision === 'number' ? existing.revision : 1) + (action === 'updated' ? 1 : 0);
            if (action === 'updated') {
                decision.supersededAnswer = existing.answer;
                decision.supersededAt = now;
            }
            mem.decisions[existingIndex] = decision;
        }
        else {
            decision.firstRecordedAt = now;
            decision.revision = 1;
            mem.decisions.push(decision);
        }
        // If the decision maps to a known preset, mirror it into effective preferences.
        let preferenceMirrored = null;
        let preferenceRejected = null;
        if (isKnownPresetPath(decisionId)) {
            const checked = validatePreset(decisionId, answer);
            if (checked.ok) {
                setPath(mem.preferences, decisionId, checked.value);
                preferenceMirrored = decisionId;
            }
            else {
                // The decision is still recorded; only the typed mirror is refused,
                // so a bad value never becomes an effective preset.
                preferenceRejected = checked.error;
            }
        }
        mem.updatedAt = now;
        const werr = tryWriteJson(memPath, mem);
        if (werr) {
            return textResult(JSON.stringify({ error: `Could not write ${memPath}: ${werr}` }, null, 2));
        }
        return textResult(JSON.stringify({
            action,
            id: decisionId,
            decisionCount: mem.decisions.length,
            ...(preferenceMirrored ? { preferenceMirrored } : {}),
            ...(preferenceRejected ? { preferenceNotMirrored: preferenceRejected } : {}),
            ...mem,
        }, null, 2));
    });
    // 5) fluent_recall ---------------------------------------------------------
    server.registerTool('fluent_recall', {
        title: 'Recall recorded design decisions from agent memory',
        description: 'Read projectDir/.fluent/memory.json and return { version, updatedAt, preferences, decisions, memoryExists, filter, matched, total }. Optionally filter the decision log by a case-insensitive substring over id/question/answer/surface — the filter and the match count are always echoed back, so an empty result is unambiguous ("matched 0 of 12") rather than indistinguishable from an empty memory. Returns an empty structure when no memory exists, and reports a parse error rather than pretending the file is absent. Use this before asking the user anything, to avoid re-asking. Never throws.',
        inputSchema: {
            projectDir: projectDirArg,
            filter: z
                .string()
                .optional()
                .describe('Case-insensitive substring matched against decision id / question / answer / surface.'),
        },
    }, async ({ projectDir, filter }) => {
        const root = projectRoot(projectDir);
        const state = readJsonState(memoryPathFor(root));
        const mem = normalizeMemory(state.value);
        const total = mem.decisions.length;
        let decisions = mem.decisions;
        const active = filter && filter.trim() ? filter.trim() : null;
        if (active) {
            const f = active.toLowerCase();
            decisions = decisions.filter((d) => {
                const hay = [d && d.id, d && d.question, d && d.answer, d && d.surface]
                    .filter(Boolean)
                    .join(' ')
                    .toLowerCase();
                return hay.includes(f);
            });
        }
        return textResult(JSON.stringify({
            version: mem.version,
            updatedAt: mem.updatedAt,
            memoryExists: state.exists,
            ...(state.error ? { memoryParseError: `${memoryPathFor(root)}: ${state.error}` } : {}),
            filter: active,
            matched: decisions.length,
            total,
            matchSummary: active
                ? `matched ${decisions.length} of ${total} decision(s) for filter "${active}"`
                : `${total} decision(s), no filter applied`,
            preferences: mem.preferences,
            decisions,
        }, null, 2));
    });
}
