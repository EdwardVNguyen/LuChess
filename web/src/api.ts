import { z } from 'zod'

const healthSchema = z.object({ status: z.string() })
const userSchema = z.object({ id: z.number(), email: z.string(), name: z.string() })
const messageSchema = z.object({ message: z.string() })
const errorBodySchema = z.object({ error: z.string() })

export type Health = z.infer<typeof healthSchema>
export type User = z.infer<typeof userSchema>

export type SignUpInput = { email: string; name: string; password: string }

export class ApiError extends Error {
  readonly status: number
  readonly retryAfterSeconds?: number

  constructor(message: string, status: number, retryAfterSeconds?: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.retryAfterSeconds = retryAfterSeconds
  }
}

export function createApiClient(baseUrl: string, fetchFn: typeof fetch = fetch) {
  async function request(path: string, body?: unknown): Promise<Response> {
    let res: Response
    try {
      res = await fetchFn(`${baseUrl}${path}`, {
        credentials: 'include',
        ...(body === undefined
          ? {}
          : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
      })
    } catch {
      throw new ApiError('Could not reach the server. Check your connection and try again.', 0)
    }
    if (res.ok) return res

    // Only trust the message if the body is the API's own error shape
    const parsed = errorBodySchema.safeParse(await res.json().catch(() => null))
    const retryAfter = Number(res.headers.get('Retry-After'))
    throw new ApiError(
      parsed.success ? parsed.data.error : `Something went wrong (status ${res.status}). Please try again.`,
      res.status,
      Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : undefined,
    )
  }

  return {
    async health(): Promise<Health> {
      const res = await request('/api/health')
      return healthSchema.parse(await res.json())
    },

    async signUp(input: SignUpInput): Promise<User> {
      const res = await request('/api/auth/signup', input)
      return userSchema.parse(await res.json())
    },

    async verifyEmail(token: string): Promise<void> {
      await request('/api/auth/verify-email', { token })
    },

    async resendVerification(email: string): Promise<{ message: string }> {
      const res = await request('/api/auth/resend-verification', { email })
      return messageSchema.parse(await res.json())
    },
  }
}
