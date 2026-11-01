import { describe, expect, it, vi } from 'vitest'
import { createApiClient } from './api'

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('api client health', () => {
  it('asks the API for its health, sending credentials, and returns the status', async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse({ status: 'ok' }))
    const api = createApiClient('http://localhost:8080', fetchFn)

    const health = await api.health()

    expect(health).toEqual({ status: 'ok' })
    expect(fetchFn).toHaveBeenCalledTimes(1)
    const [url, init] = fetchFn.mock.calls[0]
    expect(url).toBe('http://localhost:8080/api/health')
    expect(init.credentials).toBe('include')
  })

  it('throws when the API answers with an error status', async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse({ error: 'boom' }, 500))
    const api = createApiClient('http://localhost:8080', fetchFn)

    await expect(api.health()).rejects.toThrow(/500/)
  })

  it('throws when the response is not a health payload', async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse({ hello: 'world' }))
    const api = createApiClient('http://localhost:8080', fetchFn)

    await expect(api.health()).rejects.toThrow()
  })
})
