import { Menu, UnstyledButton } from '@mantine/core'
import { useState, type ReactNode } from 'react'
import type { Writing } from '../chess/pgn'
import { moveOf, onMainLine, type MoveId, type MoveTree, type TreeMove } from '../chess/tree'
import { ContextMenu, useContextMenu } from '../overlay'
import { glyphName } from './glyphs'
import { LinkedText } from './LinkedText'
import { useShownText } from './linking'
import { cutShown, shownLength } from './links'
import styles from './Notes.module.css'

type Props = {
  tree: MoveTree
  /** The Move the board is on. */
  current: MoveId
  onMoveChange: (move: MoveId) => void
  /** The writing on each Move that has some, by Move. */
  writing?: ReadonlyMap<MoveId, Writing>
  /** What a Move's right-click menu does; without it, a Move keeps the browser's own menu. */
  menu?: MoveMenu
}

/** The actions in a Move's right-click menu (#76). */
export type MoveMenu = {
  /** Go to the Move and focus its Comment. */
  onComment: (move: MoveId) => void
  /** Put the Move on the Main line, all the way up (ADR 0009). */
  onPromote: (move: MoveId) => void
  /** Delete the Move and its whole subtree, confirming first if writing would go. */
  onDelete: (move: MoveId) => void
}

type TriggerProps = ReturnType<ReturnType<typeof useContextMenu<MoveId>>['triggerProps']>

const noWriting: ReadonlyMap<MoveId, Writing> = new Map()

// One run of the Main line: its moves, then the Variations that replace its
// last move, then the Body after that move. A Variation or a Body ends a run.
type Run = { moves: ReactNode[]; variations: TreeMove[]; body: { move: MoveId; text: string } | null; key: MoveId }

// The Main line as running text: a move number before each White move, each
// move a button that jumps the board there, its Glyphs after it and its
// Comment inline. After a move come the Variations that replace it, greyed,
// smaller and indented, with deeper ones nested in parentheses.
// A Body breaks the moves into a paragraph of its own. Black's move after a
// break gets its number again ("10…exd5"). The Body on the Position is not
// here: it opens the Note above the list.
export function MoveList({ tree, current, onMoveChange, writing = noWriting, menu }: Props) {
  const contextMenu = useContextMenu<MoveId>()
  const root = moveOf(tree, tree.root)
  const start = writing.get(root.id)
  const opening = start && (start.positionGlyph || start.comment) && (
    <>
      {start.positionGlyph && <Glyph glyph={start.positionGlyph} />}
      {start.comment && <Comment text={start.comment} current={current === root.id} />}
    </>
  )

  if (root.children.length === 0) {
    return (
      <div className={styles.lineOfThought}>
        {opening && <p className={styles.moves}>{opening}</p>}
        <p className={styles.noMoves}>No moves yet. This note studies the position alone.</p>
      </div>
    )
  }

  const move = (m: TreeMove, numbered: boolean) => (
    <MoveButton
      key={m.id}
      move={m}
      numbered={numbered}
      current={m.id === current}
      written={writing.get(m.id)}
      onClick={onMoveChange}
      menuTrigger={menu && contextMenu.triggerProps(m.id)}
      menuOpen={contextMenu.opened?.value === m.id}
    />
  )

  // A Variation as one line of text, from its first move on through first
  // children, with the Variations inside it in parentheses.
  function variationLine(first: TreeMove): ReactNode[] {
    const nodes: ReactNode[] = []
    let numbered = true
    for (let at: TreeMove | null = first; at; at = at.children.length > 0 ? moveOf(tree, at.children[0]) : null) {
      nodes.push(move(at, numbered))
      numbered = false
      const written = writing.get(at.id)
      if (written?.comment) {
        nodes.push(<Comment key={`${at.id}-comment`} text={written.comment} current={at.id === current} />)
        numbered = true
      }
      if (written?.body) {
        nodes.push(<InlineBody key={`${at.id}-body`} text={written.body} current={at.id === current} />)
        numbered = true
      }
      // The first move's alternatives are listed beside it, by the line it branched from.
      const alternatives = at === first ? [] : moveOf(tree, at.parent as MoveId).children.slice(1)
      for (const alternative of alternatives) {
        nodes.push(
          <span key={`${alternative}-nested`} className={styles.nestedVariation}>
            ({variationLine(moveOf(tree, alternative))})
          </span>,
        )
        numbered = true
      }
    }
    return nodes
  }

  const runs: Run[] = []
  let run: Run | null = null
  let numbered = true
  for (let at = root; at.children.length > 0; ) {
    const [main, ...variations] = at.children.map((id) => moveOf(tree, id))
    run ??= { moves: [], variations: [], body: null, key: main.id }
    run.moves.push(move(main, numbered))
    numbered = false
    const written = writing.get(main.id)
    if (written?.comment) {
      run.moves.push(<Comment key={`${main.id}-comment`} text={written.comment} current={main.id === current} />)
      numbered = true
    }
    run.variations = variations
    if (written?.body) run.body = { move: main.id, text: written.body }
    if (variations.length > 0 || written?.body) {
      runs.push(run)
      run = null
      numbered = true
    }
    at = main
  }
  if (run) runs.push(run)

  return (
    <div className={styles.lineOfThought}>
      {runs.map((r, i) => (
        <div key={r.key} className={styles.thoughtBlock}>
          <p className={styles.moves}>
            {i === 0 && opening}
            {r.moves}
          </p>
          {r.variations.length > 0 && (
            <div className={styles.variations}>
              {r.variations.map((variation) => (
                <p key={variation.id} className={styles.variation}>
                  {variationLine(variation)}
                </p>
              ))}
            </div>
          )}
          {r.body && (
            <p className={styles.body} data-current={r.body.move === current || undefined}>
              <Written text={r.body.text} />
            </p>
          )}
        </div>
      ))}
      {menu && (
        <ContextMenu at={contextMenu.opened} onClose={contextMenu.close}>
          {contextMenu.opened && tree.moves.has(contextMenu.opened.value) && (
            <MoveMenuItems tree={tree} move={contextMenu.opened.value} menu={menu} />
          )}
        </ContextMenu>
      )}
    </div>
  )
}

