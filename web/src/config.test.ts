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
})
