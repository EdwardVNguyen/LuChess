import { Alert } from '@mantine/core'
import { useNavigate } from '@tanstack/react-router'
import { errorMessage } from '../errors'
import { NoteStartForm } from './NoteStartForm'
import { useCreateNote } from './queries'

export function NewNotePage() {
  const create = useCreateNote()
  const navigate = useNavigate()

  return (
    <NoteStartForm
      title="New note"
      submitLabel="Create note"
      pending={create.isPending}
      error={
        create.isError && (
          <Alert color="red" title="Could not create the note">
            {errorMessage(create.error)}
          </Alert>
        )
      }
      onSubmit={(input) =>
        create.mutate(input, {
          onSuccess: (note) => void navigate({ to: '/notes/$noteId', params: { noteId: String(note.id) } }),
        })
      }
    />
  )
}
