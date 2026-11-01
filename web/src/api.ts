import { z } from 'zod'

const healthSchema = z.object({ status: z.string() })

export type Health = z.infer<typeof healthSchema>

export function createApiClient(baseUrl: string, fetchFn: typeof fetch = fetch) {
  return {
    async health(): Promise<Health> {
      const res = await fetchFn(`${baseUrl}/api/health`, { credentials: 'include' })
      if (!res.ok) {
        throw new Error(`API request failed with status ${res.status}`)
      }
      return healthSchema.parse(await res.json())
    },
  }
}
