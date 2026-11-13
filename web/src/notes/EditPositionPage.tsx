import { Alert, Button, Loader, Stack, Text, Title } from '@mantine/core'
import { Link, useParams } from '@tanstack/react-router'
import { useState } from 'react'
import { ApiError } from '../api'
import { errorMessage } from '../errors'
import { EditPosition } from './EditPosition'
import { resetLoss } from './editPosition'
import styles from './Notes.module.css'
import { useNote, useResetPosition } from './queries'
import { useBackToNote } from './useEditPosition'

// /notes/$noteId/position: Edit position for a saved Note (#108).
export function EditPositionPage() {
  const { noteId } = useParams({ from: '/notes/$noteId/position' })
  const id = /^\d+$/.test(noteId) ? Number(noteId) : null
  return id === null ? <NoteMissing /> : <EditSavedPosition key={id} id={id} />
}

function EditSavedPosition({ id }: { id: number }) {
  const note = useNote(id)
  const reset = useResetPosition(id)
  const [confirming, setConfirming] = useState<{ startFen: string | null; loss: string } | null>(null)
  const leave = useBackToNote(id)

  if (note.isError) {
    if (note.error instanceof ApiError && note.error.status === 404) return <NoteMissing />
    return (
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
    )
  }
  if (note.isPending) {
    return (
      <div className={styles.centered}>
        <Loader aria-label="Loading note" />
      </div>
    )
  }

  // The server answers how much would go; a Note with nothing to lose resets at once.
  function save(startFen: string | null) {
    reset.mutate(
      { startFen, confirm: false },
      {
        onSuccess: (result) => {
          if (result.status === 'reset') leave()
          else setConfirming({ startFen, loss: resetLoss(result) ?? '' })
        },
      },
    )
  }

  function confirm() {
    if (!confirming) return
    reset.mutate({ startFen: confirming.startFen, confirm: true }, { onSuccess: (result) => result.status === 'reset' && leave() })
  }

  return (
    <EditPosition
      name={note.data.name}
      onSave={save}
      onCancel={leave}
      saving={reset.isPending}
      error={reset.isError ? errorMessage(reset.error) : null}
      confirming={confirming && { loss: confirming.loss, keeps: 'The name and folder stay.' }}
      onConfirm={confirm}
      onDismiss={() => {
        setConfirming(null)
        reset.reset()
      }}
    />
  )
}

function NoteMissing() {
  return (
    <div className={styles.centered}>
      <Stack align="center" gap="md" maw={380} ta="center">
        <Title order={2}>Note not found</Title>
        <Text>This note doesn't exist, or it has been deleted.</Text>
        <Button component={Link} to="/notes" variant="outline">
          Back to your notes
        </Button>
      </Stack>
    </div>
  )
}
