import { MantineProvider } from '@mantine/core'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMemoryHistory, createRootRoute, createRoute, createRouter, RouterProvider } from '@tanstack/react-router'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import type { MoveDeleteResult, MoveRow, Note, NoteLinks } from '../api'
import { importPgn } from '../chess/pgnImport'
import { moveOf, type MoveId } from '../chess/tree'
import type { Session } from '../session'
import { SessionProvider } from '../session'
import { theme } from '../theme'
import { NoteScreen } from './NoteScreen'

const getNote = vi.fn<(token: string, id: number) => Promise<Note>>()
const getLinks = vi.fn<(token: string, id: number) => Promise<NoteLinks>>()
const addMove = vi.fn<(token: string, id: number, parentId: number, san: string) => Promise<MoveRow>>()
const deleteMove = vi.fn<(token: string, id: number, moveId: number, confirm: boolean) => Promise<MoveDeleteResult>>()
vi.mock('../apiClient', () => ({
  api: {
    getNote: (token: string, id: number) => getNote(token, id),
    listMoves: async () => structuredClone(rows),
    getLinks: (token: string, id: number) => getLinks(token, id),
    addMove: (token: string, id: number, parentId: number, san: string) => addMove(token, id, parentId, san),
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
  name: 'Italian',
  tags: [['Event', 'Casual']],
  startFen: null,
  folderId: null,
  createdAt: '2026-11-01T12:00:00Z',
  updatedAt: '2026-11-01T12:00:00Z',
}

// The Note's rows as the fake API keeps them, from PGN with its writing.
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

function square(name: string): HTMLElement {
  const element = document.querySelector<HTMLElement>(`[id$="-square-${name}"]`)
  if (!element) throw new Error(`no square ${name}`)
  return element
}

async function startEditing(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('button', { name: 'Note actions' }))
  await user.click(await screen.findByRole('menuitem', { name: 'Edit moves' }))
  return screen.findByRole('region', { name: 'Editing moves' })
}

beforeEach(() => {
  // react-chessboard measures a square to animate a move; jsdom lays nothing out.
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 40, 40))
  rows = rowsOf('1. e4 e5 2. Nf3 Nc6 *')
  getNote.mockReset().mockResolvedValue(note)
  getLinks.mockReset().mockResolvedValue({ targets: [], backlinks: [] })
  addMove.mockReset().mockImplementation(async (_t, _id, parentId, san) => {
    const row: MoveRow = { ...rows[0], id: Math.max(...rows.map((r) => r.id)) + 1, parentId, san }
    rows = [...rows, row]
    return row
  })
  deleteMove.mockReset().mockImplementation(async (_t, _id, moveId) => {
    const gone = new Set([moveId])
    for (const row of rows) if (row.parentId !== null && gone.has(row.parentId)) gone.add(row.id)
    rows = rows.filter((row) => !gone.has(row.id))
    return { status: 'deleted' }
  })
})

describe('Editing moves', () => {
  it('deletes a move straight away when no writing follows it, and steps back', async () => {
    rows = rowsOf('1. e4 {Best by test.} e5 2. Nf3 Nc6 *')
    const user = userEvent.setup()
    renderNote()

    const bar = await startEditing(user)
    // The board opens at the end of the game, on 2…Nc6.
    await user.click(within(bar).getByRole('button', { name: 'Delete 2…Nc6' }))

    await waitFor(() => expect(screen.queryByRole('button', { name: 'Nc6' })).not.toBeInTheDocument())
    expect(deleteMove).toHaveBeenCalledWith('token', 1, idOf('Nf3') + 1, false)
    expect(screen.getByRole('button', { name: 'Nf3' })).toHaveAttribute('aria-current', 'step')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('asks before deleting writing, and sends the confirmation', async () => {
    rows = rowsOf('1. e4 {Best by test.} e5 {Symmetry.} 2. Nf3 $1 Nc6 *')
    const e5 = idOf('e5')
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
    expect(await screen.findByText('Symmetry.')).toBeInTheDocument()

    const bar = await startEditing(user)
    await user.click(screen.getByRole('button', { name: 'e5' }))
    await user.click(within(bar).getByRole('button', { name: 'Delete 1…e5' }))

    const dialog = await screen.findByRole('dialog', { name: 'Delete your writing?' })
    expect(dialog).toHaveTextContent('This will delete 1 Comment and 1 Glyph: everything written from this move on')
    expect(deleteMove).toHaveBeenLastCalledWith('token', 1, e5, false)

    await user.click(within(dialog).getByRole('button', { name: 'Delete' }))
    await waitFor(() => expect(deleteMove).toHaveBeenLastCalledWith('token', 1, e5, true))
    await waitFor(() => expect(screen.queryByText('Symmetry.')).not.toBeInTheDocument())
    expect(screen.getByRole('button', { name: 'e4' })).toHaveAttribute('aria-current', 'step')
    expect(screen.getByRole('textbox', { name: 'Comment on 1.e4' })).toHaveValue('Best by test.')
  })

  it('keeps the move when the confirmation is cancelled', async () => {
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

    const bar = await startEditing(user)
    await user.click(within(bar).getByRole('button', { name: 'Delete 2…Nc6' }))
    const dialog = await screen.findByRole('dialog', { name: 'Delete your writing?' })
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(deleteMove).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: 'Nc6' })).toHaveAttribute('aria-current', 'step')
    expect(within(bar).getByRole('button', { name: 'Delete 2…Nc6' })).toBeEnabled()
  })

  it('starts a Variation with a different move played on the board, and steps onto a move already there', async () => {
    const user = userEvent.setup()
    renderNote()

    await startEditing(user)
    await user.click(screen.getByRole('button', { name: 'e4' }))
    // Playing the move already there only steps forward.
    await user.click(square('e7'))
    await user.click(square('e5'))
    expect(screen.getByRole('button', { name: 'e5' })).toHaveAttribute('aria-current', 'step')
    expect(addMove).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Previous move' }))
    await user.click(square('c7'))
    await user.click(square('c5'))

    await waitFor(() => expect(screen.getByRole('button', { name: 'c5' })).toHaveAttribute('aria-current', 'step'))
    expect(addMove).toHaveBeenCalledWith('token', 1, idOf('e4'), 'c5')
    // The Main line goes on; the new move is a Variation beside 1…e5.
    expect(screen.getByRole('button', { name: 'Nf3' })).toBeInTheDocument()
  })

  it('ends with Done', async () => {
    const user = userEvent.setup()
    renderNote()

    const bar = await startEditing(user)
    await user.click(within(bar).getByRole('button', { name: 'Done' }))
    expect(screen.queryByRole('region', { name: 'Editing moves' })).not.toBeInTheDocument()
  })

  it('shows why a delete failed', async () => {
    deleteMove.mockRejectedValue(new Error('Could not delete the move'))
    const user = userEvent.setup()
    renderNote()

    const bar = await startEditing(user)
    await user.click(within(bar).getByRole('button', { name: 'Delete 2…Nc6' }))

    expect(await within(bar).findByRole('alert')).toHaveTextContent('Could not delete the move')
    expect(screen.getByRole('button', { name: 'Nc6' })).toBeInTheDocument()
  })
})
