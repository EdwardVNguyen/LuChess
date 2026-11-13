import type { NewNoteInput } from '../api'
import { START_FEN } from '../chess/chess'
import type { TagPair, Writing } from '../chess/pgn'
import { moveOf, newTree, type MoveId, type MoveTree } from '../chess/tree'

/** The name a new Note starts with, until it is renamed. Names need not be unique, so it is not numbered. */
export const UNTITLED = 'Untitled'

/** A Note being started, before it is saved: its Position, tags, tree of Moves and their writing. */
export type NoteStart = {
  name: string
  /** Null for the standard start. */
  startFen: string | null
  tags: TagPair[]
  tree: MoveTree
  writing: ReadonlyMap<MoveId, Writing>
}

/** A new Note as New note makes it (#106): at the standard start, with no Moves or writing. */
export function blankNote(): NoteStart {
  return { name: UNTITLED, startFen: null, tags: [], tree: newTree(START_FEN, 0), writing: new Map() }
}

/**
 * The API's input for a new Note: the Moves listed depth first, so a parent
 * comes before its children and siblings keep their order, each naming its
 * parent by its index in the list (null for the Position).
 */
export function newNoteInput({ name, startFen, tags, tree, writing }: NoteStart, folderId?: number | null): NewNoteInput {
  const index = new Map<MoveId, number>()
  const moves: NewNoteInput['moves'] = []
  const stack = [...moveOf(tree, tree.root).children].reverse()
  while (stack.length > 0) {
    const move = moveOf(tree, stack.pop() as MoveId)
    index.set(move.id, moves.length)
    const parent = move.parent === tree.root ? null : (index.get(move.parent as MoveId) as number)
    moves.push({ parent, san: move.san as string, ...writing.get(move.id) })
    stack.push(...[...move.children].reverse())
  }
  return {
    name,
    startFen,
    tags,
    ...(folderId === undefined ? {} : { folderId }),
    position: writing.get(tree.root) ?? {},
    moves,
  }
}
