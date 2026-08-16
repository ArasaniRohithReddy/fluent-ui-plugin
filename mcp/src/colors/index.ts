/* eslint-disable @typescript-eslint/naming-convention */
// Entry point ported from microsoft/fluentui:
//   packages/react-components/theme-designer/src/utils/getBrandTokensFromPalette.ts
//
// The 16 stops are keyed 10, 20, 30 ... 160 — exactly the BrandVariants shape that
// @fluentui/react-theme's createLightTheme / createDarkTheme consume.

import {
  BRAND_DARK_CP,
  BRAND_LIGHT_CP,
  BRAND_LINEARITY,
  BRAND_SHADES,
  hexColorsFromPalette,
  hex_to_LCH,
  type Palette,
} from './palettes.js';

export type BrandRampOptions = {
  /**
   * Control point of the quadratic Bezier curve towards black (0-1). Higher values move the
   * control point toward the end of the gamut, so chroma diminishes more slowly near the key
   * colour; lower values move it toward the key colour, so chroma diminishes more linearly.
   */
  darkCp?: number;
  /** Control point of the quadratic Bezier curve towards white (0-1). */
  lightCp?: number;
  /** Rotates the curve's points in LAB space, making the ramp move through different hues. */
  hueTorsion?: number;
};

/** The 16 BrandVariants keys, in ramp order: '10' (darkest) .. '160' (lightest). */
export const BRAND_STOP_KEYS: string[] = Array.from({ length: BRAND_SHADES }, (_, i) => `${(i + 1) * 10}`);

/**
 * Build a Fluent 2 BrandVariants ramp (16 stops keyed 10..160) from one key colour, using the
 * same LAB/LCH Bezier maths as Microsoft's Fluent 2 Theme Designer.
 *
 * @param keyColor 6-digit hex, with or without a leading '#'. Case-insensitive.
 */
export function getBrandTokensFromPalette(keyColor: string, options: BrandRampOptions = {}): Record<string, string> {
  const { darkCp = BRAND_DARK_CP, lightCp = BRAND_LIGHT_CP, hueTorsion = 0 } = options;
  // Upstream's hexToHue reads hex.substring(1, 3), so the leading '#' is load-bearing.
  const hex = keyColor.startsWith('#') ? keyColor : `#${keyColor}`;
  const brandPalette: Palette = {
    keyColor: hex_to_LCH(hex),
    darkCp,
    lightCp,
    hueTorsion,
  };
  const hexColors = hexColorsFromPalette(hex, brandPalette, BRAND_SHADES, BRAND_LINEARITY);
  return hexColors.reduce((acc: Record<string, string>, hexColor, h) => {
    acc[`${(h + 1) * 10}`] = hexColor;
    return acc;
  }, {});
}

export { hex_to_LCH, hexColorsFromPalette, curvePathFromPalette, type Palette } from './palettes.js';
export type { Vec3 } from './csswg.js';
