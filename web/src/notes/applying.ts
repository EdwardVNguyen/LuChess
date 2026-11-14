import type { KeepWriting, ResetTree, TreeInput, TreeLoss } from '../api'
import { validateFen, type Result } from '../chess/chess'
import { hasWriting, NO_WRITING, type Drawing, type ImportedNote, type PgnImport, type Writing } from '../chess/pgn'
import { moveOf, nextId, type MoveId, type MoveTree, type TreeMove } from '../chess/tree'
import { linkTargets } from './links'
import { listedMoves } from './newNote'
import { startFenFor } from './positionSetup'
import { writingUnder } from './writing'

// Applying the FEN or PGN typed under the board to the Note (#109, ADR 0010).
//
// A FEN always sets the Note's Position, which resets it. So does a PGN with a
// different Position; one with the same Position is matched to the Note
// instead: each of its Moves is the stored Move with the same line of SANs
// from the Position, as the API keeps one child per SAN under a parent.
// Matched Moves stay, new ones are added, stored ones the PGN no longer has
// are deleted with their subtrees, and siblings take the PGN's order. The PGN
// shows a Link as plain text, so a matched Move keeps its stored Comment or
// Body, Links and all, when the PGN shows it as the export wrote it.

/** What applying a PGN does to the Note. */
export type PgnPlan =
  /** A different Position: the Note is reset and the PGN imported, as at creation. */
  | { kind: 'reset'; startFen: string | null; note: ImportedNote }
  /** The same Position: the PGN's tree matched to the Note's. */
  | {
      kind: 'match'
      note: ImportedNote
      /** For each Move of the PGN (and its root), whether its Comment and Body read as the export wrote them. */
      keep: ReadonlyMap<MoveId, KeepWriting>
    }

/**
 * What applying `edited` would do to a Note whose tree is `tree`. `original`
 * is the PGN the box showed when Edit was pressed, as the export wrote it, so
 * writing the PGN still shows unchanged is kept as stored. Fails with why
 * the PGN can't be read. Null when the PGN was not changed.
 */
export function planPgn(tree: MoveTree, edited: string, original: string, read: PgnImport): Result<PgnPlan | null> {
  if (edited.trim() === original.trim()) return { ok: true, value: null }
  const parsed = read(edited)
  if (!parsed.ok) return parsed
  const note = parsed.value
  if (note.startFen !== tree.startFen) return { ok: true, value: { kind: 'reset', startFen: startFenFor(note.startFen), note } }

  const exported = read(original)
  const keep = new Map<MoveId, KeepWriting>()
  if (exported.ok) {
    for (const [id, was] of matchBySan(note.tree, exported.value.tree)) {
      const now = note.writing.get(id) ?? NO_WRITING
      const then = exported.value.writing.get(was) ?? NO_WRITING
      keep.set(id, { keepComment: now.comment === then.comment, keepBody: now.body === then.body })
    }
  }
  return { ok: true, value: { kind: 'match', note, keep } }
}

/**
 * The Moves of `from` that are also in `to`, by the same line of SANs from
 * the Position, mapped to their ids there; the roots always match.
 */
export function matchBySan(from: MoveTree, to: MoveTree): Map<MoveId, MoveId> {
  const matched = new Map<MoveId, MoveId>([[from.root, to.root]])
  const stack: [TreeMove, TreeMove][] = [[moveOf(from, from.root), moveOf(to, to.root)]]
  while (stack.length > 0) {
    const [a, b] = stack.pop() as [TreeMove, TreeMove]
    for (const child of a.children) {
      const move = moveOf(from, child)
      const same = b.children.find((other) => moveOf(to, other).san === move.san)
      if (same === undefined) continue
      matched.set(child, same)
      stack.push([move, moveOf(to, same)])
    }
  }
  return matched
}

const noKeep: KeepWriting = { keepComment: false, keepBody: false }

/** The API's input for a matched PGN. */
export function treeInput({ note, keep }: Extract<PgnPlan, { kind: 'match' }>): TreeInput {
  const { tree, writing, tags } = note
  return {
    tags,
    position: { ...writing.get(tree.root), ...(keep.get(tree.root) ?? noKeep) },
    moves: listedMoves(tree, writing).map(({ id, move }) => ({ ...move, ...(keep.get(id) ?? noKeep) })),
  }
}

/** The API's input for a PGN with a new Position: its tree imported in the reset. */
export function resetTree(note: ImportedNote): ResetTree {
  return {
    tags: note.tags,
    position: note.writing.get(note.tree.root) ?? {},
    moves: listedMoves(note.tree, note.writing).map(({ move }) => move),
  }
}

/**
 * A matched PGN applied to a tree kept in the browser, as the API applies it
 * to a saved Note: the new tree, where matched Moves keep their ids, the
 * writing on it, and what the apply deletes or replaces.
 */
