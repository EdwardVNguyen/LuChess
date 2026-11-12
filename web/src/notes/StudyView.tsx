import { ActionIcon, Alert, Button, CopyButton, Group, Text, Tooltip } from '@mantine/core'
import { useId, useState, type ReactNode } from 'react'
import type { PlyWriting } from '../api'
import { Board } from '../board'
import {
  clampPly,
  editMoves,
  fenAt,
  firstChangedPly,
  gameFromMoves,
  parsePgn,
  plyLabel,
  sansOf,
  type Game,
  type LegalMove,
  type MovesEdit,
} from '../chess/chess'
import { noteDetails } from './details'
import { CheckIcon, CopyIcon } from './icons'
import { MoveList, Written } from './MoveList'
import { PaneEdge } from './PaneEdge'
import { PaneToggle } from './PaneToggle'
import { useCollapsible } from './useCollapsible'
import styles from './Notes.module.css'
import { PlyEditor } from './PlyEditor'
import type { PlyChange } from './writing'

/** Editing the moves is on while the caller passes this. */
export type MoveEditing = {
  onCancel: () => void
  /** Called with the edit to save; the caller confirms it and ends editing once saved. */
  onSave: (edit: MovesEdit) => void
  saving: boolean
  /** Why the last save failed. */
  error: string | null
}

/** What the writing column needs to know while the moves are edited. */
export type MovesDraft = {
  /** The first Ply that differs from the saved moves, or null while none does. */
  firstChangedPly: number | null
}

/** What the board shows, for the writing column and the tools under the board. */
export type StudyViewState = {
  game: Game | null
  ply: number
  onPlyChange: (ply: number) => void
  draft: MovesDraft | null
}

type StudyViewProps = {
  name: string
  /** Above the title: the Folders the Note is filed in. */
  eyebrow?: ReactNode
  pgn: string
  /** Beside the title: the Note's menu, or a Guest's Save button. */
  actions: ReactNode
  /**
   * The writing column, given the game and the Ply the board is on. While the
   * moves are edited, the game is the draft and `draft` says where it differs.
   */
  children: (view: StudyViewState) => ReactNode
  /** Under the board, above the FEN and PGN: the editor for the current Ply. */
  tools?: (view: StudyViewState) => ReactNode
  /** The Ply to open at, e.g. where a Backlink points; the end of the game when absent. */
  initialPly?: number
  /** The margin: beside the writing on desktop, below it on tablet and mobile. */
  margin?: ReactNode
  /** While set, the board plays moves into a draft of the Note's moves. */
  moveEditing?: MoveEditing | null
}

