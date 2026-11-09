import { Alert, Button, Loader, Stack, Text, Title } from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import { Link, useParams, useSearch } from '@tanstack/react-router'
import { useCallback, useEffect, useMemo, useRef } from 'react'
import { ApiError, type Note } from '../api'
import type { Game } from '../chess/chess'
import { errorMessage } from '../errors'
import { ResponsivePopover, useOverlaySize } from '../overlay'
import { FolderIcon } from './icons'
import { LinkingContext, type Linking } from './linking'
import type { LinkStatus } from './links'
import { NoteActions } from './NoteActions'
import { NoteList } from './NoteList'
import styles from './Notes.module.css'
import { NoteMargin } from './NoteMargin'
import { useNote, useNoteLinks, usePlies, useSavePly } from './queries'
import { StudyView, WritingView } from './StudyView'

export function NoteScreen() {
  const { noteId } = useParams({ from: '/notes/$noteId' })
  const { ply } = useSearch({ from: '/notes/$noteId' })
  const id = /^\d+$/.test(noteId) ? Number(noteId) : null
  // Following a Backlink opens the Note afresh at the linking Ply.
  return id === null ? <NoteMissing /> : <LoadedNote key={`${id}@${ply}`} id={id} initialPly={ply} />
}

function LoadedNote({ id, initialPly }: { id: number; initialPly: number | undefined }) {
  const note = useNote(id)

  if (note.isPending) {
    return (
      <>
        <Strip name={null} />
        <div className={styles.centered}>
          <Loader aria-label="Loading note" />
        </div>
      </>
    )
  }
  if (note.isError) {
    if (note.error instanceof ApiError && note.error.status === 404) return <NoteMissing />
    return (
      <>
        <Strip name={null} />
        <div className={styles.message}>
          <Alert color="red" title="Could not open this note">
            <Stack gap="sm" align="flex-start">
              <Text size="sm">{errorMessage(note.error)}</Text>
              <Button variant="light" onClick={() => void note.refetch()}>
                Try again
              </Button>
            </Stack>
          </Alert>
        </div>
      </>
    )
  }
  return <NoteView note={note.data} initialPly={initialPly} />
}

function NoteView({ note, initialPly }: { note: Note; initialPly: number | undefined }) {
  const linking = useNoteLinking(note.id)
  return (
    <LinkingContext value={linking}>
      <Strip name={note.name} />
      <StudyView
        name={note.name}
        pgn={note.pgn}
        actions={<NoteActions note={note} />}
        initialPly={initialPly}
        margin={<NoteMargin noteId={note.id} />}
      >
        {(view) => <Writing noteId={note.id} scrollToCurrent={initialPly !== undefined} {...view} />}
      </StudyView>
    </LinkingContext>
  )
}

// Links show their targets' current names from the Note's links. Until those
// load, or if they fail, a Link is shown without being called broken.
function useNoteLinking(noteId: number): Linking {
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
  return useMemo(() => ({ resolve, noteId }), [resolve, noteId])
}

// The Note's writing, loaded from and saved to the API.
function Writing({
  noteId,
  scrollToCurrent,
  game,
  ply,
  onPlyChange,
}: {
  noteId: number
  /** Bring the current Ply's writing into view once it loads, as when arriving by a Backlink. */
  scrollToCurrent: boolean
  game: Game | null
  ply: number
  onPlyChange: (ply: number) => void
}) {
  const plies = usePlies(noteId)
  const save = useSavePly(noteId)
  const writing = useMemo(() => new Map((plies.data ?? []).map((p) => [p.ply, p])), [plies.data])
  const anchor = useRef<HTMLDivElement>(null)
  const scrolled = useRef(!scrollToCurrent)

  useEffect(() => {
    if (scrolled.current || !plies.isSuccess) return
    scrolled.current = true
    const column = anchor.current?.parentElement
    column?.querySelector('[data-current]')?.scrollIntoView({ block: 'center' })
  }, [plies.isSuccess])

  return (
    <>
    <div ref={anchor} hidden />
    <WritingView
      game={game}
      ply={ply}
      onPlyChange={onPlyChange}
      writing={writing}
      editable={plies.isSuccess}
      onSave={(change) => save.mutate(change)}
      aboveMoves={
        plies.isError && (
          <Alert color="red" title="Could not load your writing">
            <Stack gap="sm" align="flex-start">
              <Text size="sm">{errorMessage(plies.error)}</Text>
              <Button variant="light" onClick={() => void plies.refetch()}>
                Try again
              </Button>
            </Stack>
          </Alert>
        )
      }
      belowMoves={
        <>
          {plies.isPending && (
            <div className={styles.writingLoading}>
              <Loader size="sm" aria-label="Loading your writing" />
            </div>
          )}
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
        </>
      }
      belowEditor={save.isPending && <div className={styles.saving}>Saving…</div>}
    />
    </>
  )
}

// Tablet and mobile: the Note's name and a button opening the list of Notes,
// in place of the desktop sidebar (Note-tablet.png, Note-mobile.png).
function Strip({ name }: { name: string | null }) {
  const [opened, { toggle, close }] = useDisclosure(false)
  const size = useOverlaySize()

  return (
    <div className={styles.strip}>
      <span className={styles.stripName}>{name}</span>
      <ResponsivePopover
        size={size}
        opened={opened}
        onClose={close}
        label="Your notes"
        target={
          <Button variant="outline" size="sm" leftSection={<FolderIcon />} onClick={toggle} className={styles.stripButton}>
            All notes
          </Button>
        }
      >
        <NoteList onNavigate={close} showHeading={false} />
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
