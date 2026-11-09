import { gameFromMoves, START_FEN, type Game } from '../chess/chess'

// The landing page's own game (not sample data, per web/AGENTS.md): a
// Tarrasch Defense in which Black takes on an isolated queen's pawn. The
// hero shows it at 10.Nxd4, the knight landing in front of the pawn.
export const heroMoves = [
  'd4', 'd5', 'c4', 'e6', 'Nc3', 'c5', 'cxd5', 'exd5', 'Nf3', 'Nc6',
  'g3', 'Nf6', 'Bg2', 'Be7', 'O-O', 'O-O', 'Bg5', 'cxd4', 'Nxd4',
] as const

export const heroPly: number = heroMoves.length

export const heroGame: Game = (() => {
  const game = gameFromMoves(START_FEN, heroMoves)
  if (!game.ok) throw new Error(`The landing page's game does not play: ${game.error}`)
  return game.value
})()
