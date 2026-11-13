import { describe, expect, it } from 'vitest'
import { START_FEN } from './chess'
import { fischerSpassky1972Game6 } from './fixtures'
import { exportPgn, MAX_PGN_BYTES, tagRecord, type ImportedNote, type Writing } from './pgn'
import { importPgn } from './pgnImport'
import { mainLine, moveOf, type MoveTree } from './tree'

function imported(pgn: string): ImportedNote {
  const result = importPgn(pgn)
  if (!result.ok) throw new Error(result.error)
  return result.value
}

/** The Move reached by these SANs from the Position, each the child of the one before. */
function at(tree: MoveTree, ...sans: string[]) {
  let move = moveOf(tree, tree.root)
  for (const san of sans) {
    const next = move.children.map((id) => moveOf(tree, id)).find((child) => child.san === san)
    if (!next) throw new Error(`No ${san} after ${move.san ?? 'the Position'}`)
    move = next
  }
  return move
}

const childSans = (tree: MoveTree, ...path: string[]) => at(tree, ...path).children.map((id) => moveOf(tree, id).san)

const annotated = `[Event "Club night"]
[White "Lovelace, Ada"]
[Black "Hopper, Grace"]
[Result "1-0"]

{The big idea [%cal Ge2e4]} 1. e4 $1 $14 {Best by test. [%csl Re5]} {Then Black must
decide. [%cal Gg1f3,Rd2d4]} 1... e5 (1... c5 $5 {The Sicilian.} 2. Nf3 (2. Nc3 {Closed.}
2... Nc6 (2... e6 $2)) 2... d6) 2. Nf3 $18 {} {Only a Body.} Nc6 3. Bc4 {Comment} {Body one}
{Body two} 1-0
`

