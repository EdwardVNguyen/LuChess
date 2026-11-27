import { Button, Group, Menu, Popover, Text, UnstyledButton } from '@mantine/core'
import { useClickOutside, useDisclosure, useWindowEvent } from '@mantine/hooks'
import { Link } from '@tanstack/react-router'
import { useRef } from 'react'
import styles from './Header.module.css'
import { SECTIONS } from '../landing/sections'
import { QuickFind } from '../notes/QuickFind'
import { useNewNote } from '../notes/useNewNote'
import { ChevronDownIcon, CloseIcon, MenuIcon, PlusIcon } from './icons'
import { UserMenu } from './UserMenu'
import type { SessionState } from '../session'

type Props = {
  state: SessionState
  onLogOut: () => void
  /** On the landing page: the taller header with links to its sections (design/pages/home.html). */
  landing?: boolean
}

// The app shell's header (design/screens/Note.dc.html, Note-mobile.dc.html):
// no Library or Play tabs and no mobile bottom bar, because navigation shows
// only what exists in v1 (web/AGENTS.md). On the landing page it is the
// logged-out header of design/pages/home.html: links to the page's sections,
// Log in and Sign up, and on mobile a menu holding the links and Log in.
export function Header({ state, onLogOut, landing = false }: Props) {
  const ready = state.status !== 'restoring'
  const user = state.status === 'authenticated' ? state.user : null

  return (
    <div className={landing ? `${styles.header} ${styles.landing}` : styles.header}>
      <Link to="/" className={styles.logo}>
        <img src="/favicon.svg" alt="" className={styles.logoMark} />
        LuChess
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
            <UserMenu onLogOut={onLogOut} />
          </div>
        </>
      )}
      {ready && !user && landing && <LandingActions />}
      {ready && !user && !landing && (
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

// The landing header's Log in and Sign up. On mobile, Log in and the section
// links move into a full-width menu under the header (DESIGN.md leaves the
// drawer undesigned; a simple dropdown is enough).
function LandingActions() {
  const [opened, { toggle, close }] = useDisclosure(false)
  const button = useRef<HTMLButtonElement>(null)
  const ref = useClickOutside<HTMLDivElement>(close)
  useWindowEvent('keydown', (event) => {
    if (opened && event.key === 'Escape') {
      close()
      button.current?.focus()
    }
  })

  return (
    <div ref={ref} className={styles.landingActions}>
      <Link to="/login" className={styles.landingLogIn}>
        Log in
      </Link>
      <Link to="/signup" className={styles.landingSignUp}>
        Sign up
      </Link>
      <UnstyledButton
        ref={button}
        className={styles.menuButton}
        aria-label="Menu"
        aria-expanded={opened}
        aria-controls={opened ? 'landing-menu' : undefined}
        onClick={toggle}
      >
        {opened ? <CloseIcon /> : <MenuIcon />}
      </UnstyledButton>
      {opened && (
        <nav id="landing-menu" aria-label="Menu" className={styles.menu}>
          <Link to="/" hash={SECTIONS.howItWorks} className={styles.menuLink} onClick={close}>
            How it works
          </Link>
          <Link to="/" hash={SECTIONS.faq} className={styles.menuLink} onClick={close}>
            FAQ
          </Link>
          <Link to="/login" className={styles.menuLink} onClick={close}>
            Log in
          </Link>
        </nav>
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
