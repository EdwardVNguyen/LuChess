import type { PostHog } from 'posthog-js'
import { withoutTokens } from './scrub'

// The events agreed with the owner (#46), each sent every time it happens;
// PostHog finds a person's first Note or first Link itself.
export type AnalyticsEvent = 'signed_up' | 'note_created' | 'link_added'

export type Analytics = {
  pageview(): void
  capture(event: AnalyticsEvent): void
  /** Ties what follows to the user, by their ID alone: never an email address. */
  identify(userId: number): void
  /** Forgets the user once their Session ends. */
  reset(): void
}

const off: Analytics = { pageview() {}, capture() {}, identify() {}, reset() {} }

function start(posthog: PostHog, key: string): PostHog {
  posthog.init(key, {
    // Caddy passes /ingest/ to PostHog (web/Caddyfile), so the CSP stays
    // 'self' and the browser talks only to this site.
    api_host: '/ingest',
    ui_host: 'https://us.posthog.com',
    person_profiles: 'identified_only',
    // Page views are sent on each route change instead (main.tsx).
    capture_pageview: false,
    capture_pageleave: false,
    // Nothing that reads the page: its text is the user's Notes, Comments and
    // Bodies, which must never reach PostHog. The masking is in case a
    // setting in PostHog's dashboard ever turns any of these on.
    autocapture: false,
    capture_heatmaps: false,
    capture_dead_clicks: false,
    capture_exceptions: false,
    disable_session_recording: true,
    mask_all_text: true,
    mask_all_element_attributes: true,
    // No surveys or experiments, and no scripts loaded from PostHog: the CSP
    // allows only this site's own.
    disable_surveys: true,
    disable_product_tours: true,
    disable_conversations: true,
    disable_web_experiments: true,
    disable_external_dependency_loading: true,
    advanced_disable_flags: true,
    before_send: (event) => event && withoutTokens(event),
  })
  return posthog
}

/**
 * Analytics through PostHog when there is a key, and nothing at all when
 * there isn't. PostHog loads in its own chunk on the first call, and calls
 * made meanwhile wait for it, in order.
 */
export function createAnalytics(
  key: string | null,
  load: () => Promise<PostHog> = () => import('posthog-js').then((m) => m.default),
): Analytics {
  if (key === null) return off
  const projectKey = key

  let posthog: Promise<PostHog | null> | null = null
  function whenLoaded(call: (posthog: PostHog) => void) {
    // Analytics never break the app: if PostHog can't load, nothing is sent.
    posthog ??= load()
      .then((loaded) => start(loaded, projectKey))
      .catch(() => null)
    void posthog.then((loaded) => {
      if (loaded) call(loaded)
    })
  }

  return {
    pageview: () => whenLoaded((p) => p.capture('$pageview')),
    capture: (event) => whenLoaded((p) => p.capture(event)),
    identify: (userId) => whenLoaded((p) => p.identify(String(userId))),
    reset: () => whenLoaded((p) => p.reset()),
  }
}