describe('importPgn', () => {
  const note = imported(annotated)
  const { tree, writing } = note

  it('keeps the tags in order, and the result', () => {
    expect(note.tags).toEqual([
      ['Event', 'Club night'],
      ['White', 'Lovelace, Ada'],
      ['Black', 'Hopper, Grace'],
      ['Result', '1-0'],
    ])
    expect(note.startFen).toBe(START_FEN)
  })

  it('makes the moves a tree, with Variations nested after the Move they replace', () => {
    expect(mainLine(tree).map((move) => move.san)).toEqual([null, 'e4', 'e5', 'Nf3', 'Nc6', 'Bc4'])
    expect(childSans(tree, 'e4')).toEqual(['e5', 'c5'])
    expect(childSans(tree, 'e4', 'c5')).toEqual(['Nf3', 'Nc3'])
    expect(childSans(tree, 'e4', 'c5', 'Nc3')).toEqual(['Nc6', 'e6'])
    expect(childSans(tree, 'e4', 'c5', 'Nf3')).toEqual(['d6'])
  })

  it('reads a comment before the first move as the Position’s Body', () => {
    expect(writing.get(tree.root)).toEqual<Writing>({
      comment: null,
      body: 'The big idea',
      moveGlyph: null,
      positionGlyph: null,
      drawings: [{ from: 'e2', to: 'e4', brush: 'green' }],
    })
  })

  it('reads every comment before the first move as the Position’s Body, never a Comment (#97)', () => {
    const note = imported('{The plan.} {[%csl Yd4] Then the details.} 1. e4 *')
    expect(note.writing.get(note.tree.root)).toMatchObject({
      comment: null,
      body: 'The plan.\n\nThen the details.',
      drawings: [{ from: 'd4', brush: 'yellow' }],
    })
  })

  it('reads the first comment after a Move as its Comment and later ones as its Body', () => {
    expect(writing.get(at(tree, 'e4').id)).toEqual<Writing>({
      comment: 'Best by test.',
      body: 'Then Black must\ndecide.',
      moveGlyph: '!',
      positionGlyph: '⩲',
      drawings: [
        { from: 'e5', brush: 'red' },
        { from: 'g1', to: 'f3', brush: 'green' },
        { from: 'd2', to: 'd4', brush: 'red' },
      ],
    })
    expect(writing.get(at(tree, 'e4', 'e5', 'Nf3', 'Nc6', 'Bc4').id)).toMatchObject({
      comment: 'Comment',
      body: 'Body one\n\nBody two',
    })
    expect(writing.get(at(tree, 'e4', 'e5', 'Nf3').id)).toMatchObject({ comment: null, body: 'Only a Body.', positionGlyph: '+−' })
  })

  it('reads writing and Glyphs inside Variations', () => {
    expect(writing.get(at(tree, 'e4', 'c5').id)).toMatchObject({ comment: 'The Sicilian.', moveGlyph: '!?' })
    expect(writing.get(at(tree, 'e4', 'c5', 'Nc3').id)).toMatchObject({ comment: 'Closed.' })
    expect(writing.get(at(tree, 'e4', 'c5', 'Nc3', 'e6').id)).toMatchObject({ moveGlyph: '?' })
    expect(writing.has(at(tree, 'e4', 'c5', 'Nf3').id)).toBe(false)
  })

  it('reads Drawings in all four brushes, on their own or with a Comment, and each shape once (#77)', () => {
    const note = imported('{[%csl Yd4]} 1. e4 {[%cal Bg1f3,Rd2d4,Bg1f3][%csl Ge4,Re4]} 1... e5 (1... c5 {[%cal Yc5d4] Sicilian.}) *')
    expect(note.writing.get(note.tree.root)).toMatchObject({ comment: null, body: null, drawings: [{ from: 'd4', brush: 'yellow' }] })
    expect(note.writing.get(at(note.tree, 'e4').id)).toMatchObject({
      comment: null,
      drawings: [
        { from: 'e4', brush: 'green' },
        { from: 'g1', to: 'f3', brush: 'blue' },
        { from: 'd2', to: 'd4', brush: 'red' },
      ],
    })
    expect(note.writing.get(at(note.tree, 'e4', 'c5').id)).toMatchObject({
      comment: 'Sicilian.',
      drawings: [{ from: 'c5', to: 'd4', brush: 'yellow' }],
    })
    const pgn = exportPgn({ ...note, linkName: () => null })
    expect(imported(pgn).writing).toEqual(note.writing)
  })

  it('drops NAGs that have no Glyph', () => {
    const { tree, writing } = imported('1. e4 $22 $1 $140 e5 $36 *')
    expect(writing.get(at(tree, 'e4').id)).toMatchObject({ moveGlyph: '!', positionGlyph: null })
    expect(writing.has(at(tree, 'e4', 'e5').id)).toBe(false)
  })

  it('reads a set-up Position from the FEN tag', () => {
    const fen = '4k3/8/8/8/8/8/8/4K2R b K - 0 30'
    const { tree, startFen } = imported(`[SetUp "1"]\n[FEN "${fen}"]\n\n30... Kd7 31. Rh7+ *`)
    expect(startFen).toBe(fen)
    expect(at(tree, 'Kd7', 'Rh7+')).toMatchObject({ ply: 2, moveNumber: 31 })
  })

  it('reads a whole game', () => {
    const { tree, tags } = imported(fischerSpassky1972Game6)
    expect(mainLine(tree)).toHaveLength(82)
    expect(tagRecord(tags)).toMatchObject({ White: 'Fischer, Robert James', Date: '1972.07.23' })
  })

  it('gives a clear error for an illegal move, even in a Variation', () => {
    expect(importPgn('1. e4 e5 2. Ke3 *')).toEqual({ ok: false, error: '“Ke3” is not a legal move in this game.' })
    expect(importPgn('1. e4 e5 (1... Nf6 2. Ke3) *')).toEqual({ ok: false, error: '“Ke3” is not a legal move in this game.' })
  })

  it('gives a clear error for text that is not PGN', () => {
    expect(importPgn('1. e4 e5 2. Qh9')).toEqual({ ok: false, error: 'The PGN could not be read: unexpected “9” at line 1, column 15.' })
    expect(importPgn('   ')).toEqual({ ok: false, error: 'The PGN is empty.' })
    expect(importPgn(`[FEN "nonsense"]\n\n*`)).toEqual({ ok: false, error: 'The PGN’s FEN tag is not a legal position.' })
  })

  it('refuses a PGN over 64 KB', () => {
    const long = `{${'x'.repeat(MAX_PGN_BYTES)}} *`
    expect(importPgn(long)).toEqual({ ok: false, error: 'The PGN must be at most 64 KB.' })
  })

  it('refuses more than 5,000 Moves', () => {
    // Knights out and back on the Main line, each move with a Variation of three: four Moves a ply.
    const step = [
      (n: number) => `${n}. Nf3 (${n}. Nc3 Nc6 ${n + 1}. Nb1)`,
      (n: number) => `${n}... Nf6 (${n}... Nc6 ${n + 1}. Nc3 Nb8)`,
      (n: number) => `${n}. Ng1 (${n}. Nh4 Nh5 ${n + 1}. Nf3)`,
      (n: number) => `${n}... Ng8 (${n}... Nh5 ${n + 1}. Nh3 Nf6)`,
    ]
    const pgn = (plies: number) =>
      Array.from({ length: plies }, (_, i) => step[i % 4](Math.floor(i / 2) + 1)).join(' ') + ' *'
    const full = importPgn(pgn(1250))
    expect(full.ok ? full.value.tree.moves.size - 1 : full.error).toBe(5_000)
    expect(importPgn(pgn(1251))).toEqual({ ok: false, error: 'A note can hold at most 5,000 moves.' })
    // chess.js checks each of the 10,000 Moves: seconds, not the default 5.
  }, 30_000)
})

