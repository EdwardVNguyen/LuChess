import { Chess, DEFAULT_POSITION, validateFen as chessJsValidateFen } from 'chess.js'

// The pure chess module: reading PGN, listing the main line's Plies, and the
// position (FEN) at any Ply. No React here; the Board and the Note screen
// build on it. chess.js does the rules (docs/adr/0006).

export const START_FEN = DEFAULT_POSITION

export type Color = 'w' | 'b'

export type Ply = {
  /** 0 is the Position; 1 is White's first move (GLOSSARY.md). */
  index: number
  /** The move that reached this Ply, or null at ply 0. */
  san: string | null
  /** The full-move number the move belongs to, e.g. 10 for 10…exd5. */
  moveNumber: number
  /** Who made the move; at ply 0, who is to move. */
  color: Color
  from: string | null
  to: string | null
  /** The position after this Ply. */
  fen: string
}

export type Game = {
  /** The Position, at ply 0. */
  startFen: string
  /** `plies[0]` is the Position, `plies[n]` is the position after ply n. */
  plies: Ply[]
  /** The PGN's tag pairs (Event, Site, Opening, …), without unknown "?" values. */
  tags: Record<string, string>
}

type Move = { san: string; color: Color; from: string; to: string; before: string; after: string }

export type Result<T> = { ok: true; value: T } | { ok: false; error: string }

export function parsePgn(pgn: string): Result<Game> {
  if (pgn.trim() === '') return { ok: false, error: 'The PGN is empty.' }

  const chess = new Chess()
  try {
    chess.loadPgn(pgn)
  } catch (error) {
    return { ok: false, error: describePgnError(error) }
  }

  const headers = chess.getHeaders()
  const startFen = headers.FEN ?? START_FEN
  return { ok: true, value: buildGame(startFen, chess.history({ verbose: true }), knownTags(headers)) }
}

/** A Game from a Position and the SAN of each move after it, e.g. moves made in play mode. */
export function gameFromMoves(startFen: string, sans: readonly string[]): Result<Game> {
  let chess: Chess
  try {
    chess = new Chess(startFen)
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'The position is not valid.' }
  }
  for (const san of sans) {
    try {
      chess.move(san)
    } catch {
      return { ok: false, error: `“${san}” is not a legal move here.` }
    }
  }
  return { ok: true, value: buildGame(startFen, chess.history({ verbose: true })) }
}

/** The PGN for a Position and the SAN of each move after it, with the FEN tag when it is not the standard start. */
export function pgnFromMoves(startFen: string, sans: readonly string[]): Result<string> {
  const game = gameFromMoves(startFen, sans)
  if (!game.ok) return game
  const chess = new Chess(startFen)
  for (const san of sans) chess.move(san)
  return { ok: true, value: chess.pgn() }
}

/** A change to a Note's moves: its new PGN and the first Ply that differs (ADR 0003). */
export type MovesEdit = { pgn: string; firstChangedPly: number }

/** The first Ply at which two move lists differ, or null when they are the same. */
export function firstChangedPly(before: readonly string[], after: readonly string[]): number | null {
  const length = Math.max(before.length, after.length)
  for (let i = 0; i < length; i += 1) {
    if (before[i] !== after[i]) return i + 1
  }
  return null
}

/**
 * Replaces a PGN's main line with `sans`, keeping its tags and any PGN
 * comments on the moves that stay. Side-lines are dropped: writing lives on
 * the main line only. Null when the moves are unchanged.
 */
export function editMoves(pgn: string, sans: readonly string[]): Result<MovesEdit | null> {
  const chess = new Chess()
  try {
    chess.loadPgn(pgn)
  } catch (error) {
    return { ok: false, error: describePgnError(error) }
  }
  const first = firstChangedPly(chess.history(), sans)
  if (first === null) return { ok: true, value: null }
  while (chess.history().length >= first) chess.undo()
  for (const san of sans.slice(first - 1)) {
    try {
      chess.move(san)
    } catch {
      return { ok: false, error: `“${san}” is not a legal move here.` }
    }
  }
  return { ok: true, value: { pgn: chess.pgn(), firstChangedPly: first } }
}

/** The SAN of each move in a Game's main line, after the Position. */
export function sansOf(game: Game): string[] {
  return game.plies.slice(1).map((ply) => ply.san ?? '')
}

function isUnknownTag(value: string | null | undefined): boolean {
  return !value || /^[?.*\s]*$/.test(value)
}

function knownTags(headers: Record<string, string | null | undefined>): Record<string, string> {
  const tags: Record<string, string> = {}
  for (const [tag, value] of Object.entries(headers)) {
    if (value && !isUnknownTag(value)) tags[tag] = value
  }
  return tags
}

function buildGame(startFen: string, moves: readonly Move[], tags: Record<string, string> = {}): Game {
  const [, turn, , , , fullMove] = startFen.split(' ')
  const plies: Ply[] = [
    {
      index: 0,
      san: null,
      moveNumber: Number(fullMove) || 1,
      color: turn === 'b' ? 'b' : 'w',
      from: null,
      to: null,
      fen: startFen,
    },
  ]
  for (const move of moves) {
    plies.push({
      index: plies.length,
      san: move.san,
      moveNumber: Number(move.before.split(' ')[5]) || 1,
      color: move.color,
      from: move.from,
      to: move.to,
      fen: move.after,
    })
  }
  return { startFen, plies, tags }
}

