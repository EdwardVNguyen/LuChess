import { Button, Stack, Text, Title } from '@mantine/core'
import { Link, Outlet } from '@tanstack/react-router'
import { useId } from 'react'
import { PageLoading } from '../Loading'
import { useSession } from '../session'
import { NoteTree } from './NoteTree'
import { PaneEdge } from './PaneEdge'
import { PaneToggle } from './PaneToggle'
import { useCollapsible } from './useCollapsible'
import styles from './Notes.module.css'

// The Notes area: the "Your notes" sidebar on desktop beside the open Note
// or the New note page. Tablet and mobile have no sidebar; each screen
// offers the list itself (design/screenshots/Note*.png). On desktop the
// sidebar's edge can be dragged (#51), and the sidebar collapsed to a rail (#61).
export function NotesLayout() {
  const { state } = useSession()
  const sidebar = useCollapsible('sidebar')
  const sidebarId = useId()

  if (state.status === 'restoring') return <PageLoading />

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
      <nav id={sidebarId} className={styles.sidebar} aria-label="Notes" data-collapsed={sidebar.collapsed || undefined}>
        <PaneToggle
          pane="sidebar"
          collapsed={sidebar.collapsed}
          onToggle={sidebar.toggle}
          focusRequests={sidebar.focusRequests}
          controls={sidebarId}
        />
        {!sidebar.collapsed && <NoteTree />}
      </nav>
      <PaneEdge pane="sidebar" onCollapsed={sidebar.focusToggle} />
      <div className={styles.main}>
        <Outlet />
      </div>
    </div>
  )
}
