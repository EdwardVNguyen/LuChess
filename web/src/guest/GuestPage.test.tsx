import { MantineProvider } from '@mantine/core'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMemoryHistory, createRootRoute, createRoute, createRouter, Outlet, RouterProvider } from '@tanstack/react-router'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Session, SessionState } from '../session'
import { SessionProvider } from '../session'
import { theme } from '../theme'
import { GuestPage } from './GuestPage'

// Every API call goes through apiClient; any call at all fails the test.
const apiCalls: string[] = []
vi.mock('../apiClient', () => ({
  api: new Proxy({}, { get: (_target, name) => (...args: unknown[]) => { apiCalls.push(String(name)); return Promise.reject(new Error(`unexpected api.${String(name)}(${args.length})`)) } }),
}))

const fetchSpy = vi.fn(() => Promise.reject(new Error('unexpected fetch')))

beforeEach(() => {
  apiCalls.length = 0
  fetchSpy.mockClear()
  vi.stubGlobal('fetch', fetchSpy)
  // react-chessboard measures a square to animate a move; jsdom has no layout.
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 40, 40))
})

afterEach(() => {
  vi.unstubAllGlobals()
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
    authorized: () => Promise.reject(new Error('a Guest has no Session')),
  }
}

function renderGuestPage(state: SessionState = { status: 'guest' }) {
  const root = createRootRoute({ component: Outlet })
  const page = (text: string) => () => <p>{text}</p>
  const router = createRouter({
    routeTree: root.addChildren([
      createRoute({ getParentRoute: () => root, path: '/try', component: GuestPage }),
      createRoute({ getParentRoute: () => root, path: '/signup', component: page('Sign-up page') }),
      createRoute({ getParentRoute: () => root, path: '/login', component: page('Log-in page') }),
      createRoute({ getParentRoute: () => root, path: '/notes/new', component: page('New note page') }),
    ]),
    history: createMemoryHistory({ initialEntries: ['/try'] }),
  })
  render(
    <MantineProvider theme={theme}>
      <QueryClientProvider client={new QueryClient()}>
        <SessionProvider session={sessionIn(state)}>
          <RouterProvider router={router} />
        </SessionProvider>
      </QueryClientProvider>
    </MantineProvider>,
  )
  return router
}

async function startFromPgn(pgn: string, name: string) {
  await userEvent.type(await screen.findByRole('textbox', { name: 'PGN' }), pgn)
  await userEvent.type(screen.getByRole('textbox', { name: 'Name' }), name)
  await userEvent.click(screen.getByRole('button', { name: 'Start writing' }))
}

describe('GuestPage', () => {
  it('lets a Guest write Glyphs, Comments and Bodies without calling the API', async () => {
    renderGuestPage()
    expect(await screen.findByText(/You are writing as a guest/)).toBeInTheDocument()

    await startFromPgn('1. e4 e5 2. Nf3 *', 'Open games')
    expect(screen.getByRole('heading', { name: 'Open games' })).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'e5' }))
    await userEvent.click(within(screen.getByRole('group', { name: 'Move Glyph' })).getByRole('button', { name: 'Good move' }))
    await userEvent.type(screen.getByRole('textbox', { name: 'Comment on 1…e5' }), 'The classical reply.')
    await userEvent.type(screen.getByRole('textbox', { name: 'Body after 1…e5' }), 'Now the knight comes out.')
    await userEvent.tab()

    expect(screen.getByRole('button', { name: 'e5!' })).toBeInTheDocument()
    expect(screen.getByText('The classical reply.', { selector: 'span' })).toBeInTheDocument()
    expect(screen.getByText('Now the knight comes out.', { selector: 'p' })).toBeInTheDocument()

    expect(apiCalls).toEqual([])
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('studies a set-up Position with no moves', async () => {
    renderGuestPage()
    await userEvent.click(await screen.findByText('Set up a position'))
    await userEvent.type(screen.getByRole('textbox', { name: 'Name' }), 'A position')
    await userEvent.click(screen.getByRole('button', { name: 'Start writing' }))

    expect(screen.getByText('No moves yet. This note studies the position alone.')).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Body opening the note' })).toBeInTheDocument()
  })

  it('asks the Guest to sign up or log in when they try to save', async () => {
    const router = renderGuestPage()
    await startFromPgn('1. d4 *', 'Queen pawn')

    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    const dialog = await screen.findByRole('dialog', { name: 'Sign up to save' })
    expect(within(dialog).getByRole('link', { name: 'Log in' })).toHaveAttribute('href', '/login')

    await userEvent.click(within(dialog).getByRole('button', { name: 'Sign up' }))
    expect(await screen.findByText('Sign-up page')).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/signup')
    expect(apiCalls).toEqual([])
  })

  it('confirms before starting over when something is written', async () => {
    renderGuestPage()
    await startFromPgn('1. c4 *', 'English')
    await userEvent.type(screen.getByRole('textbox', { name: 'Comment on 1.c4' }), 'Flexible.')
    await userEvent.tab()

    await userEvent.click(screen.getByRole('button', { name: 'Note actions' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Start over' }))
    const dialog = await screen.findByRole('dialog', { name: 'Start over' })
    await userEvent.click(within(dialog).getByRole('button', { name: 'Start over' }))

    expect(await screen.findByRole('button', { name: 'Start writing' })).toBeInTheDocument()
  })

  it('sends someone logged in to the New note page', async () => {
    renderGuestPage({ status: 'authenticated', user: { id: 1, email: 'ada@example.com', name: 'Ada' } })
    expect(await screen.findByText('New note page')).toBeInTheDocument()
  })

  it('shows the editor, the current FEN and the PGN under the board, to copy', async () => {
    const user = userEvent.setup()
    renderGuestPage()
    await startFromPgn('1. e4 e5 *', 'Open games')

    const tools = await screen.findByRole('region', { name: 'Tools' })
    expect(within(tools).getByRole('region', { name: 'Writing on 1…e5' })).toBeInTheDocument()
    const fen = within(tools).getByRole('textbox', { name: 'FEN' })
    expect(fen).toHaveValue('rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2')
    expect(fen).toHaveAttribute('readonly')
    expect(within(tools).getByRole('textbox', { name: 'PGN' })).toHaveValue('1. e4 e5 *')

    // The FEN follows the Ply the board is on.
    await user.click(screen.getByRole('button', { name: 'First move' }))
    expect(fen).toHaveValue('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1')
    expect(within(tools).getByRole('region', { name: 'Writing on the position' })).toBeInTheDocument()

    await user.click(within(tools).getByRole('button', { name: 'Copy FEN' }))
    expect(await navigator.clipboard.readText()).toBe('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1')
    await user.click(within(tools).getByRole('button', { name: 'Copy PGN' }))
    expect(await navigator.clipboard.readText()).toBe('1. e4 e5 *')
  })
})