describe('exportPgn', () => {
  const noLinks = () => null

  it('round-trips nested Variations, NAGs, two comments on a Move, and Drawings', () => {
    const first = imported(annotated)
    const pgn = exportPgn({ ...first, linkName: noLinks })
    const again = imported(pgn)

    expect(again.tags).toEqual(first.tags)
    expect([...again.tree.moves.values()].map(({ id, parent, san, children }) => ({ id, parent, san, children }))).toEqual(
      [...first.tree.moves.values()].map(({ id, parent, san, children }) => ({ id, parent, san, children })),
    )
    expect(again.writing).toEqual(first.writing)
    expect(exportPgn({ ...again, linkName: noLinks })).toBe(pgn)
  })

  it('writes each Move as SAN, NAGs, {Comment} and {Body}, and Variations after the Move they replace', () => {
    expect(exportPgn({ ...imported(annotated), linkName: noLinks })).toBe(`[Event "Club night"]
[White "Lovelace, Ada"]
[Black "Hopper, Grace"]
[Result "1-0"]

{[%cal Ge2e4] The big idea} 1. e4 $1 $14
{[%csl Re5][%cal Gg1f3,Rd2d4] Best by test.} {Then Black must
decide.} 1... e5 (1... c5 $5 {The Sicilian.} 2. Nf3 (2. Nc3 {Closed.} 2... Nc6
(2... e6 $2)) 2... d6) 2. Nf3 $18 {} {Only a Body.} 2... Nc6 3. Bc4 {Comment}
{Body one

Body two} 1-0
`)
  })

  it('writes Links as their label or their target’s name, in plain text', () => {
    const note = imported('1. e4 *')
    const e4 = at(note.tree, 'e4').id
    note.writing.set(e4, {
      comment: 'See [[note:7|the pawns]] and [[note:8]] {or} [[note:9]].',
      body: null,
      moveGlyph: null,
      positionGlyph: null,
      drawings: [],
    })
    const pgn = exportPgn({ ...note, linkName: (target) => (target === 8 ? 'Hanging pawns' : null) })
    expect(pgn).toBe('1. e4 {See the pawns and Hanging pawns (or) a deleted note.} *\n')
  })

  it('writes an older Comment on the Position, which reads back into its Body, and a set-up Position’s FEN', () => {
    const fen = '4k3/8/8/8/8/8/8/4K2R b K - 0 30'
    const note = imported(`[FEN "${fen}"]\n\n30... Kd7 *`)
    note.writing.set(note.tree.root, { comment: 'Black to move.', body: 'Then the king.', moveGlyph: null, positionGlyph: null, drawings: [] })
    const pgn = exportPgn({ ...note, tags: [], linkName: noLinks })
    expect(pgn).toBe(`[SetUp "1"]\n[FEN "${fen}"]\n\n{Black to move.} {Then the king.} 30... Kd7 *\n`)
    expect(imported(pgn).writing.get(0)).toMatchObject({ comment: null, body: 'Black to move.\n\nThen the king.' })
  })
})
