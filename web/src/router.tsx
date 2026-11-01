import { createRootRoute, createRoute, createRouter } from '@tanstack/react-router'
import { z } from 'zod'
import { HomePage } from './HomePage'
import { Layout } from './Layout'
import { SignUpPage } from './SignUpPage'
import { VerifyEmailPage } from './VerifyEmailPage'

const rootRoute = createRootRoute({ component: Layout })
const homeRoute = createRoute({ getParentRoute: () => rootRoute, path: '/', component: HomePage })
const signUpRoute = createRoute({ getParentRoute: () => rootRoute, path: '/signup', component: SignUpPage })
const verifyEmailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/verify-email',
  validateSearch: z.object({ token: z.string().optional() }),
  component: VerifyEmailPage,
})

export const router = createRouter({
  routeTree: rootRoute.addChildren([homeRoute, signUpRoute, verifyEmailRoute]),
})

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
