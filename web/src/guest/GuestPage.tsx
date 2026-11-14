import { Button, Loader, Menu, Text, UnstyledButton } from '@mantine/core'
import { Link, Navigate, useNavigate, useRouter, useSearch } from '@tanstack/react-router'
import { useState } from 'react'
import type { ImportedNote, TagPair, Writing } from '../chess/pgn'
import { START_FEN } from '../chess/chess'
import { addMove, deleteSubtree, newTree, nextId, promote, subtree, type MoveId, type MoveTree } from '../chess/tree'
import { ConfirmDialog, ResponsiveDialog, useOverlaySize, type OverlaySize } from '../overlay'
import { useApplyConfirm } from '../notes/ApplyConfirm'
import { applyInBrowser, describeLoss, type ApplyOutcome, type PgnPlan } from '../notes/applying'
import { DeleteWritingDialog } from '../notes/DeleteWritingDialog'
import { EditPosition } from '../notes/EditPosition'
import { resetCounts, resetLoss } from '../notes/positionSetup'
import { BookmarkIcon, MoreIcon } from '../notes/icons'
import noteStyles from '../notes/Notes.module.css'
import { blankNote, type NoteStart } from '../notes/newNote'
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
  // Someone logged in can write a Note that is saved. Not to a new one: a redirect never creates a Note.
  if (state.status === 'authenticated') return <Navigate to="/notes" replace />
  return <GuestStudy />
}

