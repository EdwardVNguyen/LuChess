import { ActionIcon, CopyButton, Text, Tooltip } from '@mantine/core'
import { useId, useMemo, useRef, useState, type ReactNode } from 'react'
import { Board } from '../board'
import type { Game, LegalMove } from '../chess/chess'
import { exportPgn, tagRecord, type Drawing, type TagPair, type Writing } from '../chess/pgn'
import { lineAsGame, lineThrough, mainLine, moveOf, pathTo, type MoveId, type MoveTree } from '../chess/tree'
import { noteDetails } from './details'
import { CheckIcon, CopyIcon } from './icons'
import { MoveList, Written, type MoveMenu } from './MoveList'
import { PaneEdge } from './PaneEdge'
import { PaneToggle } from './PaneToggle'
import { useCollapsible } from './useCollapsible'
import styles from './Notes.module.css'
import { PlyEditor } from './PlyEditor'
import type { WritingChange } from './writing'

/** What the board shows, for the writing column and the tools under the board. */
export type StudyViewState = {
  tree: MoveTree
  /** The line through the current Move, as a Game for the Board: plies[n] is the Move at ply n. */
  line: Game
  current: MoveId
  onMoveChange: (move: MoveId) => void
  /** What a Move's right-click menu in the move list does, when Moves can be promoted and deleted. */
  menu?: MoveMenu
  /** The id for the current Move's Comment editor, for the menu's Add comment to focus. */
  commentId: string
}

type StudyViewProps = {
  name: string
  /** Above the title: the Folders the Note is filed in. */
  eyebrow?: ReactNode
  tree: MoveTree
  /** The PGN tag pairs, for the details under the title and the PGN under the board. */
  tags: readonly TagPair[]
  /** The writing on each Move that has some, for the PGN under the board. */
  writing: ReadonlyMap<MoveId, Writing>
  /** How a Link reads in the PGN: its target's name, or null when unknown. */
  linkName?: (target: number) => string | null
  /** Beside the title: the Note's menu, or a Guest's Save button. */
  actions: ReactNode
  /** The writing column, given the tree and the Move the board is on. */
  children: (view: StudyViewState) => ReactNode
  /** Under the board, above the FEN and PGN: the editor for the current Move. */
  tools?: (view: StudyViewState) => ReactNode
  /** The Move to open at, e.g. where a Backlink points; the end of the Main line when absent. */
  initialMove?: MoveId
  /** The margin: beside the writing on desktop, below it on tablet and mobile. */
  margin?: ReactNode
  /**
   * Adds a move played on the board after `parent`, and answers the Move it
   * became (an existing one when that move was already played there), or null
   * if it was not saved. The board takes no moves without it.
   */
  onPlay?: (parent: MoveId, san: string) => Promise<MoveId | null> | MoveId | null
  /** Under the board: why the last move played was not saved. */
  playError?: string | null
  /**
   * Saves the Drawings on a Move or the Position, drawn on the board while it
   * shows that Move (#77). Without it, the Drawings are only shown.
   */
  onDraw?: (move: MoveId, drawings: Drawing[]) => void
  /** Puts a Move on the Main line, all the way up. With `onDelete`, the move list gets its right-click menu. */
  onPromote?: (move: MoveId) => void
  /** Deletes a Move and its subtree, confirming first if writing would go; true once deleted. */
  onDelete?: (move: MoveId) => Promise<boolean> | boolean
}

const noLinkNames = () => null
const noDrawings: readonly Drawing[] = []

