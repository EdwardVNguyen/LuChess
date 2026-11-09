import { Alert } from '@mantine/core'
import { useState, type ReactNode } from 'react'
import type { PlyWriting } from '../api'
import { Board } from '../board'
import { clampPly, parsePgn, type Game } from '../chess/chess'
import { noteDetails } from './details'
import { MoveList, Written } from './MoveList'
import styles from './Notes.module.css'
import { PlyEditor } from './PlyEditor'
import type { PlyChange } from './writing'

type StudyViewProps = {
  name: string
  pgn: string
  /** Beside the title: the Note's menu, or a Guest's Save button. */
  actions: ReactNode
  /** The writing column, given the game and the Ply the board is on. */
  children: (view: { game: Game | null; ply: number; onPlyChange: (ply: number) => void }) => ReactNode
  /** The Ply to open at, e.g. where a Backlink points; the end of the game when absent. */
  initialPly?: number
  /** The margin: beside the writing on desktop, below it on tablet and mobile. */
  margin?: ReactNode
}

// The study view shared by a saved Note and a Guest's unsaved one: the title,
// the board and the writing column (design/screenshots/Note*.png), so the two
// behave the same. Where the writing comes from and goes to is the caller's.
export function StudyView({ name, pgn, actions, children, initialPly, margin }: StudyViewProps) {
  const parsed = parsePgn(pgn)
  // Open at the end of the game, so a pasted game shows its final position.
  const [ply, setPly] = useState(() =>
    parsed.ok ? clampPly(parsed.value, initialPly ?? parsed.value.plies.length - 1) : 0,
  )
  const details = parsed.ok ? noteDetails(parsed.value.tags) : null

  return (
    <div className={styles.note}>
      <section className={styles.boardColumn} aria-label="Position">
        <div className={styles.titleBlock}>
          <div className={styles.titleRow}>
            <h1 className={styles.title}>{name}</h1>
            {actions}
          </div>
          {details && <div className={styles.details}>{details}</div>}
        </div>
        {parsed.ok ? (
          <Board mode="view" game={parsed.value} ply={ply} onPlyChange={setPly} />
        ) : (
          <Alert color="red" title="This note's moves could not be read">
            {parsed.error}
          </Alert>
        )}
      </section>
      <section className={styles.movesColumn} aria-label="Writing">
        {children({ game: parsed.ok ? parsed.value : null, ply, onPlyChange: setPly })}
      </section>
      {margin && (
        <aside className={styles.margin} aria-label="In the margin">
          {margin}
        </aside>
      )}
    </div>
  )
}

type WritingViewProps = {
  game: Game | null
  ply: number
  onPlyChange: (ply: number) => void
  /** The writing on each Ply that has some, by Ply. */
  writing: ReadonlyMap<number, PlyWriting>
  /** False while the writing is loading or could not be loaded: there is nothing to edit yet. */
  editable: boolean
  onSave: (change: PlyChange) => void
  /** Shown above the moves, e.g. why the writing could not be loaded. */
  aboveMoves?: ReactNode
  /** Shown between the moves and the editor, e.g. loading, or why a save failed. */
  belowMoves?: ReactNode
  /** Shown under the editor, e.g. "Saving…". */
  belowEditor?: ReactNode
}

// The big idea (the Body at ply 0), the line of thought (the moves with their
// Glyphs, Comments and Bodies) and the editors for the current Ply.
export function WritingView({
  game,
  ply,
  onPlyChange,
  writing,
  editable,
  onSave,
  aboveMoves,
  belowMoves,
  belowEditor,
}: WritingViewProps) {
  const current = game?.plies[clampPly(game, ply)]
  const bigIdea = writing.get(0)?.body

  return (
    <>
      {bigIdea && (
        <>
          <div className={styles.bigIdeaBlock}>
            <div className={styles.eyebrow}>The big idea</div>
            <p className={styles.bigIdea} data-current={ply === 0 || undefined}>
              <Written text={bigIdea} />
            </p>
          </div>
          <div className={styles.rule} />
        </>
      )}
      <div className={styles.lineBlock}>
        <div className={styles.eyebrow}>Line of thought</div>
        {aboveMoves}
        {game && <MoveList game={game} ply={ply} onPlyChange={onPlyChange} writing={writing} />}
        {belowMoves}
        {editable && current && (
          <PlyEditor
            key={current.index}
            ply={current}
            writing={writing.get(current.index)}
            onSave={(change) => onSave({ ply: current.index, ...change })}
          />
        )}
        {belowEditor}
      </div>
    </>
  )
}
