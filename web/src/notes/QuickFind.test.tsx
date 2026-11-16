import { MantineProvider } from '@mantine/core'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
  useParams,
} from '@tanstack/react-router'
import { screen, waitFor, render } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { NoteSearchResult } from '../api'
import { ApiError } from '../api'
import type { Session } from '../session'
import { SessionProvider } from '../session'
import { theme } from '../theme'
import { QuickFind } from './QuickFind'

const searchNotes = vi.fn<(token: string, query: string) => Promise<NoteSearchResult[]>>()
vi.mock('../apiClient', () => ({ api: { searchNotes: (token: string, query: string) => searchNotes(token, query) } }))

const lovelace: NoteSearchResult = { id: 1, name: 'Lovelace v. Hopper', white: 'Lovelace, Ada', black: 'Hopper, Grace', date: '1952.03.01', folderPath: [] }
const babbage: NoteSearchResult = { id: 2, name: 'Club night', white: 'Babbage, Charles', black: 'Lovelace, Ada', date: null, folderPath: [] }

const signedIn = { status: 'authenticated', user: { id: 1, email: 'ada@example.com', name: 'Ada' } } as const
const session: Session = {
  getState: () => signedIn,
  subscribe: () => () => {},
  restore: async () => {},
  signIn: async () => ({ id: 1, email: 'ada@example.com', name: 'Ada' }),
  signOut: async () => {},
  forget: () => {},
  authorized: (call) => call('token'),
}

function NoteRoute() {
  const { noteId } = useParams({ strict: false })
  return <p>Opened note {noteId}</p>
}

function renderQuickFind() {
  const root = createRootRoute({
    component: () => (
      <>
        <QuickFind />
        <Outlet />
      </>
    ),
  })
  const note = createRoute({ getParentRoute: () => root, path: '/notes/$noteId', component: NoteRoute })
  const home = createRoute({ getParentRoute: () => root, path: '/', component: () => null })
  const router = createRouter({ routeTree: root.addChildren([home, note]), history: createMemoryHistory() })
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <MantineProvider theme={theme} env="test">
      <QueryClientProvider client={queryClient}>
        <SessionProvider session={session}>
          <RouterProvider router={router} />
        </SessionProvider>
      </QueryClientProvider>
    </MantineProvider>,
  )
}

async function openAndType(text: string) {
  const user = userEvent.setup()
  renderQuickFind()
  await user.click(await screen.findByRole('button', { name: 'Find a note' }))
  const input = await screen.findByRole('combobox', { name: 'Find a note' })
  await waitFor(() => expect(input).toHaveFocus())
  await user.type(input, text)
  return { user, input }
}

describe('QuickFind', () => {
  beforeEach(() => {
    searchNotes.mockReset()
  })

  it('shows ranked results with the players and date, and opens the chosen one with the keyboard', async () => {
    searchNotes.mockResolvedValue([lovelace, babbage])
    const { user } = await openAndType('lovelace')

    const options = await screen.findAllByRole('option')
    expect(searchNotes).toHaveBeenLastCalledWith('token', 'lovelace')
    expect(options.map((o) => o.textContent)).toEqual([
      'Lovelace v. HopperLovelace, Ada v. Hopper, Grace · 1952.03.01',
      'Club nightBabbage, Charles v. Lovelace, Ada',
    ])
    expect(options[0]).toHaveAttribute('aria-selected', 'true')

    await user.keyboard('{ArrowDown}{Enter}')

    expect(await screen.findByText('Opened note 2')).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('opens a result on click', async () => {
    searchNotes.mockResolvedValue([lovelace])
    const { user } = await openAndType('hopper')

    await user.click(await screen.findByRole('option', { name: /Lovelace v\. Hopper/ }))

    expect(await screen.findByText('Opened note 1')).toBeInTheDocument()
  })

  it('marks the matched characters', async () => {
    searchNotes.mockResolvedValue([lovelace])
    await openAndType('hopper')

    const option = await screen.findByRole('option')
    expect([...option.querySelectorAll('mark')].map((m) => m.textContent)).toEqual(['Hopper'])
  })

  it('says when nothing matches', async () => {
    searchNotes.mockResolvedValue([])
    await openAndType('zz')

    expect(await screen.findByText('No notes match “zz”.')).toBeInTheDocument()
  })

  it('shows an error and tries again', async () => {
    searchNotes.mockRejectedValueOnce(new ApiError('Could not search notes', 500)).mockResolvedValue([lovelace])
    const { user } = await openAndType('hopper')

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not search notes')
    await user.click(screen.getByRole('button', { name: 'Try again' }))

    expect(await screen.findByRole('option')).toBeInTheDocument()
  })

  it('opens on Ctrl+K', async () => {
    const user = userEvent.setup()
    renderQuickFind()
    await screen.findByRole('button', { name: 'Find a note' })

    await user.keyboard('{Control>}k{/Control}')

    expect(await screen.findByRole('dialog', { name: 'Find a note' })).toBeInTheDocument()
  })
})