// A Guest starts on a blank board at the standard start, as New note does
// (#106), and can import a game or a position in its place with Import….
function GuestStudy() {
  // Each Note started gets a new key, so nothing of the last one carries over.
  const [started, setStarted] = useState(() => ({ key: 0, note: blankNote() }))
  const [importing, setImporting] = useState(false)
  const [prompting, setPrompting] = useState(false)
  const size = useOverlaySize()

  const start = (note: NoteStart) => {
    setStarted(({ key }) => ({ key: key + 1, note }))
    setImporting(false)
  }

  return (
    <div className={styles.page}>
      <GuestBanner />
      {importing && (
        <div className={styles.start}>
          <NoteStartForm title="Import" submitLabel="Start writing" onSubmit={start} onCancel={() => setImporting(false)} />
        </div>
      )}
      {/* Kept while importing, so Cancel goes back to it as it was. */}
      <div hidden={importing} className={styles.study}>
        <GuestNote
          key={started.key}
          note={started.note}
          size={size}
          onSave={() => setPrompting(true)}
          onImport={() => setImporting(true)}
          onStartOver={() => start(blankNote())}
          onReset={(startFen, imported) =>
            start({
              name: started.note.name,
              startFen,
              tags: imported?.tags ?? [],
              tree: imported?.tree ?? newTree(startFen ?? START_FEN, 0),
              writing: imported?.writing ?? new Map(),
            })
          }
        />
      </div>
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
  onImport: () => void
  onStartOver: () => void
  /**
   * Gives the Note a new Position (null for the standard start), deleting its
   * Moves, writing and tags, and starting it with those of the PGN that gave
   * the Position, if one did.
   */
  onReset: (startFen: string | null, imported?: ImportedNote) => void
}

/** What leaving the Guest's Note would lose, asked before it does. */
type Leaving = 'startOver' | 'import'

// The Guest's tree, the one they started with and the moves they play on it,
// and their writing on it, including what an imported PGN brought, are kept
// here in the browser.
function GuestNote({ note, size, onSave, onImport, onStartOver, onReset }: GuestNoteProps) {
  const [tree, setTree] = useState<MoveTree>(note.tree)
  const [writing, setWriting] = useState<ReadonlyMap<MoveId, Writing>>(note.writing)
  const [tags, setTags] = useState<readonly TagPair[]>(note.tags)
  const confirmApply = useApplyConfirm(size, 'The name stays.')
  const [confirming, setConfirming] = useState<Leaving | null>(null)
  const navigate = useNavigate()
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

  // The FEN and PGN under the board (#109), applied as to a saved Note, with
  // the same confirmations, in the browser.
  async function resetTo(kind: 'fen' | 'position', startFen: string | null, imported?: ImportedNote): Promise<ApplyOutcome> {
    const loss = resetLoss(resetCounts(tree, writing))
    if (loss !== null && !(await confirmApply.ask({ kind, loss }))) return 'cancelled'
    onReset(startFen, imported)
    return 'applied'
  }

  async function applyPgn(plan: PgnPlan): Promise<ApplyOutcome> {
    if (plan.kind === 'reset') return resetTo('position', plan.startFen, plan.note)
    const applied = applyInBrowser(tree, writing, plan)
    const loss = describeLoss(applied.loss)
    if (loss !== null && !(await confirmApply.ask({ kind: 'pgn', loss }))) return 'cancelled'
    setTree(applied.tree)
    setWriting(applied.writing)
    setTags(plan.note.tags)
    return 'applied'
  }

  const { edit } = useSearch({ strict: false })
  if (edit === 'position') {
    return <GuestEditPosition note={note} tree={tree} writing={writing} onReset={onReset} />
  }

  // Its own page, as for a saved Note: Back cancels it.
  function openEditPosition() {
    void navigate({ to: '/try', search: { edit: 'position' } })
  }

  const leave = { startOver: onStartOver, import: onImport }
  function confirmLeaving(how: Leaving) {
    if (writing.size > 0 || tree !== note.tree) setConfirming(how)
    else leave[how]()
  }

  return (
    <>
      <StudyView
        name={note.name}
        tree={tree}
        tags={tags}
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
                <Menu.Item onClick={openEditPosition}>Edit position</Menu.Item>
                <Menu.Item onClick={() => confirmLeaving('import')}>Import…</Menu.Item>
                <Menu.Item onClick={() => confirmLeaving('startOver')}>Start over</Menu.Item>
              </Menu.Dropdown>
            </Menu>
          </div>
        }
        onPlay={play}
        onDraw={(move, drawings) => write({ move, drawings })}
        onComment={(move, comment) => write({ move, comment })}
        onPromote={(move) => setTree(promote(tree, move))}
        onDelete={deleteFrom}
        onApplyFen={(startFen) => resetTo('fen', startFen)}
        onApplyPgn={applyPgn}
        tools={(view) => <CurrentMoveEditor {...view} writing={writing} editable onSave={write} />}
      >
        {(view) => <WritingView {...view} writing={writing} />}
      </StudyView>
      <ConfirmDialog
        size={size}
        opened={confirming !== null}
        onClose={() => setConfirming(null)}
        title={confirming === 'import' ? 'Import a note' : 'Start over'}
        message={
          confirming === 'import'
            ? 'The note you import takes the place of this one. Everything you have written on it, and the moves you have played, will be lost.'
            : 'Everything you have written on this note, and the moves you have played, will be lost.'
        }
        confirmLabel={confirming === 'import' ? 'Continue' : 'Start over'}
        onConfirm={() => {
          if (confirming) leave[confirming]()
          setConfirming(null)
        }}
        destructive
      />
      {confirmApply.dialog}
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

// Edit position on the Guest's Note: the same page and confirmation as a
// saved Note, with nothing sent. Save and Cancel go back to the Note.
function GuestEditPosition({
  note,
  tree,
  writing,
  onReset,
}: {
  note: NoteStart
  tree: MoveTree
  writing: ReadonlyMap<MoveId, Writing>
  onReset: (startFen: string | null) => void
}) {
  const [confirming, setConfirming] = useState<{ startFen: string | null; loss: string } | null>(null)
  const router = useRouter()
  const navigate = useNavigate()

  function leave() {
    if (router.history.canGoBack()) router.history.back()
    else void navigate({ to: '/try', replace: true })
  }

  function reset(startFen: string | null) {
    onReset(startFen)
    leave()
  }

  function save(startFen: string | null) {
    const loss = resetLoss(resetCounts(tree, writing))
    if (loss === null) reset(startFen)
    else setConfirming({ startFen, loss })
  }

  return (
    <EditPosition
      name={note.name}
      onSave={save}
      onCancel={leave}
      confirming={confirming && { loss: confirming.loss, keeps: 'The name stays.' }}
      onConfirm={() => confirming && reset(confirming.startFen)}
      onDismiss={() => setConfirming(null)}
    />
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
