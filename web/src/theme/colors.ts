import { colorsTuple, type MantineColorsTuple } from '@mantine/core'
import { colorTokens } from './tokens'

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

// Mantine colors are 10-shade tuples (lightest to darkest). The designs only
// give us one hex per color, so this fills in a ramp around it: `baseIndex`
// is the shade that must equal `baseHex` exactly.
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

// Primary: the dark ink used for filled buttons, checked radios, focus
// rings. Shade 8 is the glossary's `ink` color exactly.
export const ink = ramp(colorTokens.ink, 8, colorTokens.paper, '#15120E')

// The oxblood link/accent color, for anchors and anything calling out a
// link. Shade 6 is the glossary's `accent` color exactly.
export const accent = ramp(colorTokens.accent, 6, '#F3ECE0', '#4A1811')
