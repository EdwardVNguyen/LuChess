// The theme store: the saved choice, kept in step with the page and, for
// Match system, with the device (see themeBoot.ts for how it is read and applied).

import { useSyncExternalStore } from 'react'
import { applyTheme, DARK_QUERY, readThemeChoice, resolveTheme, type ThemeChoice } from './themeBoot'
import type { ThemeName } from './tokens'

export { THEME_CHOICES, type ThemeChoice } from './themeBoot'

export type ThemeState = { choice: ThemeChoice; theme: ThemeName }

export type ThemeStore = {
  get: () => ThemeState
  set: (choice: ThemeChoice) => void
  subscribe: (listener: () => void) => () => void
}

type Environment = {
  getStorage: () => Storage
  /** null when the browser can't answer media queries. */
  darkQuery: MediaQueryList | null
  root: HTMLElement
}

function browserEnvironment(): Environment {
  let darkQuery: MediaQueryList | null = null
  try {
    darkQuery = window.matchMedia(DARK_QUERY)
  } catch {
    // jsdom and very old browsers: treat the device as light.
  }
  return { getStorage: () => window.localStorage, darkQuery, root: document.documentElement }
}

export function createThemeStore(env: Environment = browserEnvironment()): ThemeStore {
  const listeners = new Set<() => void>()
  const prefersDark = () => env.darkQuery?.matches ?? false
  const choice = readThemeChoice(env.getStorage)
  let state: ThemeState = { choice, theme: resolveTheme(choice, prefersDark()) }

  function update(choice: ThemeChoice) {
    const theme = resolveTheme(choice, prefersDark())
    if (choice !== state.choice || theme !== state.theme) state = { choice, theme }
    applyTheme(env.root, state.theme)
    listeners.forEach((listener) => listener())
  }

  // Match system follows the device live, without a reload.
  env.darkQuery?.addEventListener?.('change', () => update(state.choice))
  applyTheme(env.root, state.theme)

  return {
    get: () => state,
    set(choice) {
      try {
        env.getStorage().setItem('chessnotes:theme', choice)
      } catch {
        // Not saved, but this visit still shows it.
      }
      update(choice)
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}

let defaultStore: ThemeStore | null = null

/** The page's theme store, made on first use. */
export function themeStore(): ThemeStore {
  defaultStore ??= createThemeStore()
  return defaultStore
}

/** The current choice and theme, and a way to change it. Changing it applies at once. */
export function useTheme(store: ThemeStore = themeStore()): ThemeState & { setChoice: (choice: ThemeChoice) => void } {
  const state = useSyncExternalStore(store.subscribe, store.get, store.get)
  return { ...state, setChoice: store.set }
}
