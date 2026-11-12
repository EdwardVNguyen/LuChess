import { Alert, Button, Loader, Stack, Text, Title } from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import { Link, useParams, useSearch } from '@tanstack/react-router'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ApiError, type MoveRow, type Note } from '../api'
import { START_FEN, type Game } from '../chess/chess'
import type { Writing } from '../chess/pgn'
import { readingOrder, treeFromRows, type MoveId, type MoveTree } from '../chess/tree'
import { errorMessage } from '../errors'
import { ConfirmDialog, ResponsivePopover, useOverlaySize } from '../overlay'
import { FolderIcon } from './icons'
import { LinkingContext, type Linking } from './linking'
import type { LinkStatus } from './links'
import { NoteActions } from './NoteActions'
import { folderPath } from './folders'
import { NoteTree } from './NoteTree'
import styles from './Notes.module.css'
import { NoteMargin } from './NoteMargin'
import { useAddMove, useDeleteMove, useFolders, useMoves, useNote, useNoteLinks, useSaveWriting } from './queries'
import { CurrentMoveEditor, StudyView, WritingView } from './StudyView'
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
  const editing = useMoveEditing(note.id)
  const save = useSaveWriting(note.id)
  const folders = useFolders()
  const path = folderPath(folders.data ?? [], note.folderId).map((folder) => folder.name)
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
        eyebrow={path.length > 0 ? path.join(' / ') : undefined}
        tree={tree.value}
        tags={note.tags}
        writing={writing}
        linkName={linking.name}
        actions={<NoteActions note={note} onEditMoves={editing.start} />}
        initialMove={initialMove}
        margin={<NoteMargin noteId={note.id} writing={inReadingOrder} />}
        moveEditing={editing.editing}
        tools={(view) => <Editor save={save} writing={writing} {...view} />}
      >
        {(view) => <WritingColumn writing={writing} scrollToCurrent={initialMove !== undefined} {...view} />}
      </StudyView>
      {editing.confirmDialog}
    </LinkingContext>
  )
}

type Confirming = { move: MoveId; message: string; done: (deleted: boolean) => void }

// Playing moves on a Note's board: each move is added as it is played. Deleting
// a Move deletes its subtree; if the API answers that writing would go with
// it, the user confirms before it is sent again with the confirmation.
function useMoveEditing(noteId: number) {
  const [active, setActive] = useState(false)
  const [confirming, setConfirming] = useState<Confirming | null>(null)
  const add = useAddMove(noteId)
  const remove = useDeleteMove(noteId)
  const size = useOverlaySize()

  function onPlay(parentId: MoveId, san: string): Promise<MoveId | null> {
    remove.reset()
    return add.mutateAsync({ parentId, san }).then(
      (move) => move.id,
      () => null,
    )
  }

  function onDelete(move: MoveId): Promise<boolean> {
    add.reset()
    return new Promise((done) => {
      remove.mutate(
        { moveId: move, confirm: false },
        {
          onSuccess: (result) => {
            if (result.status === 'deleted') done(true)
            else setConfirming({ move, message: result.message, done })
          },
          onError: () => done(false),
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

  const failed = add.isError ? add.error : remove.isError && !confirming ? remove.error : null

  return {
    start: active
      ? undefined
      : () => {
          add.reset()
          remove.reset()
          setActive(true)
        },
    editing: active
      ? {
          onPlay,
          onDelete,
          onDone: () => setActive(false),
          saving: add.isPending || remove.isPending,
          error: failed ? errorMessage(failed) : null,
        }
      : null,
    confirmDialog: confirming && (
      <ConfirmDialog
        size={size}
        opened
        onClose={closeConfirm}
        title="Delete your writing?"
        message={
          <>
            {confirming.message}: everything written from this move on, in every Variation after it, and the Links in
            them. This cannot be undone.
            {remove.isError && (
              <Text component="span" display="block" c="accent" size="sm" mt="sm" role="alert">
                {errorMessage(remove.error)}
              </Text>
            )}
          </>
        }
        confirmLabel="Delete"
        onConfirm={confirm}
        confirmLoading={remove.isPending}
        destructive
      />
    ),
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
}: {
  writing: ReadonlyMap<MoveId, Writing>
  /** Bring the current Move's writing into view, as when arriving by a Backlink. */
  scrollToCurrent: boolean
  tree: MoveTree
  current: MoveId
  onMoveChange: (move: MoveId) => void
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
      <WritingView tree={tree} current={current} onMoveChange={onMoveChange} writing={writing} />
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
