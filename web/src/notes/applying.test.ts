import { describe, expect, it } from 'vitest'
import { START_FEN } from '../chess/chess'
import { exportPgn, type ImportedNote, type Writing } from '../chess/pgn'
import { importPgn } from '../chess/pgnImport'
import { mainLine, moveOf, type MoveId, type MoveTree } from '../chess/tree'
import { applyInBrowser, describeLoss, matchBySan, planFen, planPgn, treeInput, type PgnPlan } from './applying'

function imported(pgn: string): ImportedNote {
  const result = importPgn(pgn)
  if (!result.ok) throw new Error(result.error)
  return result.value
}

/** The Move reached by these SANs from the Position. */
function at(tree: MoveTree, ...sans: string[]): MoveId {
  let move = moveOf(tree, tree.root)
  for (const san of sans) {
    const next = move.children.map((id) => moveOf(tree, id)).find((child) => child.san === san)
    if (!next) throw new Error(`No ${san} after ${move.san ?? 'the Position'}`)
    move = next
  }
  return move.id
}

const sans = (tree: MoveTree) => mainLine(tree).flatMap((move) => (move.san ? [move.san] : []))

// A Note as stored: its tree and writing, with a Link in a Comment, and the
// PGN the box under the board shows for it.
function stored(pgn: string, linked?: { sans: string[]; comment: string }) {
  const note = imported(pgn)
  const writing = new Map<MoveId, Writing>(note.writing)
  if (linked) {
    const id = at(note.tree, ...linked.sans)
    writing.set(id, { ...(writing.get(id) ?? { body: null, moveGlyph: null, positionGlyph: null, drawings: [] }), comment: linked.comment })
  }
  const names = new Map([[7, 'Najdorf']])
  const original = exportPgn({ tree: note.tree, tags: note.tags, writing, linkName: (id) => names.get(id) ?? null })
  // The export wraps its lines; edits are made on one line, as reading it doesn't mind.
  return { tree: note.tree, writing, original, flat: original.replace(/\s+/g, ' ') }
}

function plan(tree: MoveTree, edited: string, original: string): PgnPlan {
  const planned = planPgn(tree, edited, original, importPgn)
  if (!planned.ok) throw new Error(planned.error)
  if (!planned.value) throw new Error('nothing to apply')
  return planned.value
}

function matched(p: PgnPlan): Extract<PgnPlan, { kind: 'match' }> {
  if (p.kind !== 'match') throw new Error(`a ${p.kind}`)
  return p
}

const GAME = `[Event "Casual"]

1. e4 {Kings pawn} e5 2. Nf3 $1 {Develops} {A long Body} Nc6 (2... d6 {Philidor}) 3. Bc4 Bc5 *
`

