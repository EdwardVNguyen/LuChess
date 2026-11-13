import type { ResetCounts } from '../api'
import { START_FEN } from '../chess/chess'
import type { Writing } from '../chess/pgn'
import type { MoveId, MoveTree } from '../chess/tree'
import { writingUnder } from './writing'

// Edit position (#108, docs/adr/0010): a Note's new Position resets it, so
// Save asks first whenever the Note has Moves or writing to lose.

/** The board Edit position opens on, every time: no pieces, White to move. */
export const EMPTY_BOARD_FEN = '8/8/8/8/8/8/8/8 w - - 0 1'

/** The Note's Position as the API takes it: null for the standard start. */
export function startFenFor(fen: string): string | null {
  return fen === START_FEN ? null : fen
}

/** What resetting a tree kept in the browser would delete, counted as the API counts it. */
export function resetCounts(tree: MoveTree, writing: ReadonlyMap<MoveId, Writing>): ResetCounts {
  return { moves: tree.moves.size - 1, ...writingUnder(tree, writing, tree.root) }
}

/**
 * What a reset deletes, for the confirmation: "This deletes its 14 Moves and
 * all its writing." Null when the Note has nothing to lose, so Save needs no
 * confirmation.
 */
export function resetLoss({ moves, ...writing }: ResetCounts): string | null {
  const written = Object.values(writing).some((n) => n > 0)
  const deleted = [moves > 0 && `its ${moves} ${moves === 1 ? 'Move' : 'Moves'}`, written && 'all its writing'].filter(
    Boolean,
  )
  return deleted.length === 0 ? null : `This deletes ${deleted.join(' and ')}.`
}
