import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { resolve, join, dirname } from 'node:path';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { textResult } from '../util.js';

/**
 * User-defined presets config (fluent.config.json) + persistent agent memory
 * (.fluent/memory.json). Zero-config safe: every tool falls back to built-in
 * Fluent 2 defaults and NEVER throws on missing / empty / corrupt files.
 * See research/config-design.md (§5 precedence, §5.3 defaults, §6 tool contracts).
 */

/** Canonical URL of the fluent.config.json JSON Schema (editor IntelliSense + validation). */
const SCHEMA_URL =
  'https://raw.githubusercontent.com/Rohithreddy7123/fluent-ui-plugin/main/assets/schema/fluent.config.schema.json';

/**
 * Built-in Fluent 2 defaults (research/config-design.md §5.3). A zero-config
 * build is a valid Fluent 2 build (the stock webLightTheme look). Used as the
 * lowest-precedence source when neither config nor memory sets a value.
 */
const DEFAULTS: Record<string, any> = {
  brand: { color: '#0f6cbd', name: 'brand' },
  theme: { mode: 'light', base: 'web', highContrast: false },
  typography: {
    fontFamily:
      "'Segoe UI', 'Segoe UI Web (West European)', -apple-system, BlinkMacSystemFont, Roboto, 'Helvetica Neue', sans-serif",
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
  migration: { from: 'none', strategy: 'incremental' },
  content: { capitalization: 'sentence' },
};

/** Look up the built-in default value at a dot-path (or undefined). */
function defaultAt(dotPath: string): any {
  let node: any = DEFAULTS;
  for (const p of dotPath.split('.')) {
    if (node && typeof node === 'object') node = node[p];
    else return undefined;
  }
  return node;
}

/** Coerce a raw value to the type of the built-in default at dotPath (keeps written config schema-valid). */
function coerceForPath(dotPath: string, value: any): any {
  const d = defaultAt(dotPath);
  if (typeof d === 'number' && typeof value !== 'number') {
    const n = Number(value);
    if (!Number.isNaN(n)) return n;
  }
  if (typeof d === 'boolean' && typeof value !== 'boolean') {
    if (value === 'true') return true;
    if (value === 'false') return false;
  }
  return value;
}

// ---------------------------------------------------------------------------
// fs + path helpers (never throw; writes confined to projectDir)
// ---------------------------------------------------------------------------

/** Parse a JSON file, returning null on missing / empty / unreadable / corrupt. Never throws. */
function readJsonSafe<T = any>(file: string): T | null {
  try {
    if (!existsSync(file)) return null;
    const raw = readFileSync(file, 'utf8').trim();
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

/** Write JSON (pretty, trailing newline), creating parent directories as needed. */
function writeJson(file: string, data: unknown): void {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

/** Write JSON, catching real I/O errors. Returns null on success or an error message. Never throws. */
function tryWriteJson(file: string, data: unknown): string | null {
  try {
    writeJson(file, data);
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}

/** Resolve the user's project root (defaults to the current working directory). */
function projectRoot(projectDir?: string): string {
  return resolve(projectDir && projectDir.trim() ? projectDir : process.cwd());
}

/** projectDir/fluent.config.json */
function configPathFor(root: string): string {
  return join(root, 'fluent.config.json');
}

/** projectDir/.fluent/memory.json */
function memoryPathFor(root: string): string {
  return join(root, '.fluent', 'memory.json');
}

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v));
}

/** Ensure a hex color has a leading '#', preserving the caller's casing. */
function ensureHash(hex: string): string {
  const h = String(hex).trim();
  return h.startsWith('#') ? h : '#' + h;
}

function slugify(s: string): string {
  return String(s)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

function randomId(): string {
  return 'decision-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
}

/** Segment names that could pollute Object.prototype — never walked into or assigned. */
const DANGEROUS_KEYS = new Set(['__proto__', 'prototype', 'constructor']);

/** Set a nested value by dot-path, creating intermediate objects as needed. Refuses prototype-polluting paths. */
function setPath(obj: Record<string, any>, dotPath: string, value: any): void {
  const parts = dotPath.split('.');
  if (parts.some((p) => DANGEROUS_KEYS.has(p))) return; // defense-in-depth vs prototype pollution
  let node = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const key = parts[i];
    if (
      !Object.prototype.hasOwnProperty.call(node, key) ||
      typeof node[key] !== 'object' ||
      node[key] === null ||
      Array.isArray(node[key])
    ) {
      node[key] = {};
    }
    node = node[key];
  }
  node[parts[parts.length - 1]] = value;
}

/** Collect every leaf dot-path of an object (arrays are treated as leaves). */
function collectLeaves(obj: any, prefix = '', out: Record<string, string> = {}): Record<string, string> {
  for (const [k, v] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      collectLeaves(v, path, out);
    } else {
      out[path] = 'default';
    }
  }
  return out;
}

/** The dot-paths that correspond to known Fluent 2 presets (leaves of DEFAULTS). */
const KNOWN_PRESET_PATHS = new Set(Object.keys(collectLeaves(DEFAULTS)));

function isKnownPresetPath(p: string): boolean {
  return KNOWN_PRESET_PATHS.has(p);
}

/**
 * Deep-merge a source object onto a target, recording the winning source
 * ("config" | "memory") at each leaf dot-path. Top-level format metadata
 * ($schema, version) is ignored — it is not a design setting.
 */
function overlay(
  target: Record<string, any>,
  sources: Record<string, string>,
  src: any,
  srcName: string,
  prefix = ''
): void {
  if (!src || typeof src !== 'object' || Array.isArray(src)) return;
  for (const [k, v] of Object.entries(src)) {
    if (prefix === '' && (k === '$schema' || k === 'version')) continue;
    if (v === undefined || v === null) continue;
    const path = prefix ? `${prefix}.${k}` : k;
    if (Array.isArray(v) || typeof v !== 'object') {
      target[k] = Array.isArray(v) ? clone(v) : v;
      sources[path] = srcName;
    } else {
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
function resolveEffective(config: any, memory: any): { config: Record<string, any>; sources: Record<string, string> } {
  const resolved = clone(DEFAULTS);
  const sources = collectLeaves(DEFAULTS);
  const prefs = memory && typeof memory === 'object' ? memory.preferences : null;
  overlay(resolved, sources, prefs, 'memory');
  overlay(resolved, sources, config, 'config');
  return { config: resolved, sources };
}

/** A fresh, empty memory skeleton. */
function emptyMemory(): Record<string, any> {
  return { version: '1.0', updatedAt: new Date().toISOString(), preferences: {}, decisions: [] };
}

/** Coerce whatever is on disk into a well-formed memory object (never throws). */
function normalizeMemory(mem: any): Record<string, any> {
  if (!mem || typeof mem !== 'object' || Array.isArray(mem)) return emptyMemory();
  return {
    version: typeof mem.version === 'string' ? mem.version : '1.0',
    updatedAt: typeof mem.updatedAt === 'string' ? mem.updatedAt : new Date().toISOString(),
    preferences:
      mem.preferences && typeof mem.preferences === 'object' && !Array.isArray(mem.preferences)
        ? mem.preferences
        : {},
    decisions: Array.isArray(mem.decisions) ? mem.decisions : [],
  };
}

// ---------------------------------------------------------------------------
// Tool registration
// ---------------------------------------------------------------------------

export function registerConfig(server: McpServer): void {
  const projectDirArg = z
    .string()
    .optional()
    .describe(
      "The user's project root that holds fluent.config.json and .fluent/memory.json. Defaults to the current working directory. Files are only ever read/written under this directory."
    );

  // 1) fluent_get_config -----------------------------------------------------
  server.registerTool(
    'fluent_get_config',
    {
      title: 'Get resolved Fluent 2 presets (config + memory + defaults)',
      description:
        'Read-only resolver for the effective Fluent 2 design presets. Merges fluent.config.json (user intent) over .fluent/memory.json (agent memory) over built-in Fluent 2 defaults, per field. Returns { configExists, memoryExists, config: <resolved effective settings>, sources: { <dot-path>: "config"|"memory"|"default" } }. Zero-config safe: with no files present it returns all-defaults (brand #0f6cbd, webLightTheme look) and never throws. Call this at the START of a build task to load context.',
      inputSchema: {
        projectDir: projectDirArg,
      },
    },
    async ({ projectDir }) => {
      const root = projectRoot(projectDir);
      const config = readJsonSafe(configPathFor(root));
      const memory = readJsonSafe(memoryPathFor(root));
      const { config: resolved, sources } = resolveEffective(config, memory);
      return textResult(
        JSON.stringify(
          {
            configExists: config !== null,
            memoryExists: memory !== null,
            projectDir: root,
            config: resolved,
            sources,
          },
          null,
          2
        )
      );
    }
  );

  // 2) fluent_init_config ----------------------------------------------------
  server.registerTool(
    'fluent_init_config',
    {
      title: 'Initialize a fluent.config.json presets file',
      description:
        'Scaffold projectDir/fluent.config.json by merging the provided presets over the built-in Fluent 2 defaults (with a "$schema" reference for editor IntelliSense). Also creates an empty .fluent/memory.json skeleton if one does not exist. Does NOT overwrite an existing fluent.config.json unless force:true. Use for the first-run onboarding offer when fluent_get_config reports configExists:false.',
      inputSchema: {
        projectDir: projectDirArg,
        brandColor: z
          .string()
          .regex(/^#?[0-9a-fA-F]{6}$/)
          .optional()
          .describe('Primary brand color (hex). Seeds brand.color (BrandVariants slot 80).'),
        targets: z
          .array(z.enum(['web-react', 'web-components', 'powerbi', 'powerapps', 'powerpages', 'pcf']))
          .optional()
          .describe('Build / adoption targets. Sets the targets array.'),
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
        force: z
          .boolean()
          .default(false)
          .describe('Overwrite an existing fluent.config.json when true.'),
      },
    },
    async ({
      projectDir,
      brandColor,
      targets,
      accessibilityLevel,
      themeMode,
      shape,
      controlSize,
      iconStyle,
      migrationFrom,
      force,
    }) => {
      const root = projectRoot(projectDir);
      const cfgPath = configPathFor(root);
      const memPath = memoryPathFor(root);
      const existed = existsSync(cfgPath);

      // Always make sure a memory skeleton exists (records agent context later).
      let memoryCreated = false;
      if (!existsSync(memPath)) {
        if (!tryWriteJson(memPath, emptyMemory())) memoryCreated = true;
      }

      if (existed && !force) {
        return textResult(
          JSON.stringify(
            {
              written: false,
              note: `fluent.config.json already exists at ${cfgPath}. Pass force:true to overwrite.`,
              configPath: cfgPath,
              memoryPath: memPath,
              memoryCreated,
              config: readJsonSafe(cfgPath),
            },
            null,
            2
          )
        );
      }

      const merged = clone(DEFAULTS);
      if (brandColor) merged.brand.color = ensureHash(brandColor);
      if (themeMode) merged.theme.mode = themeMode;
      if (shape) merged.shape.cornerRadius = shape;
      if (controlSize) merged.density.controlSize = controlSize;
      if (accessibilityLevel) merged.accessibility.targetLevel = accessibilityLevel;
      if (iconStyle) merged.iconStyle = iconStyle;
      if (targets && targets.length) merged.targets = targets;
      if (migrationFrom) merged.migration.from = migrationFrom;

      const content = { $schema: SCHEMA_URL, version: '1.0', ...merged };
      const werr = tryWriteJson(cfgPath, content);
      if (werr) {
        return textResult(
          JSON.stringify({ written: false, error: `Could not write ${cfgPath}: ${werr}`, configPath: cfgPath }, null, 2)
        );
      }

      return textResult(
        JSON.stringify(
          {
            written: true,
            overwritten: existed,
            configPath: cfgPath,
            memoryPath: memPath,
            memoryCreated,
            config: content,
          },
          null,
          2
        )
      );
    }
  );

  // 3) fluent_set_config -----------------------------------------------------
  server.registerTool(
    'fluent_set_config',
    {
      title: 'Set a single fluent.config.json value',
      description:
        'Set one preset by dot-path (e.g. "brand.color", "accessibility.targetLevel", "shape.card") in projectDir/fluent.config.json. Loads the existing config or starts a new one (with "$schema") if none exists, sets the value, writes it back, and returns the updated config. The value is coerced to the setting\'s type. Keys containing "..", a path separator, or a prototype key ("__proto__"/"prototype"/"constructor") are rejected. Returns an error note instead of throwing on invalid input or write failure.',
      inputSchema: {
        projectDir: projectDirArg,
        key: z
          .string()
          .min(1)
          .describe('Dot-path of the setting to change, e.g. "brand.color" or "accessibility.targetLevel".'),
        value: z
          .union([z.string(), z.number(), z.boolean()])
          .describe('New value for the setting (string, number, or boolean).'),
      },
    },
    async ({ projectDir, key, value }) => {
      if (!key || key.includes('..') || key.includes('/') || key.includes('\\')) {
        return textResult(
          JSON.stringify(
            { error: 'Invalid key. Use a dot-path like "brand.color"; no "..", "/", or "\\".', key },
            null,
            2
          )
        );
      }
      const parts = key.split('.');
      if (parts.some((p) => p.trim() === '')) {
        return textResult(
          JSON.stringify(
            { error: 'Invalid key. Dot-path segments must be non-empty (no leading/trailing/double dots).', key },
            null,
            2
          )
        );
      }
      if (parts.some((p) => DANGEROUS_KEYS.has(p))) {
        return textResult(
          JSON.stringify(
            { error: 'Invalid key. Segments "__proto__", "prototype", and "constructor" are not allowed.', key },
            null,
            2
          )
        );
      }

      const root = projectRoot(projectDir);
      const cfgPath = configPathFor(root);
      let cfg = readJsonSafe<Record<string, any>>(cfgPath);
      if (!cfg || typeof cfg !== 'object' || Array.isArray(cfg)) {
        cfg = { $schema: SCHEMA_URL };
      }
      const coerced = coerceForPath(key, value);
      setPath(cfg, key, coerced);
      const werr = tryWriteJson(cfgPath, cfg);
      if (werr) {
        return textResult(
          JSON.stringify({ written: false, error: `Could not write ${cfgPath}: ${werr}`, key }, null, 2)
        );
      }

      return textResult(
        JSON.stringify({ written: true, configPath: cfgPath, key, value: coerced, config: cfg }, null, 2)
      );
    }
  );

  // 4) fluent_remember -------------------------------------------------------
  server.registerTool(
    'fluent_remember',
    {
      title: 'Record a design decision in agent memory',
      description:
        'Append a design decision (a resolved clarification) to projectDir/.fluent/memory.json so it is never re-asked. Stores { id, question, answer, scope, surface?, timestamp, source }. Creates the memory file if missing. If the decision id is a known preset dot-path (e.g. "brand.color"), the effective value is also mirrored into memory.preferences. Never throws.',
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
    },
    async ({ projectDir, question, answer, id, scope, surface, source }) => {
      const root = projectRoot(projectDir);
      const memPath = memoryPathFor(root);
      const mem = normalizeMemory(readJsonSafe(memPath));

      const decisionId = id && id.trim() ? id.trim() : slugify(question) || randomId();
      const decision: Record<string, any> = {
        id: decisionId,
        question,
        answer,
        scope: scope || 'global',
      };
      if (surface) decision.surface = surface;
      decision.timestamp = new Date().toISOString();
      decision.source = source || 'user';
      mem.decisions.push(decision);

      // If the decision maps to a known preset, mirror it into effective preferences.
      if (isKnownPresetPath(decisionId)) {
        setPath(mem.preferences, decisionId, coerceForPath(decisionId, answer));
      }

      mem.updatedAt = new Date().toISOString();
      const werr = tryWriteJson(memPath, mem);
      if (werr) {
        return textResult(JSON.stringify({ error: `Could not write ${memPath}: ${werr}` }, null, 2));
      }

      return textResult(JSON.stringify(mem, null, 2));
    }
  );

  // 5) fluent_recall ---------------------------------------------------------
  server.registerTool(
    'fluent_recall',
    {
      title: 'Recall recorded design decisions from agent memory',
      description:
        'Read projectDir/.fluent/memory.json and return { version, updatedAt, preferences, decisions, memoryExists }. Optionally filter the decision log by a case-insensitive substring over id/question/answer/surface. Returns an empty structure when no memory exists. Use this before asking the user anything, to avoid re-asking. Never throws.',
      inputSchema: {
        projectDir: projectDirArg,
        filter: z
          .string()
          .optional()
          .describe('Case-insensitive substring matched against decision id / question / answer / surface.'),
      },
    },
    async ({ projectDir, filter }) => {
      const root = projectRoot(projectDir);
      const raw = readJsonSafe(memoryPathFor(root));
      const mem = normalizeMemory(raw);

      let decisions = mem.decisions;
      if (filter && filter.trim()) {
        const f = filter.trim().toLowerCase();
        decisions = decisions.filter((d: any) => {
          const hay = [d && d.id, d && d.question, d && d.answer, d && d.surface]
            .filter(Boolean)
            .join(' ')
            .toLowerCase();
          return hay.includes(f);
        });
      }

      return textResult(
        JSON.stringify(
          {
            version: mem.version,
            updatedAt: mem.updatedAt,
            preferences: mem.preferences,
            decisions,
            memoryExists: raw !== null,
          },
          null,
          2
        )
      );
    }
  );
}
