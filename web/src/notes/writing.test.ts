import { describe, expect, it } from 'vitest'
import type { MoveRow } from '../api'
import { NO_WRITING } from '../chess/pgn'
import { mergeWriting, withWriting, writingByMove } from './writing'

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
