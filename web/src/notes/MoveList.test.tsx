import { fireEvent, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { importPgn } from '../chess/pgnImport'
import { mainLine, type MoveTree } from '../chess/tree'
import { renderWithTheme } from '../overlay/testUtils'
import { MoveList } from './MoveList'
import { leavingAsks } from './testUtils'

// A tree and its writing from PGN, as a Note's moves would be.
function note(pgn: string) {
  const imported = importPgn(pgn)
  if (!imported.ok) throw new Error(imported.error)
  return imported.value
}

// The id of the only Move played as `san`.
function idOf(tree: MoveTree, san: string) {
  const found = [...tree.moves.values()].filter((move) => move.san === san)
  if (found.length !== 1) throw new Error(`${found.length} moves are ${san}`)
  return found[0].id
}

const paragraphs = (container: HTMLElement) => [...container.querySelectorAll('p')].map((p) => p.textContent)

describe('MoveList', () => {
  it('numbers the moves, marks the current Move and jumps to a clicked move', async () => {
    const { tree } = note('1. e4 e5 2. Nf3 *')
    const onMoveChange = vi.fn()
    const { container } = renderWithTheme(<MoveList tree={tree} current={idOf(tree, 'e5')} onMoveChange={onMoveChange} />)

    expect(container.querySelector('p')?.textContent).toBe('1.e4e52.Nf3')
    expect(screen.getByRole('button', { name: 'e5' })).toHaveAttribute('aria-current', 'step')
    await userEvent.click(screen.getByRole('button', { name: 'Nf3' }))
    expect(onMoveChange).toHaveBeenCalledWith(idOf(tree, 'Nf3'))
  })

  it('numbers Black’s first move when Black starts', () => {
    const { tree } = note('[SetUp "1"]\n[FEN "4k3/8/8/8/8/8/4P3/4K3 b - - 0 1"]\n\n1... Kd7 2. e4 *')
    const { container } = renderWithTheme(<MoveList tree={tree} current={tree.root} onMoveChange={() => {}} />)
    expect(container.querySelector('p')?.textContent).toBe('1…Kd72.e4')
  })

  it('says when the Note is a Position alone', () => {
    const { tree } = note('*')
    renderWithTheme(<MoveList tree={tree} current={tree.root} onMoveChange={() => {}} />)
    expect(screen.getByText(/studies the position alone/)).toBeInTheDocument()
  })
})

describe('MoveList with Variations', () => {
  const pgn = '1. e4 e5 (1... c5 2. Nf3 (2. c3 d5) 2... d6) (1... e6) 2. Nf3 Nc6 *'

  it('lists the Variations after the move they replace, nesting deeper ones in parentheses', () => {
    const { tree } = note(pgn)
    const { container } = renderWithTheme(<MoveList tree={tree} current={tree.root} onMoveChange={() => {}} />)

    expect(paragraphs(container)).toEqual(['1.e4e5', '1…c52.Nf3(2.c3d5)2…d6', '1…e6', '2.Nf3Nc6'])
    expect(container.querySelectorAll('[class*="nestedVariation"]')).toHaveLength(1)
  })

  it('jumps to a Move inside a Variation', async () => {
    const { tree } = note(pgn)
    const onMoveChange = vi.fn()
    renderWithTheme(<MoveList tree={tree} current={idOf(tree, 'd5')} onMoveChange={onMoveChange} />)

    expect(screen.getByRole('button', { name: 'd5' })).toHaveAttribute('aria-current', 'step')
    await userEvent.click(screen.getByRole('button', { name: 'c3' }))
    expect(onMoveChange).toHaveBeenCalledWith(idOf(tree, 'c3'))
  })

  it('shows writing inside a Variation, its Body inline', () => {
    const { tree, writing } = note('1. e4 e5 (1... c5 $5 {Sharp.} {The Sicilian.} 2. Nf3) 2. Nf3 *')
    const { container: written } = renderWithTheme(
      <MoveList tree={tree} current={idOf(tree, 'c5')} onMoveChange={() => {}} writing={writing} />,
    )
    expect(paragraphs(written)[1]).toBe('1…c5!?Sharp.The Sicilian.2.Nf3')
    expect(screen.getByText('The Sicilian.')).toHaveAttribute('data-current')
  })
})

describe('MoveList with writing', () => {
  const moves = '1. e4 e5 2. Nf3 Nc6 3. Bb5'

  it('shows Glyphs after their move and Comments inline, renumbering Black after a Comment', () => {
    const { tree, writing } = note(`1. e4 $1 $14 {Best by test.} e5 2. Nf3 Nc6 3. Bb5 *`)
    const { container } = renderWithTheme(<MoveList tree={tree} current={tree.root} onMoveChange={() => {}} writing={writing} />)
    expect(screen.getByRole('button', { name: 'e4!⩲' })).toBeInTheDocument()
    expect(container.querySelector('p')?.textContent).toBe('1.e4!⩲Best by test.1…e52.Nf3Nc63.Bb5')
  })

  it('breaks the moves with a Body and highlights the current Move’s writing', () => {
    const { tree, writing } = note(`1. e4 {Open.} e5 2. Nf3 {Attacks e5.} {Black must defend.} Nc6 3. Bb5 *`)
    const { container } = renderWithTheme(
      <MoveList tree={tree} current={idOf(tree, 'Nf3')} onMoveChange={() => {}} writing={writing} />,
    )
    expect(paragraphs(container)).toEqual(['1.e4Open.1…e52.Nf3Attacks e5.', 'Black must defend.', '2…Nc63.Bb5'])
    expect(screen.getByText('Attacks e5.')).toHaveAttribute('data-current')
    expect(screen.getByText('Black must defend.')).toHaveAttribute('data-current')
    expect(screen.getByText('Open.')).not.toHaveAttribute('data-current')
  })

  it('collapses a long Comment behind "more"', async () => {
    const long = `${'A long thought. '.repeat(20)}The end.`
    const { tree } = note(`${moves} *`)
    const e5 = mainLine(tree)[2].id
    const writing = new Map([[e5, { comment: long, body: null, moveGlyph: null, positionGlyph: null, drawings: [] }]])
    renderWithTheme(<MoveList tree={tree} current={tree.root} onMoveChange={() => {}} writing={writing} />)
    expect(screen.queryByText(/The end\./)).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'more' }))
    expect(screen.getByText(/The end\./)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'less' })).toHaveAttribute('aria-expanded', 'true')
  })

  it('opens with the Position’s Glyph and Comment', () => {
    const { tree, writing } = note('1. e4 *')
    writing.set(tree.root, { comment: 'Level.', body: 'Shown above, not here.', moveGlyph: null, positionGlyph: '=', drawings: [] })
    const { container } = renderWithTheme(<MoveList tree={tree} current={tree.root} onMoveChange={() => {}} writing={writing} />)
    expect(container.querySelector('p')?.textContent).toBe('=Level.1.e4')
    expect(screen.queryByText('Shown above, not here.')).not.toBeInTheDocument()
  })
})

