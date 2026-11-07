import { lazy, Suspense } from 'react'

// Imported lazily so the dev-only route (and the components it exercises)
// can be dropped from the production bundle entirely.
const DevTheme = lazy(() => import('./DevTheme').then((m) => ({ default: m.DevTheme })))

export function DevThemeRoute() {
  return (
    <Suspense fallback={null}>
      <DevTheme />
    </Suspense>
  )
}
