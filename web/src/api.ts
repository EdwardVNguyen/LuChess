import { z } from 'zod'

const healthSchema = z.object({ status: z.string() })
const userSchema = z.object({ id: z.number(), email: z.string(), name: z.string() })
const messageSchema = z.object({ message: z.string() })
const errorBodySchema = z.object({ error: z.string() })
const sessionResponseSchema = z.object({ accessToken: z.string(), user: userSchema })

export type Health = z.infer<typeof healthSchema>
export type User = z.infer<typeof userSchema>
export type SessionResponse = z.infer<typeof sessionResponseSchema>

export type SignUpInput = { email: string; name: string; password: string }
export type LoginInput = { email: string; password: string }
export type ResetPasswordInput = { token: string; password: string }

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

type RequestInput = { method?: 'GET' | 'POST'; body?: unknown; accessToken?: string }

// The transport adapter: HTTP paths, credentials, schemas and ApiError. It
// holds no Session state; the Session module decides when to call it.
export function createApiClient(baseUrl: string, fetchFn: typeof fetch = fetch) {
  async function request(path: string, { method, body, accessToken }: RequestInput = {}): Promise<Response> {
    const headers: Record<string, string> = {}
    if (body !== undefined) headers['Content-Type'] = 'application/json'
    if (accessToken) headers.Authorization = `Bearer ${accessToken}`

    let res: Response
    try {
      res = await fetchFn(`${baseUrl}${path}`, {
        credentials: 'include',
        method: method ?? (body === undefined ? 'GET' : 'POST'),
        ...(Object.keys(headers).length > 0 ? { headers } : {}),
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
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
      const res = await request('/api/auth/signup', { body: input })
      return userSchema.parse(await res.json())
    },

    async verifyEmail(token: string): Promise<void> {
      await request('/api/auth/verify-email', { body: { token } })
    },

    async resendVerification(email: string): Promise<{ message: string }> {
      const res = await request('/api/auth/resend-verification', { body: { email } })
      return messageSchema.parse(await res.json())
    },

    async forgotPassword(email: string): Promise<{ message: string }> {
      const res = await request('/api/auth/forgot-password', { body: { email } })
      return messageSchema.parse(await res.json())
    },

    async resetPassword(input: ResetPasswordInput): Promise<void> {
      await request('/api/auth/reset-password', { body: input })
    },

    async login(input: LoginInput): Promise<SessionResponse> {
      const res = await request('/api/auth/login', { body: input })
      return sessionResponseSchema.parse(await res.json())
    },

    async refresh(): Promise<SessionResponse> {
      const res = await request('/api/auth/refresh', { method: 'POST' })
      return sessionResponseSchema.parse(await res.json())
    },

    async logout(): Promise<void> {
      await request('/api/auth/logout', { method: 'POST' })
    },

    async me(accessToken: string): Promise<User> {
      const res = await request('/api/me', { accessToken })
      return userSchema.parse(await res.json())
    },
  }
}
