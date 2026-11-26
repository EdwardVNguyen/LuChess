import { MantineProvider } from '@mantine/core'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMemoryHistory, createRootRoute, createRoute, createRouter, RouterProvider } from '@tanstack/react-router'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Layout } from './Layout'
import { ErrorPage, NotFoundPage } from './PageMessage'
import type { Session, SessionState } from './session'
import { SessionProvider } from './session'
import { theme } from './theme'

afterEach(() => {
  vi.restoreAllMocks()
})

function sessionIn(state: SessionState): Session {
  return {
    getState: () => state,
    subscribe: () => () => {},
    restore: async () => {},
    signIn: async () => ({ id: 1, email: 'ada@example.com', name: 'Ada' }),
    signOut: async () => {},
    forget: () => {},
    authorized: () => Promise.reject(new Error('not used')),
  }
}

const SECRET = 'Thrown with a secret message'

// Whether `/broken` throws while rendering, so a test can let it recover.
let broken = true
function Broken() {
  if (broken) throw new Error(SECRET)
  return <p>/broken page</p>
}

// The fallbacks set on the router as in router.tsx, inside the shell.
function renderAt(state: SessionState, path: string) {
  const root = createRootRoute({ component: Layout })
  const router = createRouter({
    routeTree: root.addChildren([
      createRoute({ getParentRoute: () => root, path: '/', component: () => <p>/ page</p> }),
      createRoute({ getParentRoute: () => root, path: '/notes', component: () => <p>/notes page</p> }),
      createRoute({ getParentRoute: () => root, path: '/broken', component: Broken }),
    ]),
    history: createMemoryHistory({ initialEntries: [path] }),
    defaultNotFoundComponent: NotFoundPage,
    defaultErrorComponent: ErrorPage,
  })
  render(
    <MantineProvider theme={theme} env="test">
      <QueryClientProvider client={new QueryClient()}>
        <SessionProvider session={sessionIn(state)}>
          <RouterProvider router={router} />
        </SessionProvider>
      </QueryClientProvider>
    </MantineProvider>,
  )
}

describe('NotFoundPage', () => {
  it('sends a Guest to the home page, inside the shell', async () => {
    const user = userEvent.setup()
    renderAt({ status: 'guest' }, '/nope')

    expect(await screen.findByRole('heading', { name: 'Page not found' })).toBeInTheDocument()
    expect(screen.getByRole('banner')).toBeInTheDocument()
    expect(screen.queryByText('Not Found')).not.toBeInTheDocument()

    await user.click(screen.getByRole('link', { name: 'Go to the home page' }))

    expect(await screen.findByText('/ page')).toBeInTheDocument()
  })

  it('sends someone logged in back to their notes', async () => {
    const user = userEvent.setup()
    renderAt({ status: 'authenticated', user: { id: 1, email: 'ada@example.com', name: 'Ada' } }, '/note/12')

    await user.click(await screen.findByRole('link', { name: 'Back to your notes' }))

    expect(await screen.findByText('/notes page')).toBeInTheDocument()
  })

  it('sends someone to the home page while the Session is being restored', async () => {
    renderAt({ status: 'restoring' }, '/nope')

    expect(await screen.findByRole('link', { name: 'Go to the home page' })).toHaveAttribute('href', '/')
  })
})

describe('ErrorPage', () => {
  it('logs the error without showing it, and shows the page again on Try again', async () => {
    const user = userEvent.setup()
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    broken = true
    renderAt({ status: 'guest' }, '/broken')

    expect(await screen.findByRole('heading', { name: 'Something went wrong' })).toBeInTheDocument()
    expect(screen.getByRole('banner')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reload the page' })).toBeInTheDocument()
    expect(document.body).not.toHaveTextContent(SECRET)
    expect(consoleError).toHaveBeenCalledWith(expect.objectContaining({ message: SECRET }))

    broken = false
    await user.click(screen.getByRole('button', { name: 'Try again' }))

    expect(await screen.findByText('/broken page')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Something went wrong' })).not.toBeInTheDocument()
  })
})
