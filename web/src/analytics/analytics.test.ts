import type { PostHog } from 'posthog-js'
import { describe, expect, it, vi } from 'vitest'
import { createAnalytics } from './analytics'

function fakePostHog() {
  const calls: string[] = []
  const posthog = {
    init: vi.fn(),
    capture: vi.fn((event: string) => calls.push(`capture ${event}`)),
    identify: vi.fn((id: string) => calls.push(`identify ${id}`)),
    reset: vi.fn(() => calls.push('reset')),
  }
  return { posthog: posthog as unknown as PostHog, init: posthog.init, calls }
}

const settle = () => new Promise((resolve) => setTimeout(resolve))

describe('createAnalytics', () => {
  it('loads nothing and sends nothing without a key', async () => {
    const load = vi.fn()
    const analytics = createAnalytics(null, load)

    analytics.pageview()
    analytics.capture('note_created')
    await settle()

    expect(load).not.toHaveBeenCalled()
  })

  it('loads PostHog once and sends the calls made while it loads, in order', async () => {
    const { posthog, init, calls } = fakePostHog()
    const load = vi.fn(() => Promise.resolve(posthog))
    const analytics = createAnalytics('phc_key', load)

    analytics.pageview()
    analytics.identify(42)
    analytics.capture('link_added')
    analytics.reset()
    await settle()

    expect(load).toHaveBeenCalledTimes(1)
    expect(init).toHaveBeenCalledTimes(1)
    expect(calls).toEqual(['capture $pageview', 'identify 42', 'capture link_added', 'reset'])
  })

  it('reads nothing on the page and removes tokens from what it sends', async () => {
    const { posthog, init } = fakePostHog()
    createAnalytics('phc_key', () => Promise.resolve(posthog)).pageview()
    await settle()

    const [key, options] = init.mock.calls[0]
    expect(key).toBe('phc_key')
    expect(options).toMatchObject({
      api_host: '/ingest',
      autocapture: false,
      capture_pageview: false,
      disable_session_recording: true,
      mask_all_text: true,
      disable_external_dependency_loading: true,
    })
    const event = { event: '$pageview', properties: { $current_url: 'https://luchess.example/reset-password?token=abc' } }
    expect(options.before_send(event)).toEqual({ event: '$pageview', properties: { $current_url: 'https://luchess.example/reset-password' } })
  })

  it('sends nothing, and throws nothing, when PostHog cannot load', async () => {
    const load = vi.fn(() => Promise.reject(new Error('blocked')))
    const analytics = createAnalytics('phc_key', load)

    analytics.pageview()
    analytics.capture('signed_up')
    await settle()

    expect(load).toHaveBeenCalledTimes(1)
  })
})
