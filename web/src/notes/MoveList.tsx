import { Menu, UnstyledButton } from '@mantine/core'
import { useState, type ReactNode } from 'react'
import type { Writing } from '../chess/pgn'
import { moveOf, onMainLine, type MoveId, type MoveTree, type TreeMove } from '../chess/tree'
import { ContextMenu, useContextMenu } from '../overlay'
import { glyphName } from './glyphs'
import { LinkedText } from './LinkedText'
import { useLinking, useShownText } from './linking'
import { cutShown, shownLength } from './links'
import styles from './Notes.module.css'
import { TextEditor } from './TextEditor'

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
  /** Saves a Move's Comment, written in the move list (#97), or deletes it when null. */
  onComment: (move: MoveId, comment: string | null) => void
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
// The menu's Add comment (Edit comment when there is one) opens an editor
// where the Move's Comment shows. New Comments go on Moves only: a Comment on
// the Position, from an older Note, still shows, and its menu only deletes it.
export function MoveList({ tree, current, onMoveChange, writing = noWriting, menu }: Props) {
  const contextMenu = useContextMenu<MoveId>()
  // The Move whose Comment is being written, and how many times its menu has
  // asked to link a Note (#101).
  const [editing, setEditing] = useState<{ move: MoveId; links: number } | null>(null)
  const canLink = useLinking().noteId !== null
  const root = moveOf(tree, tree.root)
  const start = writing.get(root.id)
  const opening = start && (start.positionGlyph || start.comment) && (
    <>
      {start.positionGlyph && <Glyph glyph={start.positionGlyph} />}
      {start.comment && (
        <Comment
          text={start.comment}
          current={current === root.id}
          menuTrigger={menu && contextMenu.triggerProps(root.id)}
          menuOpen={contextMenu.opened?.value === root.id}
        />
      )}
    </>
  )

  const contextMenuItems = menu && (
    <ContextMenu at={contextMenu.opened} onClose={contextMenu.close}>
      {contextMenu.opened && tree.moves.has(contextMenu.opened.value) && (
        <MoveMenuItems
          tree={tree}
          move={contextMenu.opened.value}
          hasComment={Boolean(writing.get(contextMenu.opened.value)?.comment)}
          menu={menu}
          onComment={(move) => {
            onMoveChange(move)
            setEditing({ move, links: 0 })
          }}
          // Linking needs a saved Note, so a Guest or an unsaved Note isn't offered it.
          onLink={
            canLink
              ? (move) => {
                  onMoveChange(move)
                  setEditing((was) => ({ move, links: was?.move === move ? was.links + 1 : 1 }))
                }
              : undefined
          }
        />
      )}
    </ContextMenu>
  )

  if (root.children.length === 0) {
    return (
      <div className={styles.lineOfThought}>
        {opening && <p className={styles.moves}>{opening}</p>}
        <p className={styles.noMoves}>No moves yet. This note studies the position alone.</p>
        {contextMenuItems}
      </div>
    )
  }

  // A Move's Comment, or its editor while it is being written.
  function commentOn(m: TreeMove): ReactNode {
    const comment = writing.get(m.id)?.comment
    if (menu && editing?.move === m.id) {
      const label = `${m.moveNumber}${m.color === 'w' ? '.' : '…'}${m.san}`
      return (
        <TextEditor
          key={`${m.id}-comment`}
          label={`Comment on ${label}`}
          placeholder={`Comment on ${label}.` + (canLink ? ' Type [[ to link another note.' : '')}
          saved={comment ?? ''}
          onSave={(text) => menu.onComment(m.id, text)}
          onClose={() => setEditing(null)}
          linkRequest={editing.links}
        />
      )
    }
    return comment ? <Comment key={`${m.id}-comment`} text={comment} current={m.id === current} /> : null
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
      const comment = commentOn(at)
      if (comment) {
        nodes.push(comment)
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
    const comment = commentOn(main)
    if (comment) {
      run.moves.push(comment)
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
      {contextMenuItems}
    </div>
  )
}

// A Move's right-click menu. Promote is there but off for a Move already on
// the Main line. Link a note opens the Comment editor with the picker to link
// another Note (#101). The Position's offers only to delete its Comment.
function MoveMenuItems({
  tree,
  move,
  hasComment,
  menu,
  onComment,
  onLink,
}: {
  tree: MoveTree
  move: MoveId
  hasComment: boolean
  menu: MoveMenu
  /** Opens the Move's Comment editor. */
  onComment: (move: MoveId) => void
  /** Opens the Move's Comment editor with the picker to link a Note; left out when Links can't be made. */
  onLink: ((move: MoveId) => void) | undefined
}) {
  if (move === tree.root) {
    return (
      <Menu.Item color="accent.6" onClick={() => menu.onComment(move, null)}>
        Delete comment
      </Menu.Item>
    )
  }
  return (
    <>
      <Menu.Item onClick={() => onComment(move)}>{hasComment ? 'Edit comment' : 'Add comment'}</Menu.Item>
      {onLink && <Menu.Item onClick={() => onLink(move)}>Link a note…</Menu.Item>}
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

function Comment({
  text,
  current,
  menuTrigger,
  menuOpen = false,
}: {
  text: string
  current: boolean
  /** On the Position's Comment: opens its menu, to delete it. */
  menuTrigger?: TriggerProps
  menuOpen?: boolean
}) {
  return (
    <Expandable
      text={text}
      current={current}
      className={styles.comment}
      // Focusable, so the keyboard can open its menu too.
      triggerProps={menuTrigger && { ...menuTrigger, tabIndex: 0, 'data-menu-open': menuOpen || undefined }}
    />
  )
}

// A Body inside a Variation runs on with its moves.
function InlineBody({ text, current }: { text: string; current: boolean }) {
  return <Expandable text={text} current={current} className={`${styles.comment} ${styles.inlineBody}`} />
}

function Expandable({
  text,
  current,
  className,
  triggerProps,
}: {
  text: string
  current: boolean
  className: string
  triggerProps?: TriggerProps & { tabIndex: number; 'data-menu-open': true | undefined }
}) {
  const [expanded, setExpanded] = useState(false)
  const parts = useShownText(text)
  const long = shownLength(parts) > COMMENT_PREVIEW + 20

  return (
    <span className={className} data-current={current || undefined} {...triggerProps}>
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
