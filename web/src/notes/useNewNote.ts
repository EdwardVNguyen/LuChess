import { useIsMutating, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { errorMessage } from '../errors'
import { blankNote, newNoteInput } from './newNote'
import { useCreateNote } from './queries'

// Every New note control shares this key, so while one create is in flight
// they are all disabled, and a double click makes one Note.
const NEW_NOTE = ['notes', 'new'] as const

declare module '@tanstack/history' {
  interface HistoryState {
    /** Set on opening a Note that New note has just made: its title opens in inline rename. */
    renameNote?: boolean
  }
}

/**
 * New note (#106): creates a blank Note on the server at once, named
 * "Untitled" at the standard start, then opens it with its title in inline
 * rename. It is filed in the Folder given, or at the root. A failed create
 * stays where it was and answers the error.
 */
export function useNewNote() {
  const create = useCreateNote(NEW_NOTE)
  const queryClient = useQueryClient()
  const creating = useIsMutating({ mutationKey: NEW_NOTE }) > 0
  const navigate = useNavigate()

  /** `onOpened` runs as the new Note opens, e.g. to close the overlay the control is in. */
  function start(folderId: number | null = null, onOpened?: () => void) {
    // Read from the cache, not the last render, so a second click before a re-render is caught too.
    if (queryClient.isMutating({ mutationKey: NEW_NOTE }) > 0) return
    create.mutate(newNoteInput(blankNote(), folderId), {
      onSuccess: (note) => {
        onOpened?.()
        void navigate({ to: '/notes/$noteId', params: { noteId: String(note.id) }, state: { renameNote: true } })
      },
    })
  }

  return { start, creating, error: create.isError ? errorMessage(create.error) : null, dismissError: create.reset }
}
