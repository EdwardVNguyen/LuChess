import { MantineProvider } from '@mantine/core'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMemoryHistory, createRootRoute, createRoute, createRouter, RouterProvider } from '@tanstack/react-router'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import type { MoveRow, Note, PositionResetResult } from '../api'
import type { Session } from '../session'
import { SessionProvider } from '../session'
import { theme } from '../theme'
import { EditPositionPage } from './EditPositionPage'
import { NoteScreen } from './NoteScreen'

const resetPosition = vi.fn<(token: string, id: number, startFen: string | null, confirm: boolean) => Promise<PositionResetResult>>()
const listMoves = vi.fn<(token: string, id: number) => Promise<MoveRow[]>>()
vi.mock('../apiClient', () => ({
  api: {
    getNote: async () => note,
    listMoves: (token: string, id: number) => listMoves(token, id),
    getLinks: async () => ({ targets: [], backlinks: [] }),
    resetPosition: (token: string, id: number, startFen: string | null, confirm: boolean) =>
      resetPosition(token, id, startFen, confirm),
    listNotes: async () => [],
    listFolders: async () => [],
  },
}))

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

let note: Note
const KINGS = '4k3/8/8/8/8/8/8/4K3 w - - 0 1'

const row = (id: number, parentId: number | null, san: string | null): MoveRow => ({
  id,
  parentId,
  san,
  comment: null,
  body: null,
  moveGlyph: null,
  positionGlyph: null,
  drawings: [],
  updatedAt: '',
})

function renderAt(path: string) {
  const root = createRootRoute()
  const router = createRouter({
    routeTree: root.addChildren([
      createRoute({
        getParentRoute: () => root,
        path: '/notes/$noteId',
        validateSearch: z.object({ move: z.number().optional() }),
        component: NoteScreen,
      }),
      createRoute({ getParentRoute: () => root, path: '/notes/$noteId/position', component: EditPositionPage }),
    ]),
    history: createMemoryHistory({ initialEntries: [path] }),
  })
  const { container } = render(
    <MantineProvider theme={theme}>
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <SessionProvider session={session}>
          <RouterProvider router={router} />
        </SessionProvider>
      </QueryClientProvider>
    </MantineProvider>,
  )
  return { router, container }
}

function square(container: HTMLElement, name: string): HTMLElement {
  const element = container.querySelector<HTMLElement>(`[id$="-square-${name}"]`)
  if (!element) throw new Error(`no square ${name}`)
  return element
}

async function placeKings(container: HTMLElement) {
  await userEvent.click(await screen.findByRole('radio', { name: 'White king' }))
  await userEvent.click(square(container, 'e1'))
  await userEvent.click(screen.getByRole('radio', { name: 'Black king' }))
  await userEvent.click(square(container, 'e8'))
}

async function openFromTitleMenu() {
  // The Note screen loads its chunks of the board and the move list first; slow on a busy run.
  await userEvent.click(await screen.findByRole('button', { name: 'Note actions' }, { timeout: 5000 }))
  await userEvent.click(await screen.findByRole('menuitem', { name: 'Edit position' }))
  await screen.findByRole('heading', { name: 'Edit position' }, { timeout: 5000 })
}

beforeEach(() => {
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 40, 40))
  note = {
    id: 1,
    name: 'Sicilian',
    tags: [['White', 'Lovelace, Ada']],
    startFen: null,
    folderId: null,
    createdAt: '2026-11-01T12:00:00Z',
    updatedAt: '2026-11-01T12:00:00Z',
  }
  listMoves.mockReset().mockResolvedValue([row(1, null, null), row(2, 1, 'e4'), row(3, 2, 'c5')])
  resetPosition.mockReset()
})

