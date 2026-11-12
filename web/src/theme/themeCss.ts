import { DEFAULT_THEME, defaultCssVariablesResolver, isLightColor, mergeMantineTheme } from '@mantine/core'
import { colorTheme, rgba } from './colors.ts'
import { palettes, type Palette, type ThemeName } from './tokens.ts'

// Every theme's colours as CSS variables, one block per theme, keyed by the
// `data-cn-theme` attribute (see themeChoice.ts). Switching theme only
// changes that attribute, so it applies at once with no reload and no
// re-render. vite.config.ts writes this into index.html's <head>, so the
// page is painted in the right theme before any script runs.
//
// A block also matches an element inside the page, so a part of the page can
// show another theme (the previews in Settings).

function kebab(name: string) {
  return name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)
}

/** The `--cn-*` colours: the palette, plus the overlay and shadows made from it. */
function paletteVariables(palette: Palette): Record<string, string> {
  const variables: Record<string, string> = {}
  for (const key of [
    'ink',
    'muted',
    'paper',
    'ground',
    'sidebar',
    'marginPanel',
    'rule',
    'card',
    'edge',
    'highlight',
    'dashed',
    'accent',
    'avatar',
    'prose',
    'bandEdge',
    'windowDot',
  ] as const) {
    variables[`--cn-${kebab(key)}`] = palette[key]
  }
  const shadow = (alpha: number) => rgba(palette.shadowBase, alpha)
  return {
    ...variables,
    '--cn-shadow-base': palette.shadowBase,
    '--cn-overlay': shadow(0.45),
    // The lift under a dialog that floats over the page (QuickFind.dc.html).
    '--cn-dialog-shadow': `0 24px 60px ${shadow(0.28)}`,
    // The landing hero's cards: the Note card, and the smaller linked cards around it.
    '--cn-lift-shadow': `0 22px 50px ${shadow(0.18)}`,
    '--cn-card-shadow': `0 10px 26px ${shadow(0.12)}`,
    // The browser frame around a picture of the app.
    '--cn-picture-shadow': `0 18px 44px ${shadow(0.16)}`,
  }
}

/**
 * The Mantine variables that depend on the palette: the `ink`, `accent`,
 * `red` and `dark` ramps and what Mantine derives from them, computed by
 * Mantine itself for this palette's scheme, and its surfaces.
 */
function mantineVariables(palette: Palette): Record<string, string> {
  const theme = mergeMantineTheme(DEFAULT_THEME, colorTheme(palette))
  const resolved = defaultCssVariablesResolver(theme)
  const ours = /^--mantine-color-(ink|accent|red|dark)-/
  const pick = (from: Record<string, string>): Record<string, string> =>
    Object.fromEntries(Object.entries(from).filter(([name]) => ours.test(name)))
  // What filled ink and accent buttons write in (see variantColorResolver in theme.ts).
  const contrast = (color: string) => (isLightColor(color) ? palette.paper : '#FFFFFF')

  return {
    ...pick(resolved.variables),
    ...pick(palette.scheme === 'dark' ? resolved.dark : resolved.light),
    '--mantine-primary-color-contrast': contrast(palette.ink),
    '--mantine-color-ink-contrast': contrast(palette.ink),
    '--mantine-color-accent-contrast': contrast(palette.accent),
    '--mantine-color-red-contrast': contrast(palette.accent),
    '--mantine-color-body': palette.paper,
    '--mantine-color-text': palette.ink,
    '--mantine-color-bright': palette.ink,
    '--mantine-color-dimmed': palette.muted,
    '--mantine-color-placeholder': palette.dashed,
    '--mantine-color-anchor': palette.accent,
    '--mantine-color-error': palette.accent,
    '--mantine-color-default': palette.card,
    '--mantine-color-default-hover': palette.highlight,
    '--mantine-color-default-color': palette.ink,
    '--mantine-color-default-border': palette.edge,
  }
}

/** The CSS declarations for one theme. */
export function themeDeclarations(name: ThemeName): Record<string, string> {
  const palette = palettes[name]
  return {
    // Native scrollbars and form controls follow.
    'color-scheme': palette.scheme,
    ...paletteVariables(palette),
    ...mantineVariables(palette),
  }
}

function block(selector: string, declarations: Record<string, string>) {
  const body = Object.entries(declarations)
    .map(([property, value]) => `  ${property}: ${value};`)
    .join('\n')
  return `${selector} {\n${body}\n}`
}

/**
 * The stylesheet for every theme. On the page's root the selector needs
 * `html:root` to outrank Mantine's own `:root[data-mantine-color-scheme]`
 * blocks; Warm paper also applies when nothing has chosen a theme yet.
 */
export function themeCss(): string {
  return (Object.keys(palettes) as ThemeName[])
    .map((name) => {
      const selectors = [`html:root[data-cn-theme='${name}']`, `[data-cn-theme='${name}']`]
      if (name === 'warm') selectors.unshift(`html:root:not([data-cn-theme])`)
      return block(selectors.join(',\n'), themeDeclarations(name))
    })
    .join('\n\n')
}
