import { MantineProvider } from '@mantine/core'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMemoryHistory, createRootRoute, createRoute, createRouter, RouterProvider } from '@tanstack/react-router'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import type { NoteLinks, NoteSearchResult, PlyWriting } from '../api'
import { gameFromMoves, START_FEN } from '../chess/chess'
import type { Session } from '../session'
import { SessionProvider } from '../session'
import { theme } from '../theme'
import { LinkingContext, type Linking } from './linking'
import { MoveList } from './MoveList'
import { NoteMargin } from './NoteMargin'
import { PlyEditor } from './PlyEditor'

const searchNotes = vi.fn<(token: string, query: string) => Promise<NoteSearchResult[]>>()
const listPlies = vi.fn<(token: string, id: number) => Promise<PlyWriting[]>>()
const getLinks = vi.fn<(token: string, id: number) => Promise<NoteLinks>>()
vi.mock('../apiClient', () => ({
  api: {
    searchNotes: (token: string, query: string) => searchNotes(token, query),
    listPlies: (token: string, id: number) => listPlies(token, id),
    getLinks: (token: string, id: number) => getLinks(token, id),
  },
}))

// One object: the Session's state is read as an external store snapshot.
const signedIn = { status: 'authenticated', user: { id: 1, email: 'ada@example.com', name: 'Ada' } } as const
const session: Session = {
  getState: () => signedIn,
  subscribe: () => () => {},
  restore: async () => {},
  signIn: async () => ({ id: 1, email: 'ada@example.com', name: 'Ada' }),
  signOut: async () => {},
  authorized: (call) => call('token'),
}

const result = gameFromMoves(START_FEN, ['e4', 'e5', 'Nf3'])
if (!result.ok) throw new Error(result.error)
const game = result.value

function written(ply: number, fields: Partial<PlyWriting>): PlyWriting {
  return { ply, comment: null, body: null, moveGlyph: null, positionGlyph: null, updatedAt: '', ...fields }
}

const hanging: NoteSearchResult = { id: 5, name: 'Hanging pawns', white: null, black: null, date: null, folderPath: [] }
const club1: NoteSearchResult = { id: 6, name: 'Club night', white: 'Lovelace, Ada', black: 'Hopper, Grace', date: '1952.03.01', folderPath: [] }
const club2: NoteSearchResult = { id: 7, name: 'Club night', white: 'Babbage, Charles', black: 'Lovelace, Ada', date: null, folderPath: [] }

const linking: Linking = {
  noteId: 1,
  resolve: (target) =>
    target === 5 ? { status: 'resolved', name: 'Hanging pawns' } : target === 9 ? { status: 'unresolved' } : { status: 'unknown' },
}

