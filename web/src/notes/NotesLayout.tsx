import { Button, Loader, Stack, Text, Title } from '@mantine/core'
import { Link, Outlet } from '@tanstack/react-router'
import { useSession } from '../session'
import { NoteTree } from './NoteTree'
import styles from './Notes.module.css'

// The Notes area: the "Your notes" sidebar on desktop beside the open Note
// or the New note page. Tablet and mobile have no sidebar; each screen
// offers the list itself (design/screenshots/Note*.png).
export function NotesLayout() {
  const { state } = useSession()

  if (state.status === 'restoring') {
    return (
      <div className={styles.centered}>
        <Loader aria-label="Loading" />
      </div>
    )
  }
  // The shell already shows the restore error with a Retry button.
  if (state.status === 'restore-failed') return null
  if (state.status === 'guest') {
    return (
      <div className={styles.centered}>
        <Stack align="center" gap="md" maw={360} ta="center">
          <Title order={2}>Your notes are private</Title>
          <Text>Log in to see your notes and write new ones.</Text>
          <Button component={Link} to="/login">
            Log in
          </Button>
        </Stack>
      </div>
    )
  }

  return (
    <div className={styles.layout}>
      <nav className={styles.sidebar} aria-label="Notes">
        <NoteTree />
      </nav>
      <div className={styles.main}>
        <Outlet />
      </div>
    </div>
  )
}
