import { useNavigate, useParams, useRouter } from '@tanstack/react-router'

// Opening Edit position (#108) for a saved Note, and leaving it.

declare module '@tanstack/history' {
  interface HistoryState {
    /** Edit position was opened from this Note's own page, which is the entry before it. */
    editPositionFrom?: number
  }
}

/**
 * Opens Edit position for a Note, from its title menu or its row in Your
 * notes, remembering whether it was opened from that Note's own page.
 */
export function useOpenEditPosition() {
  const navigate = useNavigate()
  const { noteId: openNote } = useParams({ strict: false })
  return (id: number) =>
    void navigate({
      to: '/notes/$noteId/position',
      params: { noteId: String(id) },
      state: (state) => ({ ...state, editPositionFrom: openNote === String(id) ? id : undefined }),
    })
}

/**
 * Save and Cancel return to the Note. Opened from the Note's own page, they
 * go back to it, as the browser's Back button does, so Back from the Note
 * never reopens Edit position; opened anywhere else, it is replaced by the Note.
 */
export function useBackToNote(id: number) {
  const router = useRouter()
  const navigate = useNavigate()
  return () => {
    if (router.history.location.state.editPositionFrom === id && router.history.canGoBack()) router.history.back()
    else void navigate({ to: '/notes/$noteId', params: { noteId: String(id) }, replace: true })
  }
}
