import { describe, expect, it } from 'vitest'
import { START_FEN } from './chess'
import {
  addMove,
  deleteSubtree,
  lineAsGame,
  lineThrough,
  mainLine,
  moveOf,
  newTree,
  nextId,
  onMainLine,
  promote,
  treeFromRows,
  type MoveTree,
} from './tree'

function play(tree: MoveTree, parent: number, ...sans: string[]): { tree: MoveTree; ids: number[] } {
  const ids: number[] = []
  for (const san of sans) {
    const added = addMove(tree, parent, san, nextId(tree))
    if (!added.ok) throw new Error(added.error)
    tree = added.value.tree
    parent = added.value.id
    ids.push(parent)
  }
  return { tree, ids }
}

const sans = (tree: MoveTree, line = mainLine(tree)) => line.slice(1).map((move) => move.san)
const childSans = (tree: MoveTree, id: number) => moveOf(tree, id).children.map((child) => moveOf(tree, child).san)

describe('a tree of Moves', () => {
  it('starts as the Position alone', () => {
    const tree = newTree(START_FEN, 1)
    expect(mainLine(tree)).toEqual([expect.objectContaining({ id: 1, san: null, ply: 0, color: 'w', fen: START_FEN })])
  })

  it('adds a Move at the end of a line, numbering it from the Position', () => {
    const { tree, ids } = play(newTree('4k3/8/8/8/8/8/8/4K2R b K - 0 30', 0), 0, 'Kd7', 'Rh7+')
    expect(sans(tree)).toEqual(['Kd7', 'Rh7+'])
    expect(moveOf(tree, ids[1])).toMatchObject({ ply: 2, moveNumber: 31, color: 'w', from: 'h1', to: 'h7' })
  })

  it('adds a different Move after the same parent as a Variation, after the Main line', () => {
    let { tree, ids } = play(newTree(START_FEN, 0), 0, 'e4', 'e5', 'Nf3')
    ;({ tree } = play(tree, ids[0], 'c5', 'Nf3', 'd6'))
    expect(sans(tree)).toEqual(['e4', 'e5', 'Nf3'])
    expect(childSans(tree, ids[0])).toEqual(['e5', 'c5'])
  })

  it('reuses the Move when the same SAN is played again after the same parent', () => {
    const { tree, ids } = play(newTree(START_FEN, 0), 0, 'e4', 'e5')
    const again = addMove(tree, ids[0], 'e5', 99)
    expect(again).toEqual({ ok: true, value: { tree, id: ids[1] } })
  })

  it('names a Move as chess.js does, and refuses an illegal one', () => {
    const tree = newTree(START_FEN, 0)
    const added = addMove(tree, 0, 'Ng1f3', 1)
    expect(added.ok && moveOf(added.value.tree, 1).san).toBe('Nf3')
    expect(addMove(tree, 0, 'e5', 1)).toEqual({ ok: false, error: '“e5” is not a legal move here.' })
  })

  it('deletes a Move with its subtree, Variations and all', () => {
    let { tree, ids } = play(newTree(START_FEN, 0), 0, 'e4', 'e5', 'Nf3', 'Nc6')
    const sicilian = play(tree, ids[0], 'c5', 'Nf3')
    tree = play(sicilian.tree, ids[1], 'Nc3').tree
    tree = deleteSubtree(tree, ids[1])
    expect(sans(tree)).toEqual(['e4', 'c5', 'Nf3'])
    expect(tree.moves.size).toBe(4)
    expect(() => deleteSubtree(tree, 0)).toThrow()
  })

  it('promotes a Move two Variations deep to the Main line, all the way up', () => {
    let { tree, ids } = play(newTree(START_FEN, 0), 0, 'e4', 'e5', 'Nf3')
    const c5 = play(tree, ids[0], 'c5', 'Nf3', 'd6')
    tree = c5.tree
    const nc3 = play(tree, c5.ids[0], 'Nc3', 'Nc6')
    tree = nc3.tree
    const e6 = play(tree, nc3.ids[0], 'e6')
    tree = promote(e6.tree, e6.ids[0])
    expect(sans(tree)).toEqual(['e4', 'c5', 'Nc3', 'e6'])
    expect(childSans(tree, ids[0])).toEqual(['c5', 'e5'])
    expect(childSans(tree, c5.ids[0])).toEqual(['Nc3', 'Nf3'])
    expect(childSans(tree, nc3.ids[0])).toEqual(['e6', 'Nc6'])
    expect(onMainLine(tree, e6.ids[0])).toBe(true)
    expect(onMainLine(tree, ids[1])).toBe(false)
  })

  it('gives the line through a Move, on past it by first children', () => {
    let { tree, ids } = play(newTree(START_FEN, 0), 0, 'e4', 'e5', 'Nf3')
    const c5 = play(tree, ids[0], 'c5', 'Nf3', 'd6')
    tree = c5.tree
    expect(sans(tree, lineThrough(tree, c5.ids[0]))).toEqual(['e4', 'c5', 'Nf3', 'd6'])
    const game = lineAsGame(lineThrough(tree, c5.ids[1]))
    expect(game.plies.map((ply) => [ply.index, ply.id])).toEqual([
      [0, 0],
      [1, ids[0]],
      [2, c5.ids[0]],
      [3, c5.ids[1]],
      [4, c5.ids[2]],
    ])
  })

  it('reads the rows the API lists, checking every Move', () => {
    const rows = [
      { id: 10, parentId: null, san: null },
      { id: 11, parentId: 10, san: 'e4' },
      { id: 14, parentId: 11, san: 'c5' },
      { id: 12, parentId: 11, san: 'e5' },
    ]
    const tree = treeFromRows(START_FEN, rows)
    expect(tree.ok && sans(tree.value)).toEqual(['e4', 'c5'])
    expect(treeFromRows(START_FEN, [...rows, { id: 15, parentId: 12, san: 'e5' }])).toEqual({
      ok: false,
      error: '“e5” is not a legal move here.',
    })
  })
})
