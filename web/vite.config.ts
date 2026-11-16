/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { availableParallelism } from 'node:os'
import { defineConfig, type Plugin } from 'vite'
import { themeCss } from './src/theme/themeCss.ts'
import { bootScript } from './src/theme/themeBoot.ts'

// Puts every theme's colours and the saved-theme script in index.html's
// <head>, so a returning visitor's first paint is already in their theme
// (docs/adr/0008).
function themes(): Plugin {
  return {
    name: 'chessnotes-themes',
    transformIndexHtml: () => [
      { tag: 'style', attrs: { id: 'cn-themes' }, children: themeCss(), injectTo: 'head-prepend' },
      { tag: 'script', children: bootScript, injectTo: 'head-prepend' },
    ],
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), themes()],
  // The API only allows CORS from this origin, so the port must not drift
  server: { port: 5173, strictPort: true },
  test: {
    // jsdom, not the default node environment, so overlay components (focus
    // trapping, Esc handling, matchMedia) can be rendered and interacted with.
    environment: 'jsdom',
    setupFiles: ['./src/testSetup.ts'],
    // At most four workers. The page tests each run a whole Note screen in
    // jsdom, and the slowest files start first, so with Vitest's default of a
    // worker for every core but one, seven on an 8-core M1 share its four
    // performance cores and its memory: the run finishes no sooner, and every
    // test takes two to three times longer (#151). On a machine with five
    // cores or fewer this is Vitest's default.
    maxWorkers: Math.min(4, Math.max(1, availableParallelism() - 1)),
    // Tests that click and type through a whole page re-render it on every
    // event, and a full run makes them two to three times slower than alone:
    // the slowest take ~2s, with a few ~3s, against the default 5s. Twice
    // that, for a machine that is also swapping (#151).
    testTimeout: 10_000,
  },
})
