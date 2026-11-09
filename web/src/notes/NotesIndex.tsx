import { Button, Text, Title } from '@mantine/core'
import { Link } from '@tanstack/react-router'
import { NoteTree } from './NoteTree'
import styles from './Notes.module.css'
import { useFolders, useNoteList } from './queries'

// /notes with no Note open. On desktop the sidebar already lists the Notes, so
// this only prompts; on tablet and mobile there is no sidebar, so the list is here.
export function NotesIndex() {
  const notes = useNoteList()
  const folders = useFolders()
  const empty = notes.isSuccess && notes.data.length === 0
  // Folders made before any Note still show, so they can be renamed or deleted.
  const nothingFiled = empty && folders.isSuccess && folders.data.length === 0

  return (
    <div className={styles.index}>
      {!nothingFiled && (
        <div className={styles.indexList}>
          <NoteTree />
        </div>
      )}
      <div className={empty ? styles.indexEmpty : styles.indexPrompt}>
        <Title order={2}>{empty ? 'Start your first note' : 'Choose a note'}</Title>
        <Text c="var(--cn-muted)">
          {empty
            ? 'Paste a game, play through the moves, or set up a position to study.'
            : 'Open one of your notes, or start a new one.'}
        </Text>
        <Button component={Link} to="/notes/new" mt="xs">
          New note
        </Button>
      </div>
    </div>
  )
}
