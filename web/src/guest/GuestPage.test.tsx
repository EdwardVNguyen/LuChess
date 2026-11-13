import { MantineProvider } from '@mantine/core'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMemoryHistory, createRootRoute, createRoute, createRouter, Outlet, RouterProvider } from '@tanstack/react-router'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
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
      createRoute({ getParentRoute: () => root, path: '/notes', component: page('Notes page') }),
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

function square(name: string): HTMLElement {
  const element = document.querySelector<HTMLElement>(`[id$="-square-${name}"]`)
  if (!element) throw new Error(`no square ${name}`)
  return element
}

async function openImport() {
  await userEvent.click(await screen.findByRole('button', { name: 'Note actions' }))
  await userEvent.click(await screen.findByRole('menuitem', { name: 'Import…' }))
}

async function startFromPgn(pgn: string, name: string) {
  await openImport()
  await userEvent.type(await screen.findByRole('textbox', { name: 'PGN' }), pgn)
  await userEvent.type(screen.getByRole('textbox', { name: 'Name' }), name)
  await userEvent.click(screen.getByRole('button', { name: 'Start writing' }))
}

describe('GuestPage', () => {
  it('starts a Guest on a blank board at the standard start, and plays on it', async () => {
    renderGuestPage()

    expect(await screen.findByRole('heading', { name: 'Untitled' })).toBeInTheDocument()
    expect(screen.getByText('No moves yet. This note studies the position alone.')).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'FEN' })).toHaveValue('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1')

    await userEvent.click(square('e2'))
    await userEvent.click(square('e4'))
    expect(screen.getByRole('button', { name: 'e4' })).toHaveAttribute('aria-current', 'step')
    expect(apiCalls).toEqual([])
  })

  it('imports a Position from FEN in place of the blank board', async () => {
    renderGuestPage()
    await openImport()
    await userEvent.click(screen.getByRole('radio', { name: 'FEN' }))
    await userEvent.click(screen.getByRole('textbox', { name: 'FEN' }))
    await userEvent.paste('8/8/8/4k3/8/8/4P3/4K3 w - - 0 1')
    await userEvent.type(screen.getByRole('textbox', { name: 'Name' }), 'King and pawn')
    await userEvent.click(screen.getByRole('button', { name: 'Start writing' }))

    expect(await screen.findByRole('heading', { name: 'King and pawn' })).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'Tools' })).getByRole('textbox', { name: 'FEN' })).toHaveValue(
      '8/8/8/4k3/8/8/4P3/4K3 w - - 0 1',
    )
  })

  it('asks before Import… replaces what was played, and Cancel goes back to it', async () => {
    renderGuestPage()
    await screen.findByRole('heading', { name: 'Untitled' })
    await userEvent.click(square('d2'))
    await userEvent.click(square('d4'))

    await openImport()
    const dialog = await screen.findByRole('dialog', { name: 'Import a note' })
    expect(dialog).toHaveTextContent('the moves you have played, will be lost')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Continue' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(await screen.findByRole('button', { name: 'd4' })).toBeInTheDocument()
  })

  // Typed key by key through a menu and two editors: over the default 5 seconds on a busy run.
  it('lets a Guest write Glyphs, Comments and Bodies without calling the API', async () => {
    renderGuestPage()
    expect(await screen.findByText(/You are writing as a guest/)).toBeInTheDocument()

    await startFromPgn('1. e4 e5 2. Nf3 *', 'Open games')
    expect(screen.getByRole('heading', { name: 'Open games' })).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'e5' }))
    await userEvent.click(within(screen.getByRole('group', { name: 'Move Glyph' })).getByRole('button', { name: 'Good move' }))
    fireEvent.contextMenu(screen.getByRole('button', { name: 'e5!' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Add comment' }))
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Comment on 1…e5' })).toHaveFocus())
    await userEvent.keyboard('The classical reply.{Enter}')
    await userEvent.type(screen.getByRole('textbox', { name: 'Body after 1…e5' }), 'Now the knight comes out.')
    await userEvent.tab()

    expect(screen.getByRole('button', { name: 'e5!' })).toBeInTheDocument()
    expect(screen.getByText('The classical reply.', { selector: 'span' })).toBeInTheDocument()
    expect(screen.getByText('Now the knight comes out.', { selector: 'p' })).toBeInTheDocument()

    expect(apiCalls).toEqual([])
    expect(fetchSpy).not.toHaveBeenCalled()
  }, 15_000)

  it('studies a set-up Position with no moves', async () => {
    renderGuestPage()
    await openImport()
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
    await userEvent.type(screen.getByRole('textbox', { name: 'Body after 1.c4' }), 'Flexible.')
    await userEvent.tab()

    await userEvent.click(screen.getByRole('button', { name: 'Note actions' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Start over' }))
    const dialog = await screen.findByRole('dialog', { name: 'Start over' })
    await userEvent.click(within(dialog).getByRole('button', { name: 'Start over' }))

    // Back to a blank board.
    expect(await screen.findByRole('heading', { name: 'Untitled' })).toBeInTheDocument()
    expect(screen.queryByText('Flexible.')).not.toBeInTheDocument()
  })

  it('plays moves on the board in the browser: extending, stepping forward, and Variations', async () => {
    renderGuestPage()
    await startFromPgn('1. e4 e5 *', 'Open games')
    const play = async (from: string, to: string) => {
      await userEvent.click(square(from))
      await userEvent.click(square(to))
    }

    // At the end of the line, a move extends it.
    await play('g1', 'f3')
    expect(screen.getByRole('button', { name: 'Nf3' })).toHaveAttribute('aria-current', 'step')

    // The next Move only steps forward.
    await userEvent.click(screen.getByRole('button', { name: 'e4' }))
    await play('e7', 'e5')
    expect(screen.getByRole('button', { name: 'e5' })).toHaveAttribute('aria-current', 'step')

    // A different move starts a Variation, and playing it again steps into it.
    await userEvent.click(screen.getByRole('button', { name: 'e4' }))
    await play('c7', 'c5')
    expect(screen.getByRole('button', { name: 'c5' })).toHaveAttribute('aria-current', 'step')
    await userEvent.click(screen.getByRole('button', { name: 'e4' }))
    await play('c7', 'c5')
    expect(screen.getAllByRole('button', { name: 'c5' })).toHaveLength(1)
    expect(screen.getByRole('button', { name: 'c5' })).toHaveAttribute('aria-current', 'step')
    expect(screen.getByRole('textbox', { name: 'PGN' })).toHaveValue('1. e4 e5 (1... c5) 2. Nf3 *')

    expect(apiCalls).toEqual([])
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('confirms before starting over when moves were played', async () => {
    renderGuestPage()
    await startFromPgn('1. c4 *', 'English')
    await userEvent.click(square('e7'))
    await userEvent.click(square('e5'))

    await userEvent.click(screen.getByRole('button', { name: 'Note actions' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Start over' }))
    expect(await screen.findByRole('dialog', { name: 'Start over' })).toHaveTextContent('the moves you have played')
  })

  it('promotes and deletes Moves from the move list’s menu in the browser, asking before writing goes', async () => {
    const user = userEvent.setup()
    renderGuestPage()
    await startFromPgn('1. e4 e5 (1... c5 2. Nf3 (2. Nc3 Nc6)) 2. Nf3 *', 'Sicilian')
    const pgn = screen.getByRole('textbox', { name: 'PGN' })

    // Two Variations deep, all the way up.
    fireEvent.contextMenu(screen.getByRole('button', { name: 'Nc6' }))
    await user.click(screen.getByRole('menuitem', { name: 'Promote to main line' }))
    expect(pgn).toHaveValue('1. e4 c5 (1... e5 2. Nf3) 2. Nc3 (2. Nf3) 2... Nc6 *')

    // Writing on what would go asks first.
    fireEvent.contextMenu(screen.getByRole('button', { name: 'Nc3' }))
    await user.click(screen.getByRole('menuitem', { name: 'Add comment' }))
    const comment = screen.getByRole('textbox', { name: 'Comment on 2.Nc3' })
    await waitFor(() => expect(comment).toHaveFocus())
    await user.type(comment, 'Closed.{Enter}')

    fireEvent.contextMenu(screen.getByRole('button', { name: 'Nc3' }))
    await user.click(screen.getByRole('menuitem', { name: 'Delete from here' }))
    const dialog = await screen.findByRole('dialog', { name: 'Delete your writing?' })
    expect(dialog).toHaveTextContent('This will delete 1 Comment: everything written from this move on')
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }))
    expect(pgn).toHaveValue('1. e4 c5 (1... e5 2. Nf3) 2. Nf3 *')
    expect(screen.getByRole('button', { name: 'c5' })).toHaveAttribute('aria-current', 'step')

    // Nothing written: no question.
    fireEvent.contextMenu(screen.getAllByRole('button', { name: 'Nf3' })[0])
    await user.click(screen.getByRole('menuitem', { name: 'Delete from here' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(pgn).toHaveValue('1. e4 c5 (1... e5) 2. Nf3 *')

    expect(apiCalls).toEqual([])
  })

  it('sends someone logged in to their Notes, never making one', async () => {
    renderGuestPage({ status: 'authenticated', user: { id: 1, email: 'ada@example.com', name: 'Ada' } })
    expect(await screen.findByText('Notes page')).toBeInTheDocument()
    expect(apiCalls).toEqual([])
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

  it('gives the Guest’s Note a new Position, asking first, with no API call', async () => {
    const router = renderGuestPage()
    await startFromPgn('1. e4 e5 *', 'Open games')
    await userEvent.type(screen.getByRole('textbox', { name: 'Body after 1…e5' }), 'Symmetry.')
    await userEvent.tab()

    await userEvent.click(screen.getByRole('button', { name: 'Note actions' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Edit position' }))
    expect(await screen.findByRole('heading', { name: 'Edit position' })).toBeInTheDocument()
    expect(router.state.location.search).toEqual({ edit: 'position' })
    expect(screen.getByTestId('setup-fen')).toHaveTextContent('8/8/8/8/8/8/8/8 w - - 0 1')

    await userEvent.click(screen.getByRole('radio', { name: 'White king' }))
    await userEvent.click(square('e1'))
    await userEvent.click(screen.getByRole('radio', { name: 'Black king' }))
    await userEvent.click(square('e8'))
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    const dialog = await screen.findByRole('dialog', { name: "Replace this note's position?" })
    expect(dialog).toHaveTextContent('This deletes its 2 Moves and all its writing. The name stays.')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Replace position' }))

    expect(await screen.findByText('No moves yet. This note studies the position alone.')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Open games' })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'FEN' })).toHaveValue('4k3/8/8/8/8/8/8/4K3 w - - 0 1')
    expect(router.state.location.search).toEqual({})
    expect(apiCalls).toEqual([])
    expect(fetchSpy).not.toHaveBeenCalled()
  }, 15_000)

  it('keeps the Guest’s Note as it was on Cancel, and saves at once when there is nothing to lose', async () => {
    renderGuestPage()
    await userEvent.click(await screen.findByRole('button', { name: 'Note actions' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Edit position' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Cancel' }))
    expect(await screen.findByRole('heading', { name: 'Untitled' })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'FEN' })).toHaveValue('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1')

    await userEvent.click(screen.getByRole('button', { name: 'Note actions' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Edit position' }))
    await userEvent.click(await screen.findByRole('radio', { name: 'White king' }))
    await userEvent.click(square('a1'))
    await userEvent.click(screen.getByRole('radio', { name: 'Black king' }))
    await userEvent.click(square('h8'))
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByRole('heading', { name: 'Untitled' })).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'FEN' })).toHaveValue('7k/8/8/8/8/8/8/K7 w - - 0 1')
  }, 15_000)
})
