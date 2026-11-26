import { MantineProvider } from '@mantine/core'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMemoryHistory, createRootRoute, createRoute, createRouter, RouterProvider } from '@tanstack/react-router'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import type { MoveDeleteResult, MoveRow, Note, NoteLinks, NoteSearchResult, WritingInput } from '../api'
import { importPgn } from '../chess/pgnImport'
import { moveOf, type MoveId } from '../chess/tree'
import { LONG_PRESS_MS } from '../overlay'
import type { Session } from '../session'
import { SessionProvider } from '../session'
import { theme } from '../theme'
import { NoteScreen } from './NoteScreen'
import { leavingAsks } from './testUtils'

const getNote = vi.fn<(token: string, id: number) => Promise<Note>>()
const getLinks = vi.fn<(token: string, id: number) => Promise<NoteLinks>>()
const promoteMove = vi.fn<(token: string, id: number, moveId: number) => Promise<void>>()
const deleteMove = vi.fn<(token: string, id: number, moveId: number, confirm: boolean) => Promise<MoveDeleteResult>>()
const putWriting = vi.fn<(token: string, id: number, moveId: number, writing: WritingInput) => Promise<MoveRow>>()
vi.mock('../apiClient', () => ({
  api: {
    getNote: (token: string, id: number) => getNote(token, id),
    listMoves: async () => structuredClone(rows),
    getLinks: (token: string, id: number) => getLinks(token, id),
    promoteMove: (token: string, id: number, moveId: number) => promoteMove(token, id, moveId),
    deleteMove: (token: string, id: number, moveId: number, confirm: boolean) => deleteMove(token, id, moveId, confirm),
    putWriting: (token: string, id: number, moveId: number, writing: WritingInput) => putWriting(token, id, moveId, writing),
    searchNotes: async (): Promise<NoteSearchResult[]> => [
      { id: 5, name: 'Hanging pawns', white: null, black: null, date: null, folderPath: [] },
    ],
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
    <MantineProvider theme={theme} env="test">
      <QueryClientProvider client={queryClient}>
        <SessionProvider session={session}>
          <RouterProvider router={router} />
        </SessionProvider>
      </QueryClientProvider>
    </MantineProvider>,
  )
}

const move = (name: string) => screen.getByRole('button', { name })
// A right-click as a browser does it: the press takes focus unless the page
// prevents it, then the menu opens. (user-event's right-click also closes it.)
function rightClick(element: HTMLElement) {
  if (fireEvent.mouseDown(element, { button: 2 })) act(() => element.focus())
  fireEvent.contextMenu(element)
}
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
  putWriting.mockReset().mockImplementation(async (_t, _id, moveId, writing) => {
    rows = rows.map((row) => (row.id === moveId ? { ...row, ...writing } : row))
    return structuredClone(rows.find((row) => row.id === moveId) as MoveRow)
  })
})

