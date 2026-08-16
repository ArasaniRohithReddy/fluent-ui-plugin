import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { readFileSync, existsSync } from 'node:fs';

const here = dirname(fileURLToPath(import.meta.url));

/** mcp/data (relative to compiled dist/) */
export const DATA_DIR = join(here, '..', 'data');
/** plugin templates/ (relative to compiled dist/) */
export const TEMPLATES_DIR = join(here, '..', '..', 'templates');
/** plugin scripts/ (relative to compiled dist/) - the standalone PBIR engine */
export const SCRIPTS_DIR = join(here, '..', '..', 'scripts');

export function loadJson<T = any>(file: string): T | null {
  const p = join(DATA_DIR, file);
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, 'utf8')) as T;
  } catch {
    return null;
  }
}

/**
 * Guidance from sign-in-gated Microsoft pages is not redistributed (see NOTICE),
 * so the published datasets carry only factual scaffolding plus a `gatedNotice`.
 * A reader who has access can keep the full text in `mcp/data/local/` — which is
 * gitignored — and it is merged back in here. Absent, everything still works.
 */
export function loadLocalOverlay<T = any>(file: string): Record<string, T> | null {
  const p = join(DATA_DIR, 'local', file);
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, 'utf8')) as Record<string, T>;
  } catch {
    return null;
  }
}

/** Merge a local overlay entry over a published record, if one exists. */
export function withLocalOverlay<T extends Record<string, any>>(
  record: T,
  overlay: Record<string, any> | null,
  key: string | undefined,
): T {
  if (!overlay || !key || !overlay[key]) return record;
  const { gatedNotice, ...rest } = record as any;
  return { ...rest, ...overlay[key] } as T;
}

type UnverifiedEntry = string | { note?: string; platform?: string; source?: string };

/**
 * Every dataset records what the research could NOT confirm in an `unverified`
 * list. That honesty was previously unreachable: it only surfaced if the caller
 * happened to ask for section='unverified', so a lookup returned confident API
 * detail with no hint that a caveat existed. This surfaces the relevant ones at
 * the point of use.
 *
 * `terms` are matched against each note, so a query for iOS `Avatar` shows the
 * caveats that mention Avatar or iOS and stays quiet about unrelated ones.
 */
export function provenanceFooter(
  unverified: unknown,
  opts: { terms?: string[]; scope?: string; seeAlso?: string } = {},
): string {
  const list: UnverifiedEntry[] = Array.isArray(unverified) ? unverified : [];
  if (!list.length) return '';

  const textOf = (u: UnverifiedEntry) => (typeof u === 'string' ? u : [u.platform, u.source, u.note].filter(Boolean).join(' — '));
  const scoped = opts.scope
    ? list.filter((u) => typeof u === 'string' || !u.platform || u.platform.toLowerCase() === opts.scope!.toLowerCase())
    : list;

  const terms = (opts.terms || []).map((t) => t.toLowerCase()).filter((t) => t.length > 2);
  const relevant = terms.length
    ? scoped.filter((u) => { const s = textOf(u).toLowerCase(); return terms.some((t) => s.includes(t)); })
    : [];

  const lines: string[] = ['', '---', `Provenance: ${scoped.length} caveat(s) recorded for this dataset${opts.scope ? ` (${opts.scope})` : ''}.`];
  if (relevant.length) {
    lines.push('', 'Directly relevant to this query — treat as NOT independently verified:');
    for (const u of relevant.slice(0, 5)) lines.push(`  ! ${textOf(u)}`);
    if (relevant.length > 5) lines.push(`  ...and ${relevant.length - 5} more.`);
  }
  if (opts.seeAlso) lines.push('', `See them all: ${opts.seeAlso}`);
  return lines.join('\n');
}

/** Standard MCP text tool result. */
export function textResult(text: string) {
  return { content: [{ type: 'text' as const, text }] };
}

export function normalizeHex(input: string): string {
  return '#' + input.trim().replace(/^#/, '').toUpperCase();
}

export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

export function rgbToHex(r: number, g: number, b: number): string {
  const c = (n: number) =>
    Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
  return '#' + c(r) + c(g) + c(b);
}

/** Tint a hex color toward white by amt (0..1). */
export function mixWithWhite(hex: string, amt: number): string {
  const [r, g, b] = hexToRgb(hex);
  return rgbToHex(r + (255 - r) * amt, g + (255 - g) * amt, b + (255 - b) * amt);
}

/** Shade a hex color toward black by amt (0..1). */
export function mixWithBlack(hex: string, amt: number): string {
  const [r, g, b] = hexToRgb(hex);
  return rgbToHex(r * (1 - amt), g * (1 - amt), b * (1 - amt));
}

/** hex -> HSL with h in [0,360), s/l in [0,1]. */
export function hexToHsl(hex: string): [number, number, number] {
  const [r0, g0, b0] = hexToRgb(hex);
  const r = r0 / 255, g = g0 / 255, b = b0 / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === r) h = (((g - b) / d) % 6 + 6) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
  }
  const l = (max + min) / 2;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  return [h, s, l];
}

/** HSL (h in [0,360), s/l in [0,1]) -> hex. */
export function hslToHex(h: number, s: number, l: number): string {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0, g = 0, b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return rgbToHex((r + m) * 255, (g + m) * 255, (b + m) * 255);
}
