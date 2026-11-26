// Black-box tests for #120: warn before the tab closes or reloads while
// writing is unsaved. Written from the issue, against the public surface only.
import { MantineProvider } from '@mantine/core'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMemoryHistory, createRootRoute, createRoute, createRouter, RouterProvider } from '@tanstack/react-router'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import type { MoveRow, Note, NoteLinks, WritingInput } from '../api'
import { gameFromMoves, START_FEN } from '../chess/chess'
import { NO_WRITING, type Writing } from '../chess/pgn'
import { importPgn } from '../chess/pgnImport'
import { moveOf, type MoveId } from '../chess/tree'
import { renderWithTheme } from '../overlay/testUtils'
import type { Session } from '../session'
import { SessionProvider } from '../session'
import { theme } from '../theme'
import { NoteScreen } from './NoteScreen'
import { PlyEditor } from './PlyEditor'

// --- What the browser would see on unload ------------------------------------

// Dispatches a cancelable beforeunload, as the browser does, and reports
// whether the page asked for the leave prompt.
function unloadIsCancelled(): boolean {
  const event = new Event('beforeunload', { cancelable: true })
  window.dispatchEvent(event)
  return event.defaultPrevented
}

// Counts beforeunload listeners added to window and not yet removed.
let beforeUnloadListeners = new Set<unknown>()
beforeEach(() => {
  beforeUnloadListeners = new Set()
  const add = window.addEventListener.bind(window)
  const remove = window.removeEventListener.bind(window)
  vi.spyOn(window, 'addEventListener').mockImplementation((type: string, listener: unknown, options?: unknown) => {
    if (type === 'beforeunload') beforeUnloadListeners.add(listener)
    add(type, listener as EventListener, options as AddEventListenerOptions)
  })
  vi.spyOn(window, 'removeEventListener').mockImplementation((type: string, listener: unknown, options?: unknown) => {
    if (type === 'beforeunload') beforeUnloadListeners.delete(listener)
    remove(type, listener as EventListener, options as EventListenerOptions)
  })
})
afterEach(() => {
  vi.restoreAllMocks()
})

// --- The Body editor alone ---------------------------------------------------

const played = gameFromMoves(START_FEN, ['e4', 'e5'])
if (!played.ok) throw new Error(played.error)
const game = played.value

// A PlyEditor whose parent keeps what was saved, as a Note does.
function SavingPlyEditor({ initial }: { initial?: Partial<Writing> }) {
  const [writing, setWriting] = useState<Writing | undefined>(initial ? { ...NO_WRITING, ...initial } : undefined)
  return (
    <PlyEditor
      ply={game.plies[1]}
      writing={writing}
      onSave={(change) => setWriting((was) => ({ ...NO_WRITING, ...was, ...change }))}
    />
  )
}

const body = () => screen.getByRole('textbox', { name: 'Body after 1.e4' })

describe('#120 the Body editor', () => {
  it('does not warn, and has no beforeunload listener, with nothing typed', () => {
    renderWithTheme(<SavingPlyEditor />)
    expect(unloadIsCancelled()).toBe(false)
    expect(beforeUnloadListeners.size).toBe(0)
  })

  it('warns while a draft is unsaved, and not once it is saved by leaving the editor', async () => {
    const user = userEvent.setup()
    renderWithTheme(<SavingPlyEditor />)

    await user.type(body(), 'Then Black decides.')
    expect(unloadIsCancelled()).toBe(true)

    await user.tab()
    expect(unloadIsCancelled()).toBe(false)
    expect(beforeUnloadListeners.size).toBe(0)
  })

  it('stops warning once the draft is saved with Ctrl+Enter', async () => {
    const user = userEvent.setup()
    renderWithTheme(<SavingPlyEditor />)

    await user.type(body(), 'Then Black decides.')
    expect(unloadIsCancelled()).toBe(true)
    await user.keyboard('{Control>}{Enter}{/Control}')
    expect(unloadIsCancelled()).toBe(false)
  })

  it('stops warning once the draft is undone with Escape', async () => {
    const user = userEvent.setup()
    renderWithTheme(<SavingPlyEditor initial={{ body: 'Saved already.' }} />)

    await user.type(body(), ' And more.')
    expect(unloadIsCancelled()).toBe(true)
    await user.keyboard('{Escape}')
    expect(unloadIsCancelled()).toBe(false)
    expect(beforeUnloadListeners.size).toBe(0)
  })

  it('warns when saved text is changed, and stops when it is typed back the same', async () => {
    const user = userEvent.setup()
    renderWithTheme(<SavingPlyEditor initial={{ body: 'Saved' }} />)

    await user.type(body(), '!')
    expect(unloadIsCancelled()).toBe(true)
    await user.type(body(), '{Backspace}')
    expect(unloadIsCancelled()).toBe(false)
  })

  it.each([
    ['an empty Body', undefined, '   '],
    ['an empty Body, with a newline', undefined, '{Shift>}{Enter}{/Shift} '],
    ['a saved Body, spaces after it', { body: 'Saved.' }, '   '],
  ])('does not warn for whitespace-only changes to %s', async (_name, initial, typed) => {
    const user = userEvent.setup()
    renderWithTheme(<SavingPlyEditor initial={initial} />)

    await user.type(body(), typed)
    expect(unloadIsCancelled()).toBe(false)
  })

  it('warns when saved text is cleared but not yet saved as deleted', async () => {
    const user = userEvent.setup()
    renderWithTheme(<SavingPlyEditor initial={{ body: 'Saved.' }} />)

    await user.clear(body())
    expect(unloadIsCancelled()).toBe(true)
  })
})

