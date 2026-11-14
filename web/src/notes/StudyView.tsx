import { ActionIcon, Button, CopyButton, Group, Text, Tooltip } from '@mantine/core'
import { useId, useMemo, useRef, useState, type ReactNode } from 'react'
import { Board } from '../board'
import type { Game, LegalMove } from '../chess/chess'
import { exportPgn, loadPgnImport, tagRecord, type Drawing, type TagPair, type Writing } from '../chess/pgn'
import { lineAsGame, lineThrough, mainLine, moveOf, pathTo, type MoveId, type MoveTree } from '../chess/tree'
import { planFen, planPgn, type ApplyOutcome, type PgnPlan } from './applying'
import { noteDetails } from './details'
import { CheckIcon, CopyIcon, PencilIcon } from './icons'
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
  /** What a Move's right-click menu in the move list does, when Moves can be commented on, promoted and deleted. */
  menu?: MoveMenu
}

type StudyViewProps = {
  name: string
  /** The title, in place of the name as a heading, e.g. one that renames the Note in place. */
  title?: ReactNode
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
  /** Saves a Move's Comment, written in the move list, or deletes it when null (#97). */
  onComment?: (move: MoveId, comment: string | null) => void
  /** Puts a Move on the Main line, all the way up. With `onComment` and `onDelete`, the move list gets its right-click menu. */
  onPromote?: (move: MoveId) => void
  /** Deletes a Move and its subtree, confirming first if writing would go; true once deleted. */
  onDelete?: (move: MoveId) => Promise<boolean> | boolean
  /**
   * Gives the Note the Position of a FEN typed under the board (null for the
   * standard start), which resets it, confirming first if anything would go
   * (#109). Without it, the FEN can only be copied.
   */
  onApplyFen?: (startFen: string | null) => Promise<ApplyOutcome>
  /**
   * Applies a PGN typed under the board, already read: a reset when its
   * Position differs, otherwise matched to the Note, confirming first if
   * anything would go (#109). Without it, the PGN can only be copied.
   */
  onApplyPgn?: (plan: PgnPlan) => Promise<ApplyOutcome>
}

const noLinkNames = () => null
const noDrawings: readonly Drawing[] = []

/** A move played on the board that is saving, or saved and not yet in the tree (with its id). */
type Pending = { move: LegalMove; id?: MoveId }
/** The moves played past a saved Move, in order. */
type Tail = { run: number; from: MoveId; moves: Pending[] }
/** Moves played one after another from a saved Move, saving in order. */
type Run = {
  id: number
  /** The Move the next save is played after: the last one saved. */
  parent: MoveId
  /** Once one save fails, the moves after it are dropped. */
  failed: boolean
}
const noPending: readonly Pending[] = []

/** The last of a tail's moves that the tree has (or where it starts), and the moves after it. */
function landed(tree: MoveTree, tail: Tail | null): { from: MoveId | undefined; pending: readonly Pending[] } {
  if (!tail) return { from: undefined, pending: noPending }
  const at = tail.moves.findIndex((p) => p.id === undefined || !tree.moves.has(p.id))
  const pending = at === -1 ? [] : tail.moves.slice(at)
  const last = at === -1 ? tail.moves.at(-1) : tail.moves[at - 1]
  return { from: last?.id ?? tail.from, pending }
}

/** The line up to `ply`, then the moves pending after it. */
function withPending(line: Game, ply: number, pending: readonly Pending[]): Game {
  const plies = line.plies.slice(0, ply + 1)
  for (const { move } of pending) {
    const [, turn, , , , fullMove] = plies[plies.length - 1].fen.split(' ')
    plies.push({
      index: plies.length,
      san: move.san,
      moveNumber: Number(fullMove),
      color: turn === 'b' ? 'b' : 'w',
      from: move.from,
      to: move.to,
      fen: move.fen,
    })
  }
  return { ...line, plies }
}

