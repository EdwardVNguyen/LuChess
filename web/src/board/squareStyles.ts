import type { CSSProperties } from 'react'

// Per-square highlights layered over the board's light and dark squares. A
// square can have several at once, e.g. the last move, a capture ring and the
// pointer dragging over it: `layer` keeps every one's backgroundImage, so a
// highlight is a backgroundColor (one wins) or a backgroundImage (all show).
export const lastMoveStyle: CSSProperties = { backgroundColor: 'var(--cn-board-last-move)' }
export const selectedStyle: CSSProperties = { backgroundColor: 'var(--cn-highlight)' }
/** An empty square the selected piece can move to. */
export const targetStyle: CSSProperties = {
  backgroundImage: 'radial-gradient(circle, var(--cn-board-target) 0 16%, transparent 17%)',
}
/** A square holding a piece the selected piece can capture: a ring around its edge, as on Lichess. */
export const captureStyle: CSSProperties = {
  backgroundImage: 'radial-gradient(transparent 0 79%, var(--cn-board-target) 80%)',
}
/** The king of the side to move, in check. */
export const checkStyle: CSSProperties = {
  backgroundImage: 'radial-gradient(ellipse at center, var(--cn-board-check) 0, transparent 89%)',
}
/** The square under a piece being dragged. */
export const dragOverStyle: CSSProperties = {
  backgroundImage: 'linear-gradient(var(--cn-board-drag-over), var(--cn-board-drag-over))',
}

export type Highlight = [square: string | null | undefined, style: CSSProperties]

/** Merges highlights into react-chessboard's squareStyles; later ones are drawn on top. */
export function layer(...highlights: Highlight[]): Record<string, CSSProperties> {
  const result: Record<string, CSSProperties> = {}
  for (const [square, style] of highlights) {
    if (!square) continue
    const before = result[square]
    const images = [style.backgroundImage, before?.backgroundImage].filter(Boolean)
    result[square] = { ...before, ...style, ...(images.length && { backgroundImage: images.join(', ') }) }
  }
  return result
}
