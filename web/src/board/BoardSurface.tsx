import { useId, useState, type ReactNode } from 'react'
import { Chessboard, type ChessboardOptions } from 'react-chessboard'
import type { Color } from '../chess/chess'
import styles from './Board.module.css'
import { boardPieces } from './pieces'
import { dragOverStyle, layer, type Highlight } from './squareStyles'

export type Orientation = 'white' | 'black'

/** Which pieces can be moved: one side's, every piece (set-up), or none. */
export type Movable = Color | 'all' | 'none'

type BoardSurfaceProps = {
  fen: string
  orientation: Orientation
  /** Pieces that can't move do nothing when pressed: no cursor, no text selection. */
  movable?: Movable
  /** Per-square highlights, e.g. the last move or a selected piece, drawn in order. */
  highlights?: Highlight[]
  options?: Omit<ChessboardOptions, 'id' | 'position' | 'pieces' | 'boardOrientation' | 'squareStyles'>
  /** Drawn over the squares, e.g. the promotion picker. */
  children?: ReactNode
}

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']
const RANKS = ['8', '7', '6', '5', '4', '3', '2', '1']

// The squares and pieces (react-chessboard, docs/adr/0006) in the board's own
// look (docs/adr/0007): no border, a soft shadow, and the coordinates on the
// edge squares, files along the bottom and ranks down the right.
export function BoardSurface({
  fen,
  orientation,
  movable = 'none',
  highlights = [],
  options,
  children,
}: BoardSurfaceProps) {
  // The square under a dragged piece. react-chessboard's own dropSquareStyle
  // is drawn beneath squareStyles, so a highlighted square would hide it.
  const [drag, setDrag] = useState<{ over: string | null } | null>(null)

  // react-chessboard uses the id in CSS selectors, so keep it to letters and digits.
  const id = `board${useId().replace(/[^a-zA-Z0-9]/g, '')}`
  const files = orientation === 'white' ? FILES : [...FILES].reverse()
  const ranks = orientation === 'white' ? RANKS : [...RANKS].reverse()

  return (
    <div className={styles.surface}>
      <div className={styles.squares} data-movable={movable}>
        <Chessboard
          options={{
            allowDragging: false,
            allowDrawingArrows: false,
            animationDurationInMs: 150,
            showNotation: false,
            ...options,
            onPieceDrag: (args) => {
              setDrag({ over: args.square })
              options?.onPieceDrag?.(args)
            },
            onPieceDrop: (args) => {
              setDrag(null)
              return options?.onPieceDrop?.(args) ?? false
            },
            onPieceDragCancel: () => {
              setDrag(null)
              options?.onPieceDragCancel?.()
            },
            // Also called on plain hover; only a drag highlights.
            onMouseOverSquare: ({ square }) => setDrag((current) => current && { over: square }),
            onMouseOutSquare: ({ square }) =>
              setDrag((current) => (current?.over === square ? { over: null } : current)),
            id,
            position: fen,
            pieces: boardPieces,
            boardOrientation: orientation,
            squareStyles: layer(...highlights, [drag?.over, dragOverStyle]),
            boardStyle: { borderRadius: 0, boxShadow: 'var(--cn-board-shadow)' },
            lightSquareStyle: { backgroundColor: 'var(--cn-board-light)' },
            darkSquareStyle: { backgroundColor: 'var(--cn-board-dark)' },
            // Replaces react-chessboard's default ring; the drag-over highlight is in squareStyles.
            dropSquareStyle: { boxShadow: 'none' },
          }}
        />
        <Coordinates files={files} ranks={ranks} />
        {children}
      </div>
    </div>
  )
}

// a1 is dark: a square is dark when its file and rank add up to an even number.
function isDark(file: string, rank: string): boolean {
  return (FILES.indexOf(file) + Number(rank) - 1) % 2 === 0
}

// Each coordinate is drawn in the other square colour, so it reads on either.
function coordinateColor(file: string, rank: string): string {
  return isDark(file, rank) ? 'var(--cn-board-light)' : 'var(--cn-board-dark)'
}

/** Files along the bottom rank and ranks down the right-hand file, as seen from `orientation`. */
function Coordinates({ files, ranks }: { files: string[]; ranks: string[] }) {
  const bottomRank = ranks[ranks.length - 1]
  const rightFile = files[files.length - 1]
  return (
    <div className={styles.coordinates} aria-hidden="true">
      {files.map((file, column) => (
        <span
          key={file}
          className={styles.file}
          style={{ left: `${column * 12.5}%`, color: coordinateColor(file, bottomRank) }}
        >
          {file}
        </span>
      ))}
      {ranks.map((rank, row) => (
        <span
          key={rank}
          className={styles.rank}
          style={{ top: `${row * 12.5}%`, color: coordinateColor(rightFile, rank) }}
        >
          {rank}
        </span>
      ))}
    </div>
  )
}
