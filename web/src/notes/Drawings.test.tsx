import { MantineProvider } from '@mantine/core'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMemoryHistory, createRootRoute, createRoute, createRouter, RouterProvider } from '@tanstack/react-router'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import type { MoveRow, Note, NoteLinks, WritingInput } from '../api'
import type { Drawing } from '../chess/pgn'
import { importPgn } from '../chess/pgnImport'
import { moveOf, type MoveId } from '../chess/tree'
import type { Session } from '../session'
import { SessionProvider } from '../session'
import { theme } from '../theme'
import { NoteScreen } from './NoteScreen'
import { boardControl, findMove, move, square } from './testUtils'

// Drawings on a saved Note (#77): drawn on the board, saved on the Move it
// shows through the writing endpoint, and shown again on returning to it.

const getNote = vi.fn<(token: string, id: number) => Promise<Note>>()
const getLinks = vi.fn<(token: string, id: number) => Promise<NoteLinks>>()
const putWriting = vi.fn<(token: string, id: number, moveId: number, writing: WritingInput) => Promise<MoveRow>>()
vi.mock('../apiClient', () => ({
  api: {
    getNote: (token: string, id: number) => getNote(token, id),
    listMoves: async () => structuredClone(rows),
    getLinks: (token: string, id: number) => getLinks(token, id),
    putWriting: (token: string, id: number, moveId: number, writing: WritingInput) => putWriting(token, id, moveId, writing),
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
  tags: [],
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

const idOf = (san: string | null) => {
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
    <MantineProvider theme={theme} env="test">
      <QueryClientProvider client={queryClient}>
        <SessionProvider session={session}>
          <RouterProvider router={router} />
        </SessionProvider>
      </QueryClientProvider>
    </MantineProvider>,
  )
}

/** Right-press on one square and let go on another for an arrow, or on the same one for a circle. */
function draw(from: string, to: string, keys: { shiftKey?: boolean; altKey?: boolean } = {}) {
  fireEvent.mouseDown(square(from), { button: 2, buttons: 2, ...keys })
  if (to !== from) fireEvent.mouseOver(square(to), { button: 2, buttons: 2, ...keys })
  fireEvent.mouseUp(square(to), { button: 2, ...keys })
  fireEvent.contextMenu(square(to), { button: 2, ...keys })
}

/** What the board shows: how many arrows, and the brush of each circled square. */
function onBoard(): { arrows: number; circles: Record<string, string> } {
  const circles: Record<string, string> = {}
  for (const element of document.querySelectorAll<HTMLElement>('[id*="-square-"]')) {
    const style = element.querySelector<HTMLElement>(':scope > div')?.style.backgroundImage ?? ''
    const brush = /var\(--cn-board-brush-(\w+)\)/.exec(style)?.[1]
    if (brush) circles[element.id.replace(/.*-square-/, '')] = brush
  }
  return { arrows: document.querySelectorAll('path[marker-end]').length, circles }
}

function current(name: string) {
  return waitFor(() => expect(move(name)).toHaveAttribute('aria-current', 'step'))
}

beforeEach(() => {
  // react-chessboard measures a square to animate a move; jsdom lays nothing out.
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 40, 40))
  rows = rowsOf('1. e4 {[%cal Gg1f3]} e5 (1... c5 {Sicilian.} 2. Nf3) 2. Nf3 Nc6 *')
  getNote.mockReset().mockResolvedValue(note)
  getLinks.mockReset().mockResolvedValue({ targets: [], backlinks: [] })
  putWriting.mockReset().mockImplementation(async (_t, _id, moveId, writing) => {
    const row = rows.find((r) => r.id === moveId) as MoveRow
    const written: MoveRow = { ...row, ...writing }
    rows = rows.map((r) => (r.id === moveId ? written : r))
    return written
  })
})

describe('Drawings on a Note', () => {
  it('shows the Drawings saved on each Move as the board steps onto it', async () => {
    const user = userEvent.setup()
    renderNote()
    await current('Nc6')
    expect(onBoard()).toEqual({ arrows: 0, circles: {} })

    await user.click(move('e4'))
    expect(onBoard()).toEqual({ arrows: 1, circles: {} })
  })

  it('saves a Drawing on the current Move, keeping its other writing, and shows it again on returning', async () => {
    const user = userEvent.setup()
    renderNote()
    await current('Nc6')

    draw('f1', 'b5')
    draw('e5', 'e5', { shiftKey: true })

    await waitFor(() => expect(putWriting).toHaveBeenCalledTimes(2))
    // The second is drawn before the first is saved, and keeps it.
    expect(putWriting).toHaveBeenLastCalledWith('token', 1, idOf('Nc6'), {
      comment: null,
      body: null,
      moveGlyph: null,
      positionGlyph: null,
      drawings: [
        { from: 'f1', to: 'b5', brush: 'green' },
        { from: 'e5', brush: 'red' },
      ],
    })
    expect(onBoard()).toEqual({ arrows: 1, circles: { e5: 'red' } })

    await user.click(boardControl('Previous move'))
    expect(onBoard()).toEqual({ arrows: 0, circles: {} })
    await user.click(boardControl('Next move'))
    expect(onBoard()).toEqual({ arrows: 1, circles: { e5: 'red' } })
  })

  it('saves Drawings on a Variation Move with its Comment, and removes one drawn again', async () => {
    const user = userEvent.setup()
    renderNote()
    await user.click(await findMove('c5'))

    draw('c5', 'd4', { altKey: true })
    await waitFor(() =>
      expect(putWriting).toHaveBeenLastCalledWith('token', 1, idOf('c5'), expect.objectContaining({
        comment: 'Sicilian.',
        drawings: [{ from: 'c5', to: 'd4', brush: 'blue' }],
      })),
    )

    await user.click(move('e5'))
    await user.click(move('c5'))
    expect(onBoard().arrows).toBe(1)

    draw('c5', 'd4', { altKey: true })
    await waitFor(() =>
      expect(putWriting).toHaveBeenLastCalledWith('token', 1, idOf('c5'), expect.objectContaining({ comment: 'Sicilian.', drawings: [] })),
    )
    expect(onBoard().arrows).toBe(0)
  })

  it('saves Drawings on the Position', async () => {
    const user = userEvent.setup()
    renderNote()
    await current('Nc6')
    await user.click(boardControl('First move'))

    draw('d4', 'd4', { shiftKey: true, altKey: true })

    const yellow: Drawing = { from: 'd4', brush: 'yellow' }
    await waitFor(() =>
      expect(putWriting).toHaveBeenCalledWith('token', 1, idOf(null), expect.objectContaining({ drawings: [yellow] })),
    )
    await user.click(boardControl('Next move'))
    expect(onBoard().circles).toEqual({})
    await user.click(boardControl('Previous move'))
    expect(onBoard().circles).toEqual({ d4: 'yellow' })
  })

  it('shows why Drawings were not saved', async () => {
    putWriting.mockRejectedValue(new Error('Could not save the writing'))
    renderNote()
    await current('Nc6')

    draw('e5', 'e5')

    expect(await screen.findByText('Your writing was not saved')).toBeInTheDocument()
    expect(screen.getByText('Could not save the writing')).toBeInTheDocument()
  })
})
