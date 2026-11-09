import { Loader, Radio, Text, TextInput } from '@mantine/core'
import { useState } from 'react'
import type { Folder, Note } from '../api'
import { errorMessage } from '../errors'
import { ConfirmDialog, ResponsiveDialog, type OverlaySize } from '../overlay'
import { folderChoices, folderContents } from './folders'
import styles from './Notes.module.css'
import { useCreateFolder, useDeleteFolder, useFolders, useMoveNote, useNoteList, useUpdateFolder } from './queries'

const MAX_NAME_LENGTH = 200

type DialogProps = { size: OverlaySize; onClose: () => void }

// The New folder dialog (NewFolder.png): only the Folder's name. "Who can see
// it" is left out, as Notes are private in v1 (web/AGENTS.md).
export function NewFolderDialog({ size, onClose, parent, onCreated }: DialogProps & {
  /** Where the Folder goes; the root when null. */
  parent: Folder | null
  onCreated?: (folder: Folder) => void
}) {
  const create = useCreateFolder()
  return (
    <FolderNameDialog
      size={size}
      onClose={onClose}
      title={parent ? 'New subfolder' : 'New folder'}
      description={parent ? `Inside ${parent.name}` : undefined}
      initialName=""
      confirmLabel="Create folder"
      pending={create.isPending}
      error={create.isError ? errorMessage(create.error) : null}
      onSubmit={(name) =>
        create.mutate(
          { name, parentId: parent?.id ?? null },
          {
            onSuccess: (folder) => {
              onCreated?.(folder)
              onClose()
            },
          },
        )
      }
    />
  )
}

export function RenameFolderDialog({ size, onClose, folder }: DialogProps & { folder: Folder }) {
  const update = useUpdateFolder(folder.id)
  return (
    <FolderNameDialog
      size={size}
      onClose={onClose}
      title="Rename folder"
      initialName={folder.name}
      confirmLabel="Rename"
      pending={update.isPending}
      error={update.isError ? errorMessage(update.error) : null}
      onSubmit={(name) => (name === folder.name ? onClose() : update.mutate({ name }, { onSuccess: onClose }))}
    />
  )
}

function FolderNameDialog({
  size,
  onClose,
  title,
  description,
  initialName,
  confirmLabel,
  pending,
  error,
  onSubmit,
}: DialogProps & {
  title: string
  description?: string
  initialName: string
  confirmLabel: string
  pending: boolean
  error: string | null
  onSubmit: (name: string) => void
}) {
  const [name, setName] = useState(initialName)
  const trimmed = name.trim()
  const invalid = trimmed.length === 0 || trimmed.length > MAX_NAME_LENGTH

  function submit() {
    if (!invalid && !pending) onSubmit(trimmed)
  }

  return (
    <ResponsiveDialog
      size={size}
      opened
      onClose={onClose}
      title={title}
      confirmLabel={confirmLabel}
      onConfirm={submit}
      confirmDisabled={invalid}
      confirmLoading={pending}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault()
          submit()
        }}
      >
        <TextInput
          label="Folder name"
          description={description}
          value={name}
          onChange={(event) => setName(event.currentTarget.value)}
          maxLength={MAX_NAME_LENGTH}
          data-autofocus
          error={error ?? undefined}
        />
      </form>
    </ResponsiveDialog>
  )
}

// Moving a Note has no design: a list of the Folders as a tree of radio
// buttons, in the style of the dev overlay page's "Save to folder", with the
// root first.
function FolderPicker({
  folders,
  value,
  onChange,
  rootLabel,
  exclude,
}: {
  folders: Folder[]
  value: number | null
  onChange: (id: number | null) => void
  rootLabel: string
  /** A Folder being moved: it and its subfolders are not offered. */
  exclude?: number
}) {
  return (
    <Radio.Group
      label="Move to"
      value={value === null ? 'root' : String(value)}
      onChange={(next) => onChange(next === 'root' ? null : Number(next))}
    >
      <div className={styles.folderPicker}>
        <Radio value="root" label={rootLabel} className={styles.folderChoice} />
        {folderChoices(folders, exclude).map(({ folder, depth }) => (
          <Radio
            key={folder.id}
            value={String(folder.id)}
            label={folder.name}
            className={styles.folderChoice}
            style={{ paddingLeft: `calc(${depth} * var(--cn-tree-indent))` }}
          />
        ))}
      </div>
    </Radio.Group>
  )
}

