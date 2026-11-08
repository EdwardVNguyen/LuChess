import { describe, expect, it, vi } from 'vitest'
import { ApiError, createApiClient } from './api'

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  })
}

const baseUrl = 'http://localhost:8080'

describe('api client health', () => {
  it('asks the API for its health, sending credentials, and returns the status', async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse({ status: 'ok' }))
    const api = createApiClient(baseUrl, fetchFn)

    const health = await api.health()

    expect(health).toEqual({ status: 'ok' })
    expect(fetchFn).toHaveBeenCalledTimes(1)
    const [url, init] = fetchFn.mock.calls[0]
    expect(url).toBe('http://localhost:8080/api/health')
    expect(init.credentials).toBe('include')
  })

  it('throws an ApiError carrying the status when the API answers with an error', async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse({ error: 'boom' }, 500))
    const api = createApiClient(baseUrl, fetchFn)

    await expect(api.health()).rejects.toMatchObject({ name: 'ApiError', status: 500 })
  })

  it('throws when the response is not a health payload', async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse({ hello: 'world' }))
    const api = createApiClient(baseUrl, fetchFn)

    await expect(api.health()).rejects.toThrow()
  })
})

describe('api client signUp', () => {
  it('posts the details as JSON and returns the created user', async () => {
    const created = { id: 7, email: 'ada@example.com', name: 'Ada' }
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse(created, 201))
    const api = createApiClient(baseUrl, fetchFn)

    const user = await api.signUp({ email: 'ada@example.com', name: 'Ada', password: 'correct horse battery' })

    expect(user).toEqual(created)
    const [url, init] = fetchFn.mock.calls[0]
    expect(url).toBe('http://localhost:8080/api/auth/signup')
    expect(init.method).toBe('POST')
    expect(init.headers['Content-Type']).toBe('application/json')
    expect(JSON.parse(init.body)).toEqual({
      email: 'ada@example.com',
      name: 'Ada',
      password: 'correct horse battery',
    })
  })

  it("surfaces the API's message and status when the email is taken", async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValue(jsonResponse({ error: 'An account with this email already exists' }, 409))
    const api = createApiClient(baseUrl, fetchFn)

    const failure = await api.signUp({ email: 'a@b.co', name: 'Ada', password: 'x'.repeat(12) }).catch((e) => e)

    expect(failure).toBeInstanceOf(ApiError)
    expect(failure.status).toBe(409)
    expect(failure.message).toBe('An account with this email already exists')
  })

  it('gives a plain message when the API cannot be reached', async () => {
    const fetchFn = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))
    const api = createApiClient(baseUrl, fetchFn)

    const failure = await api.signUp({ email: 'a@b.co', name: 'Ada', password: 'x'.repeat(12) }).catch((e) => e)

    expect(failure).toBeInstanceOf(ApiError)
    expect(failure.status).toBe(0)
    expect(failure.message).toMatch(/could not reach/i)
  })

  it('does not trust an error response that is not the expected JSON', async () => {
    const fetchFn = vi.fn().mockResolvedValue(new Response('<html>Bad gateway</html>', { status: 502 }))
    const api = createApiClient(baseUrl, fetchFn)

    const failure = await api.signUp({ email: 'a@b.co', name: 'Ada', password: 'x'.repeat(12) }).catch((e) => e)

    expect(failure.status).toBe(502)
    expect(failure.message).not.toContain('<html>')
  })
})

describe('api client verifyEmail', () => {
  it('posts the token and resolves when the API accepts it', async () => {
    const fetchFn = vi.fn().mockResolvedValue(new Response(null, { status: 204 }))
    const api = createApiClient(baseUrl, fetchFn)

    await expect(api.verifyEmail('abc123')).resolves.toBeUndefined()

    const [url, init] = fetchFn.mock.calls[0]
    expect(url).toBe('http://localhost:8080/api/auth/verify-email')
    expect(JSON.parse(init.body)).toEqual({ token: 'abc123' })
  })

  it('throws with the status and message for an invalid or expired link', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValue(jsonResponse({ error: 'This verification link is invalid or has expired' }, 400))
    const api = createApiClient(baseUrl, fetchFn)

    const failure = await api.verifyEmail('stale').catch((e) => e)

    expect(failure.status).toBe(400)
    expect(failure.message).toBe('This verification link is invalid or has expired')
  })
})

describe('api client resendVerification', () => {
  it('posts the email and returns the API message', async () => {
    const message = 'If that email belongs to an unverified account, we have sent a new verification link.'
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse({ message }))
    const api = createApiClient(baseUrl, fetchFn)

    await expect(api.resendVerification('ada@example.com')).resolves.toEqual({ message })

    const [url, init] = fetchFn.mock.calls[0]
    expect(url).toBe('http://localhost:8080/api/auth/resend-verification')
    expect(JSON.parse(init.body)).toEqual({ email: 'ada@example.com' })
  })

  it('reports how long to wait when rate limited', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValue(jsonResponse({ error: 'Too many requests. Please try again later.' }, 429, { 'Retry-After': '120' }))
    const api = createApiClient(baseUrl, fetchFn)

    const failure = await api.resendVerification('ada@example.com').catch((e) => e)

    expect(failure.status).toBe(429)
    expect(failure.retryAfterSeconds).toBe(120)
  })
})

