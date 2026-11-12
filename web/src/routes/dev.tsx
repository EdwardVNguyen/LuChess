import { createLazyRoute } from '@tanstack/react-router'
import { DevBoard } from '../board/DevBoard'
import { DevOverlays } from '../overlay/DevOverlays'
import { DevTheme } from '../theme/DevTheme'

// The dev-only pages' chunk, never built into production (router.tsx).
export const devThemeRoute = createLazyRoute('/dev/theme')({ component: DevTheme })
export const devOverlaysRoute = createLazyRoute('/dev/overlays')({ component: DevOverlays })
export const devBoardRoute = createLazyRoute('/dev/board')({ component: DevBoard })
