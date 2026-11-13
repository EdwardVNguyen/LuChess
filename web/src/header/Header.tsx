import { Button, Group, Menu, Popover, Text, UnstyledButton } from '@mantine/core'
import { Link } from '@tanstack/react-router'
import styles from './Header.module.css'
import { SECTIONS } from '../landing/sections'
import { QuickFind } from '../notes/QuickFind'
import { useNewNote } from '../notes/useNewNote'
import { ChevronDownIcon, PlusIcon } from './icons'
import { UserMenu } from './UserMenu'
import type { SessionState } from '../session'

type Props = {
  state: SessionState
  onLogOut: () => void
  /** On the landing page: the taller header with links to its sections (HomeLoggedOut.dc.html). */
  landing?: boolean
}

// The app shell's header (design/screens/Note.dc.html, Note-mobile.dc.html):
// no Library or Play tabs and no mobile bottom bar, because navigation shows
// only what exists in v1 (web/AGENTS.md). On the landing page it also links to
// the page's sections, from the tablet size up.
export function Header({ state, onLogOut, landing = false }: Props) {
  const ready = state.status !== 'restoring'
  const user = state.status === 'authenticated' ? state.user : null

  return (
    <div className={landing ? `${styles.header} ${styles.landing}` : styles.header}>
      <Link to="/" className={styles.logo}>
        Chess Notes
      </Link>
      {landing && (
        <nav aria-label="Main" className={styles.sections}>
          <Link to="/" hash={SECTIONS.howItWorks} className={styles.section}>
            How it works
          </Link>
          <Link to="/" hash={SECTIONS.faq} className={styles.section}>
            FAQ
          </Link>
        </nav>
      )}
      {ready && user && (
        <>
          <div className={styles.spacer} />
          <div className={styles.slots}>
            <QuickFind />
            <NewNoteButton />
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

// New note as a split button (#106): New note makes a blank Note and opens it;
// the menu beside it offers Import…. On mobile, New note is the plus. A failed
// create says so under the button and stays put.
function NewNoteButton() {
  const newNote = useNewNote()

  return (
    <Popover opened={newNote.error !== null} onChange={(opened) => !opened && newNote.dismissError()} position="bottom-end" width={260} withinPortal>
      <Popover.Target>
        <div className={styles.split}>
          <UnstyledButton className={styles.newNote} disabled={newNote.creating} onClick={() => newNote.start()}>
            New note
          </UnstyledButton>
          <UnstyledButton
            className={styles.newNoteIcon}
            disabled={newNote.creating}
            onClick={() => newNote.start()}
            aria-label="New note"
          >
            <PlusIcon />
          </UnstyledButton>
          <Menu position="bottom-end" width={160} withinPortal>
            <Menu.Target>
              <UnstyledButton className={styles.newNoteMore} aria-label="Other ways to start a note">
                <ChevronDownIcon />
              </UnstyledButton>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Item component={Link} to="/notes/import">
                Import…
              </Menu.Item>
            </Menu.Dropdown>
          </Menu>
        </div>
      </Popover.Target>
      <Popover.Dropdown>
        <Text size="sm" role="alert">
          Could not create the note. {newNote.error}
        </Text>
      </Popover.Dropdown>
    </Popover>
  )
}