describe('The right-click menu on a Move', () => {
  it('offers Add comment, Link a note…, Promote to main line and Delete from here, instead of the browser’s menu', async () => {
    rows = rowsOf('1. e4 e5 (1... c5) 2. Nf3 *')
    renderNote()

    expect(fireEvent.contextMenu(await screen.findByRole('button', { name: 'c5' }))).toBe(false)
    expect(menuItems()).toEqual(['Add comment', 'Link a note…', 'Promote to main line', 'Delete from here'])
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
    expect(menuItems()).toEqual(['Add comment', 'Link a note…', 'Promote to main line', 'Delete from here'])
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

describe('Writing a Comment in the move list (#97)', () => {
  const comment = (label: string) => screen.getByRole('textbox', { name: `Comment on ${label}` })
  const savedComment = (san: string) => putWriting.mock.calls.findLast(([, , id]) => id === idOf(san))?.[3].comment

  it('leaves no Comment editor under the board, only the Glyphs and the Body', async () => {
    renderNote()
    await waitFor(() => expect(move('Nc6')).toHaveAttribute('aria-current', 'step'))

    const tools = screen.getByRole('region', { name: 'Tools' })
    expect(within(tools).queryByRole('textbox', { name: /^Comment on/ })).not.toBeInTheDocument()
    expect(within(tools).getByRole('group', { name: 'Move Glyph' })).toBeInTheDocument()
    expect(within(tools).getByRole('textbox', { name: 'Body after 2…Nc6' })).toBeInTheDocument()
  })

  it('opens the editor right after the Move, and Enter saves and closes it', async () => {
    const user = userEvent.setup()
    renderNote()

    fireEvent.contextMenu(await screen.findByRole('button', { name: 'e5' }))
    await user.click(screen.getByRole('menuitem', { name: 'Add comment' }))
    await waitFor(() => expect(comment('1…e5')).toHaveFocus())
    // In the move list, between e5 and Nf3, not under the board.
    expect(within(screen.getByRole('region', { name: 'Tools' })).queryByRole('textbox', { name: /^Comment on/ })).toBeNull()
    expect(move('e5').compareDocumentPosition(comment('1…e5')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(comment('1…e5').compareDocumentPosition(move('Nf3')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()

    await user.type(comment('1…e5'), 'Symmetry.{Shift>}{Enter}{/Shift}Again.{Enter}')

    expect(screen.queryByRole('textbox', { name: 'Comment on 1…e5' })).not.toBeInTheDocument()
    await waitFor(() => expect(savedComment('e5')).toBe('Symmetry.\nAgain.'))
    expect(await screen.findByText(/^Symmetry\./)).toHaveTextContent('Symmetry. Again.', { normalizeWhitespace: true })
  })

  it('saves when the editor loses focus', async () => {
    const user = userEvent.setup()
    renderNote()

    fireEvent.contextMenu(await screen.findByRole('button', { name: 'Nf3' }))
    await user.click(screen.getByRole('menuitem', { name: 'Add comment' }))
    await waitFor(() => expect(comment('2.Nf3')).toHaveFocus())
    await user.type(comment('2.Nf3'), 'Develops.')
    await user.click(screen.getByRole('heading', { name: 'Sicilian' }))

    await waitFor(() => expect(savedComment('Nf3')).toBe('Develops.'))
    expect(screen.queryByRole('textbox', { name: 'Comment on 2.Nf3' })).not.toBeInTheDocument()
  })

  it('Escape cancels, keeping the saved Comment', async () => {
    rows = rowsOf('1. e4 e5 {Symmetry.} 2. Nf3 Nc6 *')
    const user = userEvent.setup()
    renderNote()

    fireEvent.contextMenu(await screen.findByRole('button', { name: 'e5' }))
    expect(menuItems()).toEqual(['Edit comment', 'Link a note…', 'Promote to main line', 'Delete from here'])
    await user.click(screen.getByRole('menuitem', { name: 'Edit comment' }))
    await waitFor(() => expect(comment('1…e5')).toHaveFocus())
    expect(comment('1…e5')).toHaveValue('Symmetry.')
    await user.type(comment('1…e5'), ' Not saved.{Escape}')

    expect(screen.queryByRole('textbox', { name: 'Comment on 1…e5' })).not.toBeInTheDocument()
    expect(screen.getByText('Symmetry.')).toBeInTheDocument()
    expect(putWriting).not.toHaveBeenCalled()
  })

  it('deletes the Comment when saved empty', async () => {
    rows = rowsOf('1. e4 e5 {Symmetry.} 2. Nf3 Nc6 *')
    const user = userEvent.setup()
    renderNote()

    fireEvent.contextMenu(await screen.findByRole('button', { name: 'e5' }))
    await user.click(screen.getByRole('menuitem', { name: 'Edit comment' }))
    await waitFor(() => expect(comment('1…e5')).toHaveFocus())
    await user.clear(comment('1…e5'))
    await user.keyboard('{Enter}')

    await waitFor(() => expect(putWriting).toHaveBeenCalled())
    expect(savedComment('e5')).toBeNull()
    await waitFor(() => expect(screen.queryByText('Symmetry.')).not.toBeInTheDocument())
  })

  it('doesn’t open the editor when a Comment’s text is clicked', async () => {
    rows = rowsOf('1. e4 e5 {Symmetry.} 2. Nf3 Nc6 *')
    const user = userEvent.setup()
    renderNote()

    await user.click(await screen.findByText('Symmetry.'))
    expect(screen.queryByRole('textbox', { name: /^Comment on/ })).not.toBeInTheDocument()
  })

  it('Link a note… on the Move being written keeps its text and puts the Link after it (#101)', async () => {
    const user = userEvent.setup()
    renderNote()

    fireEvent.contextMenu(await screen.findByRole('button', { name: 'e5' }))
    await user.click(screen.getByRole('menuitem', { name: 'Add comment' }))
    await waitFor(() => expect(comment('1…e5')).toHaveFocus())
    await user.type(comment('1…e5'), 'Symmetry, as in')

    fireEvent.contextMenu(move('e5'))
    await user.click(screen.getByRole('menuitem', { name: 'Link a note…' }))
    const search = await screen.findByRole('combobox', { name: 'Find a note to link' })
    await waitFor(() => expect(search).toHaveFocus())
    await user.type(search, 'hang')
    await user.click(await screen.findByRole('option'))

    await waitFor(() => expect(comment('1…e5')).toHaveValue('Symmetry, as in [[note:5]]'))
    await waitFor(() => expect(comment('1…e5')).toHaveFocus())
    await user.keyboard('{Enter}')
    await waitFor(() => expect(savedComment('e5')).toBe('Symmetry, as in [[note:5]]'))
  })

  it('right-clicking the Move being written saves nothing until the editor closes (#101)', async () => {
    const user = userEvent.setup()
    renderNote()

    fireEvent.contextMenu(await screen.findByRole('button', { name: 'e5' }))
    await user.click(screen.getByRole('menuitem', { name: 'Add comment' }))
    await waitFor(() => expect(comment('1…e5')).toHaveFocus())
    await user.type(comment('1…e5'), 'Symmetry, as in')

    rightClick(move('e5'))
    await user.click(await screen.findByRole('menuitem', { name: 'Link a note…' }))
    const search = await screen.findByRole('combobox', { name: 'Find a note to link' })
    await waitFor(() => expect(search).toHaveFocus())
    expect(putWriting).not.toHaveBeenCalled()
    await user.type(search, 'hang')
    await user.click(await screen.findByRole('option'))

    await waitFor(() => expect(comment('1…e5')).toHaveValue('Symmetry, as in [[note:5]]'))
    await waitFor(() => expect(comment('1…e5')).toHaveFocus())
    expect(putWriting).not.toHaveBeenCalled()
    await user.keyboard('{Escape}')
    expect(putWriting).not.toHaveBeenCalled()
  })

  it('closing the menu of the Move being written goes back to its editor, unsaved', async () => {
    const user = userEvent.setup()
    renderNote()

    fireEvent.contextMenu(await screen.findByRole('button', { name: 'e5' }))
    await user.click(screen.getByRole('menuitem', { name: 'Add comment' }))
    await waitFor(() => expect(comment('1…e5')).toHaveFocus())
    await user.type(comment('1…e5'), 'Symmetry')

    rightClick(move('e5'))
    await screen.findByRole('menuitem', { name: 'Link a note…' })
    await user.keyboard('{Escape}')

    await waitFor(() => expect(comment('1…e5')).toHaveFocus())
    expect(comment('1…e5')).toHaveValue('Symmetry')
    expect(putWriting).not.toHaveBeenCalled()
  })

  it('offers no Link a note… on the Position', async () => {
    rows = rowsOf('1. e4 e5 *')
    rows[0] = { ...rows[0], comment: 'An older Comment.' }
    renderNote()

    fireEvent.contextMenu(await screen.findByText('An older Comment.'))
    expect(menuItems()).toEqual(['Delete comment'])
  })

  it('offers only Delete comment on an older Comment on the Position', async () => {
    rows = rowsOf('1. e4 e5 *')
    rows[0] = { ...rows[0], comment: 'An older Comment.' }
    const user = userEvent.setup()
    renderNote()

    const old = await screen.findByText('An older Comment.')
    expect(fireEvent.contextMenu(old)).toBe(false)
    expect(menuItems()).toEqual(['Delete comment'])
    await user.click(screen.getByRole('menuitem', { name: 'Delete comment' }))

    await waitFor(() => expect(putWriting).toHaveBeenCalledWith('token', 1, rows[0].id, expect.objectContaining({ comment: null })))
    await waitFor(() => expect(screen.queryByText('An older Comment.')).not.toBeInTheDocument())
  })
})

describe('Leaving while writing saves (#120)', () => {
  // Writes a Body on the current Move, then goes to another, so the Body is
  // handed over to save and its editor is gone.
  async function writeBody() {
    const user = userEvent.setup()
    renderNote()
    await user.type(await screen.findByRole('textbox', { name: 'Body after 2…Nc6' }), 'Both sides develop.')
    await user.click(move('Nf3'))
    expect(await screen.findByRole('textbox', { name: 'Body after 2.Nf3' })).toHaveValue('')
    await waitFor(() => expect(putWriting).toHaveBeenCalled())
  }

  it('asks while the save is pending, and not once it has succeeded', async () => {
    let answer = () => {}
    const answered = new Promise<void>((resolve) => (answer = resolve))
    putWriting.mockImplementation(async (_t, _id, moveId, writing) => {
      await answered
      return { ...(rows.find((row) => row.id === moveId) as MoveRow), ...writing }
    })
    await writeBody()

    expect(leavingAsks()).toBe(true)
    answer()
    await waitFor(() => expect(screen.queryByText('Saving…')).not.toBeInTheDocument())
    expect(leavingAsks()).toBe(false)
  })

  it('asks after the save has failed', async () => {
    putWriting.mockRejectedValue(new Error('Network down'))
    await writeBody()

    expect(await screen.findByText('Your writing was not saved')).toBeInTheDocument()
    expect(leavingAsks()).toBe(true)
  })
})