// The study view shared by a saved Note and a Guest's unsaved one: the title,
// the board and the writing column (design/screenshots/Note*.png), so the two
// behave the same. Where the tree and writing come from and go to is the caller's.
export function StudyView({
  name,
  title,
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
  onComment,
  onPromote,
  onDelete,
  onApplyFen,
  onApplyPgn,
}: StudyViewProps) {
  // Open at the end of the Main line, so a pasted game shows its final position.
  const [chosen, setChosen] = useState<MoveId>(() =>
    initialMove !== undefined && tree.moves.has(initialMove) ? initialMove : (mainLine(tree).at(-1)?.id ?? tree.root),
  )
  // Moves played past the last saved Move, shown on the board at once while
  // they save (#98). A saved one stays here until the tree has it.
  const [tail, setTail] = useState<Tail | null>(null)
  const { from: pendingFrom, pending } = landed(tree, tail)
  if (tail && pendingFrom !== undefined && pending.length === 0) {
    // All saved and in the tree: the board is on the last of them.
    setTail(null)
    setChosen(pendingFrom)
  }
  // A Move deleted from under the board leaves it at the Position.
  const current =
    pendingFrom !== undefined && tree.moves.has(pendingFrom) ? pendingFrom : tree.moves.has(chosen) ? chosen : tree.root
  // The Drawings last drawn on the current Move, shown until the board leaves
  // it: a second Drawing made before the first is saved builds on the first.
  const [drawn, setDrawn] = useState<{ move: MoveId; drawings: Drawing[] } | null>(null)
  const drawings =
    pending.length > 0
      ? noDrawings
      : drawn?.move === current
        ? drawn.drawings
        : (writing.get(current)?.drawings ?? noDrawings)
  // Leaving moves that are saving: they go on saving, but the board stays where it is sent.
  const goTo = (move: MoveId) => {
    setTail(null)
    setDrawn(null)
    setChosen(move)
  }
  function draw(next: Drawing[]) {
    setDrawn({ move: current, drawings: next })
    onDraw?.(current, next)
  }
  const details = noteDetails(tagRecord(tags))
  const saved = useMemo(() => lineAsGame(lineThrough(tree, current), tagRecord(tags)), [tree, current, tags])
  const savedPly = moveOf(tree, current).ply
  // With moves pending, the board's line ends with them.
  const line = useMemo(
    () => (pending.length > 0 ? withPending(saved, savedPly, pending) : saved),
    [saved, savedPly, pending],
  )
  const ply = savedPly + pending.length
  const pgn = useMemo(() => exportPgn({ tree, tags, writing, linkName }).trimEnd(), [tree, tags, writing, linkName])
  // On desktop the margin can be collapsed to a rail (#61); below, it is always open.
  const marginPane = useCollapsible('margin')
  const marginId = useId()

  // A move already played after the current Move steps onto it, whether it
  // continues the line or starts a Variation; any other is added after it,
  // extending the line or starting a new Variation.
  //
  // A move that saves on a server shows on the board at once (#98). Moves
  // played while one is saving queue behind it: they save one at a time, in
  // order, each after the Move the one before it became. If one fails, the
  // ones after it are dropped and the board goes back to the last saved Move.
  const run = useRef<Run | null>(null)
  const saving = useRef<Promise<void>>(Promise.resolve())
  const inFlight = useRef(0)

  function play(move: LegalMove) {
    if (!onPlay) return
    const save = onPlay
    if (tail && pending.length > 0) {
      const playing = run.current
      if (playing?.id !== tail.run || playing.failed) return
      setTail((t) => t && { ...t, moves: [...t.moves, { move }] })
      return queue(playing, tail.moves.length, () => save(playing.parent, move.san))
    }
    const existing = moveOf(tree, current).children.find((child) => moveOf(tree, child).san === move.san)
    if (existing !== undefined) return goTo(existing)
    if (inFlight.current > 0) {
      const playing = startRun(current, move)
      return queue(playing, 0, () => save(playing.parent, move.san))
    }
    const added = save(current, move.san)
    // A Guest's move is added in the browser, so it is in the tree at once.
    if (!(added instanceof Promise)) return added === null ? undefined : goTo(added)
    queue(startRun(current, move), 0, () => added)
  }

  function startRun(from: MoveId, move: LegalMove): Run {
    const playing: Run = { id: (run.current?.id ?? 0) + 1, parent: from, failed: false }
    run.current = playing
    setDrawn(null)
    setTail({ run: playing.id, from, moves: [{ move }] })
    return playing
  }

  // Saves the nth move of a run once the saves before it are done.
  function queue(playing: Run, n: number, save: () => Promise<MoveId | null> | MoveId | null) {
    inFlight.current++
    saving.current = saving.current.then(async () => {
      try {
        if (playing.failed) return
        const added = await Promise.resolve(save()).catch(() => null)
        if (added === null) {
          playing.failed = true
          // The moves already saved stay, and land as the tree gets them.
          setTail((t) => (t?.run === playing.id ? { ...t, moves: t.moves.slice(0, n) } : t))
          return
        }
        playing.parent = added
        setTail((t) =>
          t?.run === playing.id ? { ...t, moves: t.moves.map((p, i) => (i === n ? { ...p, id: added } : p)) } : t,
        )
      } finally {
        inFlight.current--
      }
    })
  }

  // Stepping back from moves still saving goes to a saved Move.
  function stepTo(next: number) {
    if (pending.length > 0 && next >= ply) return
    const at = Math.min(Math.max(next, 0), pending.length > 0 ? savedPly : saved.plies.length - 1)
    goTo(saved.plies[at].id ?? tree.root)
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

  // A FEN always resets the Note, except the Position's own applied unchanged.
  async function applyFen(typed: string): Promise<ApplyOutcome> {
    if (!onApplyFen) return 'cancelled'
    const plan = planFen(typed, { tree, atPosition: current === tree.root && pending.length === 0 })
    if (!plan.ok) return { error: plan.error }
    return plan.value ? onApplyFen(plan.value.startFen) : 'applied'
  }

  // A PGN is read and checked first; one left as it was changes nothing.
  async function applyPgn(edited: string, original: string): Promise<ApplyOutcome> {
    if (!onApplyPgn) return 'cancelled'
    const read = await loadPgnImport().catch(() => null)
    if (!read) return { error: 'Could not load the PGN reader. Check your connection and try again.' }
    const plan = planPgn(tree, edited, original, read)
    if (!plan.ok) return { error: plan.error }
    return plan.value ? onApplyPgn(plan.value) : 'applied'
  }

  const view: StudyViewState = {
    tree,
    line: saved,
    current,
    onMoveChange: goTo,
    menu:
      onComment && onPromote && onDelete
        ? { onComment, onPromote, onDelete: (move) => void deleteFrom(move) }
        : undefined,
  }

  return (
    <div className={styles.note}>
      <section className={styles.boardColumn} aria-label="Position">
        <div className={styles.titleBlock}>
          {eyebrow && <div className={`${styles.eyebrow} ${styles.noteEyebrow}`}>{eyebrow}</div>}
          <div className={styles.titleRow}>
            {title ?? <h1 className={styles.title}>{name}</h1>}
            {actions}
          </div>
          {details && <div className={styles.details}>{details}</div>}
        </div>
        <Board
          mode="view"
          game={line}
          ply={ply}
          onPlyChange={stepTo}
          onMove={onPlay ? play : undefined}
          drawings={drawings}
          onDrawingsChange={onDraw && pending.length === 0 ? draw : undefined}
        />
        {playError && (
          <Text c="accent" size="sm" role="alert">
            {playError}
          </Text>
        )}
        <BoardTools
          fen={line.plies[ply].fen}
          pgn={pgn}
          onApplyFen={onApplyFen && applyFen}
          onApplyPgn={onApplyPgn && applyPgn}
        >
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

// Under the board: the editor for the current Move, then the current
// position's FEN and the Note's PGN, written from the tree, to copy. Where the
// Note can change, Edit turns either into a field to change it (#109), and
// nothing applies until Apply, so a stray keystroke can't damage the Note.
function BoardTools({
  fen,
  pgn,
  onApplyFen,
  onApplyPgn,
  children,
}: {
  fen: string
  pgn: string
  onApplyFen?: (typed: string) => Promise<ApplyOutcome>
  onApplyPgn?: (edited: string, original: string) => Promise<ApplyOutcome>
  children: ReactNode
}) {
  return (
    <div className={styles.boardTools} role="region" aria-label="Tools">
      {children}
      <div className={styles.copyFields}>
        <EditableValue name="FEN" value={fen} onApply={onApplyFen} />
        <EditableValue
          name="PGN"
          value={pgn}
          multiline
          // The reader is large and loads on its own; start loading it as editing starts.
          onEdit={() => void loadPgnImport().catch(() => undefined)}
          onApply={onApplyPgn}
        />
      </div>
    </div>
  )
}

/** The FEN or PGN under the board: read only with Copy, or, after Edit, a field with Apply and Cancel. */
function EditableValue({
  name,
  value,
  multiline = false,
  onEdit,
  onApply,
}: {
  name: 'FEN' | 'PGN'
  value: string
  multiline?: boolean
  onEdit?: () => void
  /** Applies the text typed, given what the field held when Edit was pressed. */
  onApply?: (typed: string, original: string) => Promise<ApplyOutcome>
}) {
  const id = useId()
  const errorId = useId()
  // While editing: what was there when Edit was pressed, and what is typed now.
  const [editing, setEditing] = useState<{ original: string; typed: string } | null>(null)
  const [applying, setApplying] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function edit() {
    onEdit?.()
    setError(null)
    setEditing({ original: value, typed: value })
  }

  function cancel() {
    setError(null)
    setEditing(null)
  }

  async function apply() {
    if (!editing || !onApply || applying) return
    setError(null)
    setApplying(true)
    const outcome = await onApply(editing.typed, editing.original)
    setApplying(false)
    if (outcome === 'applied') setEditing(null)
    else if (outcome !== 'cancelled') setError(outcome.error)
  }

  const field = {
    id,
    className: styles.copyInput,
    spellCheck: false,
    value: editing ? editing.typed : value,
    readOnly: !editing || applying,
    'aria-invalid': error ? true : undefined,
    'aria-describedby': error ? errorId : undefined,
    onChange: (event: { currentTarget: { value: string } }) => {
      const typed = event.currentTarget.value
      setEditing((current) => current && { ...current, typed })
    },
  }

  return (
    <div className={styles.copyField} data-editing={editing ? true : undefined}>
      <div className={styles.copyFieldHead}>
        <label htmlFor={id} className={styles.eyebrow}>
          {name}
        </label>
        {!editing && (
          <Group gap={2} wrap="nowrap">
            {onApply && (
              <Tooltip label={`Edit ${name}`} withArrow position="left">
                <ActionIcon variant="subtle" color="gray" size="sm" aria-label={`Edit ${name}`} onClick={edit}>
                  <PencilIcon />
                </ActionIcon>
              </Tooltip>
            )}
            <CopyValue value={value} label={`Copy ${name}`} />
          </Group>
        )}
      </div>
      {multiline ? <textarea {...field} rows={editing ? 10 : 4} /> : <input {...field} />}
      {editing && (
        <>
          {error && (
            <Text id={errorId} c="accent" size="sm" role="alert">
              {error}
            </Text>
          )}
          <Group justify="flex-end" gap="xs">
            <Button variant="default" size="xs" onClick={cancel} disabled={applying}>
              Cancel
            </Button>
            <Button size="xs" onClick={() => void apply()} loading={applying} aria-label={`Apply ${name}`}>
              Apply
            </Button>
          </Group>
        </>
      )}
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
// with their Variations, Glyphs, Comments and Bodies). A Comment is written
// in place, from its Move's menu; the other editors are under the board.
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
        />
      )}
      {belowEditor}
    </>
  )
}
