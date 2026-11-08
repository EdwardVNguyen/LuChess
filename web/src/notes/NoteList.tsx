import { Button, Loader, Text } from '@mantine/core'
import { Link } from '@tanstack/react-router'
import { errorMessage } from '../errors'
import styles from './Notes.module.css'
import { useNoteList } from './queries'

type Props = {
  /** Called when a Note is chosen, e.g. to close the overlay the list is in. */
  onNavigate?: () => void
  /** Hide the "Your notes" label when the surrounding overlay already titles the list. */
  showHeading?: boolean
}

// The user's Notes, most recently changed first: a flat list until #11 adds Folders.
export function NoteList({ onNavigate, showHeading = true }: Props) {
  const notes = useNoteList()

  return (
    <div className={styles.list}>
      {showHeading && <div className={styles.eyebrow}>Your notes</div>}
      {notes.isPending && (
        <div className={styles.listState}>
          <Loader size="sm" aria-label="Loading notes" />
        </div>
      )}
      {notes.isError && (
        <div className={styles.listState}>
          <Text size="sm" ff="var(--cn-font-sans)" role="alert">
            {errorMessage(notes.error)}
          </Text>
          <Button variant="default" size="xs" onClick={() => void notes.refetch()}>
            Try again
          </Button>
        </div>
      )}
      {notes.isSuccess && notes.data.length === 0 && (
        <div className={styles.listState}>
          <Text size="sm" ff="var(--cn-font-sans)" c="var(--cn-muted)">
            No notes yet.
          </Text>
        </div>
      )}
      {notes.isSuccess && notes.data.length > 0 && (
        <ul className={styles.items}>
          {notes.data.map((note) => (
            <li key={note.id}>
              <Link
                to="/notes/$noteId"
                params={{ noteId: String(note.id) }}
                className={styles.item}
                activeProps={{ 'aria-current': 'page' }}
                onClick={onNavigate}
              >
                <span className={styles.itemName}>{note.name}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
