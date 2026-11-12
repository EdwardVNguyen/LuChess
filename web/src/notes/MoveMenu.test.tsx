import { MantineProvider } from '@mantine/core'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMemoryHistory, createRootRoute, createRoute, createRouter, RouterProvider } from '@tanstack/react-router'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import type { MoveDeleteResult, MoveRow, Note, NoteLinks } from '../api'
import { importPgn } from '../chess/pgnImport'
import { moveOf, type MoveId } from '../chess/tree'
import { LONG_PRESS_MS } from '../overlay'
import type { Session } from '../session'
import { SessionProvider } from '../session'
import { theme } from '../theme'
import { NoteScreen } from './NoteScreen'

const getNote = vi.fn<(token: string, id: number) => Promise<Note>>()
const getLinks = vi.fn<(token: string, id: number) => Promise<NoteLinks>>()
const promoteMove = vi.fn<(token: string, id: number, moveId: number) => Promise<void>>()
const deleteMove = vi.fn<(token: string, id: number, moveId: number, confirm: boolean) => Promise<MoveDeleteResult>>()
vi.mock('../apiClient', () => ({
  api: {
    getNote: (token: string, id: number) => getNote(token, id),
    listMoves: async () => structuredClone(rows),
    getLinks: (token: string, id: number) => getLinks(token, id),
    promoteMove: (token: string, id: number, moveId: number) => promoteMove(token, id, moveId),
    deleteMove: (token: string, id: number, moveId: number, confirm: boolean) => deleteMove(token, id, moveId, confirm),
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

const note: Note = {
  id: 1,
  name: 'Sicilian',
  tags: [],
  startFen: null,
  folderId: null,
  createdAt: '2026-11-01T12:00:00Z',
  updatedAt: '2026-11-01T12:00:00Z',
}

// The Note's rows as the fake API keeps them, from PGN with its writing:
// the root first, parents before children, siblings in order.
let rows: MoveRow[] = []

function rowsOf(pgn: string): MoveRow[] {
  const imported = importPgn(pgn)
  if (!imported.ok) throw new Error(imported.error)
  const { tree, writing } = imported.value
  const out: MoveRow[] = []
  const stack: MoveId[] = [tree.root]
  while (stack.length > 0) {
    const move = moveOf(tree, stack.pop() as MoveId)
    const w = writing.get(move.id)
    out.push({
      id: move.id,
      parentId: move.parent,
      san: move.san,
      comment: w?.comment ?? null,
      body: w?.body ?? null,
      moveGlyph: w?.moveGlyph ?? null,
      positionGlyph: w?.positionGlyph ?? null,
      drawings: w?.drawings ?? [],
      updatedAt: '',
    })
    stack.push(...[...move.children].reverse())
  }
  return out
}

const idOf = (san: string) => {
  const found = rows.filter((row) => row.san === san)
  if (found.length !== 1) throw new Error(`${found.length} moves are ${san}`)
  return found[0].id
}

function renderNote() {
  const root = createRootRoute()
  const route = createRoute({
    getParentRoute: () => root,
    path: '/notes/$noteId',
    validateSearch: z.object({ move: z.number().optional() }),
    component: NoteScreen,
  })
  const router = createRouter({
    routeTree: root.addChildren([route]),
    history: createMemoryHistory({ initialEntries: ['/notes/1'] }),
  })
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <MantineProvider theme={theme}>
      <QueryClientProvider client={queryClient}>
        <SessionProvider session={session}>
          <RouterProvider router={router} />
        </SessionProvider>
      </QueryClientProvider>
    </MantineProvider>,
  )
}

const move = (name: string) => screen.getByRole('button', { name })
const menuItems = () => screen.getAllByRole('menuitem').map((item) => item.textContent)
// The PGN under the board, on one line.
const pgn = () => (screen.getByRole('textbox', { name: 'PGN' }) as HTMLTextAreaElement).value.replace(/\s+/g, ' ')

beforeEach(() => {
  // react-chessboard measures a square to animate a move; jsdom lays nothing out.
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 40, 40))
  rows = rowsOf('1. e4 e5 2. Nf3 Nc6 *')
  getNote.mockReset().mockResolvedValue(note)
  getLinks.mockReset().mockResolvedValue({ targets: [], backlinks: [] })
  // As the API does (ADR 0009): the Move and each of its ancestors goes first among its siblings.
  promoteMove.mockReset().mockImplementation(async (_t, _id, moveId) => {
    for (let at = rows.find((row) => row.id === moveId); at && at.parentId !== null; ) {
      const row = at
      const first = rows.findIndex((other) => other.parentId === row.parentId)
      rows = [...rows.slice(0, first), row, ...rows.slice(first).filter((other) => other !== row)]
      at = rows.find((other) => other.id === row.parentId)
    }
  })
  deleteMove.mockReset().mockImplementation(async (_t, _id, moveId) => {
    const gone = new Set([moveId])
    for (const row of rows) if (row.parentId !== null && gone.has(row.parentId)) gone.add(row.id)
    rows = rows.filter((row) => !gone.has(row.id))
    return { status: 'deleted' }
  })
})

describe('The right-click menu on a Move', () => {
  it('offers Add comment, Promote to main line and Delete from here, instead of the browser’s menu', async () => {
    rows = rowsOf('1. e4 e5 (1... c5) 2. Nf3 *')
    renderNote()

    expect(fireEvent.contextMenu(await screen.findByRole('button', { name: 'c5' }))).toBe(false)
    expect(menuItems()).toEqual(['Add comment', 'Promote to main line', 'Delete from here'])
    expect(screen.getByRole('menuitem', { name: 'Promote to main line' })).toBeEnabled()
  })

  it('can’t promote a Move already on the Main line', async () => {
    rows = rowsOf('1. e4 e5 (1... c5) 2. Nf3 *')
    renderNote()

    fireEvent.contextMenu(await screen.findByRole('button', { name: 'Nf3' }))
    expect(screen.getByRole('menuitem', { name: 'Promote to main line' })).toBeDisabled()
  })

  it('Add comment goes to the Move and focuses its Comment', async () => {
    const user = userEvent.setup()
    renderNote()
    await waitFor(() => expect(move('Nc6')).toHaveAttribute('aria-current', 'step'))

    fireEvent.contextMenu(move('e5'))
    await user.click(screen.getByRole('menuitem', { name: 'Add comment' }))

    expect(move('e5')).toHaveAttribute('aria-current', 'step')
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Comment on 1…e5' })).toHaveFocus())
  })

  it('Add comment on the current Move focuses its Comment too', async () => {
    const user = userEvent.setup()
    renderNote()
    await waitFor(() => expect(move('Nc6')).toHaveAttribute('aria-current', 'step'))

    fireEvent.contextMenu(move('Nc6'))
    await user.click(screen.getByRole('menuitem', { name: 'Add comment' }))

    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Comment on 2…Nc6' })).toHaveFocus())
  })

  it('promotes a Move two Variations deep all the way to the Main line, its writing staying on its Moves', async () => {
    rows = rowsOf('1. e4 e5 {Symmetry.} (1... c5 {Sharp.} 2. Nf3 (2. Nc3 Nc6 {Closed.} 3. f4) 2... d6) 2. Nf3 Nf6 *')
    const nc6 = idOf('Nc6')
    const user = userEvent.setup()
    renderNote()

    fireEvent.contextMenu(await screen.findByRole('button', { name: 'Nc6' }))
    await user.click(screen.getByRole('menuitem', { name: 'Promote to main line' }))

    expect(promoteMove).toHaveBeenCalledWith('token', 1, nc6)
    await waitFor(() =>
      expect(pgn()).toBe(
        '1. e4 c5 {Sharp.} (1... e5 {Symmetry.} 2. Nf3 Nf6) 2. Nc3 (2. Nf3 d6) 2... Nc6 {Closed.} 3. f4 *',
      ),
    )
    // The move list leads with the new Main line.
    expect(document.querySelector('p')?.textContent).toBe('1.e4c5Sharp.')
  })

  it('deletes a Move and everything after it straight away when no writing goes, and steps back', async () => {
    rows = rowsOf('1. e4 e5 (1... c5 2. Nf3) 2. Nf3 Nc6 *')
    const nf3 = rows.filter((row) => row.san === 'Nf3' && row.parentId === idOf('e5'))[0].id
    const user = userEvent.setup()
    renderNote()
    // The board opens at the end of the Main line, on 2…Nc6, inside what goes.
    await waitFor(() => expect(move('Nc6')).toHaveAttribute('aria-current', 'step'))

    fireEvent.contextMenu(screen.getAllByRole('button', { name: 'Nf3' })[1])
    await user.click(screen.getByRole('menuitem', { name: 'Delete from here' }))

    await waitFor(() => expect(screen.queryByRole('button', { name: 'Nc6' })).not.toBeInTheDocument())
    expect(deleteMove).toHaveBeenCalledWith('token', 1, nf3, false)
    expect(move('e5')).toHaveAttribute('aria-current', 'step')
    expect(pgn()).toBe('1. e4 e5 (1... c5 2. Nf3) *')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('stays on the current Move when it isn’t in what goes', async () => {
    rows = rowsOf('1. e4 e5 (1... c5 2. Nf3) 2. Nf3 Nc6 *')
    const user = userEvent.setup()
    renderNote()
    await waitFor(() => expect(move('Nc6')).toHaveAttribute('aria-current', 'step'))

    fireEvent.contextMenu(move('c5'))
    await user.click(screen.getByRole('menuitem', { name: 'Delete from here' }))

    await waitFor(() => expect(screen.queryByRole('button', { name: 'c5' })).not.toBeInTheDocument())
    expect(move('Nc6')).toHaveAttribute('aria-current', 'step')
  })

  it('asks before deleting writing, with what would go, and sends the confirmation', async () => {
    rows = rowsOf('1. e4 {Best by test.} e5 (1... c5 {Sharp.} 2. Nf3 $1) 2. Nf3 *')
    const c5 = idOf('c5')
    deleteMove.mockResolvedValueOnce({
      status: 'needsConfirmation',
      message: 'This will delete 1 Comment and 1 Glyph',
      comments: 1,
      bodies: 0,
      glyphs: 1,
      drawings: 0,
    })
    const user = userEvent.setup()
    renderNote()
    expect(await screen.findByText('Sharp.')).toBeInTheDocument()

    fireEvent.contextMenu(move('c5'))
    await user.click(screen.getByRole('menuitem', { name: 'Delete from here' }))

    const dialog = await screen.findByRole('dialog', { name: 'Delete your writing?' })
    expect(dialog).toHaveTextContent('This will delete 1 Comment and 1 Glyph: everything written from this move on')
    expect(deleteMove).toHaveBeenLastCalledWith('token', 1, c5, false)

    await user.click(within(dialog).getByRole('button', { name: 'Delete' }))
    await waitFor(() => expect(deleteMove).toHaveBeenLastCalledWith('token', 1, c5, true))
    await waitFor(() => expect(screen.queryByText('Sharp.')).not.toBeInTheDocument())
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(pgn()).toBe('1. e4 {Best by test.} 1... e5 2. Nf3 *')
  })

  it('keeps the Move when the confirmation is cancelled', async () => {
    rows = rowsOf('1. e4 e5 2. Nf3 Nc6 {Defends.} *')
    deleteMove.mockResolvedValue({
      status: 'needsConfirmation',
      message: 'This will delete 1 Comment',
      comments: 1,
      bodies: 0,
      glyphs: 0,
      drawings: 0,
    })
    const user = userEvent.setup()
    renderNote()

    fireEvent.contextMenu(await screen.findByRole('button', { name: 'Nf3' }))
    await user.click(screen.getByRole('menuitem', { name: 'Delete from here' }))
    const dialog = await screen.findByRole('dialog', { name: 'Delete your writing?' })
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(deleteMove).toHaveBeenCalledTimes(1)
    expect(move('Nc6')).toHaveAttribute('aria-current', 'step')
    expect(pgn()).toBe('1. e4 e5 2. Nf3 Nc6 {Defends.} *')
  })

  it('shows why a delete or a promote failed', async () => {
    rows = rowsOf('1. e4 e5 (1... c5) 2. Nf3 *')
    deleteMove.mockRejectedValue(new Error('Could not delete the move'))
    promoteMove.mockRejectedValue(new Error('Could not promote the move'))
    const user = userEvent.setup()
    renderNote()

    fireEvent.contextMenu(await screen.findByRole('button', { name: 'Nf3' }))
    await user.click(screen.getByRole('menuitem', { name: 'Delete from here' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not delete the move')
    expect(move('Nf3')).toBeInTheDocument()

    fireEvent.contextMenu(move('c5'))
    await user.click(screen.getByRole('menuitem', { name: 'Promote to main line' }))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Could not promote the move'))
    expect(pgn()).toBe('1. e4 e5 (1... c5) 2. Nf3 *')
  })

  it('opens from the keyboard on a focused Move: Shift+F10 or the menu key', async () => {
    const user = userEvent.setup()
    renderNote()
    await waitFor(() => expect(move('Nc6')).toHaveAttribute('aria-current', 'step'))

    // jsdom has no keyboard-made contextmenu event, so these are the keys themselves.
    move('e5').focus()
    expect(fireEvent.keyDown(move('e5'), { key: 'F10', shiftKey: true })).toBe(false)
    expect(menuItems()).toEqual(['Add comment', 'Promote to main line', 'Delete from here'])
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('menuitem')).not.toBeInTheDocument())

    move('e4').focus()
    expect(fireEvent.keyDown(move('e4'), { key: 'ContextMenu' })).toBe(false)
    await user.click(screen.getByRole('menuitem', { name: 'Add comment' }))
    expect(move('e4')).toHaveAttribute('aria-current', 'step')
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Comment on 1.e4' })).toHaveFocus())
  })

  it('opens on a long-press, and the lifted finger doesn’t also go to the Move', async () => {
    renderNote()
    await waitFor(() => expect(move('Nc6')).toHaveAttribute('aria-current', 'step'))
    const e5 = move('e5')
    vi.useFakeTimers()
    try {
      fireEvent.touchStart(e5, { touches: [{ clientX: 40, clientY: 40 }] })
      vi.advanceTimersByTime(LONG_PRESS_MS)
      expect(fireEvent.touchEnd(e5)).toBe(false)
    } finally {
      vi.useRealTimers()
    }
    expect(await screen.findByRole('menuitem', { name: 'Delete from here' })).toBeInTheDocument()
    expect(move('Nc6')).toHaveAttribute('aria-current', 'step')
  })
})