// The study view shared by a saved Note and a Guest's unsaved one: the title,
// the board and the writing column (design/screenshots/Note*.png), so the two
// behave the same. Where the tree and writing come from and go to is the caller's.
export function StudyView({
  name,
  eyebrow,
  tree,
  tags,
  writing,
  linkName = noLinkNames,
  actions,
  children,
  tools,
  initialMove,
  margin,
  onPlay,
  playError,
  onDraw,
  onPromote,
  onDelete,
}: StudyViewProps) {
  // Open at the end of the Main line, so a pasted game shows its final position.
  const [chosen, setChosen] = useState<MoveId>(() =>
    initialMove !== undefined && tree.moves.has(initialMove) ? initialMove : (mainLine(tree).at(-1)?.id ?? tree.root),
  )
  // A Move deleted from under the board leaves it at the Position.
  const current = tree.moves.has(chosen) ? chosen : tree.root
  // The Drawings last drawn on the current Move, shown until the board leaves
  // it: a second Drawing made before the first is saved builds on the first.
  const [drawn, setDrawn] = useState<{ move: MoveId; drawings: Drawing[] } | null>(null)
  const drawings = drawn?.move === current ? drawn.drawings : (writing.get(current)?.drawings ?? noDrawings)
  const goTo = (move: MoveId) => {
    setDrawn(null)
    setChosen(move)
  }
  function draw(next: Drawing[]) {
    setDrawn({ move: current, drawings: next })
    onDraw?.(current, next)
  }
  const details = noteDetails(tagRecord(tags))
  const line = useMemo(() => lineAsGame(lineThrough(tree, current), tagRecord(tags)), [tree, current, tags])
  const ply = moveOf(tree, current).ply
  const pgn = useMemo(() => exportPgn({ tree, tags, writing, linkName }).trimEnd(), [tree, tags, writing, linkName])
  // On desktop the margin can be collapsed to a rail (#61); below, it is always open.
  const marginPane = useCollapsible('margin')
  const marginId = useId()

  // A move already played after the current Move steps onto it, whether it
  // continues the line or starts a Variation; any other is added after it,
  // extending the line or starting a new Variation. One is saved at a time,
  // so the next move is played from where the last one landed.
  const playing = useRef(false)
  async function play(move: LegalMove) {
    if (!onPlay || playing.current) return
    const existing = moveOf(tree, current).children.find((child) => moveOf(tree, child).san === move.san)
    if (existing !== undefined) return goTo(existing)
    playing.current = true
    try {
      const added = await onPlay(current, move.san)
      if (added !== null) goTo(added)
    } finally {
      playing.current = false
    }
  }

  // Add comment: go to the Move, and once its editor is there, into its Comment.
  const commentId = useId()
  function addComment(move: MoveId) {
    goTo(move)
    requestAnimationFrame(() => document.getElementById(commentId)?.focus())
  }

  // A board on what was deleted steps back to the Move it was played from.
  async function deleteFrom(move: MoveId) {
    const parent = moveOf(tree, move).parent
    const before = tree
    if (!onDelete || parent === null || !(await onDelete(move))) return
    setChosen((chosen) =>
      before.moves.has(chosen) && pathTo(before, chosen).some((m) => m.id === move) ? parent : chosen,
    )
  }

  const view: StudyViewState = {
    tree,
    line,
    current,
    onMoveChange: goTo,
    menu:
      onPromote && onDelete
        ? { onComment: addComment, onPromote, onDelete: (move) => void deleteFrom(move) }
        : undefined,
    commentId,
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
        <Board
          mode="view"
          game={line}
          ply={ply}
          onPlyChange={(next) => goTo(line.plies[Math.min(Math.max(next, 0), line.plies.length - 1)].id ?? tree.root)}
          onMove={onPlay ? (move) => void play(move) : undefined}
          drawings={drawings}
          onDrawingsChange={onDraw ? draw : undefined}
        />
        {playError && (
          <Text c="accent" size="sm" role="alert">
            {playError}
          </Text>
        )}
        <BoardTools fen={line.plies[ply].fen} pgn={pgn}>
          {tools?.(view)}
        </BoardTools>
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

// Under the board: the editor for the current Move,
// then the current position's FEN and the Note's PGN to copy. The PGN is
// written from the tree; it can be copied but not edited (ADR 0009).
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
  tree: MoveTree
  current: MoveId
  onMoveChange: (move: MoveId) => void
  /** The writing on each Move that has some, by Move. */
  writing: ReadonlyMap<MoveId, Writing>
  /** Shown above the moves, e.g. why the writing could not be loaded. */
  aboveMoves?: ReactNode
  /** Shown below the moves, e.g. loading. */
  belowMoves?: ReactNode
  /** What a Move's right-click menu does. */
  menu?: MoveMenu
}

// The big idea (the Body on the Position) and the line of thought (the moves
// with their Variations, Glyphs, Comments and Bodies). The editors are under the board.
export function WritingView({ tree, current, onMoveChange, writing, aboveMoves, belowMoves, menu }: WritingViewProps) {
  const bigIdea = writing.get(tree.root)?.body

  return (
    <>
      {bigIdea && (
        <>
          <div className={styles.bigIdeaBlock}>
            <div className={styles.eyebrow}>The big idea</div>
            <p className={styles.bigIdea} data-current={current === tree.root || undefined}>
              <Written text={bigIdea} />
            </p>
          </div>
          <div className={styles.rule} />
        </>
      )}
      <div className={styles.lineBlock}>
        <div className={styles.eyebrow}>Line of thought</div>
        {aboveMoves}
        <MoveList tree={tree} current={current} onMoveChange={onMoveChange} writing={writing} menu={menu} />
        {belowMoves}
      </div>
    </>
  )
}

type CurrentMoveEditorProps = {
  line: Game
  current: MoveId
  tree: MoveTree
  /** The writing on each Move that has some, by Move. */
  writing: ReadonlyMap<MoveId, Writing>
  /** False while the writing is loading or could not be loaded: there is nothing to edit yet. */
  editable: boolean
  onSave: (change: WritingChange) => void
  /** Shown under the editor, e.g. "Saving…", or why a save failed. */
  belowEditor?: ReactNode
  /** The id for the Comment editor, for the move list's Add comment to focus. */
  commentId?: string
}

// The editors for the current Move, for the tools under the board.
export function CurrentMoveEditor({
  line,
  current,
  tree,
  writing,
  editable,
  onSave,
  belowEditor,
  commentId,
}: CurrentMoveEditorProps) {
  const ply = line.plies[moveOf(tree, current).ply]
  return (
    <>
      {editable && ply && (
        <PlyEditor
          key={current}
          ply={ply}
          writing={writing.get(current)}
          onSave={(change) => onSave({ move: current, ...change })}
          commentId={commentId}
        />
      )}
      {belowEditor}
    </>
  )
}
