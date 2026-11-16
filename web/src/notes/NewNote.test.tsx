import { MantineProvider } from '@mantine/core'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMemoryHistory, createRootRoute, createRoute, createRouter, Outlet, RouterProvider } from '@tanstack/react-router'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import type { MoveRow, NewNoteInput, Note, NoteLinks, NoteSummary } from '../api'
import { Header } from '../header/Header'
import type { Session } from '../session'
import { SessionProvider } from '../session'
import { theme } from '../theme'
import { NoteScreen } from './NoteScreen'
import { NotesIndex } from './NotesIndex'

const createNote = vi.fn<(token: string, input: NewNoteInput) => Promise<Note>>()
const renameNote = vi.fn<(token: string, id: number, name: string) => Promise<Note>>()
const getNote = vi.fn<(token: string, id: number) => Promise<Note>>()
const listNotes = vi.fn<() => Promise<NoteSummary[]>>()
vi.mock('../apiClient', () => ({
  api: {
    createNote: (token: string, input: NewNoteInput) => createNote(token, input),
    renameNote: (token: string, id: number, name: string) => renameNote(token, id, name),
    getNote: (token: string, id: number) => getNote(token, id),
    listNotes: () => listNotes(),
    listFolders: async () => [],
    listMoves: async (): Promise<MoveRow[]> => [root],
    getLinks: async (): Promise<NoteLinks> => ({ targets: [], backlinks: [] }),
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

const root: MoveRow = {
  id: 1,
  parentId: null,
  san: null,
  comment: null,
  body: null,
  moveGlyph: null,
  positionGlyph: null,
  drawings: [],
  updatedAt: '',
}

const noteOf = (input: { name: string; folderId?: number | null }, id = 7): Note => ({
  id,
  name: input.name,
  folderId: input.folderId ?? null,
  tags: [],
  startFen: null,
  createdAt: '',
  updatedAt: '',
})

function renderApp(path = '/notes') {
  const rootRoute = createRootRoute({
    component: () => (
      <>
        <Header state={signedIn} onLogOut={() => {}} />
        <Outlet />
      </>
    ),
  })
  const routes = [
    createRoute({ getParentRoute: () => rootRoute, path: '/notes', component: NotesIndex }),
    createRoute({ getParentRoute: () => rootRoute, path: '/notes/import', component: () => 'Import page' }),
    createRoute({
      getParentRoute: () => rootRoute,
      path: '/notes/$noteId',
      validateSearch: z.object({ move: z.number().optional() }),
      component: NoteScreen,
    }),
  ]
  const router = createRouter({
    routeTree: rootRoute.addChildren(routes),
    history: createMemoryHistory({ initialEntries: [path] }),
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
  return router
}

beforeEach(() => {
  vi.resetAllMocks()
  listNotes.mockResolvedValue([])
  createNote.mockImplementation(async (_token, input) => noteOf(input))
  getNote.mockImplementation(async (_token, id) => noteOf({ name: 'Untitled' }, id))
  renameNote.mockImplementation(async (_token, id, name) => noteOf({ name }, id))
})

/** The header's New note button, as shown from the tablet size up (the mobile plus is the other). */
const headerNewNote = async () => (await screen.findAllByRole('button', { name: 'New note' }))[0]

describe('New note', () => {
  it('creates a blank Untitled Note at the root and opens it with its title in rename, Untitled selected', async () => {
    const router = renderApp()

    await userEvent.click(await headerNewNote())

    await waitFor(() => expect(router.state.location.pathname).toBe('/notes/7'))
    expect(createNote).toHaveBeenCalledTimes(1)
    expect(createNote.mock.calls[0][1]).toEqual({
      name: 'Untitled',
      startFen: null,
      tags: [],
      folderId: null,
      position: {},
      moves: [],
    })
    const field = await screen.findByRole('textbox', { name: 'Rename note Untitled' })
    expect(field).toHaveFocus()
    expect(field).toHaveValue('Untitled')
    expect((field as HTMLInputElement).selectionStart).toBe(0)
    expect((field as HTMLInputElement).selectionEnd).toBe('Untitled'.length)
    // Once: going back to this entry, or reloading it, doesn't rename again.
    await waitFor(() => expect(router.state.location.state.renameNote).toBeUndefined())
    expect(screen.getByText('No moves yet. This note studies the position alone.')).toBeInTheDocument()

    // Typing replaces the name, and Enter saves it.
    await userEvent.keyboard('Najdorf ideas{Enter}')
    await waitFor(() => expect(renameNote).toHaveBeenCalledWith('token', 7, 'Najdorf ideas'))
    expect(await screen.findByRole('heading', { name: 'Najdorf ideas' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Najdorf ideas' })).toHaveFocus()
  })

  it('keeps Untitled on Escape', async () => {
    renderApp()

    await userEvent.click(await headerNewNote())
    await screen.findByRole('textbox', { name: 'Rename note Untitled' })
    await userEvent.keyboard('Something{Escape}')

    expect(await screen.findByRole('heading', { name: 'Untitled' })).toBeInTheDocument()
    expect(renameNote).not.toHaveBeenCalled()
  })

  it('makes one Note for a double click, with every New note disabled while it is created', async () => {
    let answer!: (note: Note) => void
    createNote.mockImplementation(() => new Promise((resolve) => (answer = resolve)))
    const router = renderApp()

    await userEvent.dblClick(await headerNewNote())
    await waitFor(() => expect(screen.getAllByRole('button', { name: 'New note' })[0]).toBeDisabled())
    expect(screen.getAllByRole('button', { name: 'New note' }).every((button) => button.hasAttribute('disabled') || button.getAttribute('data-loading') === 'true')).toBe(true)

    answer(noteOf({ name: 'Untitled' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/notes/7'))
    expect(createNote).toHaveBeenCalledTimes(1)
  })

  it('says when the create fails and stays where it was', async () => {
    createNote.mockRejectedValue(new Error('Could not reach the server'))
    const router = renderApp()

    await userEvent.click(await headerNewNote())

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not create the note. Could not reach the server')
    expect(router.state.location.pathname).toBe('/notes')
    expect(await headerNewNote()).toBeEnabled()
  })

  it('starts from the empty Notes page, which offers Import… beside it', async () => {
    const router = renderApp()

    expect(await screen.findByText('Start on a fresh board, or import a game or a position to study.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Import…' })).toHaveAttribute('href', '/notes/import')
    // The page's own New note, after the header's two.
    await userEvent.click(screen.getAllByRole('button', { name: 'New note' }).at(-1)!)
    await waitFor(() => expect(router.state.location.pathname).toBe('/notes/7'))
    expect(createNote.mock.calls[0][1]).toMatchObject({ name: 'Untitled', folderId: null })
  })

  it('offers Import… in the header’s menu beside New note', async () => {
    const router = renderApp()

    await userEvent.click(await screen.findByRole('button', { name: 'Other ways to start a note' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Import…' }))

    await waitFor(() => expect(router.state.location.pathname).toBe('/notes/import'))
    expect(createNote).not.toHaveBeenCalled()
  })
})

describe('A Note’s title', () => {
  it('renames in place at any time, from the title or the Note’s menu', async () => {
    getNote.mockResolvedValue(noteOf({ name: 'Italian' }, 3))
    renameNote.mockImplementation(async (_token, id, name) => noteOf({ name }, id))
    renderApp('/notes/3')

    // Opened, not created: no rename until asked.
    await userEvent.click(await screen.findByRole('button', { name: 'Italian' }))
    const field = screen.getByRole('textbox', { name: 'Rename note Italian' })
    expect(field).toHaveFocus()
    await userEvent.keyboard('Italian game')
    await userEvent.click(document.body)
    await waitFor(() => expect(renameNote).toHaveBeenCalledWith('token', 3, 'Italian game'))
    expect(await screen.findByRole('heading', { name: 'Italian game' })).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Note actions' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Rename' }))
    expect(await screen.findByRole('textbox', { name: 'Rename note Italian game' })).toHaveFocus()
  })
})
