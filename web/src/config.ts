import { z } from 'zod'

const envSchema = z.object({
  VITE_API_URL: z.url({ protocol: /^https?$/ }),
})

export type Config = {
  apiUrl: string
}

export function loadConfig(env: Record<string, unknown>): Config {
  const parsed = envSchema.safeParse(env)
  if (!parsed.success) {
    throw new Error('VITE_API_URL must be set to the API base URL, e.g. http://localhost:8080')
  }
  return { apiUrl: parsed.data.VITE_API_URL.replace(/\/+$/, '') }
}
