import { Textarea, UnstyledButton } from '@mantine/core'
import { useRef, useState, type ChangeEvent, type KeyboardEvent } from 'react'
import type { PlyWriting, PlyWritingInput } from '../api'
import { plyLabel, type Ply } from '../chess/chess'
import { ResponsivePopover, useOverlaySize } from '../overlay'
import { moveGlyphs, positionGlyphs } from './glyphs'
import { LinkPicker } from './LinkPicker'
import { useLinking } from './linking'
import { linkToken } from './links'
import styles from './Notes.module.css'

type Change = Partial<PlyWritingInput>

type Props = {
  ply: Ply
  /** What is saved on this Ply, if anything. */
  writing: PlyWriting | undefined
  onSave: (change: Change) => void
}

// The editors for the current Ply: its Glyphs, its Comment and its Body.
// Glyphs save as they are picked; text saves when the editor loses focus (so
// moving to another Ply saves first) or on Ctrl/⌘+Enter. Escape undoes.
// Typing [[ in a saved Note opens the picker to link another Note.
// Render with key={ply} so the drafts start over on every Ply.
export function PlyEditor({ ply, writing, onSave }: Props) {
  const label = plyLabel(ply)
  const atPosition = ply.index === 0
  const canLink = useLinking().noteId !== null
  const toLink = canLink ? ' Type [[ to link another note.' : ''

  return (
    <section className={styles.editor} aria-label={atPosition ? 'Writing on the position' : `Writing on ${label}`}>
      <div className={`${styles.eyebrow} ${styles.editorHeading}`}>{atPosition ? 'On the position' : `On ${label}`}</div>
      <div className={styles.glyphPickers}>
        {!atPosition && (
          <GlyphPicker
            label="Move"
            glyphs={moveGlyphs}
            value={writing?.moveGlyph ?? null}
            onChange={(moveGlyph) => onSave({ moveGlyph })}
          />
        )}
        <GlyphPicker
          label="Position"
          glyphs={positionGlyphs}
          value={writing?.positionGlyph ?? null}
          onChange={(positionGlyph) => onSave({ positionGlyph })}
        />
      </div>
      <TextEditor
        label={atPosition ? 'Comment on the position' : `Comment on ${label}`}
        placeholder={(atPosition ? 'Comment on the position.' : `Comment on ${label}.`) + toLink}
        saved={writing?.comment ?? ''}
        onSave={(comment) => onSave({ comment })}
      />
      <TextEditor
        label={atPosition ? 'Body opening the note' : `Body after ${label}`}
        placeholder={
          (atPosition ? 'The big idea: what this note is about.' : 'Add a thought that leads to the next move.') + toLink
        }
        saved={writing?.body ?? ''}
        onSave={(body) => onSave({ body })}
      />
    </section>
  )
}

type GlyphPickerProps = {
  label: string
  glyphs: readonly { glyph: string; name: string }[]
  value: string | null
  onChange: (glyph: string | null) => void
}

// One Glyph of a kind at most: picking another replaces it, picking the
// chosen one again clears it.
function GlyphPicker({ label, glyphs, value, onChange }: GlyphPickerProps) {
  return (
    <div role="group" aria-label={`${label} Glyph`} className={styles.glyphPicker}>
      <span className={styles.glyphPickerLabel}>{label}</span>
      {glyphs.map(({ glyph, name }) => (
        <UnstyledButton
          key={glyph}
          className={styles.glyphOption}
          aria-pressed={value === glyph}
          aria-label={name}
          title={name}
          onClick={() => onChange(value === glyph ? null : glyph)}
        >
          {glyph}
        </UnstyledButton>
      ))}
    </div>
  )
}

type TextEditorProps = {
  label: string
  placeholder: string
  saved: string
  onSave: (text: string | null) => void
}

function TextEditor({ label, placeholder, saved, onSave }: TextEditorProps) {
  const { noteId } = useLinking()
  const size = useOverlaySize()
  const [draft, setDraft] = useState(saved)
  // Where the [[ that opened the picker sits in the draft, while it is open.
  const [picking, setPicking] = useState<{ start: number; end: number } | null>(null)
  const pickingRef = useRef(false)
  const input = useRef<HTMLTextAreaElement>(null)

  function save() {
    if (draft.trim() !== saved.trim()) onSave(draft.trim() === '' ? null : draft)
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
    if (!pickingRef.current) save()
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
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault()
      save()
    } else if (event.key === 'Escape') {
      setDraft(saved)
    }
  }

  const textarea = (
    <Textarea
      ref={input}
      aria-label={label}
      placeholder={placeholder}
      value={draft}
      onChange={onChange}
      onBlur={onBlur}
      onKeyDown={onKeyDown}
      rows={2}
      classNames={{ input: styles.editorInput }}
    />
  )

  return (
    <div className={styles.textEditor}>
      {noteId === null ? (
        textarea
      ) : (
        <ResponsivePopover
          size={size}
          opened={picking !== null}
          onClose={() => closePicker(picking?.end ?? draft.length)}
          label="Link a note"
          width={360}
          target={<div className={styles.editorTarget}>{textarea}</div>}
        >
          {picking && <LinkPicker noteId={noteId} onPick={insertLink} />}
        </ResponsivePopover>
      )}
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
