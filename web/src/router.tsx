import { createRootRoute, createRoute, createRouter } from '@tanstack/react-router'
import { z } from 'zod'
import { DevBoardRoute } from './board/DevBoardRoute'
import { ForgotPasswordPage } from './ForgotPasswordPage'
import { GuestPage } from './guest/GuestPage'
import { HomePage } from './HomePage'
import { Layout } from './Layout'
import { LoginPage } from './LoginPage'
import { NewNotePage } from './notes/NewNotePage'
import { NoteScreen } from './notes/NoteScreen'
import { NotesIndex } from './notes/NotesIndex'
import { NotesLayout } from './notes/NotesLayout'
import { DevOverlaysRoute } from './overlay/DevOverlaysRoute'
import { ResetPasswordPage } from './ResetPasswordPage'
import { SettingsPage } from './settings/SettingsPage'
import { SignUpPage } from './SignUpPage'
import { DevThemeRoute } from './theme/DevThemeRoute'
import { VerifyEmailPage } from './VerifyEmailPage'

const rootRoute = createRootRoute({ component: Layout })
const homeRoute = createRoute({ getParentRoute: () => rootRoute, path: '/', component: HomePage })
const signUpRoute = createRoute({ getParentRoute: () => rootRoute, path: '/signup', component: SignUpPage })
const loginRoute = createRoute({ getParentRoute: () => rootRoute, path: '/login', component: LoginPage })
const verifyEmailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/verify-email',
  validateSearch: z.object({ token: z.string().optional() }),
  component: VerifyEmailPage,
})
const forgotPasswordRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/forgot-password',
  component: ForgotPasswordPage,
})
const resetPasswordRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/reset-password',
  validateSearch: z.object({ token: z.string().optional() }),
  component: ResetPasswordPage,
})
const settingsRoute = createRoute({ getParentRoute: () => rootRoute, path: '/settings', component: SettingsPage })
const tryRoute = createRoute({ getParentRoute: () => rootRoute, path: '/try', component: GuestPage })
const notesRoute = createRoute({ getParentRoute: () => rootRoute, path: '/notes', component: NotesLayout })
const notesIndexRoute = createRoute({ getParentRoute: () => notesRoute, path: '/', component: NotesIndex })
const newNoteRoute = createRoute({
  getParentRoute: () => notesRoute,
  path: '/new',
  // The Folder to file the new Note in, e.g. from a Folder's "New note here".
  validateSearch: z.object({ folder: z.number().int().positive().optional().catch(undefined) }),
  component: NewNotePage,
})
const noteRoute = createRoute({
  getParentRoute: () => notesRoute,
  path: '/$noteId',
  // The Ply to open at, e.g. where a Backlink's Comment or Body is.
  validateSearch: z.object({ ply: z.number().int().min(0).optional().catch(undefined) }),
  component: NoteScreen,
})

// Dev-only: pages showing the theme's components and the shared overlays, so
// a change is easy to screenshot. Not reachable, or bundled, in production
// (web/AGENTS.md).
const devRoutes = import.meta.env.DEV
  ? [
      createRoute({ getParentRoute: () => rootRoute, path: '/dev/theme', component: DevThemeRoute }),
      createRoute({ getParentRoute: () => rootRoute, path: '/dev/overlays', component: DevOverlaysRoute }),
      createRoute({
        getParentRoute: () => rootRoute,
        path: '/dev/board',
        validateSearch: z.object({
          mode: z.enum(['view', 'play', 'setup']).catch('view'),
          fen: z.string().optional().catch(undefined),
        }),
        component: DevBoardRoute,
      }),
    ]
  : []

export const router = createRouter({
  routeTree: rootRoute.addChildren([homeRoute, signUpRoute, loginRoute, verifyEmailRoute, forgotPasswordRoute, resetPasswordRoute, settingsRoute, tryRoute, notesRoute.addChildren([notesIndexRoute, newNoteRoute, noteRoute]), ...devRoutes]),
})

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
