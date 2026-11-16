import { Chess } from 'chess.js'
import type { Color, Game, Ply, Result } from './chess.ts'

// A Note's Moves as a tree (ADR 0009): each Move follows the Position or
// another Move, and a Move can be followed by several. The first child
// continues the line, so the Main line follows first children from the
// Position, and any later child starts a Variation. Pure functions on an
// immutable tree; chess.js checks every Move (ADR 0006).

export type MoveId = number

export type TreeMove = {
  id: MoveId
  /** Null at the root, the Position. */
  parent: MoveId | null
  /** Null at the root. */
  san: string | null
  /** In order: the first continues the line, the rest start Variations. */
  children: readonly MoveId[]
  /** How far the Move is from the Position (GLOSSARY.md); 0 at the root. */
  ply: number
  /** The full-move number the move belongs to, e.g. 10 for 10…exd5. */
  moveNumber: number
  /** Who made the move; at the root, who is to move. */
  color: Color
  from: string | null
  to: string | null
  /** The position after the move. */
  fen: string
}

export type MoveTree = {
  startFen: string
  root: MoveId
  moves: ReadonlyMap<MoveId, TreeMove>
}

/** A tree of the Position alone. */
export function newTree(startFen: string, root: MoveId): MoveTree {
  const [, turn, , , , fullMove] = startFen.split(' ')
  const move: TreeMove = {
    id: root,
    parent: null,
    san: null,
    children: [],
    ply: 0,
    moveNumber: Number(fullMove) || 1,
    color: turn === 'b' ? 'b' : 'w',
    from: null,
    to: null,
    fen: startFen,
  }
  return { startFen, root, moves: new Map([[root, move]]) }
}

export function moveOf(tree: MoveTree, id: MoveId): TreeMove {
  const move = tree.moves.get(id)
  if (!move) throw new Error(`No move ${id} in this tree`)
  return move
}

/** The Move played as `san` after `parent`, checked and named by chess.js, or why it can't be played. */
function play(parent: TreeMove, san: string, id: MoveId): Result<TreeMove> {
  const chess = new Chess(parent.fen)
  let move
  try {
    move = chess.move(san)
  } catch {
    return { ok: false, error: `“${san}” is not a legal move here.` }
  }
  return {
    ok: true,
    value: {
      id,
      parent: parent.id,
      san: move.san,
      children: [],
      ply: parent.ply + 1,
      moveNumber: Number(move.before.split(' ')[5]) || 1,
      color: move.color,
      from: move.from,
      to: move.to,
      fen: move.after,
    },
  }
}

/**
 * Plays `san` after `parent` as the parent's last child, with the given id.
 * If the parent already has a child with that SAN, that Move is answered and
 * the tree is unchanged, as the API does (ADR 0009).
 */
export function addMove(tree: MoveTree, parent: MoveId, san: string, id: MoveId): Result<{ tree: MoveTree; id: MoveId }> {
  const placed = placeMove(tree, parent, san, id)
  if (!placed.ok) return placed
  if (placed.value.changed.length === 0) return { ok: true, value: { tree, id: placed.value.id } }
  const moves = new Map(tree.moves)
  for (const move of placed.value.changed) moves.set(move.id, move)
  return { ok: true, value: { tree: { ...tree, moves }, id: placed.value.id } }
}

/**
 * A tree to add many Moves to, as when reading a whole Note. `add` is addMove
 * changing this tree in place: addMove copies the tree for every Move, so
 * reading a Note's 5,000 Moves with it takes time growing with their square.
 * The tree is the caller's alone until every Move is added.
 */
export function growingTree(
  startFen: string,
  root: MoveId,
): { tree: MoveTree; add: (parent: MoveId, san: string, id: MoveId) => Result<MoveId> } {
  const moves = new Map(newTree(startFen, root).moves)
  const tree: MoveTree = { startFen, root, moves }
  return {
    tree,
    add(parent, san, id) {
      const placed = placeMove(tree, parent, san, id)
      if (!placed.ok) return placed
      for (const move of placed.value.changed) moves.set(move.id, move)
      return { ok: true, value: placed.value.id }
    },
  }
}

// The Move addMove answers, and the Moves it changes: the parent with its new
// child and the new Move, or none when the parent already has that Move.
function placeMove(tree: MoveTree, parent: MoveId, san: string, id: MoveId): Result<{ id: MoveId; changed: TreeMove[] }> {
  const from = moveOf(tree, parent)
  const played = play(from, san, id)
  if (!played.ok) return played
  const existing = from.children.find((child) => moveOf(tree, child).san === played.value.san)
  if (existing !== undefined) return { ok: true, value: { id: existing, changed: [] } }
  if (tree.moves.has(id)) throw new Error(`Move ${id} is already in this tree`)
  return { ok: true, value: { id, changed: [{ ...from, children: [...from.children, id] }, played.value] } }
}

