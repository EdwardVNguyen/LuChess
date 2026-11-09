import { describe, expect, it } from 'vitest'
import type { PlyWriting } from '../api'
import { hasWriting, mergeWriting, replaceWriting } from './writing'

function written(ply: number, fields: Partial<PlyWriting>): PlyWriting {
  return { ply, comment: null, body: null, moveGlyph: null, positionGlyph: null, updatedAt: '', ...fields }
}

describe('writing', () => {
  it('merges one change onto what a Ply already has', () => {
    expect(mergeWriting(written(3, { comment: 'Sharp.', moveGlyph: '!' }), { positionGlyph: '±' })).toEqual({
      comment: 'Sharp.',
      body: null,
      moveGlyph: '!',
      positionGlyph: '±',
    })
    expect(mergeWriting(undefined, { body: 'Then…' })).toEqual({ comment: null, body: 'Then…', moveGlyph: null, positionGlyph: null })
  })

  it('keeps written Plies in order and drops one left empty', () => {
    const plies = [written(1, { comment: 'a' }), written(5, { body: 'b' })]
    expect(replaceWriting(plies, written(3, { moveGlyph: '?' })).map((p) => p.ply)).toEqual([1, 3, 5])
    expect(replaceWriting(plies, written(5, {})).map((p) => p.ply)).toEqual([1])
    expect(hasWriting(written(0, {}))).toBe(false)
  })
})
