import { MantineProvider } from '@mantine/core'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMemoryHistory, createRootRoute, createRoute, createRouter, RouterProvider } from '@tanstack/react-router'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import type { NoteLinks, NoteSearchResult } from '../api'
import { NO_WRITING, type Writing } from '../chess/pgn'
import { addMove, lineAsGame, mainLine, newTree } from '../chess/tree'
import { START_FEN } from '../chess/chess'
import type { Session } from '../session'
import { SessionProvider } from '../session'
import { theme } from '../theme'
import { LinkingContext, type Linking } from './linking'
import { MoveList } from './MoveList'
import { NoteMargin } from './NoteMargin'
import { PlyEditor } from './PlyEditor'

const searchNotes = vi.fn<(token: string, query: string) => Promise<NoteSearchResult[]>>()
const getLinks = vi.fn<(token: string, id: number) => Promise<NoteLinks>>()
vi.mock('../apiClient', () => ({
  api: {
    searchNotes: (token: string, query: string) => searchNotes(token, query),
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
  forget: () => {},
  authorized: (call) => call('token'),
}

// 1.e4 e5 2.Nf3, the Position as Move 1 and each move numbered on from it.
let tree = newTree(START_FEN, 1)
for (const [parent, san] of [[1, 'e4'], [2, 'e5'], [3, 'Nf3']] as const) {
  const added = addMove(tree, parent, san, parent + 1)
  if (!added.ok) throw new Error(added.error)
  tree = added.value.tree
}
const game = lineAsGame(mainLine(tree))

function written(fields: Partial<Writing>): Writing {
  return { ...NO_WRITING, ...fields }
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
    validateSearch: z.object({ move: z.number().optional() }),
  })
  const router = createRouter({ routeTree: root.addChildren([note]), history: createMemoryHistory() })
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

beforeEach(() => {
  searchNotes.mockReset()
  getLinks.mockReset()
})

describe('Links in the writing', () => {
  it('shows the target’s current name unless the Link has a label, and opens the target', async () => {
    const writing = new Map([
      [2, written({ comment: 'See [[note:5]].' })],
      [3, written({ body: 'Black gets [[note:5|hanging pawns]] here.' })],
    ])
    renderInApp(<MoveList tree={tree} current={4} onMoveChange={() => {}} writing={writing} />)

    expect(await screen.findByRole('link', { name: 'Hanging pawns' })).toHaveAttribute('href', '/notes/5')
    expect(screen.getByRole('link', { name: 'hanging pawns' })).toHaveAttribute('href', '/notes/5')
    expect(screen.getByText(/Black gets/)).toHaveTextContent('Black gets hanging pawns here.')
  })

  it('shows a Link to a deleted Note as unresolved, keeping its label', async () => {
    const writing = new Map([[2, written({ comment: '[[note:9]] and [[note:9|the old one]]' })]])
    renderInApp(<MoveList tree={tree} current={4} onMoveChange={() => {}} writing={writing} />)

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
    const body = await screen.findByRole('textbox', { name: 'Body after 1.e4' })

    // user-event reads "[[" as one literal "[".
    await user.type(body, 'Like [[[[')
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

    await waitFor(() => expect(body).toHaveValue('Like [[note:7]]'))
    await waitFor(() => expect(body).toHaveFocus())
    await user.tab()
    expect(onSave).toHaveBeenCalledWith({ body: 'Like [[note:7]]' })
  })

  it('links from a Comment written in the move list too, saving it on Enter (#97)', async () => {
    searchNotes.mockResolvedValue([hanging])
    const onComment = vi.fn()
    const user = userEvent.setup()
    const menu = { onComment, onPromote: () => {}, onDelete: () => {} }
    renderInApp(<MoveList tree={tree} current={4} onMoveChange={() => {}} menu={menu} />)

    fireEvent.contextMenu(await screen.findByRole('button', { name: 'e4' }))
    await user.click(screen.getByRole('menuitem', { name: 'Add comment' }))
    const comment = screen.getByRole('textbox', { name: 'Comment on 1.e4' })
    await waitFor(() => expect(comment).toHaveFocus())
    expect(comment).toHaveAttribute('placeholder', 'Comment on 1.e4. Type [[ to link another note.')

    await user.type(comment, 'See [[[[')
    const search = await screen.findByRole('combobox', { name: 'Find a note to link' })
    await waitFor(() => expect(search).toHaveFocus())
    // The picker taking focus neither saves nor closes the Comment.
    expect(onComment).not.toHaveBeenCalled()
    await user.type(search, 'hang')
    await user.click(await screen.findByRole('option'))

    await waitFor(() => expect(comment).toHaveValue('See [[note:5]]'))
    await waitFor(() => expect(comment).toHaveFocus())
    await user.keyboard('{Enter}')
    expect(onComment).toHaveBeenCalledWith(2, 'See [[note:5]]')
    expect(screen.queryByRole('textbox', { name: 'Comment on 1.e4' })).not.toBeInTheDocument()
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

    await user.type(await screen.findByRole('textbox', { name: 'Body after 1.e4' }), '[[[[')
    await user.type(await screen.findByRole('combobox', { name: 'Find a note to link' }), 'this')

    expect(await screen.findByText('No other notes match “this”.')).toBeInTheDocument()
  })

  it('is not offered to a Guest', async () => {
    const user = userEvent.setup()
    renderInApp(<PlyEditor ply={game.plies[1]} writing={undefined} onSave={() => {}} />, {
      noteId: null,
      resolve: () => ({ status: 'unresolved' }),
    })
    const body = await screen.findByRole('textbox', { name: 'Body after 1.e4' })
    expect(body).toHaveAttribute('placeholder', 'Add a thought that leads to the next move.')

    await user.type(body, '[[[[')
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
  })
})

describe('Link a note… in a Move’s right-click menu (#101)', () => {
  const menuItems = () => screen.getAllByRole('menuitem').map((item) => item.textContent)
  const comment = (label: string) => screen.getByRole('textbox', { name: `Comment on ${label}` })

  function renderList(writing: ReadonlyMap<number, Writing> = new Map(), context: Linking = linking) {
    const onComment = vi.fn()
    const menu = { onComment, onPromote: () => {}, onDelete: () => {} }
    renderInApp(<MoveList tree={tree} current={4} onMoveChange={() => {}} writing={writing} menu={menu} />, context)
    return onComment
  }

  async function linkFrom(san: string, user: ReturnType<typeof userEvent.setup>) {
    fireEvent.contextMenu(await screen.findByRole('button', { name: san }))
    await user.click(screen.getByRole('menuitem', { name: 'Link a note…' }))
    const search = await screen.findByRole('combobox', { name: 'Find a note to link' })
    await waitFor(() => expect(search).toHaveFocus())
    return search
  }

  it('sits under Add comment or Edit comment, whether or not the Move has a Comment', async () => {
    renderList(new Map([[3, written({ comment: 'Symmetry.' })]]))

    fireEvent.contextMenu(await screen.findByRole('button', { name: 'e4' }))
    expect(menuItems()).toEqual(['Add comment', 'Link a note…', 'Promote to main line', 'Delete from here'])
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('menuitem')).not.toBeInTheDocument())

    fireEvent.contextMenu(screen.getByRole('button', { name: 'e5' }))
    expect(menuItems()).toEqual(['Edit comment', 'Link a note…', 'Promote to main line', 'Delete from here'])
  })

  it('is hidden for a Guest or in an unsaved Note', async () => {
    renderList(new Map(), { noteId: null, resolve: () => ({ status: 'unresolved' }) })

    fireEvent.contextMenu(await screen.findByRole('button', { name: 'e4' }))
    expect(menuItems()).toEqual(['Add comment', 'Promote to main line', 'Delete from here'])
  })

  it('opens the Comment editor with the picker, and inserts the Link without saving it', async () => {
    searchNotes.mockResolvedValue([hanging])
    const user = userEvent.setup()
    const onComment = renderList()

    const search = await linkFrom('e4', user)
    expect(comment('1.e4')).toHaveValue('')
    await user.type(search, 'hang')
    await user.click(await screen.findByRole('option'))

    await waitFor(() => expect(comment('1.e4')).toHaveValue('[[note:5]]'))
    await waitFor(() => expect(comment('1.e4')).toHaveFocus())
    expect(comment('1.e4')).toHaveProperty('selectionStart', '[[note:5]]'.length)
    expect(onComment).not.toHaveBeenCalled()
    await user.keyboard('{Enter}')
    expect(onComment).toHaveBeenCalledWith(2, '[[note:5]]')
  })

  it('puts the Link at the end of the Comment, after a space unless it ends in whitespace', async () => {
    searchNotes.mockResolvedValue([hanging])
    const user = userEvent.setup()
    const onComment = renderList(
      new Map([
        [2, written({ comment: 'Best by test.' })],
        [3, written({ comment: 'Symmetry.\n' })],
      ]),
    )

    await user.type(await linkFrom('e4', user), 'hang')
    await screen.findByRole('option')
    await user.click(screen.getByRole('textbox', { name: /^Label/ }))
    await user.keyboard('the pawns{Enter}')
    await waitFor(() => expect(comment('1.e4')).toHaveValue('Best by test. [[note:5|the pawns]]'))
    await waitFor(() => expect(comment('1.e4')).toHaveFocus())
    expect(comment('1.e4')).toHaveProperty('selectionStart', 'Best by test. [[note:5|the pawns]]'.length)
    await user.keyboard('{Enter}')
    expect(onComment).toHaveBeenLastCalledWith(2, 'Best by test. [[note:5|the pawns]]')

    await user.type(await linkFrom('e5', user), 'hang')
    await user.click(await screen.findByRole('option'))
    await waitFor(() => expect(comment('1…e5')).toHaveValue('Symmetry.\n[[note:5]]'))
  })

  it('Escape closes only the picker, leaving the editor open with its draft', async () => {
    searchNotes.mockResolvedValue([hanging])
    const user = userEvent.setup()
    const onComment = renderList(new Map([[2, written({ comment: 'Best by test.' })]]))

    await user.type(await linkFrom('e4', user), 'hang{Escape}')

    await waitFor(() => expect(screen.queryByRole('combobox')).not.toBeInTheDocument())
    expect(comment('1.e4')).toHaveValue('Best by test.')
    await waitFor(() => expect(comment('1.e4')).toHaveFocus())
    expect(onComment).not.toHaveBeenCalled()
  })

  it('saves nothing when the editor of a Move without a Comment closes empty', async () => {
    const user = userEvent.setup()
    const onComment = renderList()

    await linkFrom('e4', user)
    await user.keyboard('{Escape}')
    await waitFor(() => expect(comment('1.e4')).toHaveFocus())
    await user.keyboard('{Enter}')

    expect(screen.queryByRole('textbox', { name: 'Comment on 1.e4' })).not.toBeInTheDocument()
    expect(onComment).not.toHaveBeenCalled()
  })

  it('saves the draft on another Move first, then opens this Move’s editor with the picker', async () => {
    searchNotes.mockResolvedValue([hanging])
    const user = userEvent.setup()
    const onComment = renderList()

    fireEvent.contextMenu(await screen.findByRole('button', { name: 'Nf3' }))
    await user.click(screen.getByRole('menuitem', { name: 'Add comment' }))
    await waitFor(() => expect(comment('2.Nf3')).toHaveFocus())
    await user.type(comment('2.Nf3'), 'Develops.')

    await linkFrom('e4', user)
    expect(onComment).toHaveBeenCalledWith(4, 'Develops.')
    expect(screen.queryByRole('textbox', { name: 'Comment on 2.Nf3' })).not.toBeInTheDocument()
    expect(comment('1.e4')).toBeInTheDocument()
  })
})

