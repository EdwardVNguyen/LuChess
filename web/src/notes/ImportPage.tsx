import { Alert, Select } from '@mantine/core'
import { useNavigate, useSearch } from '@tanstack/react-router'
import { useState } from 'react'
import { errorMessage } from '../errors'
import { folderChoices, folderPath } from './folders'
import { newNoteInput } from './newNote'
import { NoteStartForm } from './NoteStartForm'
import { useCreateNote, useFolders } from './queries'

const ROOT = 'root'

// Import… (#106): a Note from a game in PGN, a position in FEN, or one set up
// on the board, filed in the Folder chosen. New note itself makes a blank
// Note straight away (useNewNote).
export function ImportPage() {
  const create = useCreateNote()
  const navigate = useNavigate()
  const folders = useFolders()
  // Opened from a Folder's "Import here…", that Folder is chosen to start with.
  const { folder: fromSearch } = useSearch({ strict: false })
  const [chosen, setChosen] = useState<number | null | undefined>(undefined)

  const choices = folders.data ? folderChoices(folders.data) : []
  const wanted = chosen === undefined ? (fromSearch ?? null) : chosen
  // A Folder that no longer exists (or hasn't loaded yet) files the Note at the root.
  const folderId = choices.some((choice) => choice.folder.id === wanted) ? wanted : null

  return (
    <NoteStartForm
      title="Import"
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
        create.mutate(
          newNoteInput(input, folderId),
          { onSuccess: (note) => void navigate({ to: '/notes/$noteId', params: { noteId: String(note.id) } }) },
        )
      }
    >
      <Select
        label="Folder"
        allowDeselect={false}
        value={folderId === null ? ROOT : String(folderId)}
        onChange={(value) => setChosen(value === null || value === ROOT ? null : Number(value))}
        data={[
          { value: ROOT, label: 'No folder (top of Your notes)' },
          ...choices.map(({ folder }) => ({
            value: String(folder.id),
            label: folderPath(folders.data ?? [], folder.id)
              .map((f) => f.name)
              .join(' / '),
          })),
        ]}
      />
    </NoteStartForm>
  )
}
