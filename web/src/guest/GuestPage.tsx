import { Button, Loader, Menu, Text, UnstyledButton } from '@mantine/core'
import { Link, Navigate, useNavigate } from '@tanstack/react-router'
import { useMemo, useState } from 'react'
import type { NewNoteInput, PlyWriting } from '../api'
import { ConfirmDialog, ResponsiveDialog, useOverlaySize, type OverlaySize } from '../overlay'
import { BookmarkIcon, MoreIcon } from '../notes/icons'
import noteStyles from '../notes/Notes.module.css'
import { NoteStartForm } from '../notes/NoteStartForm'
import { CurrentPlyEditor, StudyView, WritingView } from '../notes/StudyView'
import { mergeWriting, replaceWriting, type PlyChange } from '../notes/writing'
import { useSession } from '../session'
import styles from './Guest.module.css'

// Guest mode (#13): a visitor without an account starts a Note and writes on
// it with the same components as a saved Note. Nothing leaves this
// component's state, so nothing is sent to the API, and it is all gone when
// the Guest leaves the page. Trying to save asks them to sign up or log in.
export function GuestPage() {
  const { state } = useSession()

  if (state.status === 'restoring') {
    return (
      <div className={noteStyles.centered}>
        <Loader aria-label="Loading" />
      </div>
    )
  }
  // Not yet known to be a Guest (GLOSSARY.md); the shell shows the error with a Retry button.
  if (state.status === 'restore-failed') return null
  // Someone logged in can write a Note that is saved.
  if (state.status === 'authenticated') return <Navigate to="/notes/new" replace />
  return <GuestStudy />
}

function GuestStudy() {
  const [note, setNote] = useState<NewNoteInput | null>(null)
  const [prompting, setPrompting] = useState(false)
  const size = useOverlaySize()

  return (
    <div className={styles.page}>
      <GuestBanner />
      {note === null ? (
        <div className={styles.start}>
          <NoteStartForm title="Try a note" submitLabel="Start writing" onSubmit={setNote} />
        </div>
      ) : (
        <GuestNote note={note} size={size} onSave={() => setPrompting(true)} onStartOver={() => setNote(null)} />
      )}
      <SignUpPrompt size={size} opened={prompting} onClose={() => setPrompting(false)} />
    </div>
  )
}

// The banner pattern from design/screenshots/ArticleGuest*.png.
export function GuestBanner() {
  return (
    <div className={styles.banner}>
      <span>You are writing as a guest. Nothing here is saved. Sign up to keep your notes.</span>
      <span className={styles.bannerActions}>
        <Button component={Link} to="/signup" className={styles.bannerSignUp}>
          Sign up
        </Button>
        <Link to="/login" className={styles.bannerLogIn}>
          Log in
        </Link>
      </span>
    </div>
  )
}

type GuestNoteProps = {
  note: NewNoteInput
  size: OverlaySize
  onSave: () => void
  onStartOver: () => void
}

function GuestNote({ note, size, onSave, onStartOver }: GuestNoteProps) {
  const [plies, setPlies] = useState<PlyWriting[]>([])
  const [confirmingStartOver, setConfirmingStartOver] = useState(false)
  const writing = useMemo(() => new Map(plies.map((p) => [p.ply, p])), [plies])

  // The same merge as a saved Note (useSavePly), applied in memory.
  function write({ ply, ...change }: PlyChange) {
    setPlies((current) => {
      const merged = mergeWriting(
        current.find((p) => p.ply === ply),
        change,
      )
      return replaceWriting(current, { ply, ...merged, updatedAt: new Date().toISOString() })
    })
  }

  function startOver() {
    if (plies.length > 0) setConfirmingStartOver(true)
    else onStartOver()
  }

  return (
    <>
      <StudyView
        name={note.name}
        pgn={note.pgn}
        actions={
          <div className={styles.actions}>
            <Button variant="outline" leftSection={<BookmarkIcon />} className={styles.save} onClick={onSave}>
              Save
            </Button>
            <Menu position="bottom-end" width={160} withinPortal>
              <Menu.Target>
                <UnstyledButton className={noteStyles.actions} aria-label="Note actions">
                  <MoreIcon />
                </UnstyledButton>
              </Menu.Target>
              <Menu.Dropdown>
                <Menu.Item onClick={startOver}>Start over</Menu.Item>
              </Menu.Dropdown>
            </Menu>
          </div>
        }
        tools={(view) => <CurrentPlyEditor {...view} writing={writing} editable onSave={write} />}
      >
        {(view) => <WritingView {...view} writing={writing} />}
      </StudyView>
      <ConfirmDialog
        size={size}
        opened={confirmingStartOver}
        onClose={() => setConfirmingStartOver(false)}
        title="Start over"
        message="Everything you have written on this note will be lost."
        confirmLabel="Start over"
        onConfirm={onStartOver}
        destructive
      />
    </>
  )
}

type SignUpPromptProps = { size: OverlaySize; opened: boolean; onClose: () => void }

// Shown when a Guest tries to save. Bringing their writing into a new
// account is out of scope (ADR 0001), so the copy says it stays behind.
export function SignUpPrompt({ size, opened, onClose }: SignUpPromptProps) {
  const navigate = useNavigate()

  return (
    <ResponsiveDialog
      size={size}
      opened={opened}
      onClose={onClose}
      title="Sign up to save"
      confirmLabel="Sign up"
      onConfirm={() => void navigate({ to: '/signup' })}
      cancelLabel="Keep writing"
    >
      <Text>
        Guests can't save notes. Sign up to keep your notes and link them to one another. What you have written here
        stays in this tab and won't carry over to your account.
      </Text>
      <Text size="sm" c="dimmed">
        Already have an account?{' '}
        <Link to="/login" className={styles.promptLogIn}>
          Log in
        </Link>
      </Text>
    </ResponsiveDialog>
  )
}
