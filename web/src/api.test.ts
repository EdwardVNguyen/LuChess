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