// A Move's right-click menu. Promote is there but off for a Move already on the Main line.
function MoveMenuItems({ tree, move, menu }: { tree: MoveTree; move: MoveId; menu: MoveMenu }) {
  return (
    <>
      <Menu.Item onClick={() => menu.onComment(move)}>Add comment</Menu.Item>
      <Menu.Item disabled={onMainLine(tree, move)} onClick={() => menu.onPromote(move)}>
        Promote to main line
      </Menu.Item>
      <Menu.Item color="accent.6" onClick={() => menu.onDelete(move)}>
        Delete from here
      </Menu.Item>
    </>
  )
}

function MoveButton({
  move,
  numbered,
  current,
  written,
  onClick,
  menuTrigger,
  menuOpen,
}: {
  move: TreeMove
  /** Black's move gets its number only after a break; White's always has one. */
  numbered: boolean
  current: boolean
  written: Writing | undefined
  onClick: (move: MoveId) => void
  /** Opens the Move's right-click menu, by right-click, keyboard or long-press. */
  menuTrigger: TriggerProps | undefined
  menuOpen: boolean
}) {
  const number = move.color === 'w' ? `${move.moveNumber}.` : numbered ? `${move.moveNumber}…` : null
  return (
    <span className={styles.moveGroup}>
      {number && <span className={styles.moveNumber}>{number}</span>}
      <UnstyledButton
        className={styles.move}
        aria-current={current ? 'step' : undefined}
        data-menu-open={menuOpen || undefined}
        onClick={() => onClick(move.id)}
        {...menuTrigger}
      >
        {move.san}
        {written?.moveGlyph && <Glyph glyph={written.moveGlyph} />}
        {written?.positionGlyph && <Glyph glyph={written.positionGlyph} spaced />}
      </UnstyledButton>
    </span>
  )
}

function Glyph({ glyph, spaced = false }: { glyph: string; spaced?: boolean }) {
  return (
    <span className={styles.glyph} data-spaced={spaced || undefined} title={glyphName(glyph)}>
      {glyph}
    </span>
  )
}

// Past this many characters a Comment is cut short, with "more" to read it all.
export const COMMENT_PREVIEW = 140

function Comment({ text, current }: { text: string; current: boolean }) {
  return <Expandable text={text} current={current} className={styles.comment} />
}

// A Body inside a Variation runs on with its moves.
function InlineBody({ text, current }: { text: string; current: boolean }) {
  return <Expandable text={text} current={current} className={`${styles.comment} ${styles.inlineBody}`} />
}

function Expandable({ text, current, className }: { text: string; current: boolean; className: string }) {
  const [expanded, setExpanded] = useState(false)
  const parts = useShownText(text)
  const long = shownLength(parts) > COMMENT_PREVIEW + 20

  return (
    <span className={className} data-current={current || undefined}>
      <LinkedText parts={long && !expanded ? cutShown(parts, COMMENT_PREVIEW) : parts} />
      {long && (
        <>
          {' '}
          <UnstyledButton className={styles.more} onClick={() => setExpanded(!expanded)} aria-expanded={expanded}>
            {expanded ? 'less' : 'more'}
          </UnstyledButton>
        </>
      )}
    </span>
  )
}

/** A Comment or Body in full, with its Links. */
export function Written({ text }: { text: string }) {
  return <LinkedText parts={useShownText(text)} />
}
