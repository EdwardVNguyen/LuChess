import { MantineProvider } from '@mantine/core'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMemoryHistory, createRootRoute, createRoute, createRouter, RouterProvider } from '@tanstack/react-router'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import type { MoveRow, Note, NoteLinks } from '../api'
import { importPgn } from '../chess/pgnImport'
import { moveOf, type MoveId } from '../chess/tree'
import type { Session } from '../session'
import { SessionProvider } from '../session'
import { theme } from '../theme'
import { NoteScreen } from './NoteScreen'

const getNote = vi.fn<(token: string, id: number) => Promise<Note>>()
const getLinks = vi.fn<(token: string, id: number) => Promise<NoteLinks>>()
const addMove = vi.fn<(token: string, id: number, parentId: number, san: string) => Promise<MoveRow>>()
vi.mock('../apiClient', () => ({
  api: {
    getNote: (token: string, id: number) => getNote(token, id),
    listMoves: async () => structuredClone(rows),
    getLinks: (token: string, id: number) => getLinks(token, id),
    addMove: (token: string, id: number, parentId: number, san: string) => addMove(token, id, parentId, san),
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
    <MantineProvider theme={theme} env="test">
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

// The piece on a square, as react-chessboard draws it.
function pieceOn(name: string): string | null {
  return document.querySelector(`[data-square="${name}"] [data-piece]`)?.getAttribute('data-piece') ?? null
}

// Holds each add-Move save until the test resolves or rejects it, in order.
function deferredAddMove() {
  const waiting: { resolve: () => void; reject: (error: Error) => void }[] = []
  addMove.mockImplementation(
    (_t, _id, parentId, san) =>
      new Promise<MoveRow>((resolve, reject) => {
        waiting.push({
          resolve: () => {
            const row: MoveRow = { ...rows[0], id: Math.max(...rows.map((r) => r.id)) + 1, parentId, san }
            rows = [...rows, row]
            resolve(row)
          },
          reject,
        })
      }),
  )
  return {
    resolveNext: () => waiting.shift()?.resolve(),
    rejectNext: (error: Error) => waiting.shift()?.reject(error),
  }
}

async function play(user: ReturnType<typeof userEvent.setup>, from: string, to: string) {
  await user.click(square(from))
  await user.click(square(to))
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
})

describe('Playing moves on the board', () => {
  it('extends the line with a move at its end, saved straight away', async () => {
    const user = userEvent.setup()
    renderNote()
    // The board opens at the end of the game, on 2…Nc6.
    await waitFor(() => expect(screen.getByRole('button', { name: 'Nc6' })).toHaveAttribute('aria-current', 'step'))

    await play(user, 'f1', 'b5')

    await waitFor(() => expect(screen.getByRole('button', { name: 'Bb5' })).toHaveAttribute('aria-current', 'step'))
    expect(addMove).toHaveBeenCalledTimes(1)
    expect(addMove).toHaveBeenCalledWith('token', 1, idOf('Nc6'), 'Bb5')
  })

  it('steps forward when the move played is the next Move', async () => {
    const user = userEvent.setup()
    renderNote()
    await user.click(await screen.findByRole('button', { name: 'e4' }))

    await play(user, 'e7', 'e5')

    expect(screen.getByRole('button', { name: 'e5' })).toHaveAttribute('aria-current', 'step')
    expect(addMove).not.toHaveBeenCalled()
  })

  it('starts a Variation with a different move, and the Main line goes on', async () => {
    const user = userEvent.setup()
    renderNote()
    await user.click(await screen.findByRole('button', { name: 'e4' }))

    await play(user, 'c7', 'c5')

    await waitFor(() => expect(screen.getByRole('button', { name: 'c5' })).toHaveAttribute('aria-current', 'step'))
    expect(addMove).toHaveBeenCalledWith('token', 1, idOf('e4'), 'c5')
    expect(rows.find((row) => row.san === 'c5')?.parentId).toBe(idOf('e4'))
    expect(screen.getByRole('button', { name: 'e5' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Nf3' })).toBeInTheDocument()
  })

  it('steps into an existing Variation that starts with the move played', async () => {
    rows = rowsOf('1. e4 e5 (1... c5 2. Nf3) 2. Nf3 Nc6 *')
    const user = userEvent.setup()
    renderNote()
    await user.click(await screen.findByRole('button', { name: 'e4' }))

    await play(user, 'c7', 'c5')

    expect(screen.getByRole('button', { name: 'c5' })).toHaveAttribute('aria-current', 'step')
    expect(addMove).not.toHaveBeenCalled()
    // Then on along that Variation, onto its own 2.Nf3.
    await play(user, 'g1', 'f3')
    // The move list reads 1.e4 e5 (1…c5 2.Nf3) 2.Nf3 Nc6: the Variation's Nf3 comes first.
    const [inVariation, onMainLine] = screen.getAllByRole('button', { name: 'Nf3' })
    expect(inVariation).toHaveAttribute('aria-current', 'step')
    expect(onMainLine).not.toHaveAttribute('aria-current')
    expect(addMove).not.toHaveBeenCalled()
  })

  it('steps onto the Move the API answers when that move was already saved there', async () => {
    const user = userEvent.setup()
    renderNote()
    await user.click(await screen.findByRole('button', { name: 'e4' }))
    // Another tab has just added 1…c5; the API reuses it (ADR 0009).
    const c5: MoveRow = { ...rows[0], id: 99, parentId: idOf('e4'), san: 'c5' }
    addMove.mockResolvedValueOnce(c5)

    await play(user, 'c7', 'c5')

    await waitFor(() => expect(screen.getByRole('button', { name: 'c5' })).toHaveAttribute('aria-current', 'step'))
  })

  it('shows why a move was not saved, and stays where it was', async () => {
    addMove.mockRejectedValue(new Error('Could not save the move'))
    const user = userEvent.setup()
    renderNote()
    await user.click(await screen.findByRole('button', { name: 'e4' }))

    await play(user, 'c7', 'c5')

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not save the move')
    expect(screen.queryByRole('button', { name: 'c5' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'e4' })).toHaveAttribute('aria-current', 'step')
  })

  it('shows a move on the board before it is saved, and in the move list once it is', async () => {
    const save = deferredAddMove()
    const user = userEvent.setup()
    renderNote()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Nc6' })).toHaveAttribute('aria-current', 'step'))

    await play(user, 'f1', 'b5')

    await waitFor(() => expect(pieceOn('b5')).toBe('wB'))
    expect(pieceOn('f1')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Bb5' })).not.toBeInTheDocument()

    save.resolveNext()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Bb5' })).toHaveAttribute('aria-current', 'step'))
    expect(pieceOn('b5')).toBe('wB')
  })

  it('saves moves played while one is saving, in order, each after the one before', async () => {
    const save = deferredAddMove()
    const user = userEvent.setup()
    renderNote()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Nc6' })).toHaveAttribute('aria-current', 'step'))

    await play(user, 'f1', 'b5')
    await waitFor(() => expect(pieceOn('b5')).toBe('wB'))
    await play(user, 'a7', 'a6')
    await waitFor(() => expect(pieceOn('a6')).toBe('bP'))
    expect(addMove).toHaveBeenCalledTimes(1)

    save.resolveNext()
    await waitFor(() => expect(addMove).toHaveBeenCalledTimes(2))
    expect(addMove).toHaveBeenNthCalledWith(1, 'token', 1, idOf('Nc6'), 'Bb5')
    expect(addMove).toHaveBeenNthCalledWith(2, 'token', 1, idOf('Bb5'), 'a6')
    save.resolveNext()

    await waitFor(() => expect(screen.getByRole('button', { name: 'a6' })).toHaveAttribute('aria-current', 'step'))
    expect(rows.find((row) => row.san === 'a6')?.parentId).toBe(idOf('Bb5'))
  })

  it('goes back to the last saved Move when a save fails, dropping the moves after it', async () => {
    const save = deferredAddMove()
    const user = userEvent.setup()
    renderNote()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Nc6' })).toHaveAttribute('aria-current', 'step'))

    await play(user, 'f1', 'b5')
    await waitFor(() => expect(pieceOn('b5')).toBe('wB'))
    await play(user, 'a7', 'a6')
    await waitFor(() => expect(pieceOn('a6')).toBe('bP'))

    save.rejectNext(new Error('Could not save the move'))

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not save the move')
    await waitFor(() => expect(pieceOn('f1')).toBe('wB'))
    expect(pieceOn('b5')).toBeNull()
    expect(pieceOn('a7')).toBe('bP')
    expect(screen.getByRole('button', { name: 'Nc6' })).toHaveAttribute('aria-current', 'step')
    expect(screen.queryByRole('button', { name: 'Bb5' })).not.toBeInTheDocument()
    expect(addMove).toHaveBeenCalledTimes(1)
  })

  it('has no Edit moves step', async () => {
    const user = userEvent.setup()
    renderNote()
    await user.click(await screen.findByRole('button', { name: 'Note actions' }))

    expect(await screen.findByRole('menuitem', { name: 'Rename' })).toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: 'Edit moves' })).not.toBeInTheDocument()
  })
})
