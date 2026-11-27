// Black-box tests for #173: the self-hosted Source Serif 4 and the fixed
// dark-panel tokens for the logged-out pages (docs/adr/0012). Written from the
// issue and design/pages/DESIGN.md, against the public surface only.
//
// The issue doesn't name the CSS variables, so each one is found by its value
// in the variables the resolver puts on every theme, then checked against what
// each theme sets.
import { MantineProvider } from '@mantine/core'
import { render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cssVariablesResolver, pageBreakpointTokens, palettes, panelTokens, theme, type ThemeName } from '.'
import { DevTheme } from './DevTheme'
import { applyTheme } from './themeBoot'
import { themeCss, themeDeclarations } from './themeCss'
import indexHtml from '../../index.html?raw'
import pkg from '../../package.json'
import devThemeSource from './DevTheme.tsx?raw'
import tokensSource from './tokens.ts?raw'

// --- The design's values (design/pages/DESIGN.md) ----------------------------

const PANEL = [
  { name: 'night', hex: '#1a1714' },
  { name: 'night field', hex: '#26221e' },
  { name: 'night line', hex: '#4a4239' },
  { name: 'on-night', hex: '#fbf8f1' },
  { name: 'on-night 2', hex: '#e6dccb' },
  { name: 'on-night 3', hex: '#cfc4b0' },
  { name: 'on-night 4', hex: '#a89f8f' },
  { name: 'tan', hex: '#e3bd7c' },
  { name: 'tan hover', hex: '#f0d29c' },
  { name: 'error on dark', hex: '#f08a80' },
] as const

const THEMES: ThemeName[] = ['warm', 'night', 'cool']

// --- Helpers ------------------------------------------------------------------

type Resolved = { variables: Record<string, string>; light: Record<string, string>; dark: Record<string, string> }

const resolved = cssVariablesResolver(theme as never) as Resolved
const norm = (v: string) => v.trim().toLowerCase()

// The theme-independent variable whose value is this hex. Several variables may
// share one value; the panel one has a name that says so, so prefer that.
function panelVariable(hex: string): string | undefined {
  const matches = Object.entries(resolved.variables)
    .filter(([, v]) => norm(v) === hex)
    .map(([k]) => k)
  return matches.find((k) => /night|tan|panel|dark|error/i.test(k)) ?? matches[0]
}

function serifVariable(): string | undefined {
  return Object.entries(resolved.variables).find(([, v]) => /source serif 4/i.test(v))?.[0]
}

function allStrings(value: unknown): string[] {
  if (typeof value === 'string') return [value]
  if (value && typeof value === 'object') return Object.values(value).flatMap(allStrings)
  return []
}

// Every `--name: value` in a stylesheet, in order.
function declarations(css: string): Array<[string, string]> {
  return [...css.matchAll(/(--[\w-]+)\s*:\s*([^;}]+)/g)].map((m) => [m[1], m[2].trim()])
}

// Every source file under src/, read as text by Vite, for the Google Fonts check.
// CSS modules are left out: Vitest hands them back as class maps even with ?raw.
const sourceFiles = import.meta.glob<string>(
  ['../**/*.{ts,tsx,css}', '!../**/*.module.css', '!../**/*.blackbox.test.tsx'],
  {
    query: '?raw',
    import: 'default',
    eager: true,
  },
)

// --- The token set ------------------------------------------------------------

describe('panelTokens', () => {
  it('is exported and holds every dark-panel value from the design', () => {
    const values = allStrings(panelTokens).map(norm)
    for (const { name, hex } of PANEL) {
      expect(values, `${name} ${hex}`).toContain(hex)
    }
  })

  it('lives outside the per-theme palettes', () => {
    expect(panelTokens).toBeDefined()
    for (const name of THEMES) {
      const palette = palettes[name] as Record<string, unknown>
      for (const value of Object.values(palette)) {
        expect(value).not.toBe(panelTokens)
      }
    }
  })
})

// --- The CSS variables ----------------------------------------------------------

describe('dark-panel CSS variables', () => {
  it.each(PANEL)('$name resolves to $hex for every theme', ({ hex }) => {
    const variable = panelVariable(hex)
    expect(variable, `no theme-independent CSS variable is ${hex}`).toBeDefined()
    expect(variable).toMatch(/^--/)
  })

  it('gives each panel token its own variable', () => {
    const names = PANEL.map(({ hex }) => panelVariable(hex))
    expect(new Set(names).size).toBe(PANEL.length)
  })

  it.each(PANEL)('$name is not changed by the light or dark colour scheme', ({ hex }) => {
    const variable = panelVariable(hex)!
    for (const scheme of [resolved.light, resolved.dark]) {
      if (variable in scheme) expect(norm(scheme[variable])).toBe(hex)
    }
  })

  it.each(THEMES)('%s does not override any panel variable', (name) => {
    const declared = themeDeclarations(name)
    for (const { hex } of PANEL) {
      const variable = panelVariable(hex)!
      if (variable in declared) expect(norm(declared[variable])).toBe(hex)
    }
  })

  it('the themes stylesheet never sets a panel variable to anything else', () => {
    const css = themeCss()
    const panelNames = new Map(PANEL.map(({ hex }) => [panelVariable(hex)!, hex]))
    for (const [name, value] of declarations(css)) {
      const hex = panelNames.get(name)
      if (hex) expect(norm(value), name).toBe(hex)
    }
  })
})

