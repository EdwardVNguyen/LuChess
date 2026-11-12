import { Button, Loader, Menu, Text, UnstyledButton } from '@mantine/core'
import { Link, Navigate, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import type { Writing } from '../chess/pgn'
import { addMove, deleteSubtree, nextId, promote, subtree, type MoveId, type MoveTree } from '../chess/tree'
import { ConfirmDialog, ResponsiveDialog, useOverlaySize, type OverlaySize } from '../overlay'
import { DeleteWritingDialog } from '../notes/DeleteWritingDialog'
import { BookmarkIcon, MoreIcon } from '../notes/icons'
import noteStyles from '../notes/Notes.module.css'
import type { NoteStart } from '../notes/newNote'
import { NoteStartForm } from '../notes/NoteStartForm'
import { CurrentMoveEditor, StudyView, WritingView } from '../notes/StudyView'
import { describeWriting, mergeWriting, withWriting, writingUnder, type WritingChange } from '../notes/writing'
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
  const [note, setNote] = useState<NoteStart | null>(null)
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
  note: NoteStart
  size: OverlaySize
  onSave: () => void
  onStartOver: () => void
}

// The Guest's tree, the one they started with and the moves they play on it,
// and their writing on it, including what an imported PGN brought, are kept
// here in the browser.
function GuestNote({ note, size, onSave, onStartOver }: GuestNoteProps) {
  const [tree, setTree] = useState<MoveTree>(note.tree)
  const [writing, setWriting] = useState<ReadonlyMap<MoveId, Writing>>(note.writing)
  const [confirmingStartOver, setConfirmingStartOver] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState<{ move: MoveId; message: string; done: (deleted: boolean) => void } | null>(null)

  // The same merge as a saved Note (useSaveWriting), applied in memory.
  function write({ move, ...change }: WritingChange) {
    setWriting((current) => withWriting(current, move, mergeWriting(current.get(move), change)))
  }

  // The same tree operation as the API's add-Move: a move already played there is reused.
  function play(parent: MoveId, san: string): MoveId | null {
    const added = addMove(tree, parent, san, nextId(tree))
    if (!added.ok) return null
    setTree(added.value.tree)
    return added.value.id
  }

  // Delete from here, as the API does: the Move and its subtree, asking first
  // when writing would go with them.
  function deleteNow(move: MoveId) {
    const gone = new Set(subtree(tree, move))
    setTree(deleteSubtree(tree, move))
    setWriting((current) => new Map([...current].filter(([id]) => !gone.has(id))))
  }

  function deleteFrom(move: MoveId): Promise<boolean> | boolean {
    const counts = writingUnder(tree, writing, move)
    if (Object.values(counts).every((n) => n === 0)) {
      deleteNow(move)
      return true
    }
    return new Promise((done) => setConfirmingDelete({ move, message: `This will delete ${describeWriting(counts)}`, done }))
  }

  function startOver() {
    if (writing.size > 0 || tree !== note.tree) setConfirmingStartOver(true)
    else onStartOver()
  }

  return (
    <>
      <StudyView
        name={note.name}
        tree={tree}
        tags={note.tags}
        writing={writing}
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
        onPlay={play}
        onDraw={(move, drawings) => write({ move, drawings })}
        onPromote={(move) => setTree(promote(tree, move))}
        onDelete={deleteFrom}
        tools={(view) => <CurrentMoveEditor {...view} writing={writing} editable onSave={write} />}
      >
        {(view) => <WritingView {...view} writing={writing} />}
      </StudyView>
      <ConfirmDialog
        size={size}
        opened={confirmingStartOver}
        onClose={() => setConfirmingStartOver(false)}
        title="Start over"
        message="Everything you have written on this note, and the moves you have played, will be lost."
        confirmLabel="Start over"
        onConfirm={onStartOver}
        destructive
      />
      <DeleteWritingDialog
        size={size}
        message={confirmingDelete?.message ?? null}
        onClose={() => {
          confirmingDelete?.done(false)
          setConfirmingDelete(null)
        }}
        onConfirm={() => {
          if (!confirmingDelete) return
          deleteNow(confirmingDelete.move)
          confirmingDelete.done(true)
          setConfirmingDelete(null)
        }}
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
