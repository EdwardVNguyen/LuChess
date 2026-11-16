import { MantineProvider } from '@mantine/core'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMemoryHistory, createRootRoute, createRoute, createRouter, Outlet, RouterProvider } from '@tanstack/react-router'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { LoginPage } from './LoginPage'
import type { Session, SessionState } from './session'
import { SessionProvider } from './session'
import { theme } from './theme'

const guest: SessionState = { status: 'guest' }

function guestSession(signIn: Session['signIn']): Session {
  return {
    getState: () => guest,
    subscribe: () => () => {},
    restore: async () => {},
    signIn,
    signOut: async () => {},
    forget: () => {},
    authorized: () => Promise.reject(new Error('not used')),
  }
}

function renderLogin(signIn: Session['signIn']) {
  const root = createRootRoute({ component: Outlet })
  const router = createRouter({
    routeTree: root.addChildren([
      createRoute({ getParentRoute: () => root, path: '/login', component: LoginPage }),
      createRoute({ getParentRoute: () => root, path: '/', component: () => <p>/ page</p> }),
      createRoute({ getParentRoute: () => root, path: '/notes', component: () => <p>/notes page</p> }),
    ]),
    history: createMemoryHistory({ initialEntries: ['/login'] }),
  })
  render(
    <MantineProvider theme={theme} env="test">
      <QueryClientProvider client={new QueryClient()}>
        <SessionProvider session={guestSession(signIn)}>
          <RouterProvider router={router} />
        </SessionProvider>
      </QueryClientProvider>
    </MantineProvider>,
  )
}

describe('LoginPage', () => {
  it('goes straight to the notes page after logging in', async () => {
    const user = userEvent.setup()
    const signIn = vi.fn(async () => ({ id: 1, email: 'ada@example.com', name: 'Ada' }))
    renderLogin(signIn)

    await user.type(await screen.findByLabelText('Email'), 'ada@example.com')
    await user.type(screen.getByLabelText('Password'), 'correct horse')
    await user.click(screen.getByRole('button', { name: 'Log in' }))

    expect(await screen.findByText('/notes page')).toBeInTheDocument()
    expect(signIn).toHaveBeenCalledWith({ email: 'ada@example.com', password: 'correct horse' }, expect.anything())
  })
})
