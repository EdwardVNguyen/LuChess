import { z } from './zod.ts'

const envSchema = z.object({
  VITE_API_URL: z.url({ protocol: /^https?$/ }),
})

// PostHog's project key (#46). Optional: without it there are no analytics.
const posthogKeySchema = z.string().regex(/^phc_\w+$/)

export type Config = {
  apiUrl: string
  posthogKey: string | null
}

export function loadConfig(env: Record<string, unknown>): Config {
  const parsed = envSchema.safeParse(env)
  if (!parsed.success) {
    throw new Error('VITE_API_URL must be set to the API base URL, e.g. http://localhost:8080')
  }
  const key = env.VITE_POSTHOG_KEY
  if (key !== undefined && key !== '' && !posthogKeySchema.safeParse(key).success) {
    throw new Error('VITE_POSTHOG_KEY must be a PostHog project key, which starts with phc_, or be left unset')
  }
  return {
    apiUrl: parsed.data.VITE_API_URL.replace(/\/+$/, ''),
    posthogKey: typeof key === 'string' && key !== '' ? key : null,
  }
}
