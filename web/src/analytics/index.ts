import { config } from '../appConfig'
import { createAnalytics } from './analytics'

export type { Analytics, AnalyticsEvent } from './analytics'

// Only the production build sends anything, never `npm run dev`, the tests,
// the screenshot harness or the browser test, even with a key set locally.
export const analytics = createAnalytics(import.meta.env.MODE === 'production' ? config.posthogKey : null)
