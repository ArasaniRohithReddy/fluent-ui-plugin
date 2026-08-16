/* eslint-disable @typescript-eslint/naming-convention */
// Ported from microsoft/fluentui:
//   packages/react-components/theme-designer/src/colors/palettes.ts
//   packages/react-components/theme-designer/src/utils/getBrandTokensFromPalette.ts
//
// This is the exact algorithm Microsoft's Fluent 2 Theme Designer runs: the palette is a
// continuous curve through (D50) LAB space made of two quadratic Bezier curves that start at
// 0L (black) and 100L (white) and meet at the LAB value of the key colour. Shades are sampled
// along that curve at hue-specific lightness stops and snapped back into the sRGB gamut.
import { LAB_to_sRGB, LCH_to_Lab, Lab_to_LCH, sRGB_to_LCH, snap_into_gamut, } from './csswg.js';
import { getPointsOnCurvePath } from './geometry.js';
import { hexToHue, hueToSnappingPointsMap } from './hueMap.js';
/**
 * When distributing output shades along the curve, for each shade's lightness a
 * logarithmically distributed value is averaged with a linearly distributed
 * value to this degree between zero and one, zero meaning use the logarithmic
 * value, one meaning use the linear value.
 */
const defaultLinearity = 0.75;
/** Upstream's control points for the Fluent brand ramp (getBrandTokensFromPalette defaults). */
export const BRAND_DARK_CP = 2 / 3;
export const BRAND_LIGHT_CP = 1 / 3;
/** getBrandTokensFromPalette asks hexColorsFromPalette for 16 shades at linearity 1. */
export const BRAND_SHADES = 16;
export const BRAND_LINEARITY = 1;
const snappingPointsForKeyColor = (keyColor) => {
    const hue = hexToHue(keyColor);
    return [
        hueToSnappingPointsMap[hue][0] * 100,
        hueToSnappingPointsMap[hue][1] * 100,
        hueToSnappingPointsMap[hue][2] * 100,
    ];
};
const pointsForKeyColor = (keyColor, range, _centerPoint) => {
    const hue = hexToHue(keyColor);
    const center = hueToSnappingPointsMap[hue][1] * 100;
    return linearInterpolationThroughPoint(range[0], range[1], center, BRAND_SHADES);
};
function linearInterpolationThroughPoint(start, end, inBetween, numSamples) {
    if (numSamples < 3) {
        throw new Error('Number of samples must be at least 3.');
    }
    // Find the ratio of the inBetween point
    const inBetweenRatio = (inBetween - start) / (end - start);
    // Calculate the index of the inBetween point in the resulting array
    const inBetweenIndex = Math.floor((numSamples - 1) * inBetweenRatio);
    const result = new Array(numSamples);
    result[0] = start;
    result[inBetweenIndex] = inBetween;
    result[numSamples - 1] = end;
    const stepBefore = (inBetween - start) / inBetweenIndex;
    const stepAfter = (end - inBetween) / (numSamples - 1 - inBetweenIndex);
    for (let i = 1; i < inBetweenIndex; i++) {
        result[i] = start + i * stepBefore;
    }
    for (let i = inBetweenIndex + 1; i < numSamples - 1; i++) {
        result[i] = inBetween + (i - inBetweenIndex) * stepAfter;
    }
    return result;
}
const getLogSpace = (min, max, n) => {
    const a = min <= 0 ? 0 : Math.log(min);
    const b = Math.log(max);
    const delta = (b - a) / n;
    const result = [Math.pow(Math.E, a)];
    for (let i = 1; i < n; i += 1) {
        result.push(Math.pow(Math.E, a + delta * i));
    }
    result.push(Math.pow(Math.E, b));
    return result;
};
function paletteShadesFromCurvePoints(curvePoints, nShades, linearity, keyColor) {
    if (curvePoints.length <= 2) {
        return [];
    }
    const snappingPoints = snappingPointsForKeyColor(keyColor);
    const paletteShades = [];
    const range = [snappingPoints[0], snappingPoints[2]];
    const logLightness = getLogSpace(Math.log10(0), Math.log10(100), nShades);
    const linearLightness = pointsForKeyColor(keyColor, range, snappingPoints[1]);
    let c = 0;
    // obtain 2d path thru color space to grab points from
    for (let i = 0; i < nShades; i++) {
        const l = Math.min(range[1], Math.max(range[0], logLightness[i] * (1 - linearity) + linearLightness[i] * linearity));
        // Upstream walks the sampled curve forward until the segment straddling `l` is found.
        // The `c + 1 < curvePoints.length` guard is ours: upstream reads curvePoints[c + 1][0]
        // unguarded, which throws on a degenerate curve (e.g. a pure-white key colour, where the
        // light half of the curve collapses to a point). It cannot change any in-range result,
        // because `l` is clamped to range[1] <= 100 and the curve always ends at L = 100.
        while (c + 1 < curvePoints.length && l > curvePoints[c + 1][0]) {
            c++;
        }
        if (c + 1 >= curvePoints.length) {
            c = curvePoints.length - 2;
        }
        const [l1, a1, b1] = curvePoints[c];
        const [l2, a2, b2] = curvePoints[c + 1];
        const u = l2 === l1 ? 0 : (l - l1) / (l2 - l1);
        paletteShades[i] = [l1 + (l2 - l1) * u, a1 + (a2 - a1) * u, b1 + (b2 - b1) * u];
    }
    return paletteShades.map(snap_into_gamut);
}
export function paletteShadesFromCurve(keyColor, curve, nShades = BRAND_SHADES, linearity = defaultLinearity, curveDepth = 24) {
    const points = getPointsOnCurvePath(curve, Math.ceil((curveDepth * (1 + Math.abs(curve.torsion || 1))) / 2)).map((curvePoint) => getPointOnHelix(curvePoint, curve.torsion, curve.torsionT0));
    return paletteShadesFromCurvePoints(points, nShades, linearity, keyColor);
}
/** Upstream's hex writer: floor(channel * 256), NOT round(channel * 255). */
export function sRGB_to_hex(rgb) {
    return `#${rgb
        .map(x => {
        const channel = x < 0 ? 0 : Math.floor(x >= 1.0 ? 255 : x * 256);
        return channel.toString(16).padStart(2, '0');
    })
        .join('')}`;
}
export function Lab_to_hex(lab) {
    return sRGB_to_hex(LAB_to_sRGB(lab));
}
export function hex_to_sRGB(hex) {
    const aRgbHex = hex.match(/#?(..)(..)(..)/);
    return aRgbHex
        ? [parseInt(aRgbHex[1], 16) / 255, parseInt(aRgbHex[2], 16) / 255, parseInt(aRgbHex[3], 16) / 255]
        : [0, 0, 0];
}
export function hex_to_LCH(hex) {
    return sRGB_to_LCH(hex_to_sRGB(hex));
}
function paletteShadesToHex(paletteShades) {
    return paletteShades.map(Lab_to_hex);
}
function getPointOnHelix(pointOnCurve, torsion = 0, torsionT0 = 50) {
    const t = pointOnCurve[0];
    const [l, c, h] = Lab_to_LCH(pointOnCurve);
    const hueOffset = torsion * (t - torsionT0);
    return LCH_to_Lab([l, c, h + hueOffset]);
}
export function curvePathFromPalette({ keyColor, darkCp, lightCp, hueTorsion }) {
    const blackPosition = [0, 0, 0];
    const whitePosition = [100, 0, 0];
    const keyColorPosition = LCH_to_Lab(keyColor);
    const [l, a, b] = keyColorPosition;
    const darkControlPosition = [l * (1 - darkCp), a, b];
    const lightControlPosition = [l + (100 - l) * lightCp, a, b];
    const curves = [
        { points: [blackPosition, darkControlPosition, keyColorPosition] },
        { points: [keyColorPosition, lightControlPosition, whitePosition] },
    ];
    return { curves, torsion: hueTorsion, torsionT0: l };
}
export function hexColorsFromPalette(keyColor, palette, nShades = BRAND_SHADES, linearity = defaultLinearity, curveDepth = 24) {
    const curve = curvePathFromPalette(palette);
    const shades = paletteShadesFromCurve(keyColor, curve, nShades, linearity, curveDepth);
    return paletteShadesToHex(shades);
}
