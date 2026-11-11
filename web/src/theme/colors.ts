import { colorsTuple, DEFAULT_THEME, virtualColor, type MantineColorsTuple, type MantineThemeOverride } from '@mantine/core'
import type { Palette } from './tokens.ts'

function hexToRgb(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.replace('#', ''), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function rgbToHex([r, g, b]: [number, number, number]): string {
  return `#${[r, g, b].map((value) => Math.round(value).toString(16).padStart(2, '0')).join('')}`
}

function mix(a: [number, number, number], b: [number, number, number], t: number): [number, number, number] {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
}

// Mantine colors are 10-shade tuples (lightest to darkest). A palette only
// gives one hex per color, so this fills in a ramp around it: `baseIndex` is
// the shade that must equal `baseHex` exactly.
function ramp(baseHex: string, baseIndex: number, lightEnd: string, darkEnd: string): MantineColorsTuple {
  const base = hexToRgb(baseHex)
  const light = hexToRgb(lightEnd)
  const dark = hexToRgb(darkEnd)
  const shades = Array.from({ length: 10 }, (_, index) => {
    if (index === baseIndex) return rgbToHex(base)
    if (index < baseIndex) return rgbToHex(mix(light, base, index / baseIndex))
    return rgbToHex(mix(base, dark, (index - baseIndex) / (9 - baseIndex)))
  })
  return colorsTuple(shades)
}

/**
 * The shade of the ramps that is the palette's colour exactly. Mantine's dark
 * scheme reads the lighter shades for text, so on Night (where ink is light)
 * both sit in the middle; on a light palette ink is the dark shade 8.
 */
export const PRIMARY_SHADE = { light: 8, dark: 6 } as const

/**
 * A palette's Mantine ramps, lightest to darkest. `ink` is the primary color
 * (filled buttons, checked radios, focus rings); `accent` is for links and
 * anything calling one out.
 */
export function ramps(palette: Palette): { ink: MantineColorsTuple; accent: MantineColorsTuple } {
  const inkShade = palette.scheme === 'dark' ? PRIMARY_SHADE.dark : PRIMARY_SHADE.light
  return {
    ink: ramp(palette.ink, inkShade, ...palette.inkRamp),
    accent: ramp(palette.accent, 6, ...palette.accentRamp),
  }
}

/**
 * Mantine's `dark` grays, for the dark scheme's own surfaces (inputs, hovers,
 * Alerts). On Night they are the palette's navies, from text (0) to the
 * darkest surface (9).
 */
export function darkGrays(palette: Palette): MantineColorsTuple {
  return colorsTuple([
    palette.ink,
    palette.prose,
    palette.muted,
    palette.dashed,
    palette.edge,
    palette.highlight,
    palette.card,
    palette.paper,
    palette.ground,
    palette.sidebar,
  ])
}

/**
 * The color part of the Mantine theme for a palette. `theme.ts` builds the
 * app's theme with Night's; `themeCss.ts` builds every theme's variables
 * from each palette's, so switching needs no new theme object.
 */
export function colorTheme(palette: Palette) {
  return {
    primaryColor: 'ink',
    primaryShade: PRIMARY_SHADE,
    autoContrast: true,
    colors: {
      ...ramps(palette),
      // Mantine's own grays on a light palette.
      dark: palette.scheme === 'dark' ? darkGrays(palette) : DEFAULT_THEME.colors.dark,
      // `error`/`red` is used by form validation; map it onto the accent so
      // errors stay in the house palette instead of Mantine's red.
      red: virtualColor({ name: 'red', dark: 'accent', light: 'accent' }),
    },
  } satisfies Partial<MantineThemeOverride>
}

/** `rgba()` of a palette colour, for the shadows and the overlay. */
export function rgba(hex: string, alpha: number): string {
  const [r, g, b] = hexToRgb(hex)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}
