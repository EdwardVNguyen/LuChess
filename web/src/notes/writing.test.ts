import { describe, expect, it } from 'vitest'
import type { MoveRow } from '../api'
import { NO_WRITING } from '../chess/pgn'
import { importPgn } from '../chess/pgnImport'
import { moveOf, type MoveTree } from '../chess/tree'
import { describeWriting, mergeWriting, withWriting, writingByMove, writingUnder } from './writing'

function row(id: number, fields: Partial<MoveRow>): MoveRow {
  return { id, parentId: id === 1 ? null : 1, san: id === 1 ? null : 'e4', updatedAt: '', ...NO_WRITING, ...fields }
}

describe('writing', () => {
  it('merges one change onto what a Move already has, keeping its Drawings', () => {
    const drawings = [{ from: 'e2', to: 'e4', brush: 'green' as const }]
    expect(mergeWriting({ ...NO_WRITING, comment: 'Sharp.', moveGlyph: '!', drawings }, { positionGlyph: '±' })).toEqual({
      comment: 'Sharp.',
      body: null,
      moveGlyph: '!',
      positionGlyph: '±',
      drawings,
    })
    expect(mergeWriting(undefined, { body: 'Then…' })).toEqual({ ...NO_WRITING, body: 'Then…' })
  })

  it('keeps the writing of rows that have some, and drops a Move left empty', () => {
    const writing = writingByMove([row(1, { body: 'The idea.' }), row(2, {}), row(3, { drawings: [{ from: 'e4', brush: 'red' }] })])
    expect([...writing.keys()]).toEqual([1, 3])
    expect([...withWriting(writing, 1, NO_WRITING).keys()]).toEqual([3])
    expect(withWriting(writing, 2, { ...NO_WRITING, moveGlyph: '?' }).get(2)?.moveGlyph).toBe('?')
  })
})

describe('writing that a delete would take', () => {
  const idOf = (tree: MoveTree, san: string) => [...tree.moves.values()].find((move) => move.san === san)!.id

  it('counts each kind under a Move, in its Variations too, and none of it above', () => {
    const imported = importPgn('1. e4 {Open.} e5 $1 $14 (1... c5 {Sharp.} {The Sicilian.} 2. Nf3 $2) 2. Nf3 *')
    if (!imported.ok) throw new Error(imported.error)
    const { tree, writing } = imported.value
    const e5 = idOf(tree, 'e5')
    writing.set(e5, { ...writing.get(e5)!, drawings: [{ from: 'e5', brush: 'red' }, { from: 'g1', to: 'f3', brush: 'green' }] })

    expect(writingUnder(tree, writing, moveOf(tree, e5).parent!)).toEqual({ comments: 2, bodies: 1, glyphs: 3, drawings: 2 })
    expect(writingUnder(tree, writing, idOf(tree, 'c5'))).toEqual({ comments: 1, bodies: 1, glyphs: 1, drawings: 0 })
    expect(writingUnder(tree, writing, e5)).toEqual({ comments: 0, bodies: 0, glyphs: 2, drawings: 2 })
  })

  it('reads as the API words it, leaving out what there is none of', () => {
    expect(describeWriting({ comments: 2, bodies: 1, glyphs: 3, drawings: 0 })).toBe('2 Comments, 1 Body and 3 Glyphs')
    expect(describeWriting({ comments: 1, bodies: 0, glyphs: 0, drawings: 1 })).toBe('1 Comment and 1 Drawing')
    expect(describeWriting({ comments: 0, bodies: 2, glyphs: 0, drawings: 0 })).toBe('2 Bodies')
  })
})
