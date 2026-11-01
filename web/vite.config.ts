import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // The API only allows CORS from this origin, so the port must not drift
  server: { port: 5173, strictPort: true },
})