// The study view shared by a saved Note and a Guest's unsaved one: the title,
// the board and the writing column (design/screenshots/Note*.png), so the two
// behave the same. Where the writing comes from and goes to is the caller's.
export function StudyView({
  name,
  eyebrow,
  pgn,
  actions,
  children,
  tools,
  initialPly,
  margin,
  moveEditing,
}: StudyViewProps) {
  const parsed = parsePgn(pgn)
  // Open at the end of the game, so a pasted game shows its final position.
  const [ply, setPly] = useState(() =>
    parsed.ok ? clampPly(parsed.value, initialPly ?? parsed.value.plies.length - 1) : 0,
  )
  const details = parsed.ok ? noteDetails(parsed.value.tags) : null
  // On desktop the margin can be collapsed to a rail (#61); below, it is always open.
  const marginPane = useCollapsible('margin')
  const marginId = useId()

  // The moves as edited so far; null until the first change. Each time
  // editing starts or ends, the draft starts again from the saved moves.
  const editing = Boolean(moveEditing) && parsed.ok
  const [draft, setDraft] = useState<string[] | null>(null)
  const [wasEditing, setWasEditing] = useState(editing)
  if (editing !== wasEditing) {
    setWasEditing(editing)
    setDraft(null)
  }
  const saved = parsed.ok ? parsed.value : null
  const savedSans = saved ? sansOf(saved) : []
  const drafted = editing && saved && draft ? gameFromMoves(saved.startFen, draft) : null
  const game = drafted?.ok ? drafted.value : saved
  const sans = editing && draft ? draft : savedSans
  const changedFrom = editing && draft ? firstChangedPly(savedSans, draft) : null

  // A move played from a Ply replaces the rest of the game, unless it is the
  // move already there, which only steps forward.
  function play(move: LegalMove) {
    if (!game) return
    const from = clampPly(game, ply)
    if (sans[from] !== move.san) setDraft([...sans.slice(0, from), move.san])
    setPly(from + 1)
  }

  // Deleting a move deletes the moves after it, which no longer follow.
  function deleteMove() {
    if (!game) return
    const at = clampPly(game, ply)
    if (at === 0) return
    setDraft(sans.slice(0, at - 1))
    setPly(at - 1)
  }

  // The moves as they would be saved: the draft while there is one.
  const edit = editing && draft ? editMoves(pgn, sans) : null
  const shownPgn = edit?.ok && edit.value ? edit.value.pgn : pgn

  function save() {
    if (edit?.ok && edit.value) moveEditing?.onSave(edit.value)
  }

  const view: StudyViewState = {
    game,
    ply,
    onPlyChange: setPly,
    draft: editing ? { firstChangedPly: changedFrom } : null,
  }

  return (
    <div className={styles.note}>
      <section className={styles.boardColumn} aria-label="Position">
        <div className={styles.titleBlock}>
          {eyebrow && <div className={`${styles.eyebrow} ${styles.noteEyebrow}`}>{eyebrow}</div>}
          <div className={styles.titleRow}>
            <h1 className={styles.title}>{name}</h1>
            {actions}
          </div>
          {details && <div className={styles.details}>{details}</div>}
        </div>
        {!parsed.ok ? (
          <Alert color="red" title="This note's moves could not be read">
            {parsed.error}
          </Alert>
        ) : (
          game && (
            <>
              <Board mode="view" game={game} ply={ply} onPlyChange={setPly} onMove={editing ? play : undefined} />
              {editing && moveEditing && (
                <MoveEditBar
                  game={game}
                  ply={clampPly(game, ply)}
                  changed={changedFrom !== null}
                  editing={moveEditing}
                  onDelete={deleteMove}
                  onSave={save}
                />
              )}
              <BoardTools fen={fenAt(game, ply)} pgn={shownPgn}>
                {tools?.(view)}
              </BoardTools>
            </>
          )
        )}
      </section>
      <PaneEdge pane="board" hasMargin={Boolean(margin)} />
      <section className={styles.movesColumn} aria-label="Writing">
        {children(view)}
      </section>
      {margin && <PaneEdge pane="margin" onCollapsed={marginPane.focusToggle} />}
      {margin && (
        <aside
          id={marginId}
          className={styles.margin}
          aria-label="In the margin"
          data-collapsed={marginPane.collapsed || undefined}
        >
          <PaneToggle
            pane="margin"
            collapsed={marginPane.collapsed}
            onToggle={marginPane.toggle}
            focusRequests={marginPane.focusRequests}
            controls={marginId}
          />
          {/* Not laid out on its own (display: contents), so the margin's sections stay its grid or flex items. */}
          <div className={styles.marginBody}>{margin}</div>
        </aside>
      )}
    </div>
  )
}

// Under the board while the moves are edited: what playing a move does, and
// Delete, Cancel and Save. Nothing is saved until Save.
function MoveEditBar({
  game,
  ply,
  changed,
  editing,
  onDelete,
  onSave,
}: {
  game: Game
  ply: number
  changed: boolean
  editing: MoveEditing
  onDelete: () => void
  onSave: () => void
}) {
  const label = plyLabel(game.plies[ply])
  return (
    <div className={styles.editBar} role="region" aria-label="Editing moves">
      <Text className={styles.editHint}>
        Play a move on the board to replace the game from there. Deleting a move deletes the moves after it.
      </Text>
      <Group gap="xs" justify="space-between">
        <Button variant="default" size="xs" disabled={label === null || editing.saving} onClick={onDelete}>
          {label === null ? 'Delete move' : `Delete ${label}`}
        </Button>
        <Group gap="xs">
          <Button variant="default" size="xs" disabled={editing.saving} onClick={editing.onCancel}>
            Cancel
          </Button>
          <Button size="xs" disabled={!changed} loading={editing.saving} onClick={onSave}>
            Save moves
          </Button>
        </Group>
      </Group>
      {editing.error && (
        <Text c="accent" size="sm" role="alert">
          {editing.error}
        </Text>
      )}
    </div>
  )
}

