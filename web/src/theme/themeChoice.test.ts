import { describe, expect, it } from 'vitest'
import { bootScript } from './themeBoot'
import { createThemeStore } from './themeChoice'

function memoryStorage(initial: Record<string, string> = {}): Storage {
  const values = new Map(Object.entries(initial))
  return {
    get length() {
      return values.size
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => void values.delete(key),
    setItem: (key, value) => void values.set(key, value),
  }
}

/** A device whose dark mode can be switched, like `matchMedia('(prefers-color-scheme: dark)')`. */
function device(dark: boolean) {
  const listeners = new Set<() => void>()
  const query = {
    matches: dark,
    addEventListener: (_type: string, listener: () => void) => listeners.add(listener),
  } as unknown as MediaQueryList
  return {
    query,
    setDark(next: boolean) {
      ;(query as { matches: boolean }).matches = next
      listeners.forEach((listener) => listener())
    },
  }
}

const blocked = () => {
  throw new DOMException('The operation is insecure.', 'SecurityError')
}

function setup({ storage = memoryStorage(), dark = false, getStorage = () => storage } = {}) {
  const root = document.createElement('html')
  const media = device(dark)
  const store = createThemeStore({ getStorage, darkQuery: media.query, root })
  return { store, root, media, storage }
}

describe('theme store', () => {
  it('is Warm paper by default, and puts the page in it', () => {
    const { store, root } = setup()

    expect(store.get()).toEqual({ choice: 'warm', theme: 'warm' })
    expect(root.dataset.cnTheme).toBe('warm')
    expect(root.dataset.mantineColorScheme).toBe('light')
  })

  it('starts from the saved choice', () => {
    const { store, root } = setup({ storage: memoryStorage({ 'chessnotes:theme': 'night' }) })

    expect(store.get()).toEqual({ choice: 'night', theme: 'night' })
    expect(root.dataset.cnTheme).toBe('night')
    expect(root.dataset.mantineColorScheme).toBe('dark')
  })

  it('ignores a saved value that is not a theme', () => {
    const { store } = setup({ storage: memoryStorage({ 'chessnotes:theme': 'sepia' }) })

    expect(store.get().choice).toBe('warm')
  })

  it('saves a new choice and applies it at once', () => {
    const { store, root, storage } = setup()
    let notified = 0
    store.subscribe(() => notified++)

    store.set('cool')

    expect(store.get()).toEqual({ choice: 'cool', theme: 'cool' })
    expect(root.dataset.cnTheme).toBe('cool')
    expect(storage.getItem('chessnotes:theme')).toBe('cool')
    expect(notified).toBe(1)
  })

  it('matches the system: Night in dark mode, Cool paper in light mode, following live changes', () => {
    const { store, root, media } = setup({ storage: memoryStorage({ 'chessnotes:theme': 'system' }), dark: true })
    expect(store.get()).toEqual({ choice: 'system', theme: 'night' })

    media.setDark(false)
    expect(store.get()).toEqual({ choice: 'system', theme: 'cool' })
    expect(root.dataset.cnTheme).toBe('cool')

    media.setDark(true)
    expect(root.dataset.cnTheme).toBe('night')
  })

  it('ignores the device once a theme is chosen outright', () => {
    const { store, media } = setup({ dark: true })
    store.set('warm')

    media.setDark(false)

    expect(store.get()).toEqual({ choice: 'warm', theme: 'warm' })
  })

  it('falls back to Warm paper when storage is unavailable, and still switches for this visit', () => {
    const { store, root } = setup({ getStorage: blocked })
    expect(store.get()).toEqual({ choice: 'warm', theme: 'warm' })

    store.set('night')

    expect(store.get().theme).toBe('night')
    expect(root.dataset.cnTheme).toBe('night')
  })
})

describe('boot script', () => {
  // The script index.html runs before the first paint (vite.config.ts).
  function boot({ saved, dark = false }: { saved?: string; dark?: boolean }) {
    window.localStorage.clear()
    if (saved) window.localStorage.setItem('chessnotes:theme', saved)
    const matchMedia = window.matchMedia
    window.matchMedia = ((query: string) => ({ ...matchMedia(query), matches: dark })) as typeof window.matchMedia
    try {
      new Function(bootScript)()
    } finally {
      window.matchMedia = matchMedia
      window.localStorage.clear()
    }
    return document.documentElement
  }

  it('applies Warm paper when nothing is saved', () => {
    expect(boot({}).dataset.cnTheme).toBe('warm')
    expect(document.documentElement.dataset.mantineColorScheme).toBe('light')
  })

  it('applies the saved theme', () => {
    expect(boot({ saved: 'cool' }).dataset.cnTheme).toBe('cool')
  })

  it('applies Match system from the device', () => {
    expect(boot({ saved: 'system', dark: true }).dataset.cnTheme).toBe('night')
    expect(boot({ saved: 'system', dark: false }).dataset.cnTheme).toBe('cool')
  })
})
