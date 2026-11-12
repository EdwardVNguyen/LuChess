import { MantineProvider } from '@mantine/core'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMemoryHistory, createRootRoute, createRoute, createRouter, RouterProvider } from '@tanstack/react-router'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import type { Folder, NewNoteInput, Note } from '../api'
import type { Session } from '../session'
import { SessionProvider } from '../session'
import { theme } from '../theme'
import { NewNotePage } from './NewNotePage'

const listFolders = vi.fn<() => Promise<Folder[]>>()
const createNote = vi.fn<(token: string, input: NewNoteInput) => Promise<Note>>()
vi.mock('../apiClient', () => ({
  api: {
    listFolders: () => listFolders(),
    createNote: (token: string, input: NewNoteInput) => createNote(token, input),
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

function renderAt(path: string) {
  const root = createRootRoute()
  const routes = [
    createRoute({
      getParentRoute: () => root,
      path: '/notes/new',
      validateSearch: z.object({ folder: z.number().optional() }),
      component: NewNotePage,
    }),
    createRoute({ getParentRoute: () => root, path: '/notes/$noteId', component: () => 'Created' }),
  ]
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
}

async function createWithPgn() {
  await userEvent.click(await screen.findByRole('textbox', { name: 'PGN' }))
  await userEvent.paste('1. e4 e5 *')
  await userEvent.type(screen.getByRole('textbox', { name: 'Name' }), 'Open game')
  await userEvent.click(screen.getByRole('button', { name: 'Create note' }))
}

beforeEach(() => {
  vi.resetAllMocks()
  listFolders.mockResolvedValue(folders)
  createNote.mockImplementation(async (_token, input) => ({
    id: 7,
    name: input.name,
    folderId: input.folderId ?? null,
    tags: input.tags,
    startFen: input.startFen,
    createdAt: '',
    updatedAt: '',
  }))
})

describe('NewNotePage', () => {
  it('files the Note in the Folder it was opened from', async () => {
    renderAt('/notes/new?folder=2')

    await waitFor(() =>
      expect(screen.getByLabelText('Folder', { selector: 'input' })).toHaveValue('Openings / Queen’s Gambit Declined'),
    )
    await createWithPgn()

    await waitFor(() => expect(createNote).toHaveBeenCalled())
    expect(createNote.mock.calls[0][1]).toMatchObject({
      name: 'Open game',
      folderId: 2,
      moves: [
        { parent: null, san: 'e4' },
        { parent: 0, san: 'e5' },
      ],
    })
  })

  it('files the Note at the root otherwise', async () => {
    renderAt('/notes/new')

    expect(await screen.findByLabelText('Folder', { selector: 'input' })).toHaveValue('No folder (top of Your notes)')
    await createWithPgn()

    await waitFor(() => expect(createNote).toHaveBeenCalled())
    expect(createNote.mock.calls[0][1]).toMatchObject({ folderId: null })
  })
})