describe('Edit position', { timeout: 15_000 }, () => {
  it('opens from the Note’s title menu on an empty board, saving only a legal position', async () => {
    const { router, container } = renderAt('/notes/1')
    await openFromTitleMenu()

    expect(router.state.location.pathname).toBe('/notes/1/position')
    expect(screen.getByText('Sicilian')).toBeInTheDocument()
    expect(screen.getByTestId('setup-fen')).toHaveTextContent('8/8/8/8/8/8/8/8 w - - 0 1')
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
    expect(screen.getByRole('alert')).toHaveTextContent(/Not a legal position yet/)

    await placeKings(container)
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled()
  })

  it('confirms before resetting a Note with Moves and writing, then returns to it', async () => {
    const { router, container } = renderAt('/notes/1')
    await openFromTitleMenu()
    await placeKings(container)
    resetPosition
      .mockResolvedValueOnce({ status: 'needsConfirmation', moves: 14, comments: 2, bodies: 0, glyphs: 0, drawings: 0 })
      .mockImplementationOnce(async () => {
        note = { ...note, startFen: KINGS, tags: [] }
        listMoves.mockResolvedValue([row(9, null, null)])
        return { status: 'reset', note }
      })

    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    const dialog = await screen.findByRole('dialog', { name: "Replace this note's position?" })
    expect(dialog).toHaveTextContent('This deletes its 14 Moves and all its writing. The name and folder stay.')
    expect(resetPosition).toHaveBeenLastCalledWith('token', 1, KINGS, false)

    await userEvent.click(within(dialog).getByRole('button', { name: 'Replace position' }))

    expect(resetPosition).toHaveBeenLastCalledWith('token', 1, KINGS, true)
    await waitFor(() => expect(router.state.location.pathname).toBe('/notes/1'))
    // The Note opens on its new tree, with no Moves.
    await waitFor(() => expect(screen.queryByRole('button', { name: /e4/ })).not.toBeInTheDocument())
    expect(listMoves).toHaveBeenCalledTimes(2)
  })

  it('resets at once when the Note has nothing to lose', async () => {
    const { router, container } = renderAt('/notes/1/position')
    await placeKings(container)
    resetPosition.mockResolvedValueOnce({ status: 'reset', note: { ...note, startFen: KINGS, tags: [] } })

    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(router.state.location.pathname).toBe('/notes/1'))
    expect(resetPosition).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('keeps the Note as it was when the confirmation is dismissed, and on Cancel', async () => {
    const { router, container } = renderAt('/notes/1')
    await openFromTitleMenu()
    await placeKings(container)
    resetPosition.mockResolvedValueOnce({ status: 'needsConfirmation', moves: 2, comments: 0, bodies: 0, glyphs: 0, drawings: 0 })

    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    const dialog = await screen.findByRole('dialog')
    expect(dialog).toHaveTextContent('This deletes its 2 Moves. The name and folder stay.')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(resetPosition).toHaveBeenCalledTimes(1)

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/notes/1'))
    // Back to the Note's own entry, not a new one on top of the page.
    expect(router.history.canGoBack()).toBe(false)
  })

  it('defaults castling to what the placement allows, and saves the rights left checked', async () => {
    renderAt('/notes/1/position')
    const castling = await screen.findByRole('group', { name: 'Castling' })
    for (const box of within(castling).getAllByRole('checkbox')) {
      expect(box).not.toBeChecked()
      expect(box).toBeDisabled()
    }

    await userEvent.click(screen.getByRole('button', { name: 'Start position' }))
    for (const box of within(castling).getAllByRole('checkbox')) expect(box).toBeChecked()
    await userEvent.click(within(castling).getByRole('checkbox', { name: 'White O-O' }))
    expect(screen.getByTestId('setup-fen')).toHaveTextContent('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w Qkq - 0 1')

    resetPosition.mockResolvedValueOnce({ status: 'reset', note })
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(resetPosition).toHaveBeenLastCalledWith('token', 1, 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w Qkq - 0 1', false)
  })

  it('flips the board', async () => {
    const { container } = renderAt('/notes/1/position')
    await screen.findByRole('heading', { name: 'Edit position' })
    const a8First = () =>
      Boolean(square(container, 'a8').compareDocumentPosition(square(container, 'h1')) & Node.DOCUMENT_POSITION_FOLLOWING)
    expect(a8First()).toBe(true)

    await userEvent.click(screen.getByRole('button', { name: 'Flip board' }))
    expect(a8First()).toBe(false)
  })
})