// --- A whole Note, with the API mocked ---------------------------------------

const getNote = vi.fn<(token: string, id: number) => Promise<Note>>()
const getLinks = vi.fn<(token: string, id: number) => Promise<NoteLinks>>()
const putWriting = vi.fn<(token: string, id: number, moveId: number, writing: WritingInput) => Promise<MoveRow>>()
vi.mock('../apiClient', () => ({
  api: {
    getNote: (token: string, id: number) => getNote(token, id),
    listMoves: async () => structuredClone(rows),
    getLinks: (token: string, id: number) => getLinks(token, id),
    putWriting: (token: string, id: number, moveId: number, writing: WritingInput) => putWriting(token, id, moveId, writing),
    searchNotes: async () => [],
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
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
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

// The fake API's save: stores the writing and returns the row.
async function saved(_t: string, _id: number, moveId: number, writing: WritingInput): Promise<MoveRow> {
  rows = rows.map((row) => (row.id === moveId ? { ...row, ...writing } : row))
  return structuredClone(rows.find((row) => row.id === moveId) as MoveRow)
}

// A save the test settles by hand.
function deferredSave() {
  let settle: { resolve: () => void; reject: (error: Error) => void } | undefined
  putWriting.mockImplementation(
    (t, id, moveId, writing) =>
      new Promise<MoveRow>((resolve, reject) => {
        settle = {
          resolve: () => void saved(t, id, moveId, writing).then(resolve),
          reject,
        }
      }),
  )
  return {
    resolve: () => settle?.resolve(),
    reject: (error: Error) => settle?.reject(error),
  }
}

const move = (name: string) => screen.getByRole('button', { name })
const comment = (on: string) => screen.getByRole('textbox', { name: `Comment on ${on}` })
const noteBody = (after: string) => screen.getByRole('textbox', { name: `Body after ${after}` })
const current = async (san: string) => waitFor(() => expect(move(san)).toHaveAttribute('aria-current', 'step'))

beforeEach(() => {
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 40, 40))
  rows = rowsOf('1. e4 e5 2. Nf3 Nc6 *')
  getNote.mockReset().mockResolvedValue(note)
  getLinks.mockReset().mockResolvedValue({ targets: [], backlinks: [] })
  putWriting.mockReset().mockImplementation(saved)
})

describe('#120 a freshly opened Note', () => {
  it('does not warn and registers no beforeunload listener', async () => {
    rows = rowsOf('1. e4 {Best by test.} e5 2. Nf3 Nc6 {A Comment.} *')
    renderNote()
    await current('Nc6')
    expect(noteBody('2…Nc6')).toBeInTheDocument()

    expect(unloadIsCancelled()).toBe(false)
    expect(beforeUnloadListeners.size).toBe(0)
  })
})

describe('#120 the Body editor on a Note', () => {
  it('warns while a Body draft is unsaved and stops once it is saved', async () => {
    const user = userEvent.setup()
    renderNote()
    await current('Nc6')

    await user.type(noteBody('2…Nc6'), 'Black develops.')
    expect(unloadIsCancelled()).toBe(true)

    await user.keyboard('{Control>}{Enter}{/Control}')
    await waitFor(() => expect(putWriting).toHaveBeenCalled())
    await waitFor(() => expect(unloadIsCancelled()).toBe(false))
    expect(beforeUnloadListeners.size).toBe(0)
  })
})

describe('#120 the inline Comment editor', () => {
  async function openComment(user: ReturnType<typeof userEvent.setup>) {
    fireEvent.contextMenu(await screen.findByRole('button', { name: 'e5' }))
    await user.click(screen.getByRole('menuitem', { name: /^(Add|Edit) comment$/ }))
    await waitFor(() => expect(comment('1…e5')).toHaveFocus())
  }

  it('does not warn when opened with nothing typed', async () => {
    const user = userEvent.setup()
    renderNote()
    await openComment(user)
    expect(unloadIsCancelled()).toBe(false)
  })

  it('warns while a Comment draft is unsaved and stops once it is saved with Enter', async () => {
    const user = userEvent.setup()
    renderNote()
    await openComment(user)

    await user.type(comment('1…e5'), 'Symmetry.')
    expect(unloadIsCancelled()).toBe(true)

    await user.keyboard('{Enter}')
    await waitFor(() => expect(putWriting).toHaveBeenCalled())
    await waitFor(() => expect(unloadIsCancelled()).toBe(false))
    expect(beforeUnloadListeners.size).toBe(0)
  })

  it('stops warning once a Comment draft is undone with Escape', async () => {
    rows = rowsOf('1. e4 e5 {Symmetry.} 2. Nf3 Nc6 *')
    const user = userEvent.setup()
    renderNote()
    await openComment(user)

    await user.type(comment('1…e5'), ' Not saved.')
    expect(unloadIsCancelled()).toBe(true)
    await user.keyboard('{Escape}')
    expect(unloadIsCancelled()).toBe(false)
    expect(putWriting).not.toHaveBeenCalled()
    expect(beforeUnloadListeners.size).toBe(0)
  })

  it('does not warn for a whitespace-only Comment change', async () => {
    rows = rowsOf('1. e4 e5 {Symmetry.} 2. Nf3 Nc6 *')
    const user = userEvent.setup()
    renderNote()
    await openComment(user)

    await user.type(comment('1…e5'), '   ')
    expect(unloadIsCancelled()).toBe(false)
  })
})

describe('#120 a writing save that has not finished', () => {
  it('warns while the save is pending after moving to another Move, and stops once it succeeds', async () => {
    const save = deferredSave()
    const user = userEvent.setup()
    renderNote()
    await current('Nc6')

    await user.type(noteBody('2…Nc6'), 'Black develops.')
    await user.click(move('e4'))
    await current('e4')
    await waitFor(() => expect(putWriting).toHaveBeenCalledTimes(1))
    // The editor now shows 1.e4, with nothing typed in it, but the save is still in flight.
    expect(noteBody('1.e4')).toHaveValue('')
    expect(unloadIsCancelled()).toBe(true)

    save.resolve()
    await waitFor(() => expect(unloadIsCancelled()).toBe(false))
    expect(beforeUnloadListeners.size).toBe(0)
  })

  it('warns while a Comment save is pending after the editor closes', async () => {
    const save = deferredSave()
    const user = userEvent.setup()
    renderNote()
    fireEvent.contextMenu(await screen.findByRole('button', { name: 'e5' }))
    await user.click(screen.getByRole('menuitem', { name: /^(Add|Edit) comment$/ }))
    await waitFor(() => expect(comment('1…e5')).toHaveFocus())

    await user.type(comment('1…e5'), 'Symmetry.{Enter}')
    await waitFor(() => expect(putWriting).toHaveBeenCalledTimes(1))
    await user.click(move('Nf3'))
    await current('Nf3')
    expect(unloadIsCancelled()).toBe(true)

    save.resolve()
    await waitFor(() => expect(unloadIsCancelled()).toBe(false))
  })

  it('warns after the save failed and the user moved to another Move, and stops once Try again succeeds', async () => {
    putWriting.mockRejectedValueOnce(new Error('Could not save the writing'))
    const user = userEvent.setup()
    renderNote()
    await current('Nc6')

    await user.type(noteBody('2…Nc6'), 'Black develops.')
    await user.click(move('e4'))
    await current('e4')
    expect(await screen.findByText('Your writing was not saved')).toBeInTheDocument()
    expect(unloadIsCancelled()).toBe(true)
    expect(beforeUnloadListeners.size).toBeGreaterThan(0)

    // The fake API saves from now on.
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    await waitFor(() => expect(screen.queryByText('Your writing was not saved')).not.toBeInTheDocument())
    await waitFor(() => expect(unloadIsCancelled()).toBe(false))
    expect(putWriting).toHaveBeenCalledTimes(2)
    expect(rows.find((row) => row.san === 'Nc6')?.body).toBe('Black develops.')
    expect(beforeUnloadListeners.size).toBe(0)
  })

  it('keeps warning when Try again fails again', async () => {
    putWriting.mockRejectedValue(new Error('Could not save the writing'))
    const user = userEvent.setup()
    renderNote()
    await current('Nc6')

    await user.type(noteBody('2…Nc6'), 'Black develops.')
    await user.click(move('e4'))
    expect(await screen.findByText('Your writing was not saved')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Try again' }))
    await waitFor(() => expect(putWriting).toHaveBeenCalledTimes(2))
    expect(await screen.findByText('Your writing was not saved')).toBeInTheDocument()
    expect(unloadIsCancelled()).toBe(true)
  })
})
