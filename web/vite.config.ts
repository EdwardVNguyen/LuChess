import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'
import { configDefaults } from 'vitest/config'
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
    // e2e/*.spec.ts is the Playwright browser test (`npm run e2e`)
    exclude: [...configDefaults.exclude, 'e2e/**'],
  },
})
