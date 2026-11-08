import { useId, type CSSProperties, type ReactNode } from 'react'
import { Chessboard, type ChessboardOptions } from 'react-chessboard'
import styles from './Board.module.css'
import { glyphPieces } from './pieces'

export type Orientation = 'white' | 'black'

type BoardSurfaceProps = {
  fen: string
  orientation: Orientation
  /** Per-square backgrounds, e.g. the last move or a selected piece. */
  squareStyles?: Record<string, CSSProperties>
  options?: Omit<ChessboardOptions, 'id' | 'position' | 'pieces' | 'boardOrientation' | 'squareStyles'>
  /** Drawn over the squares, e.g. the promotion picker. */
  children?: ReactNode
}

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']
const RANKS = ['8', '7', '6', '5', '4', '3', '2', '1']

// The squares and pieces (react-chessboard, docs/adr/0006), with the
// coordinates drawn outside the board as in design/screens/Note.dc.html.
export function BoardSurface({ fen, orientation, squareStyles, options, children }: BoardSurfaceProps) {
  // react-chessboard uses the id in CSS selectors, so keep it to letters and digits.
  const id = `board${useId().replace(/[^a-zA-Z0-9]/g, '')}`
  const files = orientation === 'white' ? FILES : [...FILES].reverse()
  const ranks = orientation === 'white' ? RANKS : [...RANKS].reverse()

  return (
    <div className={styles.surface}>
      <div className={styles.ranks} aria-hidden="true">
        {ranks.map((rank) => (
          <span key={rank}>{rank}</span>
        ))}
      </div>
      <div className={styles.squares}>
        <Chessboard
          options={{
            allowDragging: false,
            allowDrawingArrows: false,
            animationDurationInMs: 150,
            showNotation: false,
            ...options,
            id,
            position: fen,
            pieces: glyphPieces,
            boardOrientation: orientation,
            squareStyles,
            boardStyle: { border: '1px solid var(--cn-ink)', borderRadius: 0, boxSizing: 'border-box' },
            lightSquareStyle: { backgroundColor: 'var(--cn-board-light)' },
            darkSquareStyle: { backgroundColor: 'var(--cn-board-dark)' },
            dropSquareStyle: { boxShadow: 'inset 0 0 0 2px var(--cn-ink)' },
          }}
        />
        {children}
      </div>
      <div className={styles.files} aria-hidden="true">
        {files.map((file) => (
          <span key={file}>{file}</span>
        ))}
      </div>
    </div>
  )
}
