import { Button, Group, SegmentedControl, Text, UnstyledButton } from '@mantine/core'
import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react'
import {
  checkedKing,
  clampPly,
  fenFromPlacement,
  isPromotion,
  legalTargets,
  placementFromFen,
  plyLabel,
  PROMOTIONS,
  START_FEN,
  tryMove,
  validateFen,
  type Color,
  type Game,
  type LegalMove,
  type PieceCode,
  type Promotion,
} from '../chess/chess'
import styles from './Board.module.css'
import { BoardSurface, type Movable, type Orientation } from './BoardSurface'
import { FirstIcon, LastIcon, NextIcon, PreviousIcon } from './icons'
import { Piece } from './Piece'
import { ALL_PIECES, pieceName } from './pieces'
import {
  captureStyle,
  checkStyle,
  lastMoveStyle,
  selectedStyle,
  targetStyle,
  type Highlight,
} from './squareStyles'

type ViewProps = {
  mode: 'view'
  game: Game
  ply: number
  onPlyChange: (ply: number) => void
  /** When given, legal moves can be played from the Ply shown, e.g. to edit a Note's moves. */
  onMove?: (move: LegalMove) => void
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

function ViewBoard({
  game,
  ply: requestedPly,
  onPlyChange,
  onMove,
  orientation,
}: ViewProps & { orientation: Orientation }) {
  const ply = clampPly(game, requestedPly)
  const current = game.plies[ply]
  const play = usePlay(current.fen, onMove ?? null, orientation)
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
        movable={play.movable}
        highlights={[
          [current.from, lastMoveStyle],
          [current.to, lastMoveStyle],
          [checkedKing(current.fen), checkStyle],
          ...play.highlights,
        ]}
        options={play.options}
      >
        {play.picker}
      </BoardSurface>
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
  const play = usePlay(fen, onMove, orientation)
  return (
    <div className={styles.board}>
      <BoardSurface
        fen={fen}
        orientation={orientation}
        movable={play.movable}
        highlights={[
          [lastMove?.from, lastMoveStyle],
          [lastMove?.to, lastMoveStyle],
          [checkedKing(fen), checkStyle],
          ...play.highlights,
        ]}
        options={play.options}
      >
        {play.picker}
      </BoardSurface>
    </div>
  )
}

// Playing legal moves on a board showing `fen`: click a piece, then a square,
// as well as dragging, so play works on touch. As on Lichess, a dragged piece
// is selected too, so its targets show while it is dragged: a dot on an empty
// square, a ring around a piece it can capture. A pawn move to the last rank
// waits for the piece to promote to. With no onMove, nothing can be played.
function usePlay(fen: string, onMove: ((move: LegalMove) => void) | null, orientation: Orientation) {
  const [selected, setSelected] = useState<{ fen: string; square: string } | null>(null)
  const [promoting, setPromoting] = useState<{ fen: string; from: string; to: string } | null>(null)
  const selectedSquare = onMove && selected?.fen === fen ? selected.square : null
  const pending = onMove && promoting?.fen === fen ? promoting : null
  const cancelPromotion = useCallback(() => setPromoting(null), [])
  const targets = selectedSquare ? legalTargets(fen, selectedSquare) : []
  const turn: Color = fen.split(' ')[1] === 'b' ? 'b' : 'w'
  const placement = placementFromFen(fen)

  if (!onMove) return { highlights: [], movable: 'none' as Movable, options: undefined, picker: null }
  const played = onMove

  function move(from: string, to: string): boolean {
    setSelected(null)
    if (isPromotion(fen, from, to)) {
      setPromoting({ fen, from, to })
      // The pawn goes back to its square until a piece is chosen.
      return false
    }
    const result = tryMove(fen, from, to)
    if (!result) return false
    played(result)
    return true
  }

  function promote(promotion: Promotion) {
    if (!pending) return
    setPromoting(null)
    const result = tryMove(fen, pending.from, pending.to, promotion)
    if (result) played(result)
  }

  function onSquareClick({ square }: { square: string }) {
    if (selectedSquare && targets.includes(square)) {
      move(selectedSquare, square)
      return
    }
    const ownPiece = placement[square]?.[0] === turn
    setSelected(ownPiece && square !== selectedSquare ? { fen, square } : null)
  }

  const highlights: Highlight[] = [
    [selectedSquare, selectedStyle],
    [pending?.from, selectedStyle],
    // En passant takes from an empty square, so it gets a dot, as on Lichess.
    ...targets.map((square): Highlight => [square, placement[square] ? captureStyle : targetStyle]),
  ]
  return {
    highlights,
    movable: (pending ? 'none' : turn) as Movable,
    options: {
      allowDragging: !pending,
      allowDragOffBoard: false,
      canDragPiece: ({ piece }: { piece: { pieceType: string } }) => piece.pieceType[0] === turn,
      onPieceDrag: ({ square }: { square: string | null }) => {
        if (square) setSelected({ fen, square })
      },
      onPieceDrop: ({ sourceSquare, targetSquare }: { sourceSquare: string; targetSquare: string | null }) => {
        // Put back where it started, the piece stays selected.
        if (targetSquare === sourceSquare) return false
        if (targetSquare) return move(sourceSquare, targetSquare)
        setSelected(null)
        return false
      },
      onSquareClick,
    },
    picker: pending && (
      <PromotionPicker
        square={pending.to}
        color={turn}
        orientation={orientation}
        onPick={promote}
        onCancel={cancelPromotion}
      />
    ),
  }
}

const PROMOTION_PIECES: Record<Promotion, { code: PieceCode[1]; name: string }> = {
  q: { code: 'Q', name: 'Queen' },
  r: { code: 'R', name: 'Rook' },
  b: { code: 'B', name: 'Bishop' },
  n: { code: 'N', name: 'Knight' },
}

// The four pieces in a column over the promotion square, running from the
// edge of the board inwards. Esc, or a click anywhere else, cancels.
function PromotionPicker({
  square,
  color,
  orientation,
  onPick,
  onCancel,
}: {
  square: string
  color: Color
  orientation: Orientation
  onPick: (promotion: Promotion) => void
  onCancel: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const file = 'abcdefgh'.indexOf(square[0])
  const column = orientation === 'white' ? file : 7 - file
  const atTop = (square[1] === '8') === (orientation === 'white')

  useEffect(() => {
    ref.current?.querySelector('button')?.focus()
    function onPointerDown(event: PointerEvent) {
      if (!ref.current?.contains(event.target as Node)) onCancel()
    }
    function onKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key === 'Escape') onCancel()
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [onCancel])

  return (
    <div className={styles.promotionBackdrop}>
      <div
        ref={ref}
        role="group"
        aria-label="Promote to"
        className={styles.promotion}
        style={{
          left: `${column * 12.5}%`,
          [atTop ? 'top' : 'bottom']: 0,
          flexDirection: atTop ? 'column' : 'column-reverse',
        }}
      >
        {PROMOTIONS.map((promotion) => {
          const { code, name } = PROMOTION_PIECES[promotion]
          const piece = `${color}${code}` as PieceCode
          return (
            <UnstyledButton
              key={promotion}
              className={styles.promotionItem}
              aria-label={name}
              onClick={() => onPick(promotion)}
            >
              <Piece piece={piece} />
            </UnstyledButton>
          )
        })}
      </div>
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
        movable="all"
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
              <Piece piece={piece} />
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
