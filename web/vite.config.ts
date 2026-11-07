/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // The API only allows CORS from this origin, so the port must not drift
  server: { port: 5173, strictPort: true },
  test: {
    // jsdom, not the default node environment, so overlay components (focus
    // trapping, Esc handling, matchMedia) can be rendered and interacted with.
    environment: 'jsdom',
    setupFiles: ['./src/testSetup.ts'],
  },
})
