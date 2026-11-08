import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
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
