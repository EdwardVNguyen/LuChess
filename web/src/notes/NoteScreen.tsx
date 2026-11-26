import { Alert, Button, Loader, Stack, Text, Title } from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import { Link, useLocation, useNavigate, useParams, useSearch } from '@tanstack/react-router'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ApiError, type MoveRow, type Note, type ResetTree } from '../api'
import { START_FEN, type Game } from '../chess/chess'
import type { Writing } from '../chess/pgn'
import { readingOrder, treeFromRows, type MoveId, type MoveTree } from '../chess/tree'
import { errorMessage } from '../errors'
import { ResponsivePopover, useOverlaySize } from '../overlay'
import { useApplyConfirm } from './ApplyConfirm'
import { describeLoss, resetTree, treeInput, type ApplyOutcome, type PgnPlan } from './applying'
import { DeleteWritingDialog } from './DeleteWritingDialog'
import { FolderIcon } from './icons'
import { LinkingContext, type Linking } from './linking'
import type { LinkStatus } from './links'
import { NoteActions } from './NoteActions'
import { folderPath } from './folders'
import { NoteTree } from './NoteTree'
import styles from './Notes.module.css'
import { NoteMargin } from './NoteMargin'
import { NoteTitle } from './NoteTitle'
import { resetLoss } from './positionSetup'
import {
  useAddMove,
  useApplyTree,
  useDeleteMove,
  useFolders,
  useMoves,
  useNote,
  useNoteLinks,
  usePromoteMove,
  useResetPosition,
  useSaveWriting,
} from './queries'
import type { MoveMenu } from './MoveList'
import { CurrentMoveEditor, StudyView, WritingView } from './StudyView'
import { useWarnBeforeUnload } from './useWarnBeforeUnload'
import { writingByMove } from './writing'

export function NoteScreen() {
  const { noteId } = useParams({ from: '/notes/$noteId' })
  const { move } = useSearch({ from: '/notes/$noteId' })
  const id = /^\d+$/.test(noteId) ? Number(noteId) : null
  // Following a Backlink opens the Note afresh at the linking Move.
  return id === null ? <NoteMissing /> : <LoadedNote key={`${id}@${move}`} id={id} initialMove={move} />
}

function LoadedNote({ id, initialMove }: { id: number; initialMove: number | undefined }) {
  const note = useNote(id)
  const moves = useMoves(id)

  if (note.isError || moves.isError) {
    const error = note.error ?? moves.error
    if (error instanceof ApiError && error.status === 404) return <NoteMissing />
    return (
      <>
        <Strip name={note.data?.name ?? null} />
        <div className={styles.message}>
          <Alert color="red" title="Could not open this note">
            <Stack gap="sm" align="flex-start">
              <Text size="sm">{errorMessage(error)}</Text>
              <Button variant="light" onClick={() => void (note.isError ? note.refetch() : moves.refetch())}>
                Try again
              </Button>
            </Stack>
          </Alert>
        </div>
      </>
    )
  }
  if (note.isPending || moves.isPending) {
    return (
      <>
        <Strip name={note.data?.name ?? null} />
        <div className={styles.centered}>
          <Loader aria-label="Loading note" />
        </div>
      </>
    )
  }
  return <NoteView note={note.data} rows={moves.data} initialMove={initialMove} />
}

function NoteView({ note, rows, initialMove }: { note: Note; rows: MoveRow[]; initialMove: number | undefined }) {
  const linking = useNoteLinking(note.id)
  const playing = useMovePlaying(note.id)
  const editing = useMoveEditing(note.id)
  const applying = useApplying(note.id)
  const save = useSaveWriting(note.id)
  const folders = useFolders()
  const path = folderPath(folders.data ?? [], note.folderId).map((folder) => folder.name)
  const renaming = useTitleRename()
  const tree = useMemo(() => treeFromRows(note.startFen ?? START_FEN, rows), [note.startFen, rows])
  const writing = useMemo(() => writingByMove(rows), [rows])
  const inReadingOrder = useMemo(
    () => (tree.ok ? readingOrder(tree.value).flatMap((id) => writing.get(id) ?? []) : []),
    [tree, writing],
  )

  if (!tree.ok) {
    return (
      <>
        <Strip name={note.name} folder={path.at(-1)} />
        <div className={styles.message}>
          <Alert color="red" title="This note's moves could not be read">
            {tree.error}
          </Alert>
        </div>
      </>
    )
  }

  return (
    <LinkingContext value={linking.context}>
      <Strip name={note.name} folder={path.at(-1)} />
      <StudyView
        name={note.name}
        title={<NoteTitle note={note} {...renaming} />}
        eyebrow={path.length > 0 ? path.join(' / ') : undefined}
        tree={tree.value}
        tags={note.tags}
        writing={writing}
        linkName={linking.name}
        actions={<NoteActions note={note} onRename={renaming.onStart} />}
        initialMove={initialMove}
        margin={<NoteMargin noteId={note.id} writing={inReadingOrder} />}
        onPlay={playing.onPlay}
        playError={playing.error}
        onDraw={(move, drawings) => save.mutate({ move, drawings })}
        onComment={(move, comment) => save.mutate({ move, comment })}
        onPromote={editing.onPromote}
        onDelete={editing.onDelete}
        onApplyFen={applying.onApplyFen}
        onApplyPgn={applying.onApplyPgn}
        tools={(view) => <Editor save={save} writing={writing} {...view} />}
      >
        {(view) => (
          <WritingColumn writing={writing} scrollToCurrent={initialMove !== undefined} error={editing.error} {...view} />
        )}
      </StudyView>
      {editing.confirmDialog}
      {applying.confirmDialog}
    </LinkingContext>
  )
}