describe('NoteMargin', () => {
  it('lists Connections in reading order and Backlinks opening their Move', async () => {
    const writing = [written({ body: '[[note:6|club]] and [[note:5]]' }), written({ comment: '[[note:9]]', body: '[[note:5]]' })]
    getLinks.mockResolvedValue({
      targets: [hanging, club1],
      backlinks: [
        { noteId: 7, name: 'Club night', startFen: null, moveId: 321, san: 'exd5', ply: 20, part: 'comment' },
        { noteId: 8, name: 'An ending', startFen: null, moveId: 40, san: null, ply: 0, part: 'body' },
      ],
    })
    renderInApp(<NoteMargin noteId={1} writing={writing} />)

    const connections = await screen.findByRole('region', { name: 'Connections' })
    await waitFor(() => expect(within(connections).getAllByRole('listitem')).toHaveLength(3))
    expect(within(connections).getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      'Club nightLovelace, Ada v. Hopper, Grace · 1952.03.01',
      'Hanging pawns',
      'Deleted noteDeleted. Its links stay in the text, unresolved.',
    ])

    const linkedFrom = screen.getByRole('region', { name: 'Linked from' })
    expect(within(linkedFrom).getByRole('link', { name: 'Club night' })).toHaveAttribute('href', '/notes/7?move=321')
    expect(within(linkedFrom).getByText('Comment on 10…exd5')).toBeInTheDocument()
    expect(within(linkedFrom).getByText('Body opening the note')).toBeInTheDocument()
  })

  it('says when there are no Links either way', async () => {
    getLinks.mockResolvedValue({ targets: [], backlinks: [] })
    renderInApp(<NoteMargin noteId={1} writing={[]} />)

    expect(await screen.findByText(/No links yet/)).toBeInTheDocument()
    expect(screen.getByText('No other note links here yet.')).toBeInTheDocument()
  })
})
