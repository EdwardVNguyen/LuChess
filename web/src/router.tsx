import { createRootRoute, createRoute, createRouter } from '@tanstack/react-router'
import { HomePage } from './HomePage'
import { Layout } from './Layout'

const rootRoute = createRootRoute({ component: Layout })
const homeRoute = createRoute({ getParentRoute: () => rootRoute, path: '/', component: HomePage })

export const router = createRouter({ routeTree: rootRoute.addChildren([homeRoute]) })

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
