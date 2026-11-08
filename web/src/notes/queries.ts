import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ApiError, type NewNoteInput, type Note, type NoteSummary, type PlyWriting, type PlyWritingInput } from '../api'
import { api } from '../apiClient'
import { useSession } from '../session'

// Every Note call goes through the Session, so an expired access token is
// refreshed once instead of failing. Cached Notes are cleared when the
// Session ends (main.tsx).
const keys = {
  list: ['notes'] as const,
  searches: ['notes', 'search'] as const,
  search: (query: string) => ['notes', 'search', query] as const,
  note: (id: number) => ['notes', id] as const,
  plies: (id: number) => ['notes', id, 'plies'] as const,
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
  return { id: note.id, name: note.name, createdAt: note.createdAt, updatedAt: note.updatedAt }
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

export type PlyChange = { ply: number } & Partial<PlyWritingInput>

const empty: PlyWritingInput = { comment: null, body: null, moveGlyph: null, positionGlyph: null }

/**
 * Saves one part of a Ply's writing (a Comment, a Body or a Glyph), keeping
 * the rest. Saves run one at a time, each merging onto the result of the one
 * before, so a Glyph chosen while a Comment is saving does not undo it.
 */
export function useSavePly(noteId: number) {
  const { authorized } = useSession()
  const queryClient = useQueryClient()
  return useMutation({
    scope: { id: `plies-${noteId}` },
    mutationFn: ({ ply, ...change }: PlyChange) => {
      const saved = queryClient.getQueryData<PlyWriting[]>(keys.plies(noteId))?.find((p) => p.ply === ply)
      const input: PlyWritingInput = {
        comment: saved?.comment ?? empty.comment,
        body: saved?.body ?? empty.body,
        moveGlyph: saved?.moveGlyph ?? empty.moveGlyph,
        positionGlyph: saved?.positionGlyph ?? empty.positionGlyph,
        ...change,
      }
      return authorized((token) => api.putPly(token, noteId, ply, input))
    },
    onSuccess: (written) => {
      const hasWriting = written.comment || written.body || written.moveGlyph || written.positionGlyph
      queryClient.setQueryData<PlyWriting[]>(keys.plies(noteId), (plies) => {
        const others = (plies ?? []).filter((p) => p.ply !== written.ply)
        return hasWriting ? [...others, written].sort((a, b) => a.ply - b.ply) : others
      })
      // Writing touches the Note, which moves it to the top of the list.
      void queryClient.invalidateQueries({ queryKey: keys.list, exact: true })
    },
  })
}