// Under the board, as in a Lichess Study: the editor for the current Ply, then
// the current Position's FEN and the Note's PGN to copy. Both are read only:
// changing the moves goes through editing them (ADR 0003).
function BoardTools({ fen, pgn, children }: { fen: string; pgn: string; children: ReactNode }) {
  const fenId = useId()
  const pgnId = useId()
  return (
    <div className={styles.boardTools} role="region" aria-label="Tools">
      {children}
      <div className={styles.copyFields}>
        <div className={styles.copyField}>
          <div className={styles.copyFieldHead}>
            <label htmlFor={fenId} className={styles.eyebrow}>
              FEN
            </label>
            <CopyValue value={fen} label="Copy FEN" />
          </div>
          <input id={fenId} className={styles.copyInput} value={fen} readOnly spellCheck={false} />
        </div>
        <div className={styles.copyField}>
          <div className={styles.copyFieldHead}>
            <label htmlFor={pgnId} className={styles.eyebrow}>
              PGN
            </label>
            <CopyValue value={pgn} label="Copy PGN" />
          </div>
          <textarea id={pgnId} className={styles.copyInput} value={pgn} readOnly spellCheck={false} rows={4} />
        </div>
      </div>
    </div>
  )
}

function CopyValue({ value, label }: { value: string; label: string }) {
  return (
    <CopyButton value={value} timeout={1500}>
      {({ copied, copy }) => (
        <Tooltip label={copied ? 'Copied' : label} withArrow position="left">
          <ActionIcon variant="subtle" color="gray" size="sm" aria-label={copied ? 'Copied' : label} onClick={copy}>
            {copied ? <CheckIcon /> : <CopyIcon />}
          </ActionIcon>
        </Tooltip>
      )}
    </CopyButton>
  )
}

type WritingViewProps = {
  game: Game | null
  ply: number
  onPlyChange: (ply: number) => void
  /** The writing on each Ply that has some, by Ply. */
  writing: ReadonlyMap<number, PlyWriting>
  /** Shown above the moves, e.g. why the writing could not be loaded. */
  aboveMoves?: ReactNode
  /** Shown below the moves, e.g. loading. */
  belowMoves?: ReactNode
}

// The big idea (the Body at ply 0) and the line of thought (the moves with
// their Glyphs, Comments and Bodies). The editors are under the board.
export function WritingView({ game, ply, onPlyChange, writing, aboveMoves, belowMoves }: WritingViewProps) {
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
      </div>
    </>
  )
}

type CurrentPlyEditorProps = {
  game: Game | null
  ply: number
  /** The writing on each Ply that has some, by Ply. */
  writing: ReadonlyMap<number, PlyWriting>
  /** False while the writing is loading or could not be loaded: there is nothing to edit yet. */
  editable: boolean
  onSave: (change: PlyChange) => void
  /** Shown under the editor, e.g. "Saving…", or why a save failed. */
  belowEditor?: ReactNode
}

// The editors for the current Ply, for the tools under the board.
export function CurrentPlyEditor({ game, ply, writing, editable, onSave, belowEditor }: CurrentPlyEditorProps) {
  const current = game?.plies[clampPly(game, ply)]
  return (
    <>
      {editable && current && (
        <PlyEditor
          key={current.index}
          ply={current}
          writing={writing.get(current.index)}
          onSave={(change) => onSave({ ply: current.index, ...change })}
        />
      )}
      {belowEditor}
    </>
  )
}