describe('planPgn', () => {
  it('does nothing for a PGN left as it was', () => {
    const { tree, original } = stored(GAME)
    expect(planPgn(tree, `${original}\n\n`, original, importPgn)).toEqual({ ok: true, value: null })
  })

  it('says why a PGN can’t be read, or has an illegal move', () => {
    const { tree, original } = stored(GAME)
    const bad = planPgn(tree, original.replace('Bc4', 'Bc9'), original, importPgn)
    expect(bad.ok).toBe(false)
    const illegal = planPgn(tree, original.replace('Bc4', 'Bb6'), original, importPgn)
    expect(illegal).toEqual({ ok: false, error: '“Bb6” is not a legal move in this game.' })
  })

  it('resets the Note for a PGN with a different Position', () => {
    const { tree, original } = stored(GAME)
    const fen = '4k3/8/8/8/8/8/4P3/4K3 w - - 0 1'
    const p = plan(tree, `[SetUp "1"]\n[FEN "${fen}"]\n\n1. e3 *`, original)
    expect(p.kind).toBe('reset')
    if (p.kind === 'reset') {
      expect(p.startFen).toBe(fen)
      expect(sans(p.note.tree)).toEqual(['e3'])
    }
  })

  it('resets to the standard start when the FEN tag goes', () => {
    const fen = '4k3/8/8/8/8/8/4P3/4K3 w - - 0 1'
    const { tree, original } = stored(`[SetUp "1"]\n[FEN "${fen}"]\n\n1. e3 *`)
    const p = plan(tree, '1. e4 *', original)
    expect(p).toMatchObject({ kind: 'reset', startFen: null })
  })

  it('keeps the writing the PGN shows as the export wrote it, and only that', () => {
    const { tree, original, flat } = stored(GAME, { sans: ['e4'], comment: 'See [[note:7]]' })
    expect(flat).toContain('{See Najdorf}')
    const edited = flat.replace('{Develops}', '{Develops a knight}').replace('2... d6 {Philidor}', '2... d6 {Philidor} {A new Body}')
    const p = matched(plan(tree, edited, original))
    const id = (...path: string[]) => at(p.note.tree, ...path)

    expect(p.keep.get(id('e4'))).toEqual({ keepComment: true, keepBody: true })
    expect(p.keep.get(id('e4', 'e5', 'Nf3'))).toEqual({ keepComment: false, keepBody: true })
    expect(p.keep.get(id('e4', 'e5', 'Nf3', 'd6'))).toEqual({ keepComment: true, keepBody: false })
    expect(p.keep.get(id('e4', 'e5', 'Nf3', 'Nc6'))).toEqual({ keepComment: true, keepBody: true })
    expect(p.keep.get(p.note.tree.root)).toEqual({ keepComment: true, keepBody: true })
  })

  it('lists the tree for the API as for a new Note, with what to keep', () => {
    const { tree, original } = stored(GAME)
    const p = matched(plan(tree, original.replace('3. Bc4 Bc5', '3. Bc4 Bc5 4. c3'), original))
    const input = treeInput(p)
    expect(input.tags).toEqual([['Event', 'Casual']])
    expect(input.position).toMatchObject({ keepComment: true, keepBody: true })
    expect(input.moves.map(({ parent, san }) => [parent, san])).toEqual([
      [null, 'e4'],
      [0, 'e5'],
      [1, 'Nf3'],
      [2, 'Nc6'],
      [3, 'Bc4'],
      [4, 'Bc5'],
      [5, 'c3'],
      [2, 'd6'],
    ])
    expect(input.moves[2]).toMatchObject({ comment: 'Develops', moveGlyph: '!', keepComment: true, keepBody: true })
    // A new Move has nothing stored to keep.
    expect(input.moves[6]).toMatchObject({ keepComment: false, keepBody: false })
  })
})

describe('matchBySan', () => {
  it('matches Moves by their line of SANs from the Position', () => {
    const a = imported('1. e4 e5 (1... c5 2. Nf3) 2. Nf3 *').tree
    const b = imported('1. e4 c5 2. Nc3 (2. Nf3) *').tree
    const m = matchBySan(a, b)
    expect(m.get(at(a, 'e4'))).toBe(at(b, 'e4'))
    expect(m.get(at(a, 'e4', 'c5', 'Nf3'))).toBe(at(b, 'e4', 'c5', 'Nf3'))
    expect(m.has(at(a, 'e4', 'e5'))).toBe(false)
    expect(m.has(at(a, 'e4', 'e5', 'Nf3'))).toBe(false)
    expect(m.size).toBe(4)
  })
})

