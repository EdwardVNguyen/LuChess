import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { PlyWriting } from '../api'
import { gameFromMoves, START_FEN, type Game } from '../chess/chess'
import { renderWithTheme } from '../overlay/testUtils'
import { MoveList } from './MoveList'

function game(startFen: string, sans: string[]): Game {
  const result = gameFromMoves(startFen, sans)
  if (!result.ok) throw new Error(result.error)
  return result.value
}

describe('MoveList', () => {
  it('numbers the moves, marks the current Ply and jumps to a clicked move', async () => {
    const onPlyChange = vi.fn()
    const { container } = renderWithTheme(
      <MoveList game={game(START_FEN, ['e4', 'e5', 'Nf3'])} ply={2} onPlyChange={onPlyChange} />,
    )

    expect(container.querySelector('p')?.textContent).toBe('1.e4e52.Nf3')
    expect(screen.getByRole('button', { name: 'e5' })).toHaveAttribute('aria-current', 'step')
    await userEvent.click(screen.getByRole('button', { name: 'Nf3' }))
    expect(onPlyChange).toHaveBeenCalledWith(3)
  })

  it('numbers Black’s first move when Black starts', () => {
    const { container } = renderWithTheme(
      <MoveList game={game('4k3/8/8/8/8/8/4P3/4K3 b - - 0 1', ['Kd7', 'e4'])} ply={0} onPlyChange={() => {}} />,
    )
    expect(container.querySelector('p')?.textContent).toBe('1…Kd72.e4')
  })

  it('says when the Note is a Position alone', () => {
    renderWithTheme(<MoveList game={game(START_FEN, [])} ply={0} onPlyChange={() => {}} />)
    expect(screen.getByText(/studies the position alone/)).toBeInTheDocument()
  })
})

function written(ply: number, fields: Partial<PlyWriting>): PlyWriting {
  return { ply, comment: null, body: null, moveGlyph: null, positionGlyph: null, updatedAt: '', ...fields }
}

function writingOf(...plies: PlyWriting[]) {
  return new Map(plies.map((p) => [p.ply, p]))
}

describe('MoveList with writing', () => {
  const moves = ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5']

  it('shows Glyphs after their move and Comments inline, renumbering Black after a Comment', () => {
    const { container } = renderWithTheme(
      <MoveList
        game={game(START_FEN, moves)}
        ply={0}
        onPlyChange={() => {}}
        writing={writingOf(written(1, { moveGlyph: '!', positionGlyph: '⩲', comment: 'Best by test.' }))}
      />,
    )
    expect(screen.getByRole('button', { name: 'e4!⩲' })).toBeInTheDocument()
    expect(container.querySelector('p')?.textContent).toBe('1.e4!⩲Best by test.1…e52.Nf3Nc63.Bb5')
  })

  it('breaks the moves with a Body and highlights the current Ply’s writing', () => {
    const { container } = renderWithTheme(
      <MoveList
        game={game(START_FEN, moves)}
        ply={3}
        onPlyChange={() => {}}
        writing={writingOf(written(3, { comment: 'Attacks e5.', body: 'Black must defend.' }), written(1, { comment: 'Open.' }))}
      />,
    )
    const paragraphs = [...container.querySelectorAll('p')].map((p) => p.textContent)
    expect(paragraphs).toEqual(['1.e4Open.1…e52.Nf3Attacks e5.', 'Black must defend.', '2…Nc63.Bb5'])
    expect(screen.getByText('Attacks e5.')).toHaveAttribute('data-current')
    expect(screen.getByText('Black must defend.')).toHaveAttribute('data-current')
    expect(screen.getByText('Open.')).not.toHaveAttribute('data-current')
  })

  it('collapses a long Comment behind "more"', async () => {
    const long = `${'A long thought. '.repeat(20)}The end.`
    renderWithTheme(
      <MoveList
        game={game(START_FEN, moves)}
        ply={0}
        onPlyChange={() => {}}
        writing={writingOf(written(2, { comment: long }))}
      />,
    )
    expect(screen.queryByText(/The end\./)).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'more' }))
    expect(screen.getByText(/The end\./)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'less' })).toHaveAttribute('aria-expanded', 'true')
  })

  it('opens with the position Glyph and Comment at ply 0', () => {
    const { container } = renderWithTheme(
      <MoveList
        game={game(START_FEN, ['e4'])}
        ply={0}
        onPlyChange={() => {}}
        writing={writingOf(written(0, { positionGlyph: '=', comment: 'Level.', body: 'Shown above, not here.' }))}
      />,
    )
    expect(container.querySelector('p')?.textContent).toBe('=Level.1.e4')
    expect(screen.queryByText('Shown above, not here.')).not.toBeInTheDocument()
  })
})
