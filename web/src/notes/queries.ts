import { keepPreviousData, useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { ApiError, type Folder, type FolderUpdate, type MoveRow, type NewNoteInput, type Note, type NoteSummary } from '../api'
import { api } from '../apiClient'
import type { MoveId } from '../chess/tree'
import { useSession } from '../session'
import { mergeWriting, writingOf, type WritingChange } from './writing'

// Every Note call goes through the Session, so an expired access token is
// refreshed once instead of failing. Cached Notes are cleared when the
// Session ends (main.tsx).
const keys = {
  list: ['notes'] as const,
  searches: ['notes', 'search'] as const,
  search: (query: string) => ['notes', 'search', query] as const,
  note: (id: number) => ['notes', id] as const,
  moves: (id: number) => ['notes', id, 'moves'] as const,
  links: (id: number) => ['notes', id, 'links'] as const,
  folders: ['folders'] as const,
}

// A save, rename or delete can change any Note's Links: the names they show,
// whether they resolve, and the Backlinks of the Notes they point at.
function invalidateLinks(queryClient: QueryClient) {
  void queryClient.invalidateQueries({ predicate: (query) => query.queryKey[0] === 'notes' && query.queryKey[2] === 'links' })
}

export function useNoteList() {
  const { state, authorized } = useSession()
  return useQuery({
    queryKey: keys.list,
    queryFn: () => authorized((token) => api.listNotes(token)),
    enabled: state.status === 'authenticated',
  })
}

/** Pass the query already trimmed and debounced; a blank query asks nothing. */
export function useNoteSearch(query: string) {
  const { state, authorized } = useSession()
  return useQuery({
    queryKey: keys.search(query),
    queryFn: () => authorized((token) => api.searchNotes(token, query)),
    enabled: state.status === 'authenticated' && query !== '',
    // Keep the last results on screen while the next keystroke's arrive.
    placeholderData: keepPreviousData,
  })
}

export function useNote(id: number) {
  const { state, authorized } = useSession()
  return useQuery({
    queryKey: keys.note(id),
    queryFn: () => authorized((token) => api.getNote(token, id)),
    enabled: state.status === 'authenticated',
    // A missing Note stays missing; asking again only delays the message.
    retry: (failures, error) => !(error instanceof ApiError && error.status === 404) && failures < 2,
  })
}

function summary(note: Note): NoteSummary {
  return { id: note.id, name: note.name, folderId: note.folderId, createdAt: note.createdAt, updatedAt: note.updatedAt }
}

function putFirst(list: NoteSummary[] | undefined, note: Note): NoteSummary[] | undefined {
  return list && [summary(note), ...list.filter((other) => other.id !== note.id)]
}

export function useCreateNote() {
  const { authorized } = useSession()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: NewNoteInput) => authorized((token) => api.createNote(token, input)),
    onSuccess: (note) => {
      queryClient.setQueryData(keys.note(note.id), note)
      queryClient.setQueryData<NoteSummary[]>(keys.list, (list) => putFirst(list, note))
      void queryClient.invalidateQueries({ queryKey: keys.searches })
    },
  })
}

export function useRenameNote(id: number) {
  const { authorized } = useSession()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (name: string) => authorized((token) => api.renameNote(token, id, name)),
    onSuccess: (note) => {
      queryClient.setQueryData(keys.note(note.id), note)
      queryClient.setQueryData<NoteSummary[]>(keys.list, (list) => putFirst(list, note))
      void queryClient.invalidateQueries({ queryKey: keys.searches })
      invalidateLinks(queryClient)
    },
  })
}

export function useDeleteNote(id: number) {
  const { authorized } = useSession()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => authorized((token) => api.deleteNote(token, id)),
    onSuccess: () => {
      queryClient.setQueryData<NoteSummary[]>(keys.list, (list) => list?.filter((note) => note.id !== id))
      queryClient.removeQueries({ queryKey: keys.note(id), exact: true })
      void queryClient.invalidateQueries({ queryKey: keys.searches })
      invalidateLinks(queryClient)
    },
  })
}

/** A Note's tree of Moves with their writing, as rows: the root first, siblings in order. */
export function useMoves(noteId: number) {
  const { state, authorized } = useSession()
  return useQuery({
    queryKey: keys.moves(noteId),
    queryFn: () => authorized((token) => api.listMoves(token, noteId)),
    enabled: state.status === 'authenticated',
    retry: (failures, error) => !(error instanceof ApiError && error.status === 404) && failures < 2,
  })
}

// Edits to one Note's tree and writing run one at a time, in order, so a save
// cannot land on a Move a delete has just removed.
const movesScope = (noteId: number) => ({ id: `moves-${noteId}` })

// Any edit touches the Note, which moves it to the top of the list.
function touched(queryClient: QueryClient) {
  void queryClient.invalidateQueries({ queryKey: keys.list, exact: true })
}

