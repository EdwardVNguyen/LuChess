import { describe, expect, it } from 'vitest'
import {
  fenAt,
  fenFromPlacement,
  gameFromMoves,
  isPromotion,
  legalTargets,
  parsePgn,
  pgnFromMoves,
  placementFromFen,
  plyLabel,
  START_FEN,
  tryMove,
  validateFen,
  type Game,
} from './chess'
import { fischerSpassky1972Game6 } from './fixtures'

function parsed(pgn: string): Game {
  const result = parsePgn(pgn)
  if (!result.ok) throw new Error(result.error)
  return result.value
}

describe('parsePgn', () => {
  const game = parsed(fischerSpassky1972Game6)

  it('makes ply 0 the Position', () => {
    expect(game.plies[0]).toMatchObject({ index: 0, san: null, color: 'w', fen: START_FEN })
    expect(game.startFen).toBe(START_FEN)
    expect(plyLabel(game.plies[0])).toBeNull()
  })

  it('numbers the main-line Plies, with ply 20 being 10…exd5', () => {
    expect(game.plies).toHaveLength(82)
    expect(game.plies[1]).toMatchObject({ san: 'c4', moveNumber: 1, color: 'w' })
    expect(game.plies[20]).toMatchObject({ index: 20, san: 'exd5', moveNumber: 10, color: 'b', from: 'e6', to: 'd5' })
    expect(plyLabel(game.plies[20])).toBe('10…exd5')
    expect(plyLabel(game.plies[19])).toBe('10.Nxd5')
  })

  it('gives the position at any Ply', () => {
    expect(fenAt(game, 20)).toBe('rnb2rk1/p1p1qpp1/1p5p/3p4/3P4/4PN2/PP3PPP/R2QKB1R w KQ - 0 11')
    expect(fenAt(game, -5)).toBe(START_FEN)
    expect(fenAt(game, 999)).toBe(game.plies[81].fen)
  })

  it('reads a PGN that starts from a set-up Position', () => {
    const fen = '4k3/8/8/8/8/8/8/4K2R b K - 0 30'
    const setUp = parsed(`[SetUp "1"]\n[FEN "${fen}"]\n\n30... Kd7 31. Rh7+ *`)
    expect(setUp.plies[0]).toMatchObject({ fen, color: 'b', moveNumber: 30 })
    expect(plyLabel(setUp.plies[1])).toBe('30…Kd7')
    expect(plyLabel(setUp.plies[2])).toBe('31.Rh7+')
  })

  it('gives a clear error for an illegal move', () => {
    expect(parsePgn('1. e4 e5 2. Ke3 *')).toEqual({ ok: false, error: '“Ke3” is not a legal move in this game.' })
  })

  it('gives a clear error for text that is not PGN', () => {
    expect(parsePgn('1. e4 e5 2. Qh9')).toEqual({ ok: false, error: 'The PGN could not be read: unexpected “9”.' })
    expect(parsePgn('   ')).toEqual({ ok: false, error: 'The PGN is empty.' })
  })
})

describe('gameFromMoves', () => {
  it('builds a Game from moves played', () => {
    const result = gameFromMoves(START_FEN, ['e4', 'c5'])
    expect(result.ok && result.value.plies.map(plyLabel)).toEqual([null, '1.e4', '1…c5'])
  })

  it('rejects an illegal move', () => {
    expect(gameFromMoves(START_FEN, ['e5'])).toEqual({ ok: false, error: '“e5” is not a legal move here.' })
  })
})

describe('play', () => {
  it('only allows legal moves', () => {
    expect(tryMove(START_FEN, 'e2', 'e4')).toMatchObject({ san: 'e4' })
    expect(tryMove(START_FEN, 'e2', 'e5')).toBeNull()
    expect(tryMove(START_FEN, 'e7', 'e5')).toBeNull()
    expect(legalTargets(START_FEN, 'g1').sort()).toEqual(['f3', 'h3'])
  })

  it('promotes to a queen', () => {
    expect(tryMove('7k/P7/8/8/8/8/8/K7 w - - 0 1', 'a7', 'a8')).toMatchObject({ san: 'a8=Q+' })
  })

  it('underpromotes', () => {
    const fen = '7k/P7/8/8/8/8/8/K7 w - - 0 1'
    expect(tryMove(fen, 'a7', 'a8', 'n')).toMatchObject({ san: 'a8=N', to: 'a8' })
    expect(tryMove(fen, 'a7', 'a8', 'r')).toMatchObject({ san: 'a8=R+' })
    expect(tryMove(fen, 'a7', 'a8', 'b')).toMatchObject({ san: 'a8=B' })
    expect(tryMove('k7/8/8/8/8/8/p7/7K b - - 0 1', 'a2', 'a1', 'n')?.fen).toMatch(/^k7\/8\/8\/8\/8\/8\/8\/n6K w/)
  })

  it('knows which moves are promotions', () => {
    const fen = '1n5k/P7/8/8/8/8/4P3/K7 w - - 0 1'
    expect(isPromotion(fen, 'a7', 'a8')).toBe(true)
    expect(isPromotion(fen, 'a7', 'b8')).toBe(true)
    expect(isPromotion(fen, 'a7', 'a6')).toBe(false)
    expect(isPromotion(fen, 'e2', 'e4')).toBe(false)
    expect(isPromotion('n6k/P7/8/8/8/8/8/K7 w - - 0 1', 'a7', 'a8')).toBe(false)
  })
})

describe('set-up FEN', () => {
  it('round-trips the start position', () => {
    expect(fenFromPlacement(placementFromFen(START_FEN), 'w')).toBe(START_FEN)
  })

  it('gives castling rights only where the king and rook are home, and the side to move', () => {
    const placement = placementFromFen(START_FEN)
    delete placement.h1
    delete placement.a8
    const fen = fenFromPlacement(placement, 'b')
    expect(fen).toBe('1nbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBN1 b Qk - 0 1')
    expect(validateFen(fen).ok).toBe(true)
  })

  it('reports why a set-up position is not valid', () => {
    expect(validateFen(fenFromPlacement({ e1: 'wK' }, 'w'))).toEqual({
      ok: false,
      error: 'Invalid FEN: missing black king',
    })
  })
})

describe('tags', () => {
  it('keeps the PGN tags, dropping unknown "?" values', () => {
    const game = parsed('[Event "Club night"]\n[Site "?"]\n[Date "????.??.??"]\n[Opening "Italian Game"]\n\n1. e4 e5 *')
    expect(game.tags).toEqual({ Event: 'Club night', Opening: 'Italian Game' })
  })
})

describe('pgnFromMoves', () => {
  it('writes moves played from the start so they read back as the same game', () => {
    const pgn = pgnFromMoves(START_FEN, ['e4', 'e5', 'Nf3'])
    if (!pgn.ok) throw new Error(pgn.error)
    expect(parsed(pgn.value).plies.map((ply) => ply.san)).toEqual([null, 'e4', 'e5', 'Nf3'])
  })

  it('writes a Position with no moves, keeping its FEN', () => {
    const fen = '4k3/8/8/8/8/8/4P3/4K3 w - - 0 1'
    const pgn = pgnFromMoves(fen, [])
    if (!pgn.ok) throw new Error(pgn.error)
    const game = parsed(pgn.value)
    expect(game.startFen).toBe(fen)
    expect(game.plies).toHaveLength(1)
    expect(game.tags).toEqual({ SetUp: '1', FEN: fen })
  })

  it('refuses an illegal move', () => {
    expect(pgnFromMoves(START_FEN, ['e5']).ok).toBe(false)
  })
})
