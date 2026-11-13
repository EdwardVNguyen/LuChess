import { MantineProvider } from '@mantine/core'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMemoryHistory, createRootRoute, createRoute, createRouter, RouterProvider } from '@tanstack/react-router'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Folder, FolderDeleteResult, FolderUpdate, NewNoteInput, Note, NoteSummary } from '../api'
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
const renameNote = vi.fn<(token: string, id: number, name: string) => Promise<Note>>()
const deleteNote = vi.fn<(token: string, id: number) => Promise<void>>()
const createNote = vi.fn<(token: string, input: NewNoteInput) => Promise<Note>>()
vi.mock('../apiClient', () => ({
  api: {
    createNote: (token: string, input: NewNoteInput) => createNote(token, input),
    listNotes: () => listNotes(),
    listFolders: () => listFolders(),
    createFolder: (token: string, input: { name: string; parentId: number | null }) => createFolder(token, input),
    updateFolder: (token: string, id: number, update: FolderUpdate) => updateFolder(token, id, update),
    deleteFolder: (token: string, id: number, confirm: boolean) => deleteFolder(token, id, confirm),
    moveNote: (token: string, id: number, folderId: number | null) => moveNote(token, id, folderId),
    renameNote: (token: string, id: number, name: string) => renameNote(token, id, name),
    deleteNote: (token: string, id: number) => deleteNote(token, id),
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
  const routes = ['/notes', '/notes/import', '/notes/$noteId'].map((p) =>
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
  createNote.mockImplementation(async (_token, input) => ({
    id: 9,
    name: input.name,
    folderId: input.folderId ?? null,
    tags: input.tags,
    startFen: input.startFen,
    createdAt: '',
    updatedAt: '',
  }))
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
    // A Note in a Folder is open, but New note here files at the root.
    const router = renderWithRouter(() => <NoteTree />, '/notes/1')
    await screen.findByRole('button', { name: 'Openings' })

    // The browser's own menu is held back
    expect(fireEvent.contextMenu(screen.getByRole('button', { name: 'New folder' }).parentElement!)).toBe(false)
    expect(screen.getAllByRole('menuitem').map((item) => item.textContent)).toEqual(['New note', 'Import…', 'New folder'])

    await userEvent.click(screen.getByRole('menuitem', { name: 'New folder' }))
    expect(await screen.findByRole('dialog', { name: 'New folder' })).toBeInTheDocument()
    await userEvent.keyboard('{Escape}')

    fireEvent.contextMenu(screen.getByRole('button', { name: 'New folder' }).parentElement!)
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Import…' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/notes/import'))
    expect(router.state.location.search).toEqual({})

    fireEvent.contextMenu(screen.getByRole('button', { name: 'New folder' }).parentElement!)
    await userEvent.click(await screen.findByRole('menuitem', { name: 'New note' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/notes/9'))
    expect(createNote).toHaveBeenCalledTimes(1)
    expect(createNote.mock.calls[0][1]).toMatchObject({ name: 'Untitled', folderId: null, moves: [] })
  })

  it('offers a Folder’s actions on the Folder, and a new Note in it', async () => {
    const router = renderWithRouter(() => <NoteTree />, '/notes')

    fireEvent.contextMenu(await screen.findByRole('button', { name: 'Endgames' }))
    expect(screen.getAllByRole('menuitem').map((item) => item.textContent)).toEqual([
      'New note here',
      'Import here…',
      'New subfolder',
      'Rename',
      'Move',
      'Delete',
    ])
    await userEvent.click(screen.getByRole('menuitem', { name: 'Rename' }))
    expect(await screen.findByRole('textbox', { name: 'Rename folder Endgames' })).toHaveValue('Endgames')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await userEvent.keyboard('{Escape}')

    fireEvent.contextMenu(screen.getByRole('button', { name: 'Endgames' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Import here…' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/notes/import'))
    expect(router.state.location.search).toEqual({ folder: 3 })

    fireEvent.contextMenu(screen.getByRole('button', { name: 'Endgames' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'New note here' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/notes/9'))
    expect(createNote.mock.calls[0][1]).toMatchObject({ name: 'Untitled', folderId: 3, moves: [] })
  })

  it('offers a Note’s actions on the Note, in place of the browser’s menu', async () => {
    renderWithRouter(() => <NoteTree />, '/notes')
    const note = await screen.findByRole('link', { name: 'At the root' })

    expect(fireEvent.contextMenu(note)).toBe(false)
    expect(screen.getAllByRole('menuitem').map((item) => item.textContent)).toEqual(['Rename', 'Move to folder', 'Delete'])
    expect(note).toHaveAttribute('data-menu-open')
  })

  it('opens a Note’s menu on a long-press, without opening the Note', async () => {
    const router = renderWithRouter(() => <NoteTree />, '/notes')
    const note = await screen.findByRole('link', { name: 'At the root' })
    vi.useFakeTimers()
    try {
      fireEvent.touchStart(note, { touches: [{ clientX: 40, clientY: 40 }] })
      vi.advanceTimersByTime(LONG_PRESS_MS)
      expect(fireEvent.touchEnd(note)).toBe(false)
    } finally {
      vi.useRealTimers()
    }
    expect(await screen.findByRole('menuitem', { name: 'Move to folder' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/notes')
  })

  it('moves a Note to a Folder with the Move note dialog', async () => {
    moveNote.mockResolvedValue({ ...summary(3, 'At the root', 3), tags: [], startFen: null })
    renderWithRouter(() => <NoteTree />, '/notes')

    fireEvent.contextMenu(await screen.findByRole('link', { name: 'At the root' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Move to folder' }))
    const dialog = await screen.findByRole('dialog', { name: 'Move note' })
    expect(within(dialog).getByLabelText('No folder (top of Your notes)')).toBeChecked()
    await userEvent.click(within(dialog).getByLabelText('Endgames'))
    await userEvent.click(within(dialog).getByRole('button', { name: 'Move' }))

    expect(moveNote).toHaveBeenCalledWith('token', 3, 3)
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    // It is now filed in Endgames, not at the root
    expect(screen.queryByRole('link', { name: 'At the root' })).not.toBeInTheDocument()
  })

  it('deletes another Note after confirming, and stays on the open one', async () => {
    deleteNote.mockResolvedValue()
    const router = renderWithRouter(() => <NoteTree />, '/notes/1')

    fireEvent.contextMenu(await screen.findByRole('link', { name: 'At the root' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Delete' }))
    const dialog = await screen.findByRole('dialog', { name: 'Delete note' })
    expect(deleteNote).not.toHaveBeenCalled()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete note' }))

    expect(deleteNote).toHaveBeenCalledWith('token', 3)
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(screen.queryByRole('link', { name: 'At the root' })).not.toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/notes/1')
  })

  it('leaves for the list of Notes after deleting the open one', async () => {
    deleteNote.mockResolvedValue()
    const router = renderWithRouter(() => <NoteTree />, '/notes/3')

    fireEvent.contextMenu(await screen.findByRole('link', { name: 'At the root' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Delete' }))
    const dialog = await screen.findByRole('dialog', { name: 'Delete note' })
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete note' }))

    await waitFor(() => expect(router.state.location.pathname).toBe('/notes'))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
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

describe('NoteTree inline rename', () => {
  const renamed = (id: number, name: string, folderId: number | null): Note => ({
    ...summary(id, name, folderId),
    tags: [],
    startFen: null,
  })

  it('renames a Note from its menu: Enter saves, and focus goes back to the row', async () => {
    renameNote.mockResolvedValue(renamed(3, 'Opposition', null))
    renderWithRouter(() => <NoteTree />, '/notes')

    fireEvent.contextMenu(await screen.findByRole('link', { name: 'At the root' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Rename' }))
    const field = await screen.findByRole('textbox', { name: 'Rename note At the root' })
    expect(field).toHaveFocus()
    expect(field).toHaveAttribute('maxLength', '200')
    // The row is the field now, not a link
    expect(screen.queryByRole('link', { name: 'At the root' })).not.toBeInTheDocument()

    await userEvent.clear(field)
    await userEvent.type(field, '  Opposition {Enter}')

    expect(renameNote).toHaveBeenCalledWith('token', 3, 'Opposition')
    const row = await screen.findByRole('link', { name: 'Opposition' })
    await waitFor(() => expect(row).toHaveFocus())
  })

  it('renames a Note on a double-click, and saves when the field is left', async () => {
    renameNote.mockResolvedValue(renamed(3, 'Opposition', null))
    const router = renderWithRouter(() => <NoteTree />, '/notes')

    await userEvent.dblClick(await screen.findByRole('link', { name: 'At the root' }))
    // The first click opened the Note, as a single click does
    expect(router.state.location.pathname).toBe('/notes/3')
    const field = await screen.findByRole('textbox', { name: 'Rename note At the root' })
    await userEvent.clear(field)
    await userEvent.type(field, 'Opposition')
    await userEvent.click(screen.getByRole('button', { name: 'New folder' }))

    expect(renameNote).toHaveBeenCalledWith('token', 3, 'Opposition')
    expect(await screen.findByRole('link', { name: 'Opposition' })).toBeInTheDocument()
  })

  it('renames a Folder on a double-click, leaving it as open as it was', async () => {
    updateFolder.mockResolvedValue({ id: 3, parentId: null, name: 'Endings' })
    renderWithRouter(() => <NoteTree />, '/notes')

    await userEvent.dblClick(await screen.findByRole('button', { name: 'Endgames' }))
    const field = await screen.findByRole('textbox', { name: 'Rename folder Endgames' })
    expect(screen.queryByRole('link', { name: 'Lucena' })).not.toBeInTheDocument()
    await userEvent.clear(field)
    await userEvent.type(field, 'Endings{Enter}')

    expect(updateFolder).toHaveBeenCalledWith('token', 3, { name: 'Endings' })
    expect(await screen.findByRole('button', { name: 'Endings' })).toHaveAttribute('aria-expanded', 'false')
  })

  it('renames a Folder in place from its “…” menu', async () => {
    updateFolder.mockResolvedValue({ id: 3, parentId: null, name: 'Endings' })
    renderWithRouter(() => <NoteTree />, '/notes')

    await userEvent.click(await screen.findByRole('button', { name: 'Folder actions: Endgames' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Rename' }))
    const field = await screen.findByRole('textbox', { name: 'Rename folder Endgames' })
    await waitFor(() => expect(field).toHaveFocus())
    await userEvent.clear(field)
    await userEvent.type(field, 'Endings{Enter}')

    expect(updateFolder).toHaveBeenCalledWith('token', 3, { name: 'Endings' })
    expect(await screen.findByRole('button', { name: 'Endings' })).toBeInTheDocument()
  })

  it('cancels on Escape, and on an empty or unchanged name', async () => {
    renderWithRouter(() => <NoteTree />, '/notes')
    const rename = async () => {
      await userEvent.dblClick(await screen.findByRole('button', { name: 'Endgames' }))
      return screen.findByRole('textbox', { name: 'Rename folder Endgames' })
    }

    await userEvent.type(await rename(), ' changed{Escape}')
    expect(await screen.findByRole('button', { name: 'Endgames' })).toHaveFocus()

    const field = await rename()
    await userEvent.clear(field)
    await userEvent.type(field, '   {Enter}')
    expect(await screen.findByRole('button', { name: 'Endgames' })).toBeInTheDocument()

    await userEvent.type(await rename(), '{Enter}')
    expect(await screen.findByRole('button', { name: 'Endgames' })).toBeInTheDocument()

    expect(updateFolder).not.toHaveBeenCalled()
  })

  it('keeps the field open with the error when the save fails', async () => {
    renameNote.mockRejectedValueOnce(new Error('Could not rename the note'))
    renameNote.mockResolvedValueOnce(renamed(3, 'Opposition', null))
    renderWithRouter(() => <NoteTree />, '/notes')

    fireEvent.contextMenu(await screen.findByRole('link', { name: 'At the root' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Rename' }))
    const field = await screen.findByRole('textbox', { name: 'Rename note At the root' })
    await userEvent.clear(field)
    await userEvent.type(field, 'Opposition{Enter}')

    expect(await screen.findByText('Could not rename the note')).toBeInTheDocument()
    expect(field).toHaveValue('Opposition')

    await userEvent.type(field, '{Enter}')
    expect(await screen.findByRole('link', { name: 'Opposition' })).toBeInTheDocument()
    expect(renameNote).toHaveBeenCalledTimes(2)
  })

  it('keeps the browser’s own menu in the field', async () => {
    renderWithRouter(() => <NoteTree />, '/notes')

    await userEvent.dblClick(await screen.findByRole('button', { name: 'Endgames' }))
    const field = await screen.findByRole('textbox', { name: 'Rename folder Endgames' })
    expect(fireEvent.contextMenu(field)).toBe(true)
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })
})
