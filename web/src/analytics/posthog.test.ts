import { afterEach, expect, it, vi } from 'vitest'
import { createAnalytics } from './analytics'

afterEach(() => {
  vi.unstubAllGlobals()
})

type Sent = { batch: { event: string; timestamp: unknown; properties: Record<string, unknown> }[] }

// With the real posthog-js, not a fake, so a before_send that breaks the
// event is caught: PostHog rejected every event whose Date timestamp had been
// copied into {} (a 400, "missing event name attribute").
it('sends PostHog a page view it can read, without the token', async () => {
  window.history.replaceState(null, '', '/reset-password?token=secret')
  const fetch = vi.fn((_url: string, _init?: RequestInit) => Promise.resolve(new Response('{"status":1}')))
  vi.stubGlobal('fetch', fetch)

  createAnalytics('phc_test').pageview()

  const sent = async () => {
    const calls = fetch.mock.calls.filter(([url]) => String(url).startsWith('/ingest/'))
    // PostHog gzips what it sends
    const bodies = await Promise.all(
      calls.map(([, init]) => new Response(new Response(init?.body).body!.pipeThrough(new DecompressionStream('gzip'))).text()),
    )
    return bodies.flatMap((body) => (JSON.parse(body) as Sent).batch)
  }
  await vi.waitFor(async () => expect((await sent()).map((e) => e.event)).toContain('$pageview'), { timeout: 8000 })

  const events = await sent()
  for (const event of events) expect(event.timestamp).toEqual(expect.any(String))
  expect(JSON.stringify(events)).not.toContain('secret')
}, 10000)
