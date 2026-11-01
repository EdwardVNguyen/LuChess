import { z } from 'zod'

const healthSchema = z.object({ status: z.string() })
const userSchema = z.object({ id: z.number(), email: z.string(), name: z.string() })
const messageSchema = z.object({ message: z.string() })
const errorBodySchema = z.object({ error: z.string() })
const sessionSchema = z.object({ accessToken: z.string(), user: userSchema })

export type Health = z.infer<typeof healthSchema>
export type User = z.infer<typeof userSchema>
export type Session = { user: User }

export type SignUpInput = { email: string; name: string; password: string }
export type LoginInput = { email: string; password: string }

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

// Runs fn while holding a lock shared by every tab of this browser, when the
// browser supports it. Refresh tokens rotate, so two tabs refreshing at once
// would race; taking turns means the second tab uses the cookie the first set.
export function browserLock<T>(fn: () => Promise<T>): Promise<T> {
  if (typeof navigator !== 'undefined' && navigator.locks) {
    return navigator.locks.request('chessnotes-refresh', fn)
  }
  return fn()
}

type Options = { lock?: <T>(fn: () => Promise<T>) => Promise<T> }

type RequestInput = { method?: 'GET' | 'POST'; body?: unknown; accessToken?: string | null }

export function createApiClient(baseUrl: string, fetchFn: typeof fetch = fetch, options: Options = {}) {
  const lock = options.lock ?? browserLock

  // The access token lives only in this variable: never in storage, so a script
  // injected into the page cannot read a long-lived credential from disk.
  let accessToken: string | null = null
  let session: Session | null = null
  const listeners = new Set<() => void>()

  function setSession(next: { accessToken: string; user: User } | null) {
    accessToken = next?.accessToken ?? null
    session = next ? { user: next.user } : null
    listeners.forEach((listener) => listener())
  }

  async function request(path: string, { method, body, accessToken: token }: RequestInput = {}): Promise<Response> {
    const headers: Record<string, string> = {}
    if (body !== undefined) headers['Content-Type'] = 'application/json'
    if (token) headers.Authorization = `Bearer ${token}`

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

  // Callers that arrive while a refresh is under way share it, so the single-use
  // refresh token is spent once.
  let refreshing: Promise<Session | null> | null = null

  function refresh(): Promise<Session | null> {
    refreshing ??= lock(async () => {
      try {
        const res = await request('/api/auth/refresh', { method: 'POST' })
        const next = sessionSchema.parse(await res.json())
        setSession(next)
        return { user: next.user }
      } catch (error) {
        // No valid refresh token simply means nobody is logged in
        if (error instanceof ApiError && error.status === 401) {
          setSession(null)
          return null
        }
        throw error
      }
    }).finally(() => {
      refreshing = null
    })
    return refreshing
  }

  // Sends an authenticated request. If the access token has expired, gets a new
  // one and tries once more.
  async function authed(path: string): Promise<Response> {
    try {
      return await request(path, { accessToken })
    } catch (error) {
      if (!(error instanceof ApiError) || error.status !== 401) throw error
      if (!(await refresh())) throw error
      return request(path, { accessToken })
    }
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

    async login(input: LoginInput): Promise<Session> {
      const res = await request('/api/auth/login', { body: input })
      const next = sessionSchema.parse(await res.json())
      setSession(next)
      return { user: next.user }
    },

    refresh,

    // The session is forgotten locally even if the server cannot be told, so the
    // person is never left looking logged in after pressing the button.
    async logout(): Promise<void> {
      try {
        await request('/api/auth/logout', { method: 'POST' })
      } finally {
        setSession(null)
      }
    },

    async me(): Promise<User> {
      const res = await authed('/api/me')
      return userSchema.parse(await res.json())
    },

    getSession: () => session,

    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
}