// Whether the Note's title is being renamed in place. A Note New note has
// just made opens with it so (#106), once: the flag that says so is cleared
// from the history entry, so going back to it or reloading doesn't again.
function useTitleRename() {
  const fresh = useLocation({ select: (location) => location.state.renameNote === true })
  const [renaming, setRenaming] = useState(fresh)
  const navigate = useNavigate()

  useEffect(() => {
    if (!fresh) return
    void navigate({ to: '.', search: true, params: true, replace: true, state: (state) => ({ ...state, renameNote: undefined }) })
  }, [fresh, navigate])

  return { renaming, onStart: () => setRenaming(true), onEnd: () => setRenaming(false) }
}

// Moves played on a Note's board are saved straight away, one add-Move
// operation each. The API answers the existing Move when that move was
// already played there (ADR 0009).
function useMovePlaying(noteId: number) {
  const add = useAddMove(noteId)

  function onPlay(parentId: MoveId, san: string): Promise<MoveId | null> {
    add.reset()
    return add.mutateAsync({ parentId, san }).then(
      (move) => move.id,
      () => null,
    )
  }

  return { onPlay, error: add.isError ? errorMessage(add.error) : null }
}

type Confirming = { move: MoveId; message: string; done: (deleted: boolean) => void }

// The move list's Promote to main line and Delete from here. Deleting a Move
// deletes its subtree; if the API answers that writing would go with it, the
// user confirms before it is sent again with the confirmation.
function useMoveEditing(noteId: number) {
  const promote = usePromoteMove(noteId)
  const remove = useDeleteMove(noteId)
  const [confirming, setConfirming] = useState<Confirming | null>(null)
  const [failed, setFailed] = useState<string | null>(null)
  const size = useOverlaySize()

  function onPromote(move: MoveId) {
    setFailed(null)
    promote.mutate(move, { onError: (error) => setFailed(errorMessage(error)) })
  }

  function onDelete(move: MoveId): Promise<boolean> {
    setFailed(null)
    return new Promise((done) => {
      remove.mutate(
        { moveId: move, confirm: false },
        {
          onSuccess: (result) => {
            if (result.status === 'deleted') done(true)
            else setConfirming({ move, message: result.message, done })
          },
          onError: (error) => {
            setFailed(errorMessage(error))
            done(false)
          },
        },
      )
    })
  }

  function closeConfirm() {
    confirming?.done(false)
    setConfirming(null)
    remove.reset()
  }

  function confirm() {
    if (!confirming) return
    remove.mutate(
      { moveId: confirming.move, confirm: true },
      {
        onSuccess: (result) => {
          if (result.status !== 'deleted') return
          confirming.done(true)
          setConfirming(null)
        },
      },
    )
  }

  return {
    onPromote,
    onDelete,
    error: failed,
    confirmDialog: (
      <DeleteWritingDialog
        size={size}
        message={confirming?.message ?? null}
        onClose={closeConfirm}
        onConfirm={confirm}
        deleting={remove.isPending}
        error={confirming && remove.isError ? errorMessage(remove.error) : null}
      />
    ),
  }
}

// The FEN and PGN under the board, applied to the Note (#109). A FEN, or a
// PGN with a new Position, resets the Note; any other PGN is matched to it.
// The API answers what either would delete until the user confirms it, and
// only then is it sent again with the confirmation.
function useApplying(noteId: number) {
  const reset = useResetPosition(noteId)
  const apply = useApplyTree(noteId)
  const size = useOverlaySize()
  const confirm = useApplyConfirm(size, 'The name and folder stay.')

  async function resetTo(kind: 'fen' | 'position', startFen: string | null, tree?: ResetTree): Promise<ApplyOutcome> {
    try {
      const result = await reset.mutateAsync({ startFen, confirm: false, tree })
      if (result.status !== 'reset') {
        if (!(await confirm.ask({ kind, loss: resetLoss(result) ?? '' }))) return 'cancelled'
        await reset.mutateAsync({ startFen, confirm: true, tree })
      }
      return 'applied'
    } catch (error) {
      return { error: errorMessage(error) }
    }
  }

  async function onApplyPgn(plan: PgnPlan): Promise<ApplyOutcome> {
    if (plan.kind === 'reset') return resetTo('position', plan.startFen, resetTree(plan.note))
    const input = treeInput(plan)
    try {
      const result = await apply.mutateAsync({ input, confirm: false })
      if (result.status !== 'applied') {
        if (!(await confirm.ask({ kind: 'pgn', loss: describeLoss(result) ?? '' }))) return 'cancelled'
        await apply.mutateAsync({ input, confirm: true })
      }
      return 'applied'
    } catch (error) {
      return { error: errorMessage(error) }
    }
  }

  return {
    onApplyFen: (startFen: string | null) => resetTo('fen', startFen),
    onApplyPgn,
    confirmDialog: confirm.dialog,
  }
}

