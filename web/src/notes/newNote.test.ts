import { describe, expect, it } from 'vitest'
import { importPgn } from '../chess/pgnImport'
import { newNoteInput } from './newNote'

describe('newNoteInput', () => {
  it('lists the Moves depth first, each naming its parent by index, with their writing', () => {
    const pgn = importPgn('{Idea} 1. e4 {Best} e5 (1... c5 2. Nf3) 2. Nf3 *')
    if (!pgn.ok) throw new Error(pgn.error)
    const { tags, tree, writing } = pgn.value
    expect(newNoteInput({ name: 'Italian', startFen: null, tags, tree, writing }, 4)).toEqual({
      name: 'Italian',
      startFen: null,
      tags: [],
      folderId: 4,
      position: { comment: null, body: 'Idea', moveGlyph: null, positionGlyph: null, drawings: [] },
      moves: [
        { parent: null, san: 'e4', comment: 'Best', body: null, moveGlyph: null, positionGlyph: null, drawings: [] },
        { parent: 0, san: 'e5' },
        { parent: 1, san: 'Nf3' },
        { parent: 0, san: 'c5' },
        { parent: 3, san: 'Nf3' },
      ],
    })
  })
})
