import { UnstyledButton } from '@mantine/core'
import { useEffect, useRef } from 'react'
import type { Note } from '../api'
import { errorMessage } from '../errors'
import { NameField } from './InlineRename'
import styles from './Notes.module.css'
import { useRenameNote } from './queries'
import type { RenameEnd } from './useInlineRename'

const TITLE_TYPE = {
  fontFamily: 'inherit',
  fontSize: 'inherit',
  fontWeight: 'inherit',
  lineHeight: 'inherit',
  letterSpacing: 'inherit',
  height: 'auto',
} as const

type Props = {
  note: Note
  renaming: boolean
  onStart: () => void
  onEnd: () => void
}

/**
 * A Note's title in the study view, renamed in place (#106): clicking it, or
 * Rename in its menu, makes it a field, which works as a row's name does in
 * the Folder tree. A Note New note has just made opens with it already a
 * field, "Untitled" selected.
 */
export function NoteTitle({ note, renaming, onStart, onEnd }: Props) {
  const rename = useRenameNote(note.id)
  const title = useRef<HTMLButtonElement>(null)
  // A rename ended from the keyboard puts focus back on the title.
  const refocus = useRef(false)

  useEffect(() => {
    if (renaming || !refocus.current) return
    refocus.current = false
    title.current?.focus()
  }, [renaming])

  function done(how: RenameEnd) {
    refocus.current = how === 'keyboard'
    rename.reset()
    onEnd()
  }

  if (renaming) {
    return (
      <NameField
        className={`${styles.title} ${styles.titleField}`}
        classNames={{ input: styles.titleInput }}
        // The theme sets the input's type inline; the title's own wins here.
        styles={{ input: TITLE_TYPE }}
        label={`Rename note ${note.name}`}
        initialName={note.name}
        pending={rename.isPending}
        error={rename.isError ? errorMessage(rename.error) : null}
        onSubmit={(name, how) => rename.mutate(name, { onSuccess: () => done(how) })}
        onDone={done}
      />
    )
  }
  return (
    <h1 className={styles.title}>
      <UnstyledButton ref={title} className={styles.titleButton} title="Rename" onClick={onStart}>
        {note.name}
      </UnstyledButton>
    </h1>
  )
}
