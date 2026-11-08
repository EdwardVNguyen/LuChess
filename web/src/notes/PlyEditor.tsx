import { Textarea, UnstyledButton } from '@mantine/core'
import { useState, type KeyboardEvent } from 'react'
import type { PlyWriting, PlyWritingInput } from '../api'
import { plyLabel, type Ply } from '../chess/chess'
import { moveGlyphs, positionGlyphs } from './glyphs'
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
// Render with key={ply} so the drafts start over on every Ply.
export function PlyEditor({ ply, writing, onSave }: Props) {
  const label = plyLabel(ply)
  const atPosition = ply.index === 0

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
        placeholder={atPosition ? 'Comment on the position.' : `Comment on ${label}.`}
        saved={writing?.comment ?? ''}
        onSave={(comment) => onSave({ comment })}
      />
      <TextEditor
        label={atPosition ? 'Body opening the note' : `Body after ${label}`}
        placeholder={
          atPosition ? 'The big idea: what this note is about.' : 'Add a thought that leads to the next move.'
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
  const [draft, setDraft] = useState(saved)

  function save() {
    if (draft.trim() !== saved.trim()) onSave(draft.trim() === '' ? null : draft)
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault()
      save()
    } else if (event.key === 'Escape') {
      setDraft(saved)
    }
  }

  return (
    <div className={styles.textEditor}>
      <Textarea
        aria-label={label}
        placeholder={placeholder}
        value={draft}
        onChange={(event) => setDraft(event.currentTarget.value)}
        onBlur={save}
        onKeyDown={onKeyDown}
        rows={2}
        classNames={{ input: styles.editorInput }}
      />
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