describe('api client forgotPassword', () => {
  it('posts the email and returns the API message', async () => {
    const message = 'If that email belongs to an account, we have sent a link to reset its password.'
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse({ message }))
    const api = createApiClient(baseUrl, fetchFn)

    await expect(api.forgotPassword('ada@example.com')).resolves.toEqual({ message })

    const [url, init] = fetchFn.mock.calls[0]
    expect(url).toBe('http://localhost:8080/api/auth/forgot-password')
    expect(JSON.parse(init.body)).toEqual({ email: 'ada@example.com' })
  })
})

describe('api client resetPassword', () => {
  it('posts the token and new password and resolves when the API accepts them', async () => {
    const fetchFn = vi.fn().mockResolvedValue(new Response(null, { status: 204 }))
    const api = createApiClient(baseUrl, fetchFn)

    await expect(api.resetPassword({ token: 'abc123', password: 'a brand new passphrase' })).resolves.toBeUndefined()

    const [url, init] = fetchFn.mock.calls[0]
    expect(url).toBe('http://localhost:8080/api/auth/reset-password')
    expect(JSON.parse(init.body)).toEqual({ token: 'abc123', password: 'a brand new passphrase' })
  })

  it('throws with the status and message for an invalid or expired link', async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse({ error: 'This reset link is invalid or has expired' }, 400))
    const api = createApiClient(baseUrl, fetchFn)

    const failure = await api.resetPassword({ token: 'stale', password: 'a brand new passphrase' }).catch((e) => e)

    expect(failure.status).toBe(400)
    expect(failure.message).toBe('This reset link is invalid or has expired')
  })
})

describe('api client session transport', () => {
  const ada = { id: 7, email: 'ada@example.com', name: 'Ada' }
  const sessionResponse = { accessToken: 'token-1', user: ada }

  it('posts credentials and returns the access token with the user', async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse(sessionResponse))
    const api = createApiClient(baseUrl, fetchFn)

    await expect(api.login({ email: 'ada@example.com', password: 'correct horse battery' })).resolves.toEqual(sessionResponse)

    const [url, init] = fetchFn.mock.calls[0]
    expect(url).toBe('http://localhost:8080/api/auth/login')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body)).toEqual({ email: 'ada@example.com', password: 'correct horse battery' })
  })

  it('refreshes with the cookie and no body', async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse(sessionResponse))
    const api = createApiClient(baseUrl, fetchFn)

    await expect(api.refresh()).resolves.toEqual(sessionResponse)

    const [url, init] = fetchFn.mock.calls[0]
    expect(url).toBe('http://localhost:8080/api/auth/refresh')
    expect(init.method).toBe('POST')
    expect(init.credentials).toBe('include')
    expect(init.body).toBeUndefined()
  })

  it('logs out with the cookie', async () => {
    const fetchFn = vi.fn().mockResolvedValue(new Response(null, { status: 204 }))
    const api = createApiClient(baseUrl, fetchFn)

    await api.logout()

    const [url, init] = fetchFn.mock.calls[0]
    expect(url).toBe('http://localhost:8080/api/auth/logout')
    expect(init.method).toBe('POST')
    expect(init.credentials).toBe('include')
  })

  it('sends the given access token to /api/me', async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse(ada))
    const api = createApiClient(baseUrl, fetchFn)

    await expect(api.me('token-9')).resolves.toEqual(ada)

    const [url, init] = fetchFn.mock.calls[0]
    expect(url).toBe('http://localhost:8080/api/me')
    expect(init.headers.Authorization).toBe('Bearer token-9')
  })
})

describe('api client notes', () => {
  const note = {
    id: 3,
    name: 'King and pawn',
    pgn: '[SetUp "1"]\n[FEN "4k3/8/8/8/8/8/4P3/4K3 w - - 0 1"]\n\n*',
    startFen: '4k3/8/8/8/8/8/4P3/4K3 w - - 0 1',
    createdAt: '2026-11-01T12:00:00Z',
    updatedAt: '2026-11-01T12:00:00Z',
  }

  it('creates a Note with the bearer token', async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse(note, 201))
    const api = createApiClient(baseUrl, fetchFn)

    const created = await api.createNote('token-9', { name: note.name, pgn: note.pgn, startFen: note.startFen })

    expect(created).toEqual(note)
    const [url, init] = fetchFn.mock.calls[0]
    expect(url).toBe('http://localhost:8080/api/notes')
    expect(init.method).toBe('POST')
    expect(init.headers.Authorization).toBe('Bearer token-9')
    expect(JSON.parse(init.body)).toEqual({ name: note.name, pgn: note.pgn, startFen: note.startFen })
  })

  it('renames with PATCH and deletes with DELETE', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ ...note, name: 'New' }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
    const api = createApiClient(baseUrl, fetchFn)

    await expect(api.renameNote('t', 3, 'New')).resolves.toMatchObject({ name: 'New' })
    await api.deleteNote('t', 3)

    expect(fetchFn.mock.calls[0][0]).toBe('http://localhost:8080/api/notes/3')
    expect(fetchFn.mock.calls[0][1].method).toBe('PATCH')
    expect(fetchFn.mock.calls[1][1].method).toBe('DELETE')
  })

  it('reports a missing Note as a 404 ApiError', async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse({ error: 'Note not found' }, 404))
    const api = createApiClient(baseUrl, fetchFn)

    await expect(api.getNote('t', 99)).rejects.toMatchObject({ status: 404, message: 'Note not found' })
  })
})
