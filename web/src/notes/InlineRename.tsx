import { TextInput } from '@mantine/core'
import { useRef, useState, type CSSProperties, type ReactNode } from 'react'
import type { Folder, NoteSummary } from '../api'
import { errorMessage } from '../errors'
import styles from './Notes.module.css'
import type { RenameEnd } from './useInlineRename'
import { useRenameNote, useUpdateFolder } from './queries'

const MAX_NAME_LENGTH = 200

type FieldProps = {
  onDone: (how: RenameEnd) => void
  depth: number
  /** What goes before the name, as in the row: a Folder's chevron, or nothing for a Note. */
  slot?: ReactNode
}

/** The Note or Folder being renamed. */
export type RenameItem = { kind: 'note'; note: NoteSummary } | { kind: 'folder'; folder: Folder }

/**
 * A Note's or a Folder's name in its row of the Folder tree, as a field, to
 * rename it in place (#99, #100). Shown in place of the row, so clicks on it
 * neither open the Note nor toggle the Folder.
 */
export function InlineRename({ item, ...rest }: FieldProps & { item: RenameItem }) {
  return item.kind === 'note' ? <NoteName note={item.note} {...rest} /> : <FolderName folder={item.folder} {...rest} />
}

function NoteName({ note, ...rest }: FieldProps & { note: NoteSummary }) {
  const rename = useRenameNote(note.id)
  return (
    <InlineNameField
      {...rest}
      label={`Rename note ${note.name}`}
      initialName={note.name}
      pending={rename.isPending}
      error={rename.isError ? errorMessage(rename.error) : null}
      onSubmit={(name, how) => rename.mutate(name, { onSuccess: () => rest.onDone(how) })}
    />
  )
}

function FolderName({ folder, ...rest }: FieldProps & { folder: Folder }) {
  const update = useUpdateFolder(folder.id)
  return (
    <InlineNameField
      {...rest}
      label={`Rename folder ${folder.name}`}
      initialName={folder.name}
      pending={update.isPending}
      error={update.isError ? errorMessage(update.error) : null}
      onSubmit={(name, how) => update.mutate({ name }, { onSuccess: () => rest.onDone(how) })}
    />
  )
}

// The name in a row of the Folder tree, as a field, after the row's slot.
function InlineNameField({ depth, slot, ...rest }: FieldProps & Omit<NameFieldProps, 'className' | 'size' | 'classNames' | 'styles'>) {
  return (
    <div className={styles.renameRow} style={{ '--depth': depth } as CSSProperties}>
      <span className={styles.treeSlot}>{slot}</span>
      <NameField className={styles.renameField} size="xs" {...rest} />
    </div>
  )
}

export type NameFieldProps = {
  label: string
  initialName: string
  pending: boolean
  error: string | null
  onSubmit: (name: string, how: RenameEnd) => void
  onDone: (how: RenameEnd) => void
  className?: string
  size?: string
  classNames?: { input?: string }
  /** Inline input styles, which win over the theme's own (e.g. its font size). */
  styles?: { input?: CSSProperties }
}

/**
 * A name as a field, to rename it in place: in a row of the Folder tree, and
 * a Note's title in the study view (#106). It opens with the name selected,
 * so typing replaces it. Enter or leaving the field saves it, Escape keeps
 * the old one. An empty or unchanged name saves nothing. A failed save keeps
 * the field open with the error under it.
 */
export function NameField({
  label,
  initialName,
  pending,
  error,
  onSubmit,
  onDone,
  className,
  size,
  classNames,
  styles: inputStyles,
}: NameFieldProps) {
  const [name, setName] = useState(initialName)
  // Escape, then the blur as the field goes, must not also save.
  const ended = useRef(false)

  function end(how: RenameEnd) {
    ended.current = true
    onDone(how)
  }

  function commit(how: RenameEnd) {
    if (pending || ended.current) return
    const trimmed = name.trim()
    if (trimmed.length === 0 || trimmed === initialName) return end(how)
    onSubmit(trimmed, how)
  }

  return (
    <TextInput
      className={className}
      classNames={classNames}
      styles={inputStyles}
      size={size}
      aria-label={label}
      value={name}
      onChange={(event) => setName(event.currentTarget.value)}
      maxLength={MAX_NAME_LENGTH}
      readOnly={pending}
      error={error ?? undefined}
      autoFocus
      onFocus={(event) => event.currentTarget.select()}
      onBlur={() => commit('blur')}
      onKeyDown={(event) => {
        // Neither the tree nor an overlay it is in acts on these keys.
        event.stopPropagation()
        if (event.key === 'Enter') {
          event.preventDefault()
          commit('keyboard')
        } else if (event.key === 'Escape') {
          event.preventDefault()
          end('keyboard')
        }
      }}
      // The field keeps the browser's own menu, to cut, copy and paste.
      onContextMenu={(event) => event.stopPropagation()}
      onTouchStart={(event) => event.stopPropagation()}
    />
  )
}
