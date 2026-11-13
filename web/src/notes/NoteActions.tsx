import { Menu, Text, UnstyledButton } from '@mantine/core'
import { useNavigate, useParams } from '@tanstack/react-router'
import { useState } from 'react'
import type { Note, NoteSummary } from '../api'
import { errorMessage } from '../errors'
import { ConfirmDialog, useOverlaySize } from '../overlay'
import { MoreIcon } from './icons'
import styles from './Notes.module.css'
import { MoveNoteDialog } from './FolderDialogs'
import { useDeleteNote } from './queries'

// The menu beside a Note's title: Rename, which renames the title in place,
// and Move to folder and Delete, each in a dialog.
export function NoteActions({ note, onRename }: { note: Note; onRename: () => void }) {
  const [dialog, setDialog] = useState<'move' | 'delete' | null>(null)
  // Closing, the menu puts focus back on its button, which would take it from
  // the title's field and end the rename at once: not when Rename was chosen.
  const [renaming, setRenaming] = useState(false)
  const size = useOverlaySize()

  return (
    <>
      <Menu position="bottom-end" width={170} withinPortal returnFocus={!renaming} onOpen={() => setRenaming(false)}>
        <Menu.Target>
          <UnstyledButton className={styles.actions} aria-label="Note actions">
            <MoreIcon />
          </UnstyledButton>
        </Menu.Target>
        <Menu.Dropdown>
          <Menu.Item
            onClick={() => {
              setRenaming(true)
              onRename()
            }}
          >
            Rename
          </Menu.Item>
          <Menu.Item onClick={() => setDialog('move')}>Move to folder</Menu.Item>
          <Menu.Item color="accent.6" onClick={() => setDialog('delete')}>
            Delete
          </Menu.Item>
        </Menu.Dropdown>
      </Menu>
      {dialog === 'move' && <MoveNoteDialog note={note} size={size} onClose={() => setDialog(null)} />}
      {dialog === 'delete' && <DeleteNoteDialog note={note} size={size} onClose={() => setDialog(null)} />}
    </>
  )
}

type DialogProps = { note: Note; size: ReturnType<typeof useOverlaySize>; onClose: () => void }

// Deleting a Note, from the menu beside its title or its row in Your notes.
// Deleting the open Note leaves it for the list of Notes; deleting another stays put.
export function DeleteNoteDialog({ note, size, onClose }: Omit<DialogProps, 'note'> & { note: NoteSummary }) {
  const remove = useDeleteNote(note.id)
  const navigate = useNavigate()
  const { noteId } = useParams({ strict: false })
  const isOpen = noteId === String(note.id)

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
      onConfirm={() =>
        remove.mutate(undefined, {
          onSuccess: () => {
            if (isOpen) void navigate({ to: '/notes' })
            onClose()
          },
        })
      }
      confirmLoading={remove.isPending}
      destructive
    />
  )
}
