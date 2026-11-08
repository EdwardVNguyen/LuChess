import { Button, Group, SegmentedControl, Text, UnstyledButton } from '@mantine/core'
import { useState, type CSSProperties, type KeyboardEvent } from 'react'
import {
  clampPly,
  fenFromPlacement,
  legalTargets,
  placementFromFen,
  plyLabel,
  START_FEN,
  tryMove,
  validateFen,
  type Color,
  type Game,
  type LegalMove,
  type PieceCode,
} from '../chess/chess'
import styles from './Board.module.css'
import { BoardSurface, type Orientation } from './BoardSurface'
import { FirstIcon, LastIcon, NextIcon, PreviousIcon } from './icons'
import { PieceGlyph } from './PieceGlyph'
import { ALL_PIECES, pieceName } from './pieces'
import { lastMoveStyle, selectedStyle, targetStyle } from './squareStyles'

type ViewProps = {
  mode: 'view'
  game: Game
  ply: number
  onPlyChange: (ply: number) => void
}

type PlayProps = {
  mode: 'play'
  fen: string
  /** Highlighted as the last move. */
  lastMove?: { from: string; to: string } | null
  onMove: (move: LegalMove) => void
}

type SetupProps = {
  mode: 'setup'
  fen: string
  /** Called with every edit; `error` is null when the FEN is a valid position. */
  onFenChange: (fen: string, error: string | null) => void
}

export type BoardProps = (ViewProps | PlayProps | SetupProps) & {
  orientation?: Orientation
}

// The one shared board (web/AGENTS.md). It fills its container's width:
// about 360px in the Note screen's desktop column, full width on mobile.
export function Board(props: BoardProps) {
  const orientation = props.orientation ?? 'white'
  switch (props.mode) {
    case 'view':
      return <ViewBoard {...props} orientation={orientation} />
    case 'play':
      return <PlayBoard {...props} orientation={orientation} />
    case 'setup':
      return <SetupBoard {...props} orientation={orientation} />
  }
}

function highlight(...entries: [string | null | undefined, CSSProperties][]): Record<string, CSSProperties> {
  const result: Record<string, CSSProperties> = {}
  for (const [square, style] of entries) {
    if (square) result[square] = { ...result[square], ...style }
  }
  return result
}

function ViewBoard({ game, ply: requestedPly, onPlyChange, orientation }: ViewProps & { orientation: Orientation }) {
  const ply = clampPly(game, requestedPly)
  const current = game.plies[ply]
  const last = game.plies.length - 1
  const label = plyLabel(current)
  const caption = label ? `After ${label}` : 'Start position'

  function onKeyDown(event: KeyboardEvent) {
    const target = { ArrowLeft: ply - 1, ArrowRight: ply + 1, ArrowUp: 0, Home: 0, ArrowDown: last, End: last }[
      event.key
    ]
    if (target === undefined) return
    event.preventDefault()
    onPlyChange(clampPly(game, target))
  }

  return (
    <div
      className={styles.board}
      role="group"
      aria-label={`Chess board, ${caption.toLowerCase()}`}
      tabIndex={0}
      onKeyDown={onKeyDown}
    >
      <BoardSurface
        fen={current.fen}
        orientation={orientation}
        squareStyles={highlight([current.from, lastMoveStyle], [current.to, lastMoveStyle])}
      />
      <div className={styles.controls}>
        <Group gap={8} wrap="nowrap">
          <ControlButton label="First move" disabled={ply === 0} onClick={() => onPlyChange(0)}>
            <FirstIcon />
          </ControlButton>
          <ControlButton label="Previous move" disabled={ply === 0} onClick={() => onPlyChange(ply - 1)}>
            <PreviousIcon />
          </ControlButton>
          <ControlButton label="Next move" disabled={ply === last} onClick={() => onPlyChange(ply + 1)}>
            <NextIcon />
          </ControlButton>
          <ControlButton label="Last move" disabled={ply === last} onClick={() => onPlyChange(last)}>
            <LastIcon />
          </ControlButton>
        </Group>
        <span className={styles.caption} aria-live="polite">
          {caption}
        </span>
      </div>
    </div>
  )
}

function ControlButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string
  disabled: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <UnstyledButton className={styles.control} aria-label={label} disabled={disabled} onClick={onClick}>
      {children}
    </UnstyledButton>
  )
}

