import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

// @testing-library/react only auto-registers this when it detects Jest's
// global `afterEach`; Vitest's globals are opt-in, so this project wires it
// up explicitly instead of turning them on everywhere.
afterEach(cleanup)

// jsdom has no layout engine, so `window.matchMedia` always throws "not
// implemented". Mantine's `useMatches`/`useMediaQuery` already catch that and
// fall back to `false`, so every breakpoint reads as unmatched here and
// responsive components render their mobile variant. Tests that need another
// size override `window.matchMedia` themselves.
if (!('matchMedia' in window) || typeof window.matchMedia !== 'function') {
  window.matchMedia = () => ({
    matches: false,
    media: '',
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })
}
