import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { DEFAULT_THEME } from '@mantine/core'
import { describe, expect, it } from 'vitest'
import { cssVariablesResolver } from '../src/theme/cssVariablesResolver.ts'
import { themeDeclarations } from '../src/theme/themeCss.ts'
import { palettes, type ThemeName } from '../src/theme/tokens.ts'

// The theme's variables against the app's source (src/theme/themeCss.ts).
// It lives here, not in src, because it reads the source files with Node.

const src = path.resolve(import.meta.dirname, '../src')

/** The text of every source file in the app, but not its tests. */
function sources(dir = src): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) return sources(full)
    if (!/\.(css|tsx?)$/.test(entry.name) || /\.test\.tsx?$/.test(entry.name)) return []
    return [readFileSync(full, 'utf8')]
  })
}

describe('themes', () => {
  // A value that is missing from one theme silently falls back to whatever
  // the page inherits, which can be unreadable in another theme.
  it('defines every --cn- variable the app uses, in every theme', () => {
    const used = new Set(sources().flatMap((text) => text.match(/--cn-[a-z-]+[a-z]/g) ?? []))
    const fixed = Object.keys(cssVariablesResolver(DEFAULT_THEME).variables)

    for (const name of Object.keys(palettes) as ThemeName[]) {
      const defined = new Set([...fixed, ...Object.keys(themeDeclarations(name))])
      expect([...used].filter((variable) => !defined.has(variable)), name).toEqual([])
    }
  })

  it('sets the same variables in every theme', () => {
    const [first, ...rest] = (Object.keys(palettes) as ThemeName[]).map((name) => Object.keys(themeDeclarations(name)).sort())
    for (const keys of rest) expect(keys).toEqual(first)
  })

  it('gives filled buttons dark text on Night and light text on the paper themes', () => {
    expect(themeDeclarations('night')['--mantine-primary-color-contrast']).toBe(palettes.night.paper)
    expect(themeDeclarations('cool')['--mantine-primary-color-contrast']).toBe('#FFFFFF')
    expect(themeDeclarations('warm')['--mantine-primary-color-contrast']).toBe('#FFFFFF')
  })
})
