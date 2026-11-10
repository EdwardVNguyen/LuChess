import type { PieceCode } from '../chess/chess'
import { pieceUrl } from './pieces'

// One piece from the cburnett set (docs/adr/0007), scaled to fill its box: a
// square on the board, the copy that follows the pointer while dragging, the
// promotion picker and the set-up palette. Decorative; the button or square
// around it carries the name.
export function Piece({ piece }: { piece: PieceCode }) {
  return (
    <img
      src={pieceUrl(piece)}
      alt=""
      draggable={false}
      width="100%"
      height="100%"
      style={{ display: 'block', pointerEvents: 'none' }}
    />
  )
}
