import type { CSSProperties } from 'react'

// Per-square backgrounds layered over the board's light and dark squares.
export const lastMoveStyle: CSSProperties = { backgroundColor: 'var(--cn-board-last-move)' }
export const selectedStyle: CSSProperties = { backgroundColor: 'var(--cn-highlight)' }
export const targetStyle: CSSProperties = {
  backgroundImage: 'radial-gradient(circle, var(--cn-overlay) 0 16%, transparent 17%)',
}
