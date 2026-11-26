import { Textarea, UnstyledButton } from '@mantine/core'
import { useEffect, useLayoutEffect, useRef, useState, type ChangeEvent, type KeyboardEvent, type ReactElement, type Ref } from 'react'
import { ResponsivePopover, useOverlaySize } from '../overlay'
import { LinkPicker } from './LinkPicker'
import { useLinking } from './linking'
import { linkToken } from './links'
import styles from './Notes.module.css'
import { useWarnBeforeUnload } from './useWarnBeforeUnload'

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
  /**
   * Opens the picker to link a Note at the end of the draft, from the Move's
   * menu (#101): on mounting when set, and again each time it changes.
   */
  linkRequest?: number
  /**
   * Its Move's menu is open over the inline editor (#101): losing focus to the
   * menu doesn't save or close it. When the menu closes, focus comes back to
   * the draft, unless the user went somewhere else, which saves and closes it.
   */
  held?: boolean
}

// Where a picked Link goes: in place of the [[ that opened the picker, or at
// the end of the draft when the menu opened it.
type Picking = { start: number; end: number } | 'end'

// The editor for a Comment or a Body. Text saves when the editor loses focus
// (so moving to another Move saves first). Typing [[ in a saved Note opens
// the picker to link another Note. Under the board it stays open: Ctrl/⌘+Enter
// saves, Escape undoes, and Delete clears what is saved.
export function TextEditor({ label, placeholder, saved, onSave, onClose, linkRequest = 0, held = false }: Props) {
  const { noteId } = useLinking()
  const size = useOverlaySize()
  const inline = onClose !== undefined
  const [draft, setDraft] = useState(saved)
  // Where the Link will go, while the picker is open.
  const [picking, setPicking] = useState<Picking | null>(null)
  const pickingRef = useRef(false)
  // Opened to link a Note, the picker takes focus rather than the text.
  const openedLinking = useRef(linkRequest > 0 && noteId !== null)
  // Each new request from the menu opens the picker, at the end of the draft.
  const [linkRequested, setLinkRequested] = useState(0)
  if (linkRequest !== linkRequested) {
    setLinkRequested(linkRequest)
    if (linkRequest > 0 && noteId !== null) setPicking('end')
  }
  // The inline editor saves or cancels once, however it is closed.
  const closed = useRef(false)
  const input = useRef<HTMLTextAreaElement>(null)
  // A draft not yet handed to onSave is lost if the tab closes, so ask first.
  useWarnBeforeUnload(draft.trim() !== saved.trim())

  // Opened from the move list's menu, it takes focus once the menu has let it go.
  useEffect(() => {
    if (!inline || openedLinking.current) return
    const frame = requestAnimationFrame(() => {
      const end = input.current?.value.length ?? 0
      input.current?.focus()
      input.current?.setSelectionRange(end, end)
    })
    return () => cancelAnimationFrame(frame)
  }, [inline])

  // The latest picker state and close, for the frame after the menu closes.
  const pickingNow = useRef(picking)
  const closeNow = useRef((saving: boolean) => close(saving))
  useLayoutEffect(() => {
    pickingNow.current = picking
    closeNow.current = close
  })

  // Once its Move's menu has closed: back to the draft, or, if the user went
  // elsewhere, save and close as losing focus does.
  const wasHeld = useRef(held)
  useEffect(() => {
    const released = wasHeld.current && !held
    wasHeld.current = held
    if (!released || !inline) return
    const frame = requestAnimationFrame(() => {
      if (pickingRef.current || pickingNow.current) return
      const active = document.activeElement
      if (active === null || active === document.body || active === input.current) {
        input.current?.focus()
      } else {
        closeNow.current(true)
      }
    })
    return () => cancelAnimationFrame(frame)
  }, [held, inline])

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
    if (held || pickingRef.current || picking !== null) return
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
    if (picking === 'end') {
      const text = draft === '' || /\s$/.test(draft) ? draft + token : `${draft} ${token}`
      setDraft(text)
      closePicker(text.length)
      return
    }
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
        onClose={() => closePicker(picking && picking !== 'end' ? picking.end : draft.length)}
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
