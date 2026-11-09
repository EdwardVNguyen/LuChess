import { Menu, Text, TextInput, UnstyledButton } from '@mantine/core'
import { useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import type { Note } from '../api'
import { errorMessage } from '../errors'
import { ConfirmDialog, ResponsiveDialog, useOverlaySize } from '../overlay'
import { MoreIcon } from './icons'
import styles from './Notes.module.css'
import { useDeleteNote, useRenameNote } from './queries'

const MAX_NAME_LENGTH = 200

// The menu beside a Note's title: Edit moves, which the Note screen handles,
// and Rename and Delete, each confirmed in a dialog.
export function NoteActions({ note, onEditMoves }: { note: Note; onEditMoves?: () => void }) {
  const [dialog, setDialog] = useState<'rename' | 'delete' | null>(null)
  const size = useOverlaySize()

  return (
    <>
      <Menu position="bottom-end" width={170} withinPortal>
        <Menu.Target>
          <UnstyledButton className={styles.actions} aria-label="Note actions">
            <MoreIcon />
          </UnstyledButton>
        </Menu.Target>
        <Menu.Dropdown>
          {onEditMoves && <Menu.Item onClick={onEditMoves}>Edit moves</Menu.Item>}
          <Menu.Item onClick={() => setDialog('rename')}>Rename</Menu.Item>
          <Menu.Item color="accent.6" onClick={() => setDialog('delete')}>
            Delete
          </Menu.Item>
        </Menu.Dropdown>
      </Menu>
      {dialog === 'rename' && <RenameDialog note={note} size={size} onClose={() => setDialog(null)} />}
      {dialog === 'delete' && <DeleteDialog note={note} size={size} onClose={() => setDialog(null)} />}
    </>
  )
}

type DialogProps = { note: Note; size: ReturnType<typeof useOverlaySize>; onClose: () => void }

function RenameDialog({ note, size, onClose }: DialogProps) {
  const [name, setName] = useState(note.name)
  const rename = useRenameNote(note.id)
  const trimmed = name.trim()
  const invalid = trimmed.length === 0 || trimmed.length > MAX_NAME_LENGTH

  function submit() {
    if (invalid) return
    if (trimmed === note.name) return onClose()
    rename.mutate(trimmed, { onSuccess: onClose })
  }

  return (
    <ResponsiveDialog
      size={size}
      opened
      onClose={onClose}
      title="Rename note"
      confirmLabel="Rename"
      onConfirm={submit}
      confirmDisabled={invalid}
      confirmLoading={rename.isPending}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault()
          submit()
        }}
      >
        <TextInput
          label="Name"
          value={name}
          onChange={(event) => setName(event.currentTarget.value)}
          maxLength={MAX_NAME_LENGTH}
          data-autofocus
          error={rename.isError ? errorMessage(rename.error) : undefined}
        />
      </form>
    </ResponsiveDialog>
  )
}

function DeleteDialog({ note, size, onClose }: DialogProps) {
  const remove = useDeleteNote(note.id)
  const navigate = useNavigate()

  return (
    <ConfirmDialog
      size={size}
      opened
      onClose={onClose}
      title="Delete note"
      message={
        <>
          <Text span fw={600}>
            {note.name}
          </Text>{' '}
          and everything written in it will be deleted. This cannot be undone.
          {remove.isError && (
            <Text component="span" display="block" c="accent" size="sm" mt="sm" role="alert">
              {errorMessage(remove.error)}
            </Text>
          )}
        </>
      }
      confirmLabel="Delete note"
      onConfirm={() => remove.mutate(undefined, { onSuccess: () => void navigate({ to: '/notes' }) })}
      confirmLoading={remove.isPending}
      destructive
    />
  )
}
