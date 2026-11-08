import type { PieceCode } from '../chess/chess'

// The design draws pieces as Noto Sans Symbols 2 glyphs (design/screens/
// Note.dc.html): always the filled glyph, dark or light, with an ink outline
// on white pieces. An SVG keeps the glyph scaled to the square at any board
// size, including the copy that follows the pointer while dragging.
const GLYPHS: Record<PieceCode[1], string> = {
  K: '\u265A',
  Q: '\u265B',
  R: '\u265C',
  B: '\u265D',
  N: '\u265E',
  P: '\u265F',
}

// U+FE0E asks for the text glyph, never an emoji.
const TEXT_PRESENTATION = '\uFE0E'

export function PieceGlyph({ piece }: { piece: PieceCode }) {
  const white = piece[0] === 'w'
  return (
    <svg viewBox="0 0 45 45" width="100%" height="100%" aria-hidden="true" style={{ display: 'block' }}>
      <text
        x="22.5"
        y="23.5"
        textAnchor="middle"
        dominantBaseline="central"
        fontSize="34"
        strokeWidth={white ? 1.2 : 0}
        // CSS variables only resolve in style, not in SVG attributes.
        style={{
          fontFamily: 'var(--cn-font-symbols)',
          fill: white ? 'var(--cn-piece-light)' : 'var(--cn-piece-dark)',
          stroke: white ? 'var(--cn-ink)' : 'none',
        }}
      >
        {GLYPHS[piece[1] as PieceCode[1]] + TEXT_PRESENTATION}
      </text>
    </svg>
  )
}