function renderInApp(ui: ReactNode, context: Linking = linking) {
  const root = createRootRoute({ component: () => <LinkingContext value={context}>{ui}</LinkingContext> })
  const note = createRoute({
    getParentRoute: () => root,
    path: '/notes/$noteId',
    validateSearch: z.object({ ply: z.number().optional() }),
  })
  const router = createRouter({ routeTree: root.addChildren([note]), history: createMemoryHistory() })
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

beforeEach(() => {
  searchNotes.mockReset()
  listPlies.mockReset()
  getLinks.mockReset()
})

describe('Links in the writing', () => {
  it('shows the target’s current name unless the Link has a label, and opens the target', async () => {
    const writing = new Map([
      [1, written(1, { comment: 'See [[note:5]].' })],
      [2, written(2, { body: 'Black gets [[note:5|hanging pawns]] here.' })],
    ])
    renderInApp(<MoveList game={game} ply={3} onPlyChange={() => {}} writing={writing} />)

    expect(await screen.findByRole('link', { name: 'Hanging pawns' })).toHaveAttribute('href', '/notes/5')
    expect(screen.getByRole('link', { name: 'hanging pawns' })).toHaveAttribute('href', '/notes/5')
    expect(screen.getByText(/Black gets/)).toHaveTextContent('Black gets hanging pawns here.')
  })

  it('shows a Link to a deleted Note as unresolved, keeping its label', async () => {
    const writing = new Map([[1, written(1, { comment: '[[note:9]] and [[note:9|the old one]]' })]])
    renderInApp(<MoveList game={game} ply={3} onPlyChange={() => {}} writing={writing} />)

    expect(await screen.findByText('Deleted note')).toHaveAttribute('title', 'The note this linked to was deleted')
    expect(screen.getByText('the old one')).toHaveTextContent('the old one (deleted note)')
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })
})

describe('Inserting a Link', () => {
  function renderEditor(onSave = vi.fn()) {
    renderInApp(<PlyEditor ply={game.plies[1]} writing={undefined} onSave={onSave} />)
    return onSave
  }

  it('opens the picker on [[ and inserts the chosen Note, told apart from a same-named one', async () => {
    searchNotes.mockResolvedValue([club1, club2])
    const user = userEvent.setup()
    const onSave = renderEditor()
    const comment = await screen.findByRole('textbox', { name: 'Comment on 1.e4' })

    // user-event reads "[[" as one literal "[".
    await user.type(comment, 'Like [[[[')
    const search = await screen.findByRole('combobox', { name: 'Find a note to link' })
    await waitFor(() => expect(search).toHaveFocus())
    expect(onSave).not.toHaveBeenCalled()

    await user.type(search, 'club')
    const options = await screen.findAllByRole('option')
    expect(options.map((o) => o.textContent)).toEqual([
      'Club nightLovelace, Ada v. Hopper, Grace · 1952.03.01',
      'Club nightBabbage, Charles v. Lovelace, Ada',
    ])
    await user.click(options[1])

    await waitFor(() => expect(comment).toHaveValue('Like [[note:7]]'))
    await waitFor(() => expect(comment).toHaveFocus())
    await user.tab()
    expect(onSave).toHaveBeenCalledWith({ comment: 'Like [[note:7]]' })
  })

  it('inserts a Link with a label from the keyboard', async () => {
    searchNotes.mockResolvedValue([hanging])
    const user = userEvent.setup()
    renderEditor()
    const body = await screen.findByRole('textbox', { name: 'Body after 1.e4' })

    await user.type(body, '[[[[')
    const search = await screen.findByRole('combobox', { name: 'Find a note to link' })
    await waitFor(() => expect(search).toHaveFocus())
    await user.type(search, 'hang')
    await screen.findByRole('option')
    await user.click(screen.getByRole('textbox', { name: /^Label/ }))
    await user.keyboard('the pawns{Enter}')

    await waitFor(() => expect(body).toHaveValue('[[note:5|the pawns]]'))
  })

  it('leaves out the Note being written on', async () => {
    searchNotes.mockResolvedValue([{ ...hanging, id: 1, name: 'This note' }])
    const user = userEvent.setup()
    renderEditor()

    await user.type(await screen.findByRole('textbox', { name: 'Comment on 1.e4' }), '[[[[')
    await user.type(await screen.findByRole('combobox', { name: 'Find a note to link' }), 'this')

    expect(await screen.findByText('No other notes match “this”.')).toBeInTheDocument()
  })

  it('is not offered to a Guest', async () => {
    const user = userEvent.setup()
    renderInApp(<PlyEditor ply={game.plies[1]} writing={undefined} onSave={() => {}} />, {
      noteId: null,
      resolve: () => ({ status: 'unresolved' }),
    })
    const comment = await screen.findByRole('textbox', { name: 'Comment on 1.e4' })
    expect(comment).toHaveAttribute('placeholder', 'Comment on 1.e4.')

    await user.type(comment, '[[[[')
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
  })
})

describe('NoteMargin', () => {
  it('lists Connections in reading order and Backlinks opening their Ply', async () => {
    listPlies.mockResolvedValue([
      written(4, { comment: '[[note:9]]', body: '[[note:5]]' }),
      written(0, { body: '[[note:6|club]] and [[note:5]]' }),
    ])
    getLinks.mockResolvedValue({
      targets: [hanging, club1],
      backlinks: [
        { noteId: 7, name: 'Club night', startFen: null, ply: 20, part: 'comment' },
        { noteId: 8, name: 'An ending', startFen: null, ply: 0, part: 'body' },
      ],
    })
    renderInApp(<NoteMargin noteId={1} />)

    const connections = await screen.findByRole('region', { name: 'Connections' })
    await waitFor(() => expect(within(connections).getAllByRole('listitem')).toHaveLength(3))
    expect(within(connections).getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      'Club nightLovelace, Ada v. Hopper, Grace · 1952.03.01',
      'Hanging pawns',
      'Deleted noteDeleted. Its links stay in the text, unresolved.',
    ])

    const linkedFrom = screen.getByRole('region', { name: 'Linked from' })
    expect(within(linkedFrom).getByRole('link', { name: 'Club night' })).toHaveAttribute('href', '/notes/7?ply=20')
    expect(within(linkedFrom).getByText('Comment on move 10…')).toBeInTheDocument()
    expect(within(linkedFrom).getByText('Body opening the note')).toBeInTheDocument()
  })

  it('says when there are no Links either way', async () => {
    listPlies.mockResolvedValue([])
    getLinks.mockResolvedValue({ targets: [], backlinks: [] })
    renderInApp(<NoteMargin noteId={1} />)

    expect(await screen.findByText(/No links yet/)).toBeInTheDocument()
    expect(screen.getByText('No other note links here yet.')).toBeInTheDocument()
  })
})
