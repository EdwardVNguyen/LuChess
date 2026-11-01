import { describe, expect, it, vi } from 'vitest'
import { ApiError, createApiClient } from './api'

const baseUrl = 'http://localhost:8080'
const ada = { id: 7, email: 'ada@example.com', name: 'Ada' }

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

const sessionBody = (accessToken: string) => json({ accessToken, user: ada })
const unauthorized = () => json({ error: 'Unauthorized' }, 401)

type Call = { path: string; init: RequestInit & { headers?: Record<string, string> } }

// A fake server: each reply is consumed in order, and every request is recorded.
function fakeServer(...replies: Array<() => Response | Promise<Response>>) {
  const calls: Call[] = []
  const queue = [...replies]
  const fetchFn = vi.fn(async (url: string, init: Call['init'] = {}) => {
    calls.push({ path: url.replace(baseUrl, ''), init })
    const next = queue.shift()
    if (!next) throw new Error(`unexpected request to ${url}`)
    return next()
  }) as unknown as typeof fetch
  return { fetchFn, calls }
}

const authHeader = (call: Call) => call.init.headers?.Authorization

describe('login', () => {
  it('posts the credentials, remembers the user, and sends the token with later requests', async () => {
    const { fetchFn, calls } = fakeServer(
      () => sessionBody('token-1'),
      () => json(ada),
    )
    const api = createApiClient(baseUrl, fetchFn)

    const session = await api.login({ email: 'ada@example.com', password: 'correct horse battery' })
    const me = await api.me()

    expect(session.user).toEqual(ada)
    expect(api.getSession()).toEqual({ user: ada })
    expect(me).toEqual(ada)
    expect(calls[0].path).toBe('/api/auth/login')
    expect(calls[0].init.method).toBe('POST')
    expect(calls[0].init.credentials).toBe('include')
    expect(JSON.parse(calls[0].init.body as string)).toEqual({
      email: 'ada@example.com',
      password: 'correct horse battery',
    })
    expect(calls[1].path).toBe('/api/me')
    expect(authHeader(calls[1])).toBe('Bearer token-1')
  })

  it('never writes the access token to browser storage', async () => {
    const setItem = vi.fn()
    vi.stubGlobal('localStorage', { setItem, getItem: vi.fn(), removeItem: vi.fn() })
    vi.stubGlobal('sessionStorage', { setItem, getItem: vi.fn(), removeItem: vi.fn() })
    try {
      const { fetchFn } = fakeServer(() => sessionBody('secret-token'))
      const api = createApiClient(baseUrl, fetchFn)

      await api.login({ email: 'ada@example.com', password: 'correct horse battery' })

      expect(setItem).not.toHaveBeenCalled()
      expect(JSON.stringify(api.getSession())).not.toContain('secret-token')
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it.each([
    [401, 'Invalid email or password'],
    [403, 'Verify your email before logging in.'],
    [429, 'Too many requests. Please try again later.'],
  ])('surfaces a %i from the API and stays logged out', async (status, error) => {
    const { fetchFn } = fakeServer(() => json({ error }, status))
    const api = createApiClient(baseUrl, fetchFn)

    const failure = await api.login({ email: 'ada@example.com', password: 'x' }).catch((e) => e)

    expect(failure).toBeInstanceOf(ApiError)
    expect(failure.status).toBe(status)
    expect(failure.message).toBe(error)
    expect(api.getSession()).toBeNull()
  })
})

describe('refresh', () => {
  it('uses the cookie to restore the session without a body', async () => {
    const { fetchFn, calls } = fakeServer(() => sessionBody('token-2'))
    const api = createApiClient(baseUrl, fetchFn)

    const session = await api.refresh()

    expect(session).toEqual({ user: ada })
    expect(api.getSession()).toEqual({ user: ada })
    expect(calls[0].path).toBe('/api/auth/refresh')
    expect(calls[0].init.method).toBe('POST')
    expect(calls[0].init.credentials).toBe('include')
    expect(calls[0].init.body).toBeUndefined()
  })

  it('returns null, not an error, when there is no valid session', async () => {
    const { fetchFn } = fakeServer(unauthorized)
    const api = createApiClient(baseUrl, fetchFn)

    await expect(api.refresh()).resolves.toBeNull()
    expect(api.getSession()).toBeNull()
  })

  it('still throws for failures that are not "you are logged out"', async () => {
    const { fetchFn } = fakeServer(() => json({ error: 'Too many requests. Please try again later.' }, 429))
    const api = createApiClient(baseUrl, fetchFn)

    await expect(api.refresh()).rejects.toMatchObject({ status: 429 })
  })

  it('runs inside the lock it is given, so tabs take turns', async () => {
    const order: string[] = []
    const lock = async <T,>(fn: () => Promise<T>) => {
      order.push('lock acquired')
      try {
        return await fn()
      } finally {
        order.push('lock released')
      }
    }
    const { fetchFn } = fakeServer(() => {
      order.push('request')
      return sessionBody('token-2')
    })
    const api = createApiClient(baseUrl, fetchFn, { lock })

    await api.refresh()

    expect(order).toEqual(['lock acquired', 'request', 'lock released'])
  })

  it('sends one request when several callers refresh at once', async () => {
    const { fetchFn, calls } = fakeServer(() => sessionBody('token-2'))
    const api = createApiClient(baseUrl, fetchFn)

    const results = await Promise.all([api.refresh(), api.refresh(), api.refresh()])

    expect(calls).toHaveLength(1)
    expect(results.every((r) => r?.user.id === ada.id)).toBe(true)
  })
})

describe('an expired access token', () => {
  it('is replaced automatically and the request retried once', async () => {
    const { fetchFn, calls } = fakeServer(
      () => sessionBody('token-1'), // login
      unauthorized, // /api/me with the expired token
      () => sessionBody('token-2'), // refresh
      () => json(ada), // /api/me retried
    )
    const api = createApiClient(baseUrl, fetchFn)
    await api.login({ email: 'ada@example.com', password: 'x' })

    const me = await api.me()

    expect(me).toEqual(ada)
    expect(calls.map((c) => c.path)).toEqual(['/api/auth/login', '/api/me', '/api/auth/refresh', '/api/me'])
    expect(authHeader(calls[1])).toBe('Bearer token-1')
    expect(authHeader(calls[3])).toBe('Bearer token-2')
  })

  it('ends the session and reports 401 when the refresh fails too', async () => {
    const { fetchFn } = fakeServer(
      () => sessionBody('token-1'),
      unauthorized, // /api/me
      unauthorized, // refresh
    )
    const api = createApiClient(baseUrl, fetchFn)
    await api.login({ email: 'ada@example.com', password: 'x' })

    const failure = await api.me().catch((e) => e)

    expect(failure).toBeInstanceOf(ApiError)
    expect(failure.status).toBe(401)
    expect(api.getSession()).toBeNull()
  })

  it('does not retry forever when the retry is rejected as well', async () => {
    const { fetchFn, calls } = fakeServer(
      () => sessionBody('token-1'),
      unauthorized,
      () => sessionBody('token-2'),
      unauthorized, // the retry is refused again
    )
    const api = createApiClient(baseUrl, fetchFn)
    await api.login({ email: 'ada@example.com', password: 'x' })

    await expect(api.me()).rejects.toMatchObject({ status: 401 })

    expect(calls).toHaveLength(4)
  })

  it('refreshes once when several requests fail at the same moment', async () => {
    const { fetchFn, calls } = fakeServer(
      () => sessionBody('token-1'),
      unauthorized,
      unauthorized,
      unauthorized,
      () => sessionBody('token-2'),
      () => json(ada),
      () => json(ada),
      () => json(ada),
    )
    const api = createApiClient(baseUrl, fetchFn)
    await api.login({ email: 'ada@example.com', password: 'x' })

    await Promise.all([api.me(), api.me(), api.me()])

    expect(calls.filter((c) => c.path === '/api/auth/refresh')).toHaveLength(1)
  })

  it('does not treat a server error as a reason to refresh', async () => {
    const { fetchFn, calls } = fakeServer(
      () => sessionBody('token-1'),
      () => json({ error: 'boom' }, 500),
    )
    const api = createApiClient(baseUrl, fetchFn)
    await api.login({ email: 'ada@example.com', password: 'x' })

    await expect(api.me()).rejects.toMatchObject({ status: 500 })

    expect(calls.map((c) => c.path)).toEqual(['/api/auth/login', '/api/me'])
  })
})

describe('logout', () => {
  it('asks the API to end the session and forgets the user', async () => {
    const { fetchFn, calls } = fakeServer(
      () => sessionBody('token-1'),
      () => new Response(null, { status: 204 }),
    )
    const api = createApiClient(baseUrl, fetchFn)
    await api.login({ email: 'ada@example.com', password: 'x' })

    await api.logout()

    expect(calls[1].path).toBe('/api/auth/logout')
    expect(calls[1].init.method).toBe('POST')
    expect(calls[1].init.credentials).toBe('include')
    expect(api.getSession()).toBeNull()
  })

  it('forgets the user even if the API cannot be reached, and says so', async () => {
    const { fetchFn } = fakeServer(
      () => sessionBody('token-1'),
      () => {
        throw new TypeError('Failed to fetch')
      },
    )
    const api = createApiClient(baseUrl, fetchFn)
    await api.login({ email: 'ada@example.com', password: 'x' })

    await expect(api.logout()).rejects.toMatchObject({ status: 0 })
    expect(api.getSession()).toBeNull()
  })

  it('no longer sends the old access token afterwards', async () => {
    const { fetchFn, calls } = fakeServer(
      () => sessionBody('token-1'),
      () => new Response(null, { status: 204 }),
      unauthorized,
      unauthorized,
    )
    const api = createApiClient(baseUrl, fetchFn)
    await api.login({ email: 'ada@example.com', password: 'x' })
    await api.logout()

    await api.me().catch(() => undefined)

    expect(authHeader(calls[2])).toBeUndefined()
  })
})

describe('subscribe', () => {
  it('tells listeners when the session starts, changes and ends', async () => {
    const { fetchFn } = fakeServer(
      () => sessionBody('token-1'),
      () => new Response(null, { status: 204 }),
    )
    const api = createApiClient(baseUrl, fetchFn)
    const listener = vi.fn()
    const unsubscribe = api.subscribe(listener)

    await api.login({ email: 'ada@example.com', password: 'x' })
    expect(listener).toHaveBeenCalledTimes(1)
    await api.logout()
    expect(listener).toHaveBeenCalledTimes(2)

    unsubscribe()
    await api.login({ email: 'ada@example.com', password: 'x' }).catch(() => undefined)
    expect(listener).toHaveBeenCalledTimes(2)
  })

  it('returns the same session object until it changes, as React requires', async () => {
    const { fetchFn } = fakeServer(() => sessionBody('token-1'))
    const api = createApiClient(baseUrl, fetchFn)
    await api.login({ email: 'ada@example.com', password: 'x' })

    expect(api.getSession()).toBe(api.getSession())
  })
})
