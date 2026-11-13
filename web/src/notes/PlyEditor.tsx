import { UnstyledButton } from '@mantine/core'
import { plyLabel, type Ply } from '../chess/chess'
import type { Writing } from '../chess/pgn'
import { moveGlyphs, positionGlyphs } from './glyphs'
import { useLinking } from './linking'
import styles from './Notes.module.css'
import { TextEditor } from './TextEditor'

type Change = Partial<Writing>

type Props = {
  ply: Ply
  /** What is saved on this Move, if anything. */
  writing: Writing | undefined
  onSave: (change: Change) => void
}

// The editors for the current Move, or the Position: its Glyphs and its Body.
// Glyphs save as they are picked; the Body saves when its editor loses focus
// (so moving to another Move saves first) or on Ctrl/⌘+Enter. Escape undoes.
// Typing [[ in a saved Note opens the picker to link another Note. A Comment
// is written from the move list's right-click menu instead (#97).
// Render with key={move} so the drafts start over on every Move.
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
