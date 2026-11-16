import { MantineProvider } from '@mantine/core'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMemoryHistory, createRootRoute, createRoute, createRouter, RouterProvider } from '@tanstack/react-router'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import type { MoveRow, Note, PositionResetResult, ResetTree, TreeApplyResult, TreeInput } from '../api'
import { START_FEN } from '../chess/chess'
import type { Session } from '../session'
import { SessionProvider } from '../session'
import { theme } from '../theme'
import { NoteScreen } from './NoteScreen'
import { tools } from './testUtils'

const resetPosition =
  vi.fn<(token: string, id: number, startFen: string | null, confirm: boolean, tree?: ResetTree) => Promise<PositionResetResult>>()
const applyTree = vi.fn<(token: string, id: number, input: TreeInput, confirm: boolean) => Promise<TreeApplyResult>>()
const listMoves = vi.fn<(token: string, id: number) => Promise<MoveRow[]>>()
vi.mock('../apiClient', () => ({
  api: {
    getNote: async () => note,
    listMoves: (token: string, id: number) => listMoves(token, id),
    getLinks: async () => ({ targets: [], backlinks: [] }),
    resetPosition: (token: string, id: number, startFen: string | null, confirm: boolean, tree?: ResetTree) =>
      resetPosition(token, id, startFen, confirm, tree),
    applyTree: (token: string, id: number, input: TreeInput, confirm: boolean) => applyTree(token, id, input, confirm),
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

const row = (id: number, parentId: number | null, san: string | null, comment: string | null = null): MoveRow => ({
  id,
  parentId,
  san,
  comment,
  body: null,
  moveGlyph: null,
  positionGlyph: null,
  drawings: [],
  updatedAt: '',
})

function renderNote() {
  const root = createRootRoute()
  const router = createRouter({
    routeTree: root.addChildren([
      createRoute({
        getParentRoute: () => root,
        path: '/notes/$noteId',
        validateSearch: z.object({ move: z.number().optional() }),
        component: NoteScreen,
      }),
    ]),
    history: createMemoryHistory({ initialEntries: ['/notes/1'] }),
  })
  render(
    <MantineProvider theme={theme} env="test">
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <SessionProvider session={session}>
          <RouterProvider router={router} />
        </SessionProvider>
      </QueryClientProvider>
    </MantineProvider>,
  )
}

/** Presses Edit on the FEN or PGN, answering its field. */
async function edit(name: 'FEN' | 'PGN'): Promise<HTMLInputElement | HTMLTextAreaElement> {
  // The Note screen loads its chunks of the board and the move list first; slow on a busy run.
  await userEvent.click(await waitFor(() => tools().getByRole('button', { name: `Edit ${name}` })))
  return tools().getByRole('textbox', { name })
}

async function retype(field: HTMLElement, text: string) {
  await userEvent.clear(field)
  // userEvent reads braces and brackets as keys; paste takes the text as it is.
  await userEvent.click(field)
  await userEvent.paste(text)
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
  listMoves.mockReset().mockResolvedValue([row(1, null, null), row(2, 1, 'e4', 'Kings pawn'), row(3, 2, 'c5')])
  resetPosition.mockReset()
  applyTree.mockReset()
})

describe('the FEN and PGN under the board', () => {
  it('are read only until Edit, and Cancel leaves the Note as it was', async () => {
    renderNote()
    const fen = await screen.findByRole('textbox', { name: 'FEN' })
    expect(fen).toHaveAttribute('readonly')

    const field = await edit('FEN')
    expect(field).not.toHaveAttribute('readonly')
    expect(field).toHaveValue('rnbqkbnr/pp1ppppp/8/2p5/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2')
    await userEvent.type(field, ' oops')
    await userEvent.click(tools().getByRole('button', { name: 'Cancel' }))

    expect(screen.getByRole('textbox', { name: 'FEN' })).toHaveAttribute('readonly')
    expect(screen.getByRole('textbox', { name: 'FEN' })).toHaveValue('rnbqkbnr/pp1ppppp/8/2p5/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2')
    expect(resetPosition).not.toHaveBeenCalled()
  })

  it('shows why a FEN is illegal, and changes nothing', async () => {
    renderNote()
    const field = await edit('FEN')
    await retype(field, '8/8/8/8/8/8/8/8 w - - 0 1')
    await userEvent.click(tools().getByRole('button', { name: 'Apply FEN' }))

    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(field).toHaveAttribute('aria-invalid', 'true')
    expect(resetPosition).not.toHaveBeenCalled()
  })

  it('starts the Note from a FEN, confirming what it deletes', async () => {
    renderNote()
    const field = await edit('FEN')
    await retype(field, KINGS)
    resetPosition
      .mockResolvedValueOnce({ status: 'needsConfirmation', moves: 2, comments: 1, bodies: 0, glyphs: 0, drawings: 0 })
      .mockImplementationOnce(async () => {
        note = { ...note, startFen: KINGS, tags: [] }
        listMoves.mockResolvedValue([row(9, null, null)])
        return { status: 'reset', note }
      })

    await userEvent.click(tools().getByRole('button', { name: 'Apply FEN' }))

    const dialog = await screen.findByRole('dialog', { name: 'Start the note from this position?' })
    expect(dialog).toHaveTextContent('This deletes its 2 Moves and all its writing. The name and folder stay.')
    expect(resetPosition).toHaveBeenLastCalledWith('token', 1, KINGS, false, undefined)
    await userEvent.click(within(dialog).getByRole('button', { name: 'Start from here' }))

    expect(resetPosition).toHaveBeenLastCalledWith('token', 1, KINGS, true, undefined)
    // The Note opens afresh on its new tree.
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'FEN' })).toHaveValue(KINGS))
    expect(screen.getByRole('textbox', { name: 'FEN' })).toHaveAttribute('readonly')
  })

  it('does nothing for the Position’s own FEN applied there', async () => {
    // A Note with no Moves opens at its Position.
    listMoves.mockResolvedValue([row(1, null, null)])
    renderNote()
    const field = await edit('FEN')
    expect(field).toHaveValue(START_FEN)
    await userEvent.type(field, '  ')
    await userEvent.click(tools().getByRole('button', { name: 'Apply FEN' }))

    await waitFor(() => expect(screen.getByRole('textbox', { name: 'FEN' })).toHaveAttribute('readonly'))
    expect(resetPosition).not.toHaveBeenCalled()
  })

  it('applies a PGN that adds a Move without asking, keeping the writing it shows unchanged', async () => {
    renderNote()
    const field = await edit('PGN')
    expect(field).toHaveValue('[White "Lovelace, Ada"]\n\n1. e4 {Kings pawn} 1... c5 *')
    applyTree.mockImplementationOnce(async (_token, _id, input) => ({
      status: 'applied',
      note,
      moves: [row(1, null, null), row(2, 1, 'e4', 'Kings pawn'), row(3, 2, 'c5'), row(4, 3, input.moves[2].san)],
    }))

    await retype(field, '[White "Lovelace, Ada"]\n\n1. e4 {Kings pawn} c5 2. Nf3 *')
    await userEvent.click(tools().getByRole('button', { name: 'Apply PGN' }))

    await waitFor(() => expect(screen.getByRole('textbox', { name: 'PGN' })).toHaveAttribute('readonly'))
    expect(applyTree).toHaveBeenCalledTimes(1)
    const [, id, input, confirm] = applyTree.mock.calls[0]
    expect([id, confirm]).toEqual([1, false])
    expect(input.tags).toEqual([['White', 'Lovelace, Ada']])
    expect(input.moves).toMatchObject([
      { parent: null, san: 'e4', comment: 'Kings pawn', keepComment: true, keepBody: true },
      { parent: 0, san: 'c5', keepComment: true, keepBody: true },
      { parent: 1, san: 'Nf3', keepComment: false, keepBody: false },
    ])
    expect(screen.getByRole('textbox', { name: 'PGN' })).toHaveValue(
      '[White "Lovelace, Ada"]\n\n1. e4 {Kings pawn} 1... c5 2. Nf3 *',
    )
  })

  it('shows why a PGN can’t be read, and changes nothing', async () => {
    renderNote()
    const field = await edit('PGN')
    await retype(field, '1. e4 c5 2. Qxf7 *')
    await userEvent.click(tools().getByRole('button', { name: 'Apply PGN' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('“Qxf7” is not a legal move in this game.')
    expect(applyTree).not.toHaveBeenCalled()
    expect(field).not.toHaveAttribute('readonly')
  })

  it('asks before a PGN deletes Moves, and keeps the field open when that is called off', async () => {
    renderNote()
    const field = await edit('PGN')
    applyTree.mockResolvedValueOnce({
      status: 'needsConfirmation',
      moves: 1,
      comments: 0,
      bodies: 0,
      glyphs: 0,
      drawings: 0,
      links: 0,
    })

    await retype(field, '[White "Lovelace, Ada"]\n\n1. e4 {Kings pawn} *')
    await userEvent.click(tools().getByRole('button', { name: 'Apply PGN' }))

    const dialog = await screen.findByRole('dialog', { name: 'Apply this PGN?' })
    expect(dialog).toHaveTextContent('This deletes 1 Move. This cannot be undone.')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(applyTree).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('textbox', { name: 'PGN' })).toHaveValue('[White "Lovelace, Ada"]\n\n1. e4 {Kings pawn} *')
  })

  it('resets the Note for a PGN with a new Position, importing it in the reset', async () => {
    renderNote()
    const field = await edit('PGN')
    resetPosition.mockResolvedValueOnce({ status: 'needsConfirmation', moves: 2, comments: 1, bodies: 0, glyphs: 0, drawings: 0 })

    await retype(field, `[SetUp "1"]\n[FEN "${KINGS}"]\n\n1. Kd2 *`)
    await userEvent.click(tools().getByRole('button', { name: 'Apply PGN' }))

    const dialog = await screen.findByRole('dialog', { name: "Replace this note's position?" })
    expect(dialog).toHaveTextContent('This deletes its 2 Moves and all its writing. The name and folder stay.')
    const [, , startFen, confirm, tree] = resetPosition.mock.calls[0]
    expect([startFen, confirm]).toEqual([KINGS, false])
    expect(tree).toMatchObject({ tags: [['SetUp', '1'], ['FEN', KINGS]], moves: [{ parent: null, san: 'Kd2' }] })
    expect(applyTree).not.toHaveBeenCalled()
  })
})
