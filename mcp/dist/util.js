import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { readFileSync, existsSync } from 'node:fs';
const here = dirname(fileURLToPath(import.meta.url));
/** mcp/data (relative to compiled dist/) */
export const DATA_DIR = join(here, '..', 'data');
/** plugin templates/ (relative to compiled dist/) */
export const TEMPLATES_DIR = join(here, '..', '..', 'templates');
export function loadJson(file) {
    const p = join(DATA_DIR, file);
    if (!existsSync(p))
        return null;
    try {
        return JSON.parse(readFileSync(p, 'utf8'));
    }
    catch {
        return null;
    }
}
/** Standard MCP text tool result. */
export function textResult(text) {
    return { content: [{ type: 'text', text }] };
}
export function normalizeHex(input) {
    return '#' + input.trim().replace(/^#/, '').toUpperCase();
}
export function hexToRgb(hex) {
    const h = hex.replace('#', '');
    return [
        parseInt(h.slice(0, 2), 16),
        parseInt(h.slice(2, 4), 16),
        parseInt(h.slice(4, 6), 16),
    ];
}
export function rgbToHex(r, g, b) {
    const c = (n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
    return '#' + c(r) + c(g) + c(b);
}
/** Tint a hex color toward white by amt (0..1). */
export function mixWithWhite(hex, amt) {
    const [r, g, b] = hexToRgb(hex);
    return rgbToHex(r + (255 - r) * amt, g + (255 - g) * amt, b + (255 - b) * amt);
}
/** Shade a hex color toward black by amt (0..1). */
export function mixWithBlack(hex, amt) {
    const [r, g, b] = hexToRgb(hex);
    return rgbToHex(r * (1 - amt), g * (1 - amt), b * (1 - amt));
}
/** hex -> HSL with h in [0,360), s/l in [0,1]. */
export function hexToHsl(hex) {
    const [r0, g0, b0] = hexToRgb(hex);
    const r = r0 / 255, g = g0 / 255, b = b0 / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const d = max - min;
    let h = 0;
    if (d !== 0) {
        if (max === r)
            h = (((g - b) / d) % 6 + 6) % 6;
        else if (max === g)
            h = (b - r) / d + 2;
        else
            h = (r - g) / d + 4;
        h *= 60;
    }
    const l = (max + min) / 2;
    const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
    return [h, s, l];
}
/** HSL (h in [0,360), s/l in [0,1]) -> hex. */
export function hslToHex(h, s, l) {
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = l - c / 2;
    let r = 0, g = 0, b = 0;
    if (h < 60)
        [r, g, b] = [c, x, 0];
    else if (h < 120)
        [r, g, b] = [x, c, 0];
    else if (h < 180)
        [r, g, b] = [0, c, x];
    else if (h < 240)
        [r, g, b] = [0, x, c];
    else if (h < 300)
        [r, g, b] = [x, 0, c];
    else
        [r, g, b] = [c, 0, x];
    return rgbToHex((r + m) * 255, (g + m) * 255, (b + m) * 255);
}
