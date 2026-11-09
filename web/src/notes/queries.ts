import { keepPreviousData, useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import {
  ApiError,
  type Folder,
  type FolderUpdate,
  type MovesEditInput,
  type NewNoteInput,
  type Note,
  type NoteSummary,
  type PlyWriting,
} from '../api'
import { api } from '../apiClient'
import { useSession } from '../session'
import { mergeWriting, replaceWriting, type PlyChange } from './writing'

// Every Note call goes through the Session, so an expired access token is
// refreshed once instead of failing. Cached Notes are cleared when the
// Session ends (main.tsx).
const keys = {
  list: ['notes'] as const,
  searches: ['notes', 'search'] as const,
  search: (query: string) => ['notes', 'search', query] as const,
  note: (id: number) => ['notes', id] as const,
  plies: (id: number) => ['notes', id, 'plies'] as const,
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

export function usePlies(noteId: number) {
  const { state, authorized } = useSession()
  return useQuery({
    queryKey: keys.plies(noteId),
    queryFn: () => authorized((token) => api.listPlies(token, noteId)),
    enabled: state.status === 'authenticated',
    retry: (failures, error) => !(error instanceof ApiError && error.status === 404) && failures < 2,
  })
}

export function useSavePly(noteId: number) {
  const { authorized } = useSession()
  const queryClient = useQueryClient()
  return useMutation({
    scope: { id: `plies-${noteId}` },
    mutationFn: ({ ply, ...change }: PlyChange) => {
      const saved = queryClient.getQueryData<PlyWriting[]>(keys.plies(noteId))?.find((p) => p.ply === ply)
      return authorized((token) => api.putPly(token, noteId, ply, mergeWriting(saved, change)))
    },
    onSuccess: (written) => {
      queryClient.setQueryData<PlyWriting[]>(keys.plies(noteId), (plies) => replaceWriting(plies, written))
      // Writing touches the Note, which moves it to the top of the list.
      void queryClient.invalidateQueries({ queryKey: keys.list, exact: true })
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

/**
 * Replaces the Note's moves. A refused edit changes nothing; a saved one may
 * have deleted writing, and the Links in it, at and after the changed Ply.
 */
export function useEditMoves(noteId: number) {
  const { authorized } = useSession()
  const queryClient = useQueryClient()
  return useMutation({
    // After any pending writing, so a save cannot land on a Ply the edit just cleared.
    scope: { id: `plies-${noteId}` },
    mutationFn: (input: MovesEditInput) => authorized((token) => api.editMoves(token, noteId, input)),
    onSuccess: (result) => {
      if (result.status !== 'saved') return
      const { note } = result
      queryClient.setQueryData(keys.note(note.id), note)
      queryClient.setQueryData<NoteSummary[]>(keys.list, (list) => putFirst(list, note))
      void queryClient.invalidateQueries({ queryKey: keys.plies(note.id) })
      void queryClient.invalidateQueries({ queryKey: keys.searches })
      invalidateLinks(queryClient)
    },
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
