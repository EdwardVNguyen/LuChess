import '@testing-library/jest-dom/vitest'
import { cleanup, configure } from '@testing-library/react'
import { afterEach } from 'vitest'

// @testing-library/react only auto-registers this when it detects Jest's
// global `afterEach`; Vitest's globals are opt-in, so this project wires it
// up explicitly instead of turning them on everywhere.
afterEach(cleanup)

// findBy* and waitFor give up after 1s by default. On a full parallel run a
// page can take longer than that to re-render after a click or a save.
configure({ asyncUtilTimeout: 5000 })

// Tests render <MantineProvider env="test">. Otherwise a Menu or Popover can
// open with its dropdown hidden: Mantine hides it when floating-ui reports the
// trigger scrolled out of view, which jsdom, with no layout, says at random.
// The overlay tests (overlay/testUtils.tsx) leave it out, because they check
// the focus Mantine returns once an exit transition ends, and env="test"
// skips transitions.

// jsdom has no layout engine, so `window.matchMedia` always throws "not
// implemented". Mantine's `useMatches`/`useMediaQuery` already catch that and
// fall back to `false`, so any component that reads matchMedia renders its
// mobile variant here. The overlay components take `size` as a prop instead,
// so their tests pass 'mobile' | 'tablet' | 'desktop' directly.
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

// jsdom has no ResizeObserver either; Mantine's SegmentedControl measures
// its indicator with one. Nothing here has a size to observe, so a no-op does.
if (typeof window.ResizeObserver === 'undefined') {
  window.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
}

// jsdom has no document.fonts; Mantine's autosizing Textarea (the PGN box)
// listens on it to resize once fonts load. Nothing loads fonts here.
if (!('fonts' in document)) {
  Object.defineProperty(document, 'fonts', {
    value: { addEventListener: () => {}, removeEventListener: () => {}, ready: Promise.resolve() },
  })
}
