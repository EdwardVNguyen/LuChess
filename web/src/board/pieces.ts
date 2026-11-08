import { createElement } from 'react'
import type { PieceRenderObject } from 'react-chessboard'
import type { PieceCode } from '../chess/chess'
import { PieceGlyph } from './PieceGlyph'

const CODES: PieceCode[] = ['wK', 'wQ', 'wR', 'wB', 'wN', 'wP', 'bK', 'bQ', 'bR', 'bB', 'bN', 'bP']

export const ALL_PIECES = CODES

export const glyphPieces: PieceRenderObject = Object.fromEntries(
  CODES.map((code) => [code, () => createElement(PieceGlyph, { piece: code })]),
)

const NAMES: Record<PieceCode[1], string> = {
  K: 'king',
  Q: 'queen',
  R: 'rook',
  B: 'bishop',
  N: 'knight',
  P: 'pawn',
}

export function pieceName(piece: PieceCode): string {
  return `${piece[0] === 'w' ? 'White' : 'Black'} ${NAMES[piece[1] as PieceCode[1]]}`
}
