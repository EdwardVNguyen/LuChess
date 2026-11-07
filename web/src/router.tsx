import { createRootRoute, createRoute, createRouter } from '@tanstack/react-router'
import { z } from 'zod'
import { HomePage } from './HomePage'
import { Layout } from './Layout'
import { LoginPage } from './LoginPage'
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

// Dev-only: a page showing the theme's components, so a token change is easy
// to screenshot. Not reachable, or bundled, in production (web/AGENTS.md).
const devRoutes = import.meta.env.DEV
  ? [createRoute({ getParentRoute: () => rootRoute, path: '/dev/theme', component: DevThemeRoute })]
  : []

export const router = createRouter({
  routeTree: rootRoute.addChildren([homeRoute, signUpRoute, loginRoute, verifyEmailRoute, ...devRoutes]),
})

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
