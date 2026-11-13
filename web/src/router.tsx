import { createRootRoute, createRoute, createRouter } from '@tanstack/react-router'
import { z } from 'zod'
import { Layout } from './Layout'
import { AuthLoading, PageLoading } from './Loading'

// Routes are defined here, with their search params; each page's component
// is loaded on demand from `routes/`, one chunk per group of pages a visitor
// needs together (the landing page, the auth pages, the signed-in app, Guest
// mode), so a visitor downloads only the code for where they are. While a
// chunk loads, the route shows the screen's own loading state.
const rootRoute = createRootRoute({ component: Layout })

const landing = () => import('./routes/landing')
const homeRoute = createRoute({ getParentRoute: () => rootRoute, path: '/' }).lazy(() =>
  landing().then((m) => m.homeRoute),
)

const auth = () => import('./routes/auth')
const signUpRoute = createRoute({ getParentRoute: () => rootRoute, path: '/signup', pendingComponent: AuthLoading }).lazy(
  () => auth().then((m) => m.signUpRoute),
)
const loginRoute = createRoute({ getParentRoute: () => rootRoute, path: '/login', pendingComponent: AuthLoading }).lazy(
  () => auth().then((m) => m.loginRoute),
)
const verifyEmailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/verify-email',
  validateSearch: z.object({ token: z.string().optional() }),
  pendingComponent: AuthLoading,
}).lazy(() => auth().then((m) => m.verifyEmailRoute))
const forgotPasswordRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/forgot-password',
  pendingComponent: AuthLoading,
}).lazy(() => auth().then((m) => m.forgotPasswordRoute))
const resetPasswordRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/reset-password',
  validateSearch: z.object({ token: z.string().optional() }),
  pendingComponent: AuthLoading,
}).lazy(() => auth().then((m) => m.resetPasswordRoute))

const app = () => import('./routes/app')
const settingsRoute = createRoute({ getParentRoute: () => rootRoute, path: '/settings' }).lazy(() =>
  app().then((m) => m.settingsRoute),
)
const notesRoute = createRoute({ getParentRoute: () => rootRoute, path: '/notes' }).lazy(() =>
  app().then((m) => m.notesRoute),
)
const notesIndexRoute = createRoute({ getParentRoute: () => notesRoute, path: '/' }).lazy(() =>
  app().then((m) => m.notesIndexRoute),
)
const importRoute = createRoute({
  getParentRoute: () => notesRoute,
  path: '/import',
  // The Folder to file the imported Note in, e.g. from a Folder's "Import here…".
  validateSearch: z.object({ folder: z.number().int().positive().optional().catch(undefined) }),
}).lazy(() => app().then((m) => m.importRoute))
const noteRoute = createRoute({
  getParentRoute: () => notesRoute,
  path: '/$noteId',
  // The Move to open at, e.g. where a Backlink's Comment or Body is.
  validateSearch: z.object({ move: z.number().int().positive().optional().catch(undefined) }),
}).lazy(() => app().then((m) => m.noteRoute))
// Edit position: a new Position for the Note, which resets it (#108).
const notePositionRoute = createRoute({ getParentRoute: () => notesRoute, path: '/$noteId/position' }).lazy(() =>
  app().then((m) => m.notePositionRoute),
)

const tryRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/try',
  // The Guest's Note is open in Edit position, so Back cancels it (#108).
  validateSearch: z.object({ edit: z.literal('position').optional().catch(undefined) }),
}).lazy(() =>
  import('./routes/guest').then((m) => m.tryRoute),
)

// Dev-only: pages showing the theme's components, the shared overlays and the
// board, so a change is easy to screenshot. Not reachable, or bundled, in
// production (web/AGENTS.md). `npm run shots` builds in the "shots" mode to
// keep them.
const devRoutes = import.meta.env.DEV || import.meta.env.MODE === 'shots'
  ? [
      createRoute({ getParentRoute: () => rootRoute, path: '/dev/theme' }).lazy(() =>
        import('./routes/dev').then((m) => m.devThemeRoute),
      ),
      createRoute({ getParentRoute: () => rootRoute, path: '/dev/overlays' }).lazy(() =>
        import('./routes/dev').then((m) => m.devOverlaysRoute),
      ),
      createRoute({
        getParentRoute: () => rootRoute,
        path: '/dev/board',
        validateSearch: z.object({
          mode: z.enum(['view', 'play', 'setup']).catch('view'),
          fen: z.string().optional().catch(undefined),
        }),
      }).lazy(() => import('./routes/dev').then((m) => m.devBoardRoute)),
    ]
  : []

export const router = createRouter({
  routeTree: rootRoute.addChildren([homeRoute, signUpRoute, loginRoute, verifyEmailRoute, forgotPasswordRoute, resetPasswordRoute, settingsRoute, tryRoute, notesRoute.addChildren([notesIndexRoute, importRoute, noteRoute, notePositionRoute]), ...devRoutes]),
  // While a page's chunk loads, its loading state shows straight away (and
  // for no longer than the chunk takes), never an empty page body. Hovering
  // or focusing a link starts loading its chunk, so moving to another group
  // of pages rarely waits at all.
  defaultPendingComponent: PageLoading,
  defaultPendingMs: 0,
  defaultPendingMinMs: 0,
  defaultPreload: 'intent',
})

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