function describePgnError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  const illegal = /^Invalid move in PGN: (.+)$/.exec(message)
  if (illegal) return `“${illegal[1]}” is not a legal move in this game.`
  const unexpected = /but (.+) found\.?$/.exec(message)
  if (unexpected) {
    const found = unexpected[1] === 'end of input' ? 'the end of the text' : unexpected[1].replace(/^"(.*)"$/, '“$1”')
    return `The PGN could not be read: unexpected ${found}.`
  }
  return `The PGN could not be read: ${message}`
}

/** The position (FEN) at a Ply, clamped to the game. */
export function fenAt(game: Game, ply: number): string {
  return game.plies[clampPly(game, ply)].fen
}

export function clampPly(game: Game, ply: number): number {
  return Math.min(Math.max(ply, 0), game.plies.length - 1)
}

/** "10.Nxd5" or "10…exd5". Null at ply 0. */
export function plyLabel(ply: Ply): string | null {
  if (ply.san === null) return null
  return ply.color === 'w' ? `${ply.moveNumber}.${ply.san}` : `${ply.moveNumber}…${ply.san}`
}

export type LegalMove = { san: string; from: string; to: string; fen: string }

/** The pieces a pawn can promote to. */
export type Promotion = 'q' | 'r' | 'b' | 'n'

export const PROMOTIONS: readonly Promotion[] = ['q', 'r', 'b', 'n']

/** Plays from → to if it is legal, promoting a pawn to `promotion` (a queen by default), or returns null. */
export function tryMove(fen: string, from: string, to: string, promotion: Promotion = 'q'): LegalMove | null {
  const chess = new Chess(fen)
  try {
    const move = chess.move({ from, to, promotion })
    return { san: move.san, from: move.from, to: move.to, fen: move.after }
  } catch {
    return null
  }
}

/** Whether from → to is a legal pawn move to the last rank, which needs a piece to promote to. */
export function isPromotion(fen: string, from: string, to: string): boolean {
  const chess = new Chess(fen)
  return chess.moves({ square: from as never, verbose: true }).some((move) => move.to === to && move.isPromotion())
}

/** The squares the piece on `from` can legally move to. */
export function legalTargets(fen: string, from: string): string[] {
  const chess = new Chess(fen)
  return chess.moves({ square: from as never, verbose: true }).map((move) => move.to)
}

/** The square of the king of the side to move when it is in check, otherwise null. */
export function checkedKing(fen: string): string | null {
  const chess = new Chess(fen)
  if (!chess.inCheck()) return null
  return chess.findPiece({ type: 'k', color: chess.turn() })[0] ?? null
}

export function validateFen(fen: string): Result<string> {
  const result = chessJsValidateFen(fen)
  return result.ok ? { ok: true, value: fen } : { ok: false, error: result.error ?? 'The position is not valid.' }
}

// Set-up mode: a position is a map from square ("e4") to piece code ("wK").

export type PieceCode = `${Color}${'K' | 'Q' | 'R' | 'B' | 'N' | 'P'}`
export type Placement = Partial<Record<string, PieceCode>>

const FILES = 'abcdefgh'

export function placementFromFen(fen: string): Placement {
  const placement: Placement = {}
  const rows = fen.split(' ')[0].split('/')
  rows.forEach((row, rowIndex) => {
    let file = 0
    for (const char of row) {
      if (/\d/.test(char)) {
        file += Number(char)
        continue
      }
      const color = char === char.toUpperCase() ? 'w' : 'b'
      placement[`${FILES[file]}${8 - rowIndex}`] = `${color}${char.toUpperCase()}` as PieceCode
      file += 1
    }
  })
  return placement
}

/**
 * The FEN for a set-up position. Castling rights are given wherever the king
 * and rook still stand on their home squares; there is no en passant square.
 */
export function fenFromPlacement(placement: Placement, turn: Color): string {
  const rows: string[] = []
  for (let rank = 8; rank >= 1; rank -= 1) {
    let row = ''
    let empty = 0
    for (const file of FILES) {
      const piece = placement[`${file}${rank}`]
      if (!piece) {
        empty += 1
        continue
      }
      if (empty) row += empty
      empty = 0
      row += piece[0] === 'w' ? piece[1] : piece[1].toLowerCase()
    }
    if (empty) row += empty
    rows.push(row)
  }

  const castling =
    [
      placement.e1 === 'wK' && placement.h1 === 'wR' ? 'K' : '',
      placement.e1 === 'wK' && placement.a1 === 'wR' ? 'Q' : '',
      placement.e8 === 'bK' && placement.h8 === 'bR' ? 'k' : '',
      placement.e8 === 'bK' && placement.a8 === 'bR' ? 'q' : '',
    ].join('') || '-'

  return `${rows.join('/')} ${turn} ${castling} - 0 1`
}