function MoveDialog({
  size,
  onClose,
  title,
  current,
  exclude,
  pending,
  error,
  onMove,
}: DialogProps & {
  title: string
  current: number | null
  exclude?: number
  pending: boolean
  error: string | null
  onMove: (folderId: number | null) => void
}) {
  const folders = useFolders()
  const [choice, setChoice] = useState(current)

  return (
    <ResponsiveDialog
      size={size}
      opened
      onClose={onClose}
      title={title}
      confirmLabel="Move"
      onConfirm={() => (choice === current ? onClose() : onMove(choice))}
      confirmDisabled={!folders.isSuccess}
      confirmLoading={pending}
    >
      {folders.isPending && <Loader size="sm" aria-label="Loading folders" />}
      {folders.isError && (
        <Text size="sm" role="alert">
          {errorMessage(folders.error)}
        </Text>
      )}
      {folders.isSuccess && (
        <FolderPicker
          folders={folders.data}
          value={choice}
          onChange={setChoice}
          rootLabel="No folder (top of Your notes)"
          exclude={exclude}
        />
      )}
      {error && (
        <Text size="sm" c="accent" role="alert">
          {error}
        </Text>
      )}
    </ResponsiveDialog>
  )
}

export function MoveNoteDialog({ size, onClose, note }: DialogProps & { note: Note }) {
  const move = useMoveNote(note.id)
  return (
    <MoveDialog
      size={size}
      onClose={onClose}
      title="Move note"
      current={note.folderId}
      pending={move.isPending}
      error={move.isError ? errorMessage(move.error) : null}
      onMove={(folderId) => move.mutate(folderId, { onSuccess: onClose })}
    />
  )
}

export function MoveFolderDialog({ size, onClose, folder }: DialogProps & { folder: Folder }) {
  const update = useUpdateFolder(folder.id)
  return (
    <MoveDialog
      size={size}
      onClose={onClose}
      title="Move folder"
      current={folder.parentId}
      exclude={folder.id}
      pending={update.isPending}
      error={update.isError ? errorMessage(update.error) : null}
      onMove={(parentId) => update.mutate({ parentId }, { onSuccess: onClose })}
    />
  )
}

const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

function contentsMessage({ folders, notes }: { folders: number; notes: number }) {
  if (folders === 0 && notes === 0) return 'This folder is empty.'
  const parts = [
    folders > 0 && `its ${count(folders, 'subfolder', 'subfolders')} will be deleted too`,
    notes > 0 && `${count(notes, 'note', 'notes')} inside will move to the top of Your notes`,
  ].filter(Boolean)
  const sentence = parts.join(', and ')
  return `${sentence.charAt(0).toUpperCase()}${sentence.slice(1)}. No note is deleted.`
}

// Deleting a Folder: the dialog shows what it holds, as far as this browser
// knows. Confirming asks the API without confirmation first: if the API's
// counts match what was shown, the user has already agreed to them and the
// delete is confirmed; if they differ, the dialog shows the API's and asks again.
export function DeleteFolderDialog({ size, onClose, folder }: DialogProps & { folder: Folder }) {
  const folders = useFolders()
  const notes = useNoteList()
  const remove = useDeleteFolder(folder.id)
  const [fromServer, setFromServer] = useState<{ folders: number; notes: number } | null>(null)
  const known = folders.isSuccess && notes.isSuccess ? folderContents(folders.data, notes.data, folder.id) : null
  const shown = fromServer ?? known
  const agreed = (a: typeof shown, b: { folders: number; notes: number }) =>
    a !== null && a.folders === b.folders && a.notes === b.notes

  function confirm() {
    // Once the API's own counts are shown, the user is agreeing to those.
    if (fromServer) return remove.mutate(true, { onSuccess: onClose })
    remove.mutate(false, {
      onSuccess: (result) => {
        if (result.status === 'deleted') return onClose()
        const counts = { folders: result.folders, notes: result.notes }
        if (agreed(shown, counts)) remove.mutate(true, { onSuccess: onClose })
        else setFromServer(counts)
      },
    })
  }

  return (
    <ConfirmDialog
      size={size}
      opened
      onClose={onClose}
      title="Delete folder"
      message={
        <>
          <Text span fw={600}>
            {folder.name}
          </Text>{' '}
          will be deleted. {shown ? contentsMessage(shown) : 'No note inside it is deleted.'}
          {remove.isError && (
            <Text component="span" display="block" c="accent" size="sm" mt="sm" role="alert">
              {errorMessage(remove.error)}
            </Text>
          )}
        </>
      }
      confirmLabel="Delete folder"
      onConfirm={confirm}
      confirmLoading={remove.isPending}
      destructive
    />
  )
}