export function useSaveWriting(noteId: number) {
  const { authorized } = useSession()
  const queryClient = useQueryClient()
  return useMutation({
    scope: movesScope(noteId),
    mutationFn: ({ move, ...change }: WritingChange) => {
      const saved = queryClient.getQueryData<MoveRow[]>(keys.moves(noteId))?.find((row) => row.id === move)
      return authorized((token) => api.putWriting(token, noteId, move, mergeWriting(saved && writingOf(saved), change)))
    },
    onSuccess: (written) => {
      queryClient.setQueryData<MoveRow[]>(keys.moves(noteId), (rows) => rows?.map((row) => (row.id === written.id ? written : row)))
      touched(queryClient)
      invalidateLinks(queryClient)
    },
  })
}

/** Plays a Move after a Move or the Position; the API answers the existing Move for a SAN already played there. */
export function useAddMove(noteId: number) {
  const { authorized } = useSession()
  const queryClient = useQueryClient()
  return useMutation({
    scope: movesScope(noteId),
    mutationFn: ({ parentId, san }: { parentId: MoveId; san: string }) =>
      authorized((token) => api.addMove(token, noteId, parentId, san)),
    onSuccess: (move) => {
      queryClient.setQueryData<MoveRow[]>(keys.moves(noteId), (rows) =>
        rows && !rows.some((row) => row.id === move.id) ? [...rows, move] : rows,
      )
      touched(queryClient)
    },
  })
}

/** The rows left when a Move and everything after it are gone. Parents are listed before their children. */
function withoutSubtree(rows: readonly MoveRow[], moveId: MoveId): MoveRow[] {
  const gone = new Set([moveId])
  for (const row of rows) if (row.parentId !== null && gone.has(row.parentId)) gone.add(row.id)
  return rows.filter((row) => !gone.has(row.id))
}

/**
 * Deletes a Move and its subtree. A refused delete changes nothing; a done
 * one may have deleted writing, and the Links in it.
 */
export function useDeleteMove(noteId: number) {
  const { authorized } = useSession()
  const queryClient = useQueryClient()
  return useMutation({
    scope: movesScope(noteId),
    mutationFn: ({ moveId, confirm }: { moveId: MoveId; confirm: boolean }) =>
      authorized((token) => api.deleteMove(token, noteId, moveId, confirm)),
    onSuccess: (result, { moveId }) => {
      if (result.status !== 'deleted') return
      queryClient.setQueryData<MoveRow[]>(keys.moves(noteId), (rows) => rows && withoutSubtree(rows, moveId))
      touched(queryClient)
      invalidateLinks(queryClient)
    },
  })
}

export function useNoteLinks(noteId: number) {
  const { state, authorized } = useSession()
  return useQuery({
    queryKey: keys.links(noteId),
    queryFn: () => authorized((token) => api.getLinks(token, noteId)),
    enabled: state.status === 'authenticated',
    retry: (failures, error) => !(error instanceof ApiError && error.status === 404) && failures < 2,
  })
}

export function useFolders() {
  const { state, authorized } = useSession()
  return useQuery({
    queryKey: keys.folders,
    queryFn: () => authorized((token) => api.listFolders(token)),
    enabled: state.status === 'authenticated',
  })
}

export function useCreateFolder() {
  const { authorized } = useSession()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: { name: string; parentId: number | null }) => authorized((token) => api.createFolder(token, input)),
    onSuccess: (folder) => {
      queryClient.setQueryData<Folder[]>(keys.folders, (folders) => folders && [...folders, folder])
    },
  })
}

/** Renames a Folder or moves it; Notes are found by the names of their Folders, so searches change too. */
export function useUpdateFolder(id: number) {
  const { authorized } = useSession()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (update: FolderUpdate) => authorized((token) => api.updateFolder(token, id, update)),
    onSuccess: (folder) => {
      queryClient.setQueryData<Folder[]>(keys.folders, (folders) => folders?.map((f) => (f.id === id ? folder : f)))
      void queryClient.invalidateQueries({ queryKey: keys.searches })
    },
  })
}

/**
 * Deletes a Folder. A refused delete changes nothing; a done one also took
 * its subfolders and moved their Notes to the root, so every cached Note's
 * Folder may be stale.
 */
export function useDeleteFolder(id: number) {
  const { authorized } = useSession()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (confirm: boolean) => authorized((token) => api.deleteFolder(token, id, confirm)),
    onSuccess: (result) => {
      if (result.status !== 'deleted') return
      void queryClient.invalidateQueries({ queryKey: keys.folders })
      void queryClient.invalidateQueries({ queryKey: keys.list, exact: true })
      void queryClient.invalidateQueries({ queryKey: keys.searches })
      void queryClient.invalidateQueries({
        predicate: (query) => query.queryKey[0] === 'notes' && typeof query.queryKey[1] === 'number' && query.queryKey.length === 2,
      })
    },
  })
}

/** Files a Note in a Folder, or at the root (null). */
export function useMoveNote(id: number) {
  const { authorized } = useSession()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (folderId: number | null) => authorized((token) => api.moveNote(token, id, folderId)),
    onSuccess: (note) => {
      queryClient.setQueryData(keys.note(note.id), note)
      queryClient.setQueryData<NoteSummary[]>(keys.list, (list) => list?.map((n) => (n.id === note.id ? summary(note) : n)))
      void queryClient.invalidateQueries({ queryKey: keys.searches })
    },
  })
}
