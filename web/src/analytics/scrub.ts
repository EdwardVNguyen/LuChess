// Verification and password-reset links carry their token in the URL
// (?token=), and PostHog sends URLs with events: the page's, the referrer, the
// first ones it saw. A token must never reach PostHog, so every string in an
// event loses its token parameter, wherever it is (#46).
const TOKEN_PARAM = /([?&])token=[^&#\s]*(&?)/g

export function withoutToken(text: string): string {
  // "?token=x&a=1" keeps its "?" for a=1; a token last in the query takes its
  // separator with it.
  return text.replace(TOKEN_PARAM, (_match, separator: string, next: string) => (next ? separator : ''))
}

/** A copy of an event's data with no token in any string, however deep. */
export function withoutTokens<T>(value: T): T {
  if (typeof value === 'string') return withoutToken(value) as T
  if (Array.isArray(value)) return value.map(withoutTokens) as T
  // Only plain objects: anything else, such as the event's Date, is kept as it
  // is, since PostHog calls its methods when it sends the event.
  if (isPlainObject(value)) {
    return Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, withoutTokens(inner)])) as T
  }
  return value
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object') return false
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}
