import type { MoveRow } from '../api'
import { NO_WRITING, hasWriting, type Writing } from '../chess/pgn'
import type { MoveId } from '../chess/tree'

/** One change to a Move's writing: a Comment, a Body, a Glyph or the Drawings, leaving the rest as it was. */
export type WritingChange = { move: MoveId } & Partial<Writing>

/** The whole writing on a Move after applying `change` to what is already there. */
export function mergeWriting(saved: Writing | undefined, change: Partial<Writing>): Writing {
  return { ...NO_WRITING, ...saved, ...change }
}

/** The writing in a row of the tree, without the rest of the row. */
export function writingOf({ comment, body, moveGlyph, positionGlyph, drawings }: MoveRow): Writing {
  return { comment, body, moveGlyph, positionGlyph, drawings }
}

/** The writing on each row that has some, by Move. */
export function writingByMove(rows: readonly MoveRow[]): Map<MoveId, Writing> {
  const writing = new Map<MoveId, Writing>()
  for (const row of rows) {
    const written = writingOf(row)
    if (hasWriting(written)) writing.set(row.id, written)
  }
  return writing
}

/** `writing` with a Move's entry replaced, or dropped when it is now empty. */
export function withWriting(writing: ReadonlyMap<MoveId, Writing>, move: MoveId, written: Writing): Map<MoveId, Writing> {
  const next = new Map(writing)
  if (hasWriting(written)) next.set(move, written)
  else next.delete(move)
  return next
}
