import { describe, expect, it } from 'vitest'
import { loadConfig } from './config'

describe('loadConfig', () => {
  it('reads the API URL and drops a trailing slash', () => {
    const config = loadConfig({ VITE_API_URL: 'http://localhost:8080/' })

    expect(config.apiUrl).toBe('http://localhost:8080')
  })

  it.each([
    ['missing', {}],
    ['empty', { VITE_API_URL: '' }],
    ['not a URL', { VITE_API_URL: 'localhost:8080' }],
    ['not http(s)', { VITE_API_URL: 'ftp://localhost' }],
  ])('rejects an API URL that is %s, naming the variable', (_case, env) => {
    expect(() => loadConfig(env)).toThrow(/VITE_API_URL/)
  })

  it('has no PostHog key unless one is set', () => {
    expect(loadConfig({ VITE_API_URL: 'http://localhost:8080' }).posthogKey).toBeNull()
    expect(loadConfig({ VITE_API_URL: 'http://localhost:8080', VITE_POSTHOG_KEY: '' }).posthogKey).toBeNull()
  })

  it('reads the PostHog key', () => {
    const config = loadConfig({ VITE_API_URL: 'http://localhost:8080', VITE_POSTHOG_KEY: 'phc_abc123' })

    expect(config.posthogKey).toBe('phc_abc123')
  })

  it('rejects a PostHog key that is not a project key, naming the variable', () => {
    expect(() => loadConfig({ VITE_API_URL: 'http://localhost:8080', VITE_POSTHOG_KEY: 'phx_personal' })).toThrow(/VITE_POSTHOG_KEY/)
  })
})