describe('applyInBrowser', () => {
  it('adds a Move at the end and changes nothing else', () => {
    const { tree, writing, original } = stored(GAME, { sans: ['e4'], comment: 'See [[note:7]]' })
    const p = matched(plan(tree, original.replace('3. Bc4 Bc5', '3. Bc4 Bc5 4. c3'), original))
    const applied = applyInBrowser(tree, writing, p)

    expect(sans(applied.tree)).toEqual(['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5', 'c3'])
    for (const [id, written] of writing) expect(applied.writing.get(id)).toEqual(written)
    for (const id of tree.moves.keys()) expect(applied.tree.moves.has(id)).toBe(true)
    expect(describeLoss(applied.loss)).toBeNull()
  })

  it('replaces the rest of a line from a changed Move, keeping the Moves before it and other Variations', () => {
    const { tree, writing, original, flat } = stored(GAME)
    const p = matched(plan(tree, flat.replace('2. Nf3 $1 {Develops} {A long Body} 2... Nc6', '2. Nc3 Nc6'), original))
    const applied = applyInBrowser(tree, writing, p)

    expect(sans(applied.tree)).toEqual(['e4', 'e5', 'Nc3', 'Nc6', 'Bc4', 'Bc5'])
    expect(applied.tree.moves.get(at(tree, 'e4', 'e5'))?.children).toHaveLength(1)
    expect(applied.writing.get(at(tree, 'e4'))?.comment).toBe('Kings pawn')
    // Nf3, Nc6, d6, Bc4 and Bc5 go, with Nf3's Comment, Body and Glyph and d6's Comment.
    expect(applied.loss).toEqual({ moves: 5, comments: 2, bodies: 1, glyphs: 1, drawings: 0, links: 0 })
    expect(describeLoss(applied.loss)).toBe('This deletes 5 Moves, 2 Comments, 1 Body and 1 Glyph.')
  })

  it('turns a Link into plain text when its Comment changes, and says so', () => {
    const { tree, writing, original } = stored(GAME, { sans: ['e4'], comment: 'See [[note:7]]' })
    const p = matched(plan(tree, original.replace('{See Najdorf}', '{See Najdorf, below}'), original))
    const applied = applyInBrowser(tree, writing, p)

    expect(applied.writing.get(at(tree, 'e4'))?.comment).toBe('See Najdorf, below')
    expect(applied.loss).toEqual({ moves: 0, comments: 1, bodies: 0, glyphs: 0, drawings: 0, links: 1 })
    expect(describeLoss(applied.loss)).toBe('This deletes 1 Comment; 1 Link becomes plain text.')
  })

  it('reorders siblings as the PGN lists them, keeping everything', () => {
    const { tree, writing, original, flat } = stored(GAME)
    const edited = flat.replace('2... Nc6 (2... d6 {Philidor}) 3. Bc4 Bc5', '2... d6 {Philidor} (2... Nc6 3. Bc4 Bc5)')
    const p = matched(plan(tree, edited, original))
    const applied = applyInBrowser(tree, writing, p)

    const nf3 = at(tree, 'e4', 'e5', 'Nf3')
    expect(applied.tree.moves.get(nf3)?.children).toEqual([at(tree, 'e4', 'e5', 'Nf3', 'd6'), at(tree, 'e4', 'e5', 'Nf3', 'Nc6')])
    expect(applied.writing).toEqual(writing)
    expect(describeLoss(applied.loss)).toBeNull()
  })

  it('counts a deleted Move with no writing', () => {
    const { tree, writing, original, flat } = stored(GAME)
    const p = matched(plan(tree, flat.replace(' Bc5', ''), original))
    expect(describeLoss(applyInBrowser(tree, writing, p).loss)).toBe('This deletes 1 Move.')
  })
})

describe('planFen', () => {
  const tree = imported('1. e4 *').tree

  it('sets the Position from a legal FEN, null for the standard start', () => {
    const fen = moveOf(tree, at(tree, 'e4')).fen
    expect(planFen(`  ${fen.replaceAll(' ', '  ')} `, { tree, atPosition: false })).toEqual({ ok: true, value: { startFen: fen } })
    expect(planFen(START_FEN, { tree, atPosition: false })).toEqual({ ok: true, value: { startFen: null } })
  })

  it('does nothing for the Position’s own FEN applied there unchanged', () => {
    expect(planFen(START_FEN, { tree, atPosition: true })).toEqual({ ok: true, value: null })
  })

  it('says why a FEN is not a legal position', () => {
    const result = planFen('8/8/8/8/8/8/8/8 w - - 0 1', { tree, atPosition: false })
    expect(result.ok).toBe(false)
    expect(planFen(' ', { tree, atPosition: false })).toEqual({ ok: false, error: 'Type a position in FEN.' })
  })
})
