import { lazy, Suspense } from 'react'

// Imported lazily so the dev-only route (and the overlay components it
// exercises) can be dropped from the production bundle entirely.
const DevOverlays = lazy(() => import('./DevOverlays').then((m) => ({ default: m.DevOverlays })))

export function DevOverlaysRoute() {
  return (
    <Suspense fallback={null}>
      <DevOverlays />
    </Suspense>
  )
}