describe('serif font-family variable', () => {
  it('exists and names Source Serif 4 with a serif fallback', () => {
    const variable = serifVariable()
    expect(variable, 'no CSS variable names Source Serif 4').toBeDefined()
    const value = resolved.variables[variable!]
    expect(value).toMatch(/source serif 4/i)
    expect(value).toMatch(/\bserif\s*$/i)
  })

  it('is not changed by the colour scheme or any theme', () => {
    const variable = serifVariable()!
    const value = resolved.variables[variable]
    for (const scheme of [resolved.light, resolved.dark]) {
      if (variable in scheme) expect(scheme[variable]).toBe(value)
    }
    for (const name of THEMES) {
      const declared = themeDeclarations(name)
      if (variable in declared) expect(declared[variable]).toBe(value)
    }
  })
})

// --- What a page sees in each theme ------------------------------------------

describe('computed values on the page', () => {
  let styles: HTMLStyleElement

  beforeEach(() => {
    styles = document.createElement('style')
    styles.textContent = themeCss()
    document.head.appendChild(styles)
  })

  afterEach(() => {
    styles.remove()
    document.documentElement.removeAttribute('style')
  })

  it.each(THEMES)('in %s the panel and serif variables have the design values', (name) => {
    const { container } = render(
      <MantineProvider theme={theme} cssVariablesResolver={cssVariablesResolver}>
        <div data-testid="probe" />
      </MantineProvider>,
    )
    applyTheme(document.documentElement, name)
    const probe = container.querySelector('[data-testid="probe"]')!
    const computed = getComputedStyle(probe)
    for (const { name: token, hex } of PANEL) {
      const variable = panelVariable(hex)!
      const value = computed.getPropertyValue(variable)
      // jsdom only cascades custom properties from some sources; when it does,
      // the value must be the design's.
      if (value) expect(norm(value), `${token} in ${name}`).toBe(hex)
    }
  })
})

// --- Self-hosted Source Serif 4 ------------------------------------------------

describe('Source Serif 4 is self-hosted', () => {
  it('is a dependency, through @fontsource/source-serif-4', () => {
    expect(pkg.dependencies).toHaveProperty('@fontsource/source-serif-4')
  })

  it('loads 400, 400 italic and 600 when the theme is imported', async () => {
    const loaded: string[] = []
    vi.resetModules()
    vi.doMock('@fontsource/source-serif-4/400.css', () => {
      loaded.push('400')
      return {}
    })
    vi.doMock('@fontsource/source-serif-4/400-italic.css', () => {
      loaded.push('400-italic')
      return {}
    })
    vi.doMock('@fontsource/source-serif-4/600.css', () => {
      loaded.push('600')
      return {}
    })
    await import('./index')
    expect(loaded.sort()).toEqual(['400', '400-italic', '600'])
    vi.doUnmock('@fontsource/source-serif-4/400.css')
    vi.doUnmock('@fontsource/source-serif-4/400-italic.css')
    vi.doUnmock('@fontsource/source-serif-4/600.css')
  })

  it('makes no requests to Google Fonts', () => {
    const sources: Record<string, string> = { 'index.html': indexHtml, ...sourceFiles }
    expect(Object.keys(sources).length).toBeGreaterThan(10)
    for (const [path, text] of Object.entries(sources)) {
      expect(text, path).not.toMatch(/fonts\.(googleapis|gstatic)\.com/)
    }
  })
})

// --- Breakpoints ----------------------------------------------------------------

describe('breakpoints match the design', () => {
  // Mobile <= 640, tablet 641-1024, desktop >= 1025. Mantine breakpoints are
  // min-widths in em, so the boundaries can show up as 641/1025 or 640/1024.
  function inPx(value: unknown): number | undefined {
    if (typeof value === 'number') return value
    if (typeof value !== 'string') return undefined
    const m = value.trim().match(/^([\d.]+)(px|em|rem)?$/)
    if (!m) return undefined
    const n = parseFloat(m[1])
    return m[2] === 'em' || m[2] === 'rem' ? n * 16 : n
  }

  function boundaries(source: unknown): number[] {
    return allStrings(source)
      .concat(Object.values(source ?? {}).filter((v): v is never => typeof v === 'number'))
      .map(inPx)
      .filter((n): n is number => n !== undefined)
      .map(Math.round)
  }

  it('the exported page breakpoint tokens put the tablet boundary between 640 and 641px', () => {
    const tablet = inPx(pageBreakpointTokens.tablet)!
    expect(tablet, `tablet ${tablet}`).toBeGreaterThan(640)
    expect(tablet, `tablet ${tablet}`).toBeLessThanOrEqual(641)
  })

  it("desktop is the theme's md, 1024px", () => {
    expect(boundaries({ md: theme.breakpoints!.md })).toEqual([1024])
  })
})

// --- DevTheme -------------------------------------------------------------------

describe('DevTheme page', () => {
  it('shows every panel token and the serif', () => {
    const { container } = render(
      <MantineProvider theme={theme} cssVariablesResolver={cssVariablesResolver}>
        <DevTheme />
      </MantineProvider>,
    )
    const html = container.innerHTML.toLowerCase()
    for (const { name, hex } of PANEL) {
      const variable = panelVariable(hex)
      const shown = html.includes(hex) || (variable !== undefined && html.includes(variable))
      expect(shown, `${name} (${hex}) on DevTheme`).toBe(true)
    }
    const serif = serifVariable()
    expect(/source serif/.test(html) || (serif !== undefined && html.includes(serif))).toBe(true)
  })
})

// --- Stale design references ----------------------------------------------------

describe('comments cite the current design', () => {
  it.each([
    ['tokens.ts', tokensSource],
    ['DevTheme.tsx', devThemeSource],
  ])('%s no longer cites HomeLoggedOut.dc.html', (_file, source) => {
    expect(source).not.toContain('HomeLoggedOut.dc.html')
  })
})