describe('Leaving with an unsaved Comment (#120)', () => {
  const menu = { onComment: vi.fn(), onPromote: vi.fn(), onDelete: vi.fn() }

  // Opens the inline editor for the Comment on `san`.
  async function writeCommentOn(san: string) {
    const { tree } = note('1. e4 e5 *')
    renderWithTheme(<MoveList tree={tree} current={idOf(tree, 'e5')} onMoveChange={() => {}} menu={menu} />)
    fireEvent.contextMenu(screen.getByRole('button', { name: san }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Add comment' }))
    return screen.findByRole('textbox', { name: /^Comment on/ })
  }

  it('asks while the inline editor has a draft, and not once Enter saves it', async () => {
    const comment = await writeCommentOn('e5')
    expect(leavingAsks()).toBe(false)

    await userEvent.type(comment, 'Symmetry.')
    expect(leavingAsks()).toBe(true)
    await userEvent.type(comment, '{Enter}')
    expect(menu.onComment).toHaveBeenCalledWith(expect.anything(), 'Symmetry.')
    expect(leavingAsks()).toBe(false)
  })

  it('does not ask once Escape cancels the draft', async () => {
    const comment = await writeCommentOn('e4')

    await userEvent.type(comment, 'Best by test.')
    expect(leavingAsks()).toBe(true)
    await userEvent.type(comment, '{Escape}')
    expect(screen.queryByRole('textbox', { name: /^Comment on/ })).not.toBeInTheDocument()
    expect(leavingAsks()).toBe(false)
  })
})
