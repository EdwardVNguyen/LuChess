import { describe, expect, it } from 'vitest'
import { START_FEN } from '../chess/chess'
import { NO_WRITING } from '../chess/pgn'
import { addMove, newTree } from '../chess/tree'
import { EMPTY_BOARD_FEN, resetCounts, resetLoss, startFenFor } from './positionSetup'

const none = { comments: 0, bodies: 0, glyphs: 0, drawings: 0 }

describe('resetLoss', () => {
  it('is null when the Note has nothing to lose', () => {
    expect(resetLoss({ moves: 0, ...none })).toBeNull()
  })

  it('names the Moves and the writing that go', () => {
    expect(resetLoss({ moves: 14, ...none, comments: 2 })).toBe('This deletes its 14 Moves and all its writing.')
    expect(resetLoss({ moves: 1, ...none })).toBe('This deletes its 1 Move.')
    expect(resetLoss({ moves: 0, ...none, drawings: 1 })).toBe('This deletes all its writing.')
  })
})

describe('resetCounts', () => {
  it('counts every Move and all the writing, the Position’s own included', () => {
    let tree = newTree(START_FEN, 0)
    const e4 = addMove(tree, 0, 'e4', 1)
    if (!e4.ok) throw new Error(e4.error)
    const c5 = addMove(e4.value.tree, 1, 'c5', 2)
    if (!c5.ok) throw new Error(c5.error)
    tree = c5.value.tree
    const writing = new Map([
      [0, { ...NO_WRITING, body: 'The Sicilian.' }],
      [2, { ...NO_WRITING, comment: 'Sharp.', moveGlyph: '!' }],
    ])

    expect(resetCounts(tree, writing)).toEqual({ moves: 2, comments: 1, bodies: 1, glyphs: 1, drawings: 0 })
    expect(resetCounts(newTree(START_FEN, 0), new Map())).toEqual({ moves: 0, ...none })
  })
})

describe('startFenFor', () => {
  it('sends the standard start as null', () => {
    expect(startFenFor(START_FEN)).toBeNull()
    expect(startFenFor(EMPTY_BOARD_FEN)).toBe(EMPTY_BOARD_FEN)
  })
})
