import { describe, expect, it } from 'vitest'
import { themeDeclarations } from './themeCss'
import { palettes, type ThemeName } from './tokens'

describe('themeDeclarations', () => {
  // The dark panels and the serif are the same in every theme (docs/adr/0012),
  // so only cssVariablesResolver.ts sets them, never a theme.
  it.each(Object.keys(palettes) as ThemeName[])('%s sets no panel or serif variable', (name) => {
    const names = Object.keys(themeDeclarations(name))
    expect(names.filter((key) => key.startsWith('--cn-panel-') || key === '--cn-font-serif')).toEqual([])
  })
})