// Links show their targets' current names from the Note's links. Until those
// load, or if they fail, a Link is shown without being called broken.
function useNoteLinking(noteId: number): { context: Linking; name: (target: number) => string | null } {
  const links = useNoteLinks(noteId)
  const names = useMemo(() => new Map(links.data?.targets.map((t) => [t.id, t.name])), [links.data])
  const loaded = links.isSuccess
  const resolve = useCallback(
    (target: number): LinkStatus => {
      const name = names.get(target)
      if (name !== undefined) return { status: 'resolved', name }
      return loaded ? { status: 'unresolved' } : { status: 'unknown' }
    },
    [names, loaded],
  )
  const name = useCallback((target: number) => names.get(target) ?? null, [names])
  const context = useMemo(() => ({ resolve, noteId }), [resolve, noteId])
  return { context, name }
}

type SaveWriting = ReturnType<typeof useSaveWriting>

// The Note's writing column.
function WritingColumn({
  writing,
  scrollToCurrent,
  tree,
  current,
  onMoveChange,
  menu,
  error,
}: {
  writing: ReadonlyMap<MoveId, Writing>
  /** Bring the current Move's writing into view, as when arriving by a Backlink. */
  scrollToCurrent: boolean
  tree: MoveTree
  current: MoveId
  onMoveChange: (move: MoveId) => void
  menu?: MoveMenu
  /** Why the last promote or delete from the move list's menu failed. */
  error: string | null
}) {
  const anchor = useRef<HTMLDivElement>(null)

  // Once, on arriving: the Note opens afresh for each Backlink followed.
  useEffect(() => {
    if (!scrollToCurrent) return
    const column = anchor.current?.parentElement
    column?.querySelector('[data-current]')?.scrollIntoView({ block: 'center' })
  }, [scrollToCurrent])

  return (
    <>
      <div ref={anchor} hidden />
      <WritingView
        tree={tree}
        current={current}
        onMoveChange={onMoveChange}
        writing={writing}
        menu={menu}
        belowMoves={
          error && (
            <Text c="accent" size="sm" role="alert">
              {error}
            </Text>
          )
        }
      />
    </>
  )
}

// The editor for the current Move, under the board, saving to the API.
function Editor({
  save,
  writing,
  tree,
  line,
  current,
}: {
  save: SaveWriting
  writing: ReadonlyMap<MoveId, Writing>
  tree: MoveTree
  line: Game
  current: MoveId
}) {
  // Once handed over, the text may be in no editor while it saves, or after
  // the save failed, so ask before the tab closes then too.
  useWarnBeforeUnload(save.isPending || save.isError)
  return (
    <CurrentMoveEditor
      tree={tree}
      line={line}
      current={current}
      writing={writing}
      editable
      onSave={(change) => save.mutate(change)}
      belowEditor={
        <>
          {save.isError && save.variables && (
            <Alert color="red" title="Your writing was not saved">
              <Stack gap="sm" align="flex-start">
                <Text size="sm">{errorMessage(save.error)}</Text>
                <Button variant="light" onClick={() => save.mutate(save.variables)}>
                  Try again
                </Button>
              </Stack>
            </Alert>
          )}
          {save.isPending && <div className={styles.saving}>Saving…</div>}
        </>
      }
    />
  )
}

// Tablet and mobile: the Note's Folder and name as a breadcrumb, and a button
// opening the Folder tree, in place of the desktop sidebar (Note-tablet.png,
// Note-mobile.png).
function Strip({ name, folder }: { name: string | null; folder?: string }) {
  const [opened, { toggle, close }] = useDisclosure(false)
  const size = useOverlaySize()

  return (
    <div className={styles.strip}>
      <span className={styles.stripName}>
        {folder && <span className={styles.stripFolder}>{folder} / </span>}
        {name}
      </span>
      <ResponsivePopover
        size={size}
        opened={opened}
        onClose={close}
        label="Your notes"
        target={
          <Button
            variant="outline"
            size="sm"
            leftSection={<FolderIcon />}
            onClick={toggle}
            className={styles.stripButton}
          >
            All notes
          </Button>
        }
      >
        <NoteTree onNavigate={close} showHeading={false} />
      </ResponsivePopover>
    </div>
  )
}

function NoteMissing() {
  return (
    <>
      <Strip name={null} />
      <div className={styles.centered}>
        <Stack align="center" gap="md" maw={380} ta="center">
          <Title order={2}>Note not found</Title>
          <Text>This note doesn't exist, or it has been deleted.</Text>
          <Button component={Link} to="/notes" variant="outline">
            Back to your notes
          </Button>
        </Stack>
      </div>
    </>
  )
}
