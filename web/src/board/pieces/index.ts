import { createElement } from 'react'
import type { PieceRenderObject } from 'react-chessboard'
import type { PieceCode } from '../../chess/chess'
import { Piece } from '../Piece'

// The cburnett pieces by Colin M.L. Burnett, under the BSD 3-Clause option of
// their licence: see THIRD_PARTY_NOTICES.md at the repo root.
const URLS = import.meta.glob<string>('./*.svg', { eager: true, query: '?url', import: 'default' })

export function pieceUrl(piece: PieceCode): string {
  return URLS[`./${piece}.svg`]
}

const CODES: PieceCode[] = ['wK', 'wQ', 'wR', 'wB', 'wN', 'wP', 'bK', 'bQ', 'bR', 'bB', 'bN', 'bP']

export const ALL_PIECES = CODES

export const boardPieces: PieceRenderObject = Object.fromEntries(
  CODES.map((code) => [code, () => createElement(Piece, { piece: code })]),
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
