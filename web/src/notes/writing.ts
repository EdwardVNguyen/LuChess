import type { PlyWriting, PlyWritingInput } from '../api'

/** One change to a Ply's writing: a Comment, a Body or a Glyph, leaving the rest as it was. */
export type PlyChange = { ply: number } & Partial<PlyWritingInput>

const empty: PlyWritingInput = { comment: null, body: null, moveGlyph: null, positionGlyph: null }

/** The whole writing on a Ply after applying `change` to what is already there. */
export function mergeWriting(saved: PlyWritingInput | undefined, change: Partial<PlyWritingInput>): PlyWritingInput {
  return {
    comment: saved?.comment ?? empty.comment,
    body: saved?.body ?? empty.body,
    moveGlyph: saved?.moveGlyph ?? empty.moveGlyph,
    positionGlyph: saved?.positionGlyph ?? empty.positionGlyph,
    ...change,
  }
}

export function hasWriting(writing: PlyWritingInput): boolean {
  return Boolean(writing.comment || writing.body || writing.moveGlyph || writing.positionGlyph)
}

/** The list of written Plies with `written` in place of its Ply's entry, dropped when it is now empty. */
export function replaceWriting(plies: readonly PlyWriting[] | undefined, written: PlyWriting): PlyWriting[] {
  const others = (plies ?? []).filter((p) => p.ply !== written.ply)
  return hasWriting(written) ? [...others, written].sort((a, b) => a.ply - b.ply) : others
}
