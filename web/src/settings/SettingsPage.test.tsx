import { MantineProvider } from '@mantine/core'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMemoryHistory, createRootRoute, createRoute, createRouter, Outlet, RouterProvider } from '@tanstack/react-router'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, type User } from '../api'
import { createSession, SessionProvider, type Session } from '../session'
import { theme } from '../theme'
import { SettingsPage } from './SettingsPage'

const deleteAccount = vi.fn<(token: string, password: string) => Promise<void>>()
vi.mock('../apiClient', () => ({
  api: { deleteAccount: (token: string, password: string) => deleteAccount(token, password) },
}))

const ada: User = { id: 1, email: 'ada@example.com', name: 'Ada' }

async function signedInSession(): Promise<Session> {
  const session = createSession({
    transport: {
      login: async () => ({ accessToken: 'token', user: ada }),
      refresh: async () => ({ accessToken: 'token', user: ada }),
      logout: async () => {},
    },
    lock: (fn) => fn(),
  })
  await session.signIn({ email: ada.email, password: 'x' })
  return session
}

function renderSettings(session: Session) {
  const root = createRootRoute({ component: Outlet })
  const settings = createRoute({ getParentRoute: () => root, path: '/settings', component: SettingsPage })
  const home = createRoute({ getParentRoute: () => root, path: '/', component: () => <p>Home page</p> })
  const router = createRouter({
    routeTree: root.addChildren([home, settings]),
    history: createMemoryHistory({ initialEntries: ['/settings'] }),
  })
  render(
    <MantineProvider theme={theme}>
      <QueryClientProvider client={new QueryClient()}>
        <SessionProvider session={session}>
          <RouterProvider router={router} />
        </SessionProvider>
      </QueryClientProvider>
    </MantineProvider>,
  )
}

async function enterPasswordAndConfirm(password: string) {
  const user = userEvent.setup()
  await user.type(await screen.findByLabelText('Your password'), password)
  await user.click(screen.getByRole('button', { name: 'Delete account' }))
  const dialog = await screen.findByRole('dialog', { name: 'Delete your account?' })
  await user.click(within(dialog).getByRole('button', { name: 'Delete account' }))
  return { user, dialog }
}

describe('SettingsPage', () => {
  beforeEach(() => {
    deleteAccount.mockReset()
  })

  it('deletes the account after the password and a confirmation, then ends the Session', async () => {
    deleteAccount.mockResolvedValue(undefined)
    const session = await signedInSession()
    renderSettings(session)

    await enterPasswordAndConfirm('correct horse battery')

    expect(await screen.findByText('Home page')).toBeInTheDocument()
    expect(deleteAccount).toHaveBeenCalledWith('token', 'correct horse battery')
    expect(session.getState()).toEqual({ status: 'guest' })
  })

  it('asks for the password before confirming', async () => {
    const user = userEvent.setup()
    renderSettings(await signedInSession())

    await user.click(await screen.findByRole('button', { name: 'Delete account' }))

    expect(await screen.findByText('Enter your password')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(deleteAccount).not.toHaveBeenCalled()
  })

  it('shows a wrong password on the field and keeps the Session', async () => {
    deleteAccount.mockRejectedValue(new ApiError('That password is not correct', 403))
    const session = await signedInSession()
    renderSettings(session)

    await enterPasswordAndConfirm('not my password')

    expect(await screen.findByText('That password is not correct')).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(session.getState()).toEqual({ status: 'authenticated', user: ada })
  })

  it('keeps the dialog open with the error when the server cannot be reached', async () => {
    deleteAccount.mockRejectedValue(new ApiError('Could not reach the server. Check your connection and try again.', 0))
    const session = await signedInSession()
    renderSettings(session)

    const { dialog } = await enterPasswordAndConfirm('correct horse battery')

    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Could not reach the server')
    expect(session.getState()).toEqual({ status: 'authenticated', user: ada })
  })
})
