import { lazy, Suspense } from 'react'

// Imported lazily so the dev-only route (and the board, chess.js and the
// sample game it loads) can be dropped from the production bundle entirely.
const DevBoard = lazy(() => import('./DevBoard').then((m) => ({ default: m.DevBoard })))

export function DevBoardRoute() {
  return (
    <Suspense fallback={null}>
      <DevBoard />
    </Suspense>
  )
}