function PlayBoard({ fen, lastMove, onMove, orientation }: PlayProps & { orientation: Orientation }) {
  // Click a piece, then a square, as well as dragging, so play works on touch.
  const [selected, setSelected] = useState<{ fen: string; square: string } | null>(null)
  const selectedSquare = selected?.fen === fen ? selected.square : null
  const targets = selectedSquare ? legalTargets(fen, selectedSquare) : []
  const turn = fen.split(' ')[1]

  function move(from: string, to: string): boolean {
    const result = tryMove(fen, from, to)
    setSelected(null)
    if (!result) return false
    onMove(result)
    return true
  }

  function onSquareClick({ square }: { square: string }) {
    if (selectedSquare && targets.includes(square)) {
      move(selectedSquare, square)
      return
    }
    const ownPiece = placementFromFen(fen)[square]?.[0] === turn
    setSelected(ownPiece && square !== selectedSquare ? { fen, square } : null)
  }

  return (
    <div className={styles.board}>
      <BoardSurface
        fen={fen}
        orientation={orientation}
        squareStyles={highlight(
          [lastMove?.from, lastMoveStyle],
          [lastMove?.to, lastMoveStyle],
          [selectedSquare, selectedStyle],
          ...targets.map((square): [string, CSSProperties] => [square, targetStyle]),
        )}
        options={{
          allowDragging: true,
          allowDragOffBoard: false,
          canDragPiece: ({ piece }) => piece.pieceType[0] === turn,
          onPieceDrop: ({ sourceSquare, targetSquare }) => (targetSquare ? move(sourceSquare, targetSquare) : false),
          onSquareClick,
        }}
      />
    </div>
  )
}

type Tool = PieceCode | 'erase'

function SetupBoard({ fen, onFenChange, orientation }: SetupProps & { orientation: Orientation }) {
  const [tool, setTool] = useState<Tool>('wP')
  const placement = placementFromFen(fen)
  const turn: Color = fen.split(' ')[1] === 'b' ? 'b' : 'w'
  const validity = validateFen(fen)

  function change(nextPlacement: typeof placement, nextTurn: Color) {
    const next = fenFromPlacement(nextPlacement, nextTurn)
    const result = validateFen(next)
    onFenChange(next, result.ok ? null : result.error)
  }

  function onSquareClick({ square }: { square: string }) {
    const next = { ...placement }
    if (tool === 'erase' || next[square] === tool) delete next[square]
    else next[square] = tool
    change(next, turn)
  }

  function onPieceDrop({ sourceSquare, targetSquare }: { sourceSquare: string; targetSquare: string | null }) {
    const piece = placement[sourceSquare]
    if (!piece || sourceSquare === targetSquare) return false
    const next = { ...placement }
    delete next[sourceSquare]
    // Dropping a piece off the board removes it.
    if (targetSquare) next[targetSquare] = piece
    change(next, turn)
    return true
  }

  return (
    <div className={styles.board}>
      <BoardSurface
        fen={fen}
        orientation={orientation}
        options={{ allowDragging: true, allowDragOffBoard: true, showAnimations: false, onSquareClick, onPieceDrop }}
      />
      <div className={styles.setup}>
        <div className={styles.palette} role="radiogroup" aria-label="Piece to place">
          {ALL_PIECES.map((piece) => (
            <UnstyledButton
              key={piece}
              role="radio"
              aria-checked={tool === piece}
              aria-label={pieceName(piece)}
              className={styles.paletteItem}
              onClick={() => setTool(piece)}
            >
              <PieceGlyph piece={piece} />
            </UnstyledButton>
          ))}
          <UnstyledButton
            role="radio"
            aria-checked={tool === 'erase'}
            className={`${styles.paletteItem} ${styles.erase}`}
            onClick={() => setTool('erase')}
          >
            Erase
          </UnstyledButton>
        </div>
        <SegmentedControl
          fullWidth
          value={turn}
          onChange={(value) => change(placement, value as Color)}
          data={[
            { value: 'w', label: 'White to move' },
            { value: 'b', label: 'Black to move' },
          ]}
          aria-label="Side to move"
        />
        <Group gap="xs">
          <Button variant="default" size="xs" onClick={() => change(placementFromFen(START_FEN), 'w')}>
            Start position
          </Button>
          <Button variant="default" size="xs" onClick={() => change({}, turn)}>
            Empty board
          </Button>
        </Group>
        <Text size="xs" className={styles.fen} data-testid="setup-fen">
          {fen}
        </Text>
        {!validity.ok && (
          <Text size="sm" c="accent" role="alert">
            {validity.error.replace(/^Invalid FEN: /, 'Not a legal position yet: ')}.
          </Text>
        )}
      </div>
    </div>
  )
}
