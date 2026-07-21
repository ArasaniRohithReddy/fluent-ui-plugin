// theme.ts — build a custom Fluent 2 brand theme from a 16-slot BrandVariants ramp.
// Grounded against @fluentui/react-components@9.74.3 / @fluentui/react-theme@9.2.1.
//
// The ramp below is Fluent's default web brand ("brandWeb"); slot 80 is the primary
// brand color (e.g. colorBrandBackground). To generate a ramp from your own seed hex,
// use the Fluent 2 Theme Designer: https://react.fluentui.dev/?path=/docs/themedesigner--page
import {
  createLightTheme,
  createDarkTheme,
  createHighContrastTheme,
  type BrandVariants,
  type Theme,
} from '@fluentui/react-components';

export const brand: BrandVariants = {
  10: '#061724',
  20: '#082338',
  30: '#0a2e4a',
  40: '#0c3b5e',
  50: '#0e4775',
  60: '#0f548c',
  70: '#115ea3',
  80: '#0f6cbd', // primary
  90: '#2886de',
  100: '#479ef5',
  110: '#62abf5',
  120: '#77b7f7',
  130: '#96c6fa',
  140: '#b4d6fa',
  150: '#cfe4fa',
  160: '#ebf3fc',
};

export const lightTheme: Theme = createLightTheme(brand);

export const darkTheme: Theme = {
  ...createDarkTheme(brand),
};

// Optional: Windows High Contrast. High contrast is brand-independent, so it takes no args.
export const highContrastTheme: Theme = createHighContrastTheme();
