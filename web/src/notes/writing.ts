import type { MoveRow, WritingCounts } from '../api'
import { NO_WRITING, hasWriting, type Writing } from '../chess/pgn'
import { subtree, type MoveId, type MoveTree } from '../chess/tree'

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

// What Delete from here counts, kind by kind, as the API does (CountSubtreeWriting).
const countedWriting: { kind: keyof WritingCounts; count: (written: Writing) => number; one: string; many: string }[] = [
  { kind: 'comments', count: (w) => (w.comment ? 1 : 0), one: 'Comment', many: 'Comments' },
  { kind: 'bodies', count: (w) => (w.body ? 1 : 0), one: 'Body', many: 'Bodies' },
  { kind: 'glyphs', count: (w) => (w.moveGlyph ? 1 : 0) + (w.positionGlyph ? 1 : 0), one: 'Glyph', many: 'Glyphs' },
  { kind: 'drawings', count: (w) => w.drawings.length, one: 'Drawing', many: 'Drawings' },
]

/** The writing that deleting a Move and its whole subtree would delete, for a tree kept in the browser. */
export function writingUnder(tree: MoveTree, writing: ReadonlyMap<MoveId, Writing>, move: MoveId): WritingCounts {
  const counts: WritingCounts = { comments: 0, bodies: 0, glyphs: 0, drawings: 0 }
  for (const id of subtree(tree, move)) {
    const written = writing.get(id)
    if (written) for (const { kind, count } of countedWriting) counts[kind] += count(written)
  }
  return counts
}

/** "2 Comments, 1 Body and 3 Glyphs", leaving out what there is none of, as the API words it; "" for none. */
export function describeWriting(counts: WritingCounts): string {
  const parts = countedWriting
    .filter(({ kind }) => counts[kind] > 0)
    .map(({ kind, one, many }) => `${counts[kind]} ${counts[kind] === 1 ? one : many}`)
  return parts.length <= 1 ? (parts[0] ?? '') : `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}`
}
