import { UnstyledButton } from '@mantine/core'
import { Fragment, useState } from 'react'
import type { PlyWriting } from '../api'
import type { Game, Ply } from '../chess/chess'
import { glyphName } from './glyphs'
import styles from './Notes.module.css'

type Props = {
  game: Game
  ply: number
  onPlyChange: (ply: number) => void
  /** The writing on each Ply that has some, by Ply. */
  writing?: ReadonlyMap<number, PlyWriting>
}

const noWriting: ReadonlyMap<number, PlyWriting> = new Map()

// The main line as running text: a move number before each White move, each
// move a button that jumps the board there, its Glyphs after it and its
// Comment inline. A Body breaks the moves into a paragraph of its own, and
// Black's move after a break gets its number again ("10…exd5"). The Body at
// ply 0 is not here: it opens the Note above the list.
export function MoveList({ game, ply, onPlyChange, writing = noWriting }: Props) {
  const moves = game.plies.slice(1)
  const start = writing.get(0)
  const opening = start && (start.positionGlyph || start.comment) && (
    <>
      {start.positionGlyph && <Glyph glyph={start.positionGlyph} />}
      {start.comment && <Comment text={start.comment} current={ply === 0} />}
    </>
  )

  if (moves.length === 0) {
    return (
      <div className={styles.lineOfThought}>
        {opening && <p className={styles.moves}>{opening}</p>}
        <p className={styles.noMoves}>No moves yet. This note studies the position alone.</p>
      </div>
    )
  }

  const blocks: { moves: Ply[]; body: PlyWriting | null }[] = [{ moves: [], body: null }]
  for (const move of moves) {
    const block = blocks[blocks.length - 1]
    block.moves.push(move)
    const written = writing.get(move.index)
    if (written?.body) {
      block.body = written
      blocks.push({ moves: [], body: null })
    }
  }
  if (blocks[blocks.length - 1].moves.length === 0) blocks.pop()

  return (
    <div className={styles.lineOfThought}>
      {blocks.map((block, b) => (
        <div key={block.moves[0].index} className={styles.thoughtBlock}>
          <p className={styles.moves}>
            {b === 0 && opening}
            {block.moves.map((move, i) => {
              const previous = i === 0 ? null : block.moves[i - 1]
              const restarts = previous === null || Boolean(writing.get(previous.index)?.comment)
              const number =
                move.color === 'w' ? `${move.moveNumber}.` : restarts ? `${move.moveNumber}…` : null
              const written = writing.get(move.index)
              return (
                <Fragment key={move.index}>
                  <span className={styles.moveGroup}>
                    {number && <span className={styles.moveNumber}>{number}</span>}
                    <UnstyledButton
                      className={styles.move}
                      aria-current={move.index === ply ? 'step' : undefined}
                      onClick={() => onPlyChange(move.index)}
                    >
                      {move.san}
                      {written?.moveGlyph && <Glyph glyph={written.moveGlyph} />}
                      {written?.positionGlyph && <Glyph glyph={written.positionGlyph} spaced />}
                    </UnstyledButton>
                  </span>
                  {written?.comment && <Comment text={written.comment} current={move.index === ply} />}
                </Fragment>
              )
            })}
          </p>
          {block.body?.body && (
            <p className={styles.body} data-current={block.body.ply === ply || undefined}>
              {block.body.body}
            </p>
          )}
        </div>
      ))}
    </div>
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
  const [expanded, setExpanded] = useState(false)
  const long = text.length > COMMENT_PREVIEW + 20
  const shown = long && !expanded ? preview(text) : text

  return (
    <span className={styles.comment} data-current={current || undefined}>
      {shown}
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

/** The start of a long Comment, cut at a word and marked with an ellipsis. */
function preview(text: string): string {
  const cut = text.slice(0, COMMENT_PREVIEW)
  const space = cut.lastIndexOf(' ')
  return `${(space > COMMENT_PREVIEW / 2 ? cut.slice(0, space) : cut).trimEnd()}…`
}