export function applyInBrowser(
  tree: MoveTree,
  writing: ReadonlyMap<MoveId, Writing>,
  plan: Extract<PgnPlan, { kind: 'match' }>,
): { tree: MoveTree; writing: Map<MoveId, Writing>; loss: TreeLoss } {
  const { note, keep } = plan
  const matched = matchBySan(note.tree, tree)
  let fresh = nextId(tree)
  const idOf = new Map<MoveId, MoveId>()
  for (const id of note.tree.moves.keys()) idOf.set(id, matched.get(id) ?? fresh++)
  const to = (id: MoveId) => idOf.get(id) as MoveId

  const moves = new Map<MoveId, TreeMove>()
  const written = new Map<MoveId, Writing>()
  const loss: TreeLoss = { moves: 0, comments: 0, bodies: 0, glyphs: 0, drawings: 0, links: 0 }
  for (const move of note.tree.moves.values()) {
    const id = to(move.id)
    moves.set(id, { ...move, id, parent: move.parent === null ? null : to(move.parent), children: move.children.map(to) })
    const pgn = note.writing.get(move.id) ?? NO_WRITING
    const stored = matched.has(move.id) ? writing.get(id) : undefined
    const final = stored ? keptWriting(stored, pgn, keep.get(move.id) ?? noKeep) : pgn
    if (stored) countReplaced(loss, stored, final)
    if (hasWriting(final)) written.set(id, final)
  }

  // Every stored Move the PGN no longer has goes, with all its writing.
  const kept = new Set(matched.values())
  for (const move of tree.moves.values()) {
    if (kept.has(move.id) || move.parent === null || !kept.has(move.parent)) continue
    const gone = writingUnder(tree, writing, move.id)
    loss.moves += countMoves(tree, move.id)
    loss.comments += gone.comments
    loss.bodies += gone.bodies
    loss.glyphs += gone.glyphs
    loss.drawings += gone.drawings
  }
  return { tree: { startFen: tree.startFen, root: tree.root, moves }, writing: written, loss }
}

function countMoves(tree: MoveTree, id: MoveId): number {
  let n = 1
  for (const child of moveOf(tree, id).children) n += countMoves(tree, child)
  return n
}

// The writing a matched Move ends with: the PGN's, except the Comment or Body
// it shows unchanged, and the Drawings when it has the same ones, which stay
// as stored (the export writes circles first, whatever order they were drawn in).
function keptWriting(stored: Writing, pgn: Writing, { keepComment, keepBody }: KeepWriting): Writing {
  return {
    ...pgn,
    comment: keepComment ? stored.comment : pgn.comment,
    body: keepBody ? stored.body : pgn.body,
    drawings: sameDrawings(stored.drawings, pgn.drawings) ? stored.drawings : pgn.drawings,
  }
}

const sameDrawing = (a: Drawing) => (b: Drawing) => a.from === b.from && a.to === b.to && a.brush === b.brush

function sameDrawings(a: readonly Drawing[], b: readonly Drawing[]): boolean {
  return a.length === b.length && a.every((d) => b.some(sameDrawing(d)))
}

// What a matched Move's stored writing loses to its new writing, counted as
// the API counts it: each part that changes or goes, each Drawing not drawn
// again, and the Links in a Comment or Body replaced by other text.
function countReplaced(loss: TreeLoss, stored: Writing, final: Writing) {
  for (const [part, kind] of [
    ['comment', 'comments'],
    ['body', 'bodies'],
  ] as const) {
    const was = stored[part]
    const now = final[part]
    if (!was || was === now) continue
    loss[kind] += 1
    if (now) loss.links += linkTargets(was).filter((target) => !linkTargets(now).includes(target)).length
  }
  for (const glyph of ['moveGlyph', 'positionGlyph'] as const) {
    if (stored[glyph] && stored[glyph] !== final[glyph]) loss.glyphs += 1
  }
  loss.drawings += stored.drawings.filter((d) => !final.drawings.some(sameDrawing(d))).length
}

/**
 * What an apply deletes or replaces, for its confirmation: "This deletes 12
 * Moves and 2 Comments; 1 Link becomes plain text." Null when nothing goes,
 * so it applies without asking.
 */
export function describeLoss({ moves, comments, bodies, glyphs, drawings, links }: TreeLoss): string | null {
  const counted = (n: number, one: string, many: string) => (n > 0 ? [`${n} ${n === 1 ? one : many}`] : [])
  const deleted = [
    ...counted(moves, 'Move', 'Moves'),
    ...counted(comments, 'Comment', 'Comments'),
    ...counted(bodies, 'Body', 'Bodies'),
    ...counted(glyphs, 'Glyph', 'Glyphs'),
    ...counted(drawings, 'Drawing', 'Drawings'),
  ]
  const parts = [
    ...(deleted.length > 0 ? [`This deletes ${listed(deleted)}`] : []),
    ...(links > 0 ? [`${links} ${links === 1 ? 'Link becomes' : 'Links become'} plain text`] : []),
  ]
  return parts.length === 0 ? null : `${parts.join('; ')}.`
}

function listed(parts: readonly string[]): string {
  return parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}`
}

/**
 * The Position a FEN typed under the board gives the Note (null for the
 * standard start), or why it can't. Null when there is nothing to do: the
 * FEN shown at the Position, applied unchanged.
 */
export function planFen(
  typed: string,
  { tree, atPosition }: { tree: MoveTree; atPosition: boolean },
): Result<{ startFen: string | null } | null> {
  const fen = typed.trim().replace(/\s+/g, ' ')
  if (fen === '') return { ok: false, error: 'Type a position in FEN.' }
  if (atPosition && fen === tree.startFen) return { ok: true, value: null }
  const valid = validateFen(fen)
  return valid.ok ? { ok: true, value: { startFen: startFenFor(fen) } } : { ok: false, error: valid.error }
}

/** What became of an Apply: done, called off at its confirmation (the editor stays open), or why it failed. */
export type ApplyOutcome = 'applied' | 'cancelled' | { error: string }
