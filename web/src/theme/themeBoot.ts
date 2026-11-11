import type { ThemeName } from './tokens.ts'

// Which theme the site is in (docs/adr/0008). The choice is saved on the
// device, not the account, so it is known before the page draws and works
// the same for Guests. Match system follows the device's dark mode: Night
// when it is dark, Cool paper when it is light.

export type ThemeChoice = ThemeName | 'system'

export const THEME_CHOICES: readonly ThemeChoice[] = ['night', 'cool', 'warm', 'system']

// readThemeChoice, resolveTheme and applyTheme also run as index.html's boot
// script, before the app loads (bootScript below). So each stands alone: no
// imports, no outside constants, no TypeScript-only runtime features.

/** The saved choice, or Night when there is none, it is unknown, or storage is unavailable. */
export function readThemeChoice(getStorage: () => Storage): ThemeChoice {
  try {
    const stored = getStorage().getItem('chessnotes:theme')
    if (stored === 'night' || stored === 'cool' || stored === 'warm' || stored === 'system') return stored
  } catch {
    // Storage is blocked or missing: fall back to the default.
  }
  return 'night'
}

/** The theme a choice shows, given whether the device is in dark mode. */
export function resolveTheme(choice: ThemeChoice, prefersDark: boolean): ThemeName {
  if (choice === 'system') return prefersDark ? 'night' : 'cool'
  return choice
}

/** Puts the page in a theme: our variables (themeCss.ts), and Mantine's light or dark scheme. */
export function applyTheme(root: HTMLElement, name: ThemeName) {
  root.setAttribute('data-cn-theme', name)
  // Night is the only dark palette (tokens.ts).
  root.setAttribute('data-mantine-color-scheme', name === 'night' ? 'dark' : 'light')
}

export const DARK_QUERY = '(prefers-color-scheme: dark)'

/** index.html's inline script: applies the saved theme before the first paint. */
export const bootScript = [
  readThemeChoice.toString(),
  resolveTheme.toString(),
  applyTheme.toString(),
  `applyTheme(document.documentElement, resolveTheme(readThemeChoice(function () { return window.localStorage }), typeof window.matchMedia === 'function' && window.matchMedia(${JSON.stringify(DARK_QUERY)}).matches))`,
].join('\n')
