import { MantineProvider } from '@mantine/core'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMemoryHistory, createRootRoute, createRoute, createRouter, RouterProvider } from '@tanstack/react-router'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import type { MovesEditInput, MovesEditResult, Note, NoteLinks, PlyWriting } from '../api'
import { parsePgn, sansOf } from '../chess/chess'
import type { Session } from '../session'
import { SessionProvider } from '../session'
import { theme } from '../theme'
import { NoteScreen } from './NoteScreen'

const getNote = vi.fn<(token: string, id: number) => Promise<Note>>()
const listPlies = vi.fn<(token: string, id: number) => Promise<PlyWriting[]>>()
const getLinks = vi.fn<(token: string, id: number) => Promise<NoteLinks>>()
const editMoves = vi.fn<(token: string, id: number, input: MovesEditInput) => Promise<MovesEditResult>>()
vi.mock('../apiClient', () => ({
  api: {
    getNote: (token: string, id: number) => getNote(token, id),
    listPlies: (token: string, id: number) => listPlies(token, id),
    getLinks: (token: string, id: number) => getLinks(token, id),
    editMoves: (token: string, id: number, input: MovesEditInput) => editMoves(token, id, input),
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
  authorized: (call) => call('token'),
}

const note: Note = {
  id: 1,
  name: 'Italian',
  pgn: '[Event "Casual"]\n\n1. e4 e5 2. Nf3 Nc6 *',
  startFen: null,
  folderId: null,
  createdAt: '2026-11-01T12:00:00Z',
  updatedAt: '2026-11-01T12:00:00Z',
}

function written(ply: number, fields: Partial<PlyWriting>): PlyWriting {
  return { ply, comment: null, body: null, moveGlyph: null, positionGlyph: null, updatedAt: '', ...fields }
}

function sansIn(pgn: string): string[] {
  const parsed = parsePgn(pgn)
  if (!parsed.ok) throw new Error(parsed.error)
  return sansOf(parsed.value)
}

function renderNote() {
  const root = createRootRoute()
  const route = createRoute({
    getParentRoute: () => root,
    path: '/notes/$noteId',
    validateSearch: z.object({ ply: z.number().optional() }),
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
  getNote.mockReset().mockResolvedValue(note)
  listPlies.mockReset().mockResolvedValue([])
  getLinks.mockReset().mockResolvedValue({ targets: [], backlinks: [] })
  editMoves.mockReset()
})

describe('Editing moves', () => {
  it('saves a deleted move straight away when no writing follows it', async () => {
    listPlies.mockResolvedValue([written(1, { comment: 'Best by test.' })])
    editMoves.mockImplementation(async (_t, _id, input) => ({ status: 'saved', note: { ...note, pgn: input.pgn } }))
    const user = userEvent.setup()
    renderNote()

    const bar = await startEditing(user)
    expect(within(bar).getByRole('button', { name: 'Save moves' })).toBeDisabled()
    // The board opens at the end of the game, on 2…Nc6.
    await user.click(within(bar).getByRole('button', { name: 'Delete 2…Nc6' }))
    await user.click(within(bar).getByRole('button', { name: 'Save moves' }))

    await waitFor(() => expect(screen.queryByRole('region', { name: 'Editing moves' })).not.toBeInTheDocument())
    expect(editMoves).toHaveBeenCalledTimes(1)
    const [, id, input] = editMoves.mock.calls[0]
    expect(id).toBe(1)
    expect(input).toMatchObject({ firstChangedPly: 4, confirm: false })
    expect(sansIn(input.pgn)).toEqual(['e4', 'e5', 'Nf3'])
    expect(input.pgn).toContain('[Event "Casual"]')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('asks before deleting writing, and sends the confirmation', async () => {
    listPlies.mockResolvedValue([
      written(1, { comment: 'Best by test.' }),
      written(2, { comment: 'Symmetry.' }),
      written(4, { moveGlyph: '!' }),
    ])
    editMoves
      .mockResolvedValueOnce({
        status: 'needsConfirmation',
        plies: 2,
        message: 'This will delete your writing on 2 moves',
      })
      .mockImplementationOnce(async (_t, _id, input) => ({ status: 'saved', note: { ...note, pgn: input.pgn } }))
    const user = userEvent.setup()
    renderNote()
    expect(await screen.findByText('Symmetry.')).toBeInTheDocument()

    const bar = await startEditing(user)
    await user.click(screen.getByRole('button', { name: 'e5' }))
    await user.click(within(bar).getByRole('button', { name: 'Delete 1…e5' }))
    // The preview leaves out the writing that saving would delete.
    expect(screen.queryByText('Symmetry.')).not.toBeInTheDocument()
    expect(screen.getByText('Best by test.')).toBeInTheDocument()
    await user.click(within(bar).getByRole('button', { name: 'Save moves' }))

    const dialog = await screen.findByRole('dialog', { name: 'Delete your writing?' })
    expect(dialog).toHaveTextContent('This will delete your writing on 2 moves')
    expect(editMoves.mock.calls[0][2]).toMatchObject({ firstChangedPly: 2, confirm: false })

    await user.click(within(dialog).getByRole('button', { name: 'Delete and save' }))
    await waitFor(() => expect(editMoves).toHaveBeenCalledTimes(2))
    expect(editMoves.mock.calls[1][2]).toEqual({ ...editMoves.mock.calls[0][2], confirm: true })
    expect(sansIn(editMoves.mock.calls[1][2].pgn)).toEqual(['e4'])
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Editing moves' })).not.toBeInTheDocument())
  })

  it('keeps the edit when the confirmation is cancelled', async () => {
    listPlies.mockResolvedValue([written(4, { comment: 'Defends.' })])
    editMoves.mockResolvedValue({
      status: 'needsConfirmation',
      plies: 1,
      message: 'This will delete your writing on 1 move',
    })
    const user = userEvent.setup()
    renderNote()

    const bar = await startEditing(user)
    await user.click(within(bar).getByRole('button', { name: 'Delete 2…Nc6' }))
    await user.click(within(bar).getByRole('button', { name: 'Save moves' }))
    const dialog = await screen.findByRole('dialog', { name: 'Delete your writing?' })
    expect(dialog).toHaveTextContent('This will delete your writing on 1 move:')
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(editMoves).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('region', { name: 'Editing moves' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save moves' })).toBeEnabled()
  })

  it('replaces the rest of the game with a different move played on the board', async () => {
    editMoves.mockImplementation(async (_t, _id, input) => ({ status: 'saved', note: { ...note, pgn: input.pgn } }))
    const user = userEvent.setup()
    renderNote()

    const bar = await startEditing(user)
    await user.click(screen.getByRole('button', { name: 'e4' }))
    // Playing the move already there only steps forward.
    await user.click(square('e7'))
    await user.click(square('e5'))
    expect(within(bar).getByRole('button', { name: 'Save moves' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Previous move' }))
    await user.click(square('c7'))
    await user.click(square('c5'))
    expect(screen.queryByRole('button', { name: 'Nf3' })).not.toBeInTheDocument()
    await user.click(within(bar).getByRole('button', { name: 'Save moves' }))

    await waitFor(() => expect(editMoves).toHaveBeenCalledTimes(1))
    expect(editMoves.mock.calls[0][2]).toMatchObject({ firstChangedPly: 2, confirm: false })
    expect(sansIn(editMoves.mock.calls[0][2].pgn)).toEqual(['e4', 'c5'])
  })

  it('puts the moves back on Cancel', async () => {
    const user = userEvent.setup()
    renderNote()

    const bar = await startEditing(user)
    await user.click(within(bar).getByRole('button', { name: 'Delete 2…Nc6' }))
    expect(screen.queryByRole('button', { name: 'Nc6' })).not.toBeInTheDocument()
    await user.click(within(bar).getByRole('button', { name: 'Cancel' }))

    expect(screen.queryByRole('region', { name: 'Editing moves' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Nc6' })).toBeInTheDocument()
    expect(editMoves).not.toHaveBeenCalled()
  })

  it('shows why a save failed', async () => {
    editMoves.mockRejectedValue(new Error('Could not save the moves'))
    const user = userEvent.setup()
    renderNote()

    const bar = await startEditing(user)
    await user.click(within(bar).getByRole('button', { name: 'Delete 2…Nc6' }))
    await user.click(within(bar).getByRole('button', { name: 'Save moves' }))

    expect(await within(bar).findByRole('alert')).toHaveTextContent('Could not save the moves')
  })
})
