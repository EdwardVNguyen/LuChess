import { MantineProvider } from '@mantine/core'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMemoryHistory, createRootRoute, createRoute, createRouter, RouterProvider } from '@tanstack/react-router'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Folder, FolderDeleteResult, FolderUpdate, Note, NoteSummary } from '../api'
import type { Session } from '../session'
import { SessionProvider } from '../session'
import { LONG_PRESS_MS } from '../overlay'
import { theme } from '../theme'
import { MoveNoteDialog } from './FolderDialogs'
import { NoteTree } from './NoteTree'

const listNotes = vi.fn<() => Promise<NoteSummary[]>>()
const listFolders = vi.fn<() => Promise<Folder[]>>()
const createFolder = vi.fn<(token: string, input: { name: string; parentId: number | null }) => Promise<Folder>>()
const updateFolder = vi.fn<(token: string, id: number, update: FolderUpdate) => Promise<Folder>>()
const deleteFolder = vi.fn<(token: string, id: number, confirm: boolean) => Promise<FolderDeleteResult>>()
const moveNote = vi.fn<(token: string, id: number, folderId: number | null) => Promise<Note>>()
vi.mock('../apiClient', () => ({
  api: {
    listNotes: () => listNotes(),
    listFolders: () => listFolders(),
    createFolder: (token: string, input: { name: string; parentId: number | null }) => createFolder(token, input),
    updateFolder: (token: string, id: number, update: FolderUpdate) => updateFolder(token, id, update),
    deleteFolder: (token: string, id: number, confirm: boolean) => deleteFolder(token, id, confirm),
    moveNote: (token: string, id: number, folderId: number | null) => moveNote(token, id, folderId),
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

const folders: Folder[] = [
  { id: 1, parentId: null, name: 'Openings' },
  { id: 2, parentId: 1, name: 'Queen’s Gambit Declined' },
  { id: 3, parentId: null, name: 'Endgames' },
]
const summary = (id: number, name: string, folderId: number | null): NoteSummary => ({
  id,
  name,
  folderId,
  createdAt: '',
  updatedAt: '',
})
const notes = [summary(1, 'Tartakower', 2), summary(2, 'Lucena', 3), summary(3, 'At the root', null)]

function renderWithRouter(component: () => React.ReactNode, path = '/notes/1') {
  const root = createRootRoute()
  const routes = ['/notes', '/notes/new', '/notes/$noteId'].map((p) =>
    createRoute({ getParentRoute: () => root, path: p, component }),
  )
  const router = createRouter({
    routeTree: root.addChildren(routes),
    history: createMemoryHistory({ initialEntries: [path] }),
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
  return router
}

beforeEach(() => {
  vi.resetAllMocks()
  listNotes.mockResolvedValue(notes)
  listFolders.mockResolvedValue(folders)
})

describe('NoteTree', () => {
  it('opens the Folders above the open Note and highlights it', async () => {
    renderWithRouter(() => <NoteTree />)

    const open = await screen.findByRole('link', { name: 'Tartakower' })
    expect(open).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('button', { name: 'Openings' })).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('button', { name: 'Queen’s Gambit Declined' })).toHaveAttribute('aria-expanded', 'true')
    // Folders it isn't in stay closed
    expect(screen.getByRole('button', { name: 'Endgames' })).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('link', { name: 'Lucena' })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'At the root' })).toBeInTheDocument()
  })

  it('opens and closes a Folder', async () => {
    renderWithRouter(() => <NoteTree />, '/notes')
    const endgames = await screen.findByRole('button', { name: 'Endgames' })

    await userEvent.click(endgames)
    expect(screen.getByRole('link', { name: 'Lucena' })).toBeInTheDocument()

    await userEvent.click(endgames)
    expect(screen.queryByRole('link', { name: 'Lucena' })).not.toBeInTheDocument()
  })

  it('creates a subfolder inside a Folder', async () => {
    createFolder.mockResolvedValue({ id: 9, parentId: 3, name: 'Rook endings' })
    renderWithRouter(() => <NoteTree />, '/notes')

    await userEvent.click(await screen.findByRole('button', { name: 'Folder actions: Endgames' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'New subfolder' }))
    const dialog = await screen.findByRole('dialog', { name: 'New subfolder' })
    await userEvent.type(within(dialog).getByLabelText(/Folder name/), '  Rook endings ')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Create folder' }))

    expect(createFolder).toHaveBeenCalledWith('token', { name: 'Rook endings', parentId: 3 })
    // The new Folder shows, opened into its parent
    expect(await screen.findByRole('button', { name: 'Rook endings' })).toBeInTheDocument()
  })

  it('creates a Folder at the root', async () => {
    createFolder.mockResolvedValue({ id: 9, parentId: null, name: 'Concepts' })
    renderWithRouter(() => <NoteTree />, '/notes')

    await userEvent.click(await screen.findByRole('button', { name: 'New folder' }))
    const dialog = await screen.findByRole('dialog', { name: 'New folder' })
    expect(within(dialog).getByRole('button', { name: 'Create folder' })).toBeDisabled()
    await userEvent.type(within(dialog).getByLabelText(/Folder name/), 'Concepts{Enter}')

    expect(createFolder).toHaveBeenCalledWith('token', { name: 'Concepts', parentId: null })
  })

  it('moves a Folder, offering neither it nor its subfolders', async () => {
    updateFolder.mockResolvedValue({ id: 1, parentId: 3, name: 'Openings' })
    renderWithRouter(() => <NoteTree />, '/notes')

    await userEvent.click(await screen.findByRole('button', { name: 'Folder actions: Openings' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Move' }))
    const dialog = await screen.findByRole('dialog', { name: 'Move folder' })
    const choices = within(dialog)
      .getAllByRole('radio')
      .map((radio) => radio.closest('label, .mantine-Radio-root')?.textContent)
    expect(choices).toEqual(['No folder (top of Your notes)', 'Endgames'])

    await userEvent.click(within(dialog).getByLabelText('Endgames'))
    await userEvent.click(within(dialog).getByRole('button', { name: 'Move' }))
    expect(updateFolder).toHaveBeenCalledWith('token', 1, { parentId: 3 })
  })

  it('deletes a Folder once the API agrees with the counts shown', async () => {
    deleteFolder.mockImplementation(async (_token, _id, confirm) =>
      confirm ? { status: 'deleted' } : { status: 'needsConfirmation', folders: 1, notes: 1, message: '' },
    )
    renderWithRouter(() => <NoteTree />, '/notes')

    await userEvent.click(await screen.findByRole('button', { name: 'Folder actions: Openings' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Delete' }))
    const dialog = await screen.findByRole('dialog', { name: 'Delete folder' })
    expect(dialog).toHaveTextContent(
      'Openings will be deleted. Its 1 subfolder will be deleted too, and 1 note inside will move to the top of Your notes. No note is deleted.',
    )
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete folder' }))

    await waitFor(() => expect(deleteFolder).toHaveBeenCalledTimes(2))
    expect(deleteFolder.mock.calls.map((call) => call[2])).toEqual([false, true])
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('asks again when the API counts more than was shown', async () => {
    deleteFolder.mockImplementation(async (_token, _id, confirm) =>
      confirm ? { status: 'deleted' } : { status: 'needsConfirmation', folders: 0, notes: 4, message: '' },
    )
    renderWithRouter(() => <NoteTree />, '/notes')

    await userEvent.click(await screen.findByRole('button', { name: 'Folder actions: Endgames' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Delete' }))
    const dialog = await screen.findByRole('dialog', { name: 'Delete folder' })
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete folder' }))

    await waitFor(() => expect(dialog).toHaveTextContent('4 notes inside will move to the top of Your notes'))
    expect(deleteFolder).toHaveBeenCalledTimes(1)
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete folder' }))
    await waitFor(() => expect(deleteFolder).toHaveBeenLastCalledWith('token', 3, true))
  })

  it('says when there is nothing yet', async () => {
    listNotes.mockResolvedValue([])
    listFolders.mockResolvedValue([])
    renderWithRouter(() => <NoteTree />, '/notes')

    expect(await screen.findByText('No notes yet.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'New folder' })).toBeInTheDocument()
  })

  it('offers to try again when the Folders fail to load', async () => {
    listFolders.mockRejectedValueOnce(new Error('Could not load folders'))
    renderWithRouter(() => <NoteTree />, '/notes')

    await userEvent.click(await screen.findByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('button', { name: 'Openings' })).toBeInTheDocument()
  })
})

describe('NoteTree right-click menu', () => {
  it('offers a new Note or Folder on the empty space', async () => {
    const router = renderWithRouter(() => <NoteTree />, '/notes')
    await screen.findByRole('button', { name: 'Openings' })

    // The browser's own menu is held back
    expect(fireEvent.contextMenu(screen.getByRole('button', { name: 'New folder' }).parentElement!)).toBe(false)
    expect(screen.getAllByRole('menuitem').map((item) => item.textContent)).toEqual(['New note', 'New folder'])

    await userEvent.click(screen.getByRole('menuitem', { name: 'New folder' }))
    expect(await screen.findByRole('dialog', { name: 'New folder' })).toBeInTheDocument()
    await userEvent.keyboard('{Escape}')

    fireEvent.contextMenu(screen.getByRole('button', { name: 'New folder' }).parentElement!)
    await userEvent.click(await screen.findByRole('menuitem', { name: 'New note' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/notes/new'))
    expect(router.state.location.search).toEqual({})
  })

  it('offers a Folder’s actions on the Folder, and a new Note in it', async () => {
    const router = renderWithRouter(() => <NoteTree />, '/notes')

    fireEvent.contextMenu(await screen.findByRole('button', { name: 'Endgames' }))
    expect(screen.getAllByRole('menuitem').map((item) => item.textContent)).toEqual([
      'New note here',
      'New subfolder',
      'Rename',
      'Move',
      'Delete',
    ])
    await userEvent.click(screen.getByRole('menuitem', { name: 'Rename' }))
    const dialog = await screen.findByRole('dialog', { name: 'Rename folder' })
    expect(within(dialog).getByLabelText(/Folder name/)).toHaveValue('Endgames')
    await userEvent.keyboard('{Escape}')

    fireEvent.contextMenu(screen.getByRole('button', { name: 'Endgames' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'New note here' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/notes/new'))
    expect(router.state.location.search).toEqual({ folder: 3 })
  })

  it('leaves a Note the browser’s own menu', async () => {
    renderWithRouter(() => <NoteTree />, '/notes')

    expect(fireEvent.contextMenu(await screen.findByRole('link', { name: 'At the root' }))).toBe(true)
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('opens on a long-press, and the lifted finger isn’t a tap', async () => {
    renderWithRouter(() => <NoteTree />, '/notes')
    const endgames = await screen.findByRole('button', { name: 'Endgames' })
    vi.useFakeTimers()
    try {
      // A tap toggles the Folder as usual
      fireEvent.touchStart(endgames, { touches: [{ clientX: 40, clientY: 40 }] })
      vi.advanceTimersByTime(100)
      expect(fireEvent.touchEnd(endgames)).toBe(true)

      // A scroll is not a long-press
      fireEvent.touchStart(endgames, { touches: [{ clientX: 40, clientY: 40 }] })
      fireEvent.touchMove(endgames, { touches: [{ clientX: 40, clientY: 80 }] })
      vi.advanceTimersByTime(LONG_PRESS_MS)
      fireEvent.touchEnd(endgames)
      expect(screen.queryByRole('menu')).not.toBeInTheDocument()

      fireEvent.touchStart(endgames, { touches: [{ clientX: 40, clientY: 40 }] })
      vi.advanceTimersByTime(LONG_PRESS_MS)
      expect(fireEvent.touchEnd(endgames)).toBe(false)
    } finally {
      vi.useRealTimers()
    }
    expect(await screen.findByRole('menuitem', { name: 'New note here' })).toBeInTheDocument()
  })

  it('keeps the “…” menu', async () => {
    renderWithRouter(() => <NoteTree />, '/notes')

    await userEvent.click(await screen.findByRole('button', { name: 'Folder actions: Endgames' }))
    expect((await screen.findAllByRole('menuitem')).map((item) => item.textContent)).toEqual([
      'New subfolder',
      'Rename',
      'Move',
      'Delete',
    ])
  })
})

describe('MoveNoteDialog', () => {
  const note: Note = { ...summary(2, 'Lucena', 3), tags: [], startFen: null }

  it('moves a Note to the root', async () => {
    moveNote.mockResolvedValue({ ...note, folderId: null })
    const onClose = vi.fn()
    renderWithRouter(() => <MoveNoteDialog size="desktop" note={note} onClose={onClose} />)

    const dialog = await screen.findByRole('dialog', { name: 'Move note' })
    expect(await within(dialog).findByLabelText('Endgames')).toBeChecked()
    await userEvent.click(within(dialog).getByLabelText('No folder (top of Your notes)'))
    await userEvent.click(within(dialog).getByRole('button', { name: 'Move' }))

    expect(moveNote).toHaveBeenCalledWith('token', 2, null)
    await waitFor(() => expect(onClose).toHaveBeenCalled())
  })
})