/**
 * A tree from rows listing the root first and every Move after its parent,
 * siblings in order, as the API lists them. Fails on a Move chess.js finds illegal.
 */
export function treeFromRows(
  startFen: string,
  rows: readonly { id: MoveId; parentId: MoveId | null; san: string | null }[],
): Result<MoveTree> {
  const [root, ...rest] = rows
  if (!root || root.parentId !== null) return { ok: false, error: 'The moves have no starting position.' }
  const { tree, add } = growingTree(startFen, root.id)
  for (const row of rest) {
    if (row.parentId === null || row.san === null || !tree.moves.has(row.parentId)) {
      return { ok: false, error: 'The moves could not be read.' }
    }
    const added = add(row.parentId, row.san, row.id)
    if (!added.ok) return added
  }
  return { ok: true, value: tree }
}

/** The ids in a Move's subtree, the Move first. */
export function subtree(tree: MoveTree, id: MoveId): MoveId[] {
  const ids: MoveId[] = []
  const stack = [id]
  while (stack.length > 0) {
    const next = stack.pop() as MoveId
    ids.push(next)
    stack.push(...[...moveOf(tree, next).children].reverse())
  }
  return ids
}

/** Removes a Move and its whole subtree. The root cannot be deleted. */
export function deleteSubtree(tree: MoveTree, id: MoveId): MoveTree {
  const move = moveOf(tree, id)
  if (move.parent === null) throw new Error('The Position cannot be deleted')
  const moves = new Map(tree.moves)
  for (const gone of subtree(tree, id)) moves.delete(gone)
  const parent = moveOf(tree, move.parent)
  moves.set(parent.id, { ...parent, children: parent.children.filter((child) => child !== id) })
  return { ...tree, moves }
}

/**
 * Puts a Move on the Main line: it and every one of its ancestors becomes its
 * parent's first child, so the old continuations become Variations.
 */
export function promote(tree: MoveTree, id: MoveId): MoveTree {
  const moves = new Map(tree.moves)
  let at = moveOf(tree, id)
  while (at.parent !== null) {
    const parent = moveOf(tree, at.parent)
    const others = parent.children.filter((child) => child !== at.id)
    moves.set(parent.id, { ...parent, children: [at.id, ...others] })
    at = parent
  }
  return { ...tree, moves }
}

/** The Moves from the root to `id`, both included. */
export function pathTo(tree: MoveTree, id: MoveId): TreeMove[] {
  const path: TreeMove[] = []
  for (let at: TreeMove | undefined = moveOf(tree, id); at; at = at.parent === null ? undefined : moveOf(tree, at.parent)) {
    path.push(at)
  }
  return path.reverse()
}

/** The line through a Move: from the root to it, then on through first children. */
export function lineThrough(tree: MoveTree, id: MoveId): TreeMove[] {
  const line = pathTo(tree, id)
  for (let next = line[line.length - 1].children[0]; next !== undefined; next = moveOf(tree, next).children[0]) {
    line.push(moveOf(tree, next))
  }
  return line
}

/** The Main line, from the root through first children. */
export function mainLine(tree: MoveTree): TreeMove[] {
  return lineThrough(tree, tree.root)
}

/** Whether a Move is on the Main line. */
export function onMainLine(tree: MoveTree, id: MoveId): boolean {
  return pathTo(tree, id).every((move) => move.parent === null || moveOf(tree, move.parent).children[0] === move.id)
}

/** A line of the tree as a Game, for the Board: plies[n] is the Move at ply n, and each Ply carries its Move's id. */
export function lineAsGame(line: readonly TreeMove[], tags: Record<string, string> = {}): Game {
  const plies: Ply[] = line.map((move) => ({
    index: move.ply,
    id: move.id,
    san: move.san,
    moveNumber: move.moveNumber,
    color: move.color,
    from: move.from,
    to: move.to,
    fen: move.fen,
  }))
  return { startFen: line[0].fen, plies, tags }
}

/** The number of Moves in the tree, not counting the root. */
export function moveCount(tree: MoveTree): number {
  return tree.moves.size - 1
}

/** An id not yet in the tree, for Moves made in the browser. */
export function nextId(tree: MoveTree): MoveId {
  let max = 0
  for (const id of tree.moves.keys()) max = Math.max(max, id)
  return max + 1
}

/**
 * Every Move in reading order, the root first, as the move list shows them:
 * each Move, then the Variations that replace it, then the line goes on.
 */
export function readingOrder(tree: MoveTree): MoveId[] {
  const order: MoveId[] = [tree.root]
  function line(from: TreeMove) {
    for (let at = from; at.children.length > 0; ) {
      const [main, ...variations] = at.children.map((id) => moveOf(tree, id))
      order.push(main.id)
      for (const variation of variations) {
        order.push(variation.id)
        line(variation)
      }
      at = main
    }
  }
  line(moveOf(tree, tree.root))
  return order
}
