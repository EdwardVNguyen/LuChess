import { Textarea, UnstyledButton } from '@mantine/core'
import { useEffect, useRef, useState, type ChangeEvent, type KeyboardEvent, type ReactElement, type Ref } from 'react'
import { ResponsivePopover, useOverlaySize } from '../overlay'
import { LinkPicker } from './LinkPicker'
import { useLinking } from './linking'
import { linkToken } from './links'
import styles from './Notes.module.css'

type Props = {
  label: string
  placeholder: string
  saved: string
  /** Saves the text, or null to delete what is saved. */
  onSave: (text: string | null) => void
  /**
   * Makes it the inline editor for a Comment in the move list (#97): it opens
   * focused, Enter saves and closes it, Shift+Enter adds a line, Escape
   * cancels, and leaving it saves and closes it. Saving it empty deletes the
   * Comment. It is all phrasing content, so it can sit inside the move list's
   * paragraphs.
   */
  onClose?: () => void
}

// The editor for a Comment or a Body. Text saves when the editor loses focus
// (so moving to another Move saves first). Typing [[ in a saved Note opens
// the picker to link another Note. Under the board it stays open: Ctrl/⌘+Enter
// saves, Escape undoes, and Delete clears what is saved.
export function TextEditor({ label, placeholder, saved, onSave, onClose }: Props) {
  const { noteId } = useLinking()
  const size = useOverlaySize()
  const inline = onClose !== undefined
  const [draft, setDraft] = useState(saved)
  // Where the [[ that opened the picker sits in the draft, while it is open.
  const [picking, setPicking] = useState<{ start: number; end: number } | null>(null)
  const pickingRef = useRef(false)
  // The inline editor saves or cancels once, however it is closed.
  const closed = useRef(false)
  const input = useRef<HTMLTextAreaElement>(null)

  // Opened from the move list's menu, it takes focus once the menu has let it go.
  useEffect(() => {
    if (!inline) return
    const frame = requestAnimationFrame(() => {
      const end = input.current?.value.length ?? 0
      input.current?.focus()
      input.current?.setSelectionRange(end, end)
    })
    return () => cancelAnimationFrame(frame)
  }, [inline])

  function save() {
    if (draft.trim() !== saved.trim()) onSave(draft.trim() === '' ? null : draft)
  }

  function close(saving: boolean) {
    if (closed.current) return
    closed.current = true
    if (saving) save()
    onClose?.()
  }

  function onChange(event: ChangeEvent<HTMLTextAreaElement>) {
    const { value, selectionStart: caret } = event.currentTarget
    if (noteId !== null && value.length > draft.length && value.slice(caret - 2, caret) === '[[') {
      pickingRef.current = true
      setPicking({ start: caret - 2, end: caret })
    }
    setDraft(value)
  }

  // The picker takes focus; the text saves when the user leaves the editor, not then.
  function onBlur() {
    if (pickingRef.current) return
    if (inline) close(true)
    else save()
  }

  function closePicker(caret: number) {
    pickingRef.current = false
    setPicking(null)
    // Once focus is back in the editor, put the caret after the [[ or the Link.
    requestAnimationFrame(() => {
      input.current?.focus()
      input.current?.setSelectionRange(caret, caret)
    })
  }

  function insertLink(target: number, linkLabel: string) {
    if (!picking) return
    const token = linkToken(target, linkLabel)
    setDraft(draft.slice(0, picking.start) + token + draft.slice(picking.end))
    closePicker(picking.start + token.length)
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (inline) {
      if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
        event.preventDefault()
        close(true)
      } else if (event.key === 'Escape') {
        event.preventDefault()
        close(false)
      }
    } else if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault()
      save()
    } else if (event.key === 'Escape') {
      setDraft(saved)
    }
  }

  const field = {
    ref: input as Ref<HTMLTextAreaElement>,
    'aria-label': label,
    placeholder,
    value: draft,
    onChange,
    onBlur,
    onKeyDown,
    rows: 2,
  }
  const withPicker = (textarea: ReactElement, Anchor: 'div' | 'span') =>
    noteId === null ? (
      textarea
    ) : (
      <ResponsivePopover
        size={size}
        opened={picking !== null}
        onClose={() => closePicker(picking?.end ?? draft.length)}
        label="Link a note"
        width={360}
        target={<Anchor className={styles.editorTarget}>{textarea}</Anchor>}
      >
        {picking && <LinkPicker noteId={noteId} onPick={insertLink} />}
      </ResponsivePopover>
    )

  if (inline) {
    return (
      <span className={styles.inlineEditor}>
        {withPicker(<textarea {...field} className={`${styles.editorInput} ${styles.inlineEditorInput}`} />, 'span')}
      </span>
    )
  }

  return (
    <div className={styles.textEditor}>
      {withPicker(<Textarea {...field} classNames={{ input: styles.editorInput }} />, 'div')}
      {saved !== '' && (
        <UnstyledButton
          className={styles.editorDelete}
          onClick={() => {
            setDraft('')
            onSave(null)
          }}
        >
          Delete
        </UnstyledButton>
      )}
    </div>
  )
}
