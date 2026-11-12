import type { CSSProperties } from 'react'
import type { Brush, Drawing } from '../chess/pgn'
import { boardTokens } from '../theme/tokens'

// Drawings (#77): arrows and circles on the board, made with one of four
// brushes. Their colours are the board's own (docs/adr/0007).

/** The brush a right-click draws with: green, Shift for red, Alt for blue, Shift+Alt for yellow. */
export function brushOf({ shiftKey, altKey }: { shiftKey: boolean; altKey: boolean }): Brush {
  if (shiftKey && altKey) return 'yellow'
  if (shiftKey) return 'red'
  if (altKey) return 'blue'
  return 'green'
}

/**
 * The colour of each brush, as a value rather than a CSS variable: arrows are
 * drawn by react-chessboard as SVG attributes, which can't read one.
 */
export const BRUSH_COLORS: Record<Brush, string> = {
  green: boardTokens.brushGreen,
  red: boardTokens.brushRed,
  blue: boardTokens.brushBlue,
  yellow: boardTokens.brushYellow,
}

const BRUSH_VARIABLES: Record<Brush, string> = {
  green: 'var(--cn-board-brush-green)',
  red: 'var(--cn-board-brush-red)',
  blue: 'var(--cn-board-brush-blue)',
  yellow: 'var(--cn-board-brush-yellow)',
}

/** A circle drawn on a square: a ring just inside its edge, layered over the square's highlights. */
export function circleStyle(brush: Brush): CSSProperties {
  return {
    backgroundImage: `radial-gradient(circle closest-side, transparent 0 83%, ${BRUSH_VARIABLES[brush]} 84% 95%, transparent 96%)`,
  }
}

function sameShape(a: Drawing, b: Drawing): boolean {
  return a.from === b.from && a.to === b.to
}

/**
 * The Drawings after drawing `drawing`: drawing one that is there removes it,
 * drawing it with another brush recolours it, and anything else is added.
 */
export function toggleDrawing(drawings: readonly Drawing[], drawing: Drawing): Drawing[] {
  const existing = drawings.find((d) => sameShape(d, drawing))
  if (!existing) return [...drawings, drawing]
  if (existing.brush === drawing.brush) return drawings.filter((d) => d !== existing)
  return drawings.map((d) => (d === existing ? drawing : d))
}
