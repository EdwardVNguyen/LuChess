import { Alert, Button, Loader, Stack, Text, Title } from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import { Link, useParams } from '@tanstack/react-router'
import { useState } from 'react'
import { ApiError, type Note } from '../api'
import { Board } from '../board'
import { parsePgn } from '../chess/chess'
import { errorMessage } from '../errors'
import { ResponsivePopover, useOverlaySize } from '../overlay'
import { noteDetails } from './details'
import { FolderIcon } from './icons'
import { MoveList } from './MoveList'
import { NoteActions } from './NoteActions'
import { NoteList } from './NoteList'
import styles from './Notes.module.css'
import { useNote } from './queries'

export function NoteScreen() {
  const { noteId } = useParams({ from: '/notes/$noteId' })
  const id = /^\d+$/.test(noteId) ? Number(noteId) : null
  return id === null ? <NoteMissing /> : <LoadedNote key={id} id={id} />
}

function LoadedNote({ id }: { id: number }) {
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
  return <NoteView note={note.data} />
}

function NoteView({ note }: { note: Note }) {
  const parsed = parsePgn(note.pgn)
  // Open at the end of the game, so a pasted game shows its final position.
  const [ply, setPly] = useState(() => (parsed.ok ? parsed.value.plies.length - 1 : 0))
  const details = parsed.ok ? noteDetails(parsed.value.tags) : null

  return (
    <>
      <Strip name={note.name} />
      <div className={styles.note}>
        <section className={styles.boardColumn} aria-label="Position">
          <div className={styles.titleBlock}>
            <div className={styles.titleRow}>
              <h1 className={styles.title}>{note.name}</h1>
              <NoteActions note={note} />
            </div>
            {details && <div className={styles.details}>{details}</div>}
          </div>
          {parsed.ok ? (
            <Board mode="view" game={parsed.value} ply={ply} onPlyChange={setPly} />
          ) : (
            <Alert color="red" title="This note's moves could not be read">
              {parsed.error}
            </Alert>
          )}
        </section>
        <section className={styles.movesColumn} aria-label="Moves">
          <div className={styles.eyebrow}>Moves</div>
          {parsed.ok && <MoveList game={parsed.value} ply={ply} onPlyChange={setPly} />}
        </section>
      </div>
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
