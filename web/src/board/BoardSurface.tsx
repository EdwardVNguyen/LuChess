import { useReducedMotion } from '@mantine/hooks'
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  Chessboard,
  ChessboardProvider,
  defaultArrowOptions,
  useChessboardContext,
  type ChessboardOptions,
} from 'react-chessboard'
import type { Color } from '../chess/chess'
import type { Brush, Drawing } from '../chess/pgn'
import styles from './Board.module.css'
import { BRUSH_COLORS, brushOf, circleStyle, toggleDrawing } from './drawings'
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
  /** Arrows and circles drawn on the board (#77). */
  drawings?: readonly Drawing[]
  /**
   * When given, the Drawings can be drawn: a right-drag draws an arrow and a
   * right-click a circle, and drawing one again removes it (`toggleDrawing`).
   * A left-click clears them all.
   */
  onDrawingsChange?: (drawings: Drawing[]) => void
  options?: Omit<
    ChessboardOptions,
    'id' | 'position' | 'pieces' | 'boardOrientation' | 'squareStyles' | 'arrows' | 'allowDrawingArrows' | 'arrowOptions'
  >
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
  drawings = noDrawings,
  onDrawingsChange,
  options,
  children,
}: BoardSurfaceProps) {
  // The square under a dragged piece. react-chessboard's own dropSquareStyle
  // is drawn beneath squareStyles, so a highlighted square would hide it.
  const [drag, setDrag] = useState<{ over: string | null } | null>(null)
  // react-chessboard animates in JavaScript, so CSS can't stop it: honour a
  // visitor's reduced-motion setting here. Read on the first render, so the
  // board never slides a piece before the setting is known.
  const reduceMotion = useReducedMotion(undefined, { getInitialValueInEffect: false })

  // react-chessboard uses the id in CSS selectors, so keep it to letters and digits.
  const id = `board${useId().replace(/[^a-zA-Z0-9]/g, '')}`
  const files = orientation === 'white' ? FILES : [...FILES].reverse()
  const ranks = orientation === 'white' ? RANKS : [...RANKS].reverse()

  // A right-press starts a Drawing, with the brush its modifier keys choose,
  // and letting go finishes it: on the same square a circle, on another an
  // arrow. react-chessboard draws the arrow while it is dragged, in that brush.
  const start = useRef<{ square: string; brush: Brush } | null>(null)
  const [brush, setBrush] = useState<Brush>('green')
  const arrows = useMemo(
    () =>
      drawings.flatMap((d) => (d.to ? [{ startSquare: d.from, endSquare: d.to, color: BRUSH_COLORS[d.brush] }] : [])),
    [drawings],
  )
  const arrowOptions = useMemo(() => {
    const color = BRUSH_COLORS[brush]
    return { ...defaultArrowOptions, colors: { default: color, shift: color, ctrl: color, alt: color, meta: color } }
  }, [brush])
  const circles = drawings.flatMap((d): Highlight[] => (d.to ? [] : [[d.from, circleStyle(d.brush)]]))

  return (
    <div className={styles.surface}>
      <div className={styles.squares} data-movable={movable} onMouseLeave={() => (start.current = null)}>
        <ChessboardProvider
          options={{
            allowDragging: false,
            animationDurationInMs: 150,
            showAnimations: !reduceMotion,
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
            onSquareMouseDown: (args, event) => {
              // A left-click anywhere on the board clears the Drawings.
              if (onDrawingsChange && event.button === 0 && drawings.length > 0) onDrawingsChange([])
              if (onDrawingsChange && event.button === 2) {
                const chosen = brushOf(event)
                start.current = { square: args.square, brush: chosen }
                setBrush(chosen)
              }
              options?.onSquareMouseDown?.(args, event)
            },
            onSquareMouseUp: (args, event) => {
              const begun = start.current
              if (onDrawingsChange && event.button === 2 && begun) {
                start.current = null
                const { square: from, brush: drawn } = begun
                const shape: Drawing =
                  from === args.square ? { from, brush: drawn } : { from, to: args.square, brush: drawn }
                onDrawingsChange(toggleDrawing(drawings, shape))
              }
              options?.onSquareMouseUp?.(args, event)
            },
            id,
            position: fen,
            pieces: boardPieces,
            boardOrientation: orientation,
            allowDrawingArrows: Boolean(onDrawingsChange),
            arrows,
            arrowOptions,
            squareStyles: layer(...highlights, ...circles, [drag?.over, dragOverStyle]),
            boardStyle: { borderRadius: 0, boxShadow: 'var(--cn-board-shadow)' },
            lightSquareStyle: { backgroundColor: 'var(--cn-board-light)' },
            darkSquareStyle: { backgroundColor: 'var(--cn-board-dark)' },
            // Replaces react-chessboard's default ring; the drag-over highlight is in squareStyles.
            dropSquareStyle: { boxShadow: 'none' },
          }}
        >
          <OnlyGivenArrows />
          <Chessboard />
        </ChessboardProvider>
        <Coordinates files={files} ranks={ranks} />
        {children}
      </div>
    </div>
  )
}

const noDrawings: readonly Drawing[] = []

// react-chessboard also keeps arrows of its own as they are drawn, which
// would stay after the Drawing they became is removed or the Move changes.
// The board shows only the Drawings it is given, so those are dropped at once.
function OnlyGivenArrows() {
  const { internalArrows, clearArrows } = useChessboardContext()
  useEffect(() => {
    if (internalArrows.length > 0) clearArrows()
  }, [internalArrows, clearArrows])
  return null
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
