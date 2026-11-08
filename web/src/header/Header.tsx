import { Button, Group } from '@mantine/core'
import { Link } from '@tanstack/react-router'
import styles from './Header.module.css'
import { PlusIcon, SearchIcon } from './icons'
import { UserMenu } from './UserMenu'
import type { SessionState } from '../session'

type Props = {
  state: SessionState
  onLogOut: () => void
}

// The app shell's header (design/screens/Note.dc.html, Note-mobile.dc.html):
// no Library or Play tabs and no mobile bottom bar, because navigation shows
// only what exists in v1 (web/AGENTS.md).
export function Header({ state, onLogOut }: Props) {
  const ready = state.status !== 'restoring'
  const user = state.status === 'authenticated' ? state.user : null

  return (
    <div className={styles.header}>
      <Link to="/" className={styles.logo}>
        Chess Notes
      </Link>
      {ready && user && (
        <>
          <div className={styles.spacer} />
          <div className={styles.slots}>
            {/* #7: the find box replaces this placeholder. */}
            <div className={styles.findPlaceholder} aria-hidden="true">
              <SearchIcon />
              <span>Find a note</span>
            </div>
            <div className={styles.iconSlot} aria-hidden="true">
              <SearchIcon />
            </div>
            {/* #6: the New note button replaces these placeholders. */}
            <div className={styles.newNotePlaceholder} aria-hidden="true">
              New note
            </div>
            <div className={styles.iconSlot} aria-hidden="true">
              <PlusIcon />
            </div>
            <UserMenu user={user} onLogOut={onLogOut} />
          </div>
        </>
      )}
      {ready && !user && (
        <Group ml="auto" gap="xs" wrap="nowrap">
          <Button component={Link} to="/login" variant="subtle">
            Log in
          </Button>
          <Button component={Link} to="/signup">
            Sign up
          </Button>
        </Group>
      )}
    </div>
  )
}
