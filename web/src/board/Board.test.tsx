import { fireEvent, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { parsePgn, START_FEN, validateFen, type Game } from '../chess/chess'
import { fischerSpassky1972Game6 } from '../chess/fixtures'
import { renderWithTheme } from '../overlay/testUtils'
import { Board } from './Board'

function square(container: HTMLElement, name: string): HTMLElement {
  const element = container.querySelector<HTMLElement>(`[id$="-square-${name}"]`)
  if (!element) throw new Error(`no square ${name}`)
  return element
}

const game = (() => {
  const result = parsePgn(fischerSpassky1972Game6)
  if (!result.ok) throw new Error(result.error)
  return result.value as Game
})()

describe('Board in view mode', () => {
  it('captions the Ply and steps with the buttons and arrow keys', async () => {
    const onPlyChange = vi.fn()
    renderWithTheme(<Board mode="view" game={game} ply={20} onPlyChange={onPlyChange} />)

    expect(screen.getByText('After 10…exd5')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Next move' }))
    expect(onPlyChange).toHaveBeenLastCalledWith(21)
    await userEvent.click(screen.getByRole('button', { name: 'First move' }))
    expect(onPlyChange).toHaveBeenLastCalledWith(0)

    const board = screen.getByRole('group', { name: 'Chess board, after 10…exd5' })
    fireEvent.keyDown(board, { key: 'ArrowLeft' })
    expect(onPlyChange).toHaveBeenLastCalledWith(19)
    fireEvent.keyDown(board, { key: 'End' })
    expect(onPlyChange).toHaveBeenLastCalledWith(81)
  })

  it('disables going back at the Position', () => {
    renderWithTheme(<Board mode="view" game={game} ply={0} onPlyChange={() => {}} />)
    expect(screen.getByText('Start position')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Previous move' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Next move' })).toBeEnabled()
  })
})

describe('Board in play mode', () => {
  it('plays a legal move by clicking a piece and then a square', async () => {
    const onMove = vi.fn()
    const { container } = renderWithTheme(<Board mode="play" fen={START_FEN} onMove={onMove} />)

    await userEvent.click(square(container, 'e2'))
    await userEvent.click(square(container, 'e4'))
    expect(onMove).toHaveBeenCalledWith(expect.objectContaining({ san: 'e4', from: 'e2', to: 'e4' }))
  })

  it('ignores illegal moves and the side not to move', async () => {
    const onMove = vi.fn()
    const { container } = renderWithTheme(<Board mode="play" fen={START_FEN} onMove={onMove} />)

    await userEvent.click(square(container, 'e2'))
    await userEvent.click(square(container, 'e5'))
    await userEvent.click(square(container, 'e7'))
    await userEvent.click(square(container, 'e5'))
    expect(onMove).not.toHaveBeenCalled()
  })
})

describe('Board in set-up mode', () => {
  it('places pieces and chooses the side to move, producing a valid FEN', async () => {
    const onFenChange = vi.fn()
    function Harness() {
      const [fen, setFen] = useState('4k3/8/8/8/8/8/8/4K3 w - - 0 1')
      return (
        <Board
          mode="setup"
          fen={fen}
          onFenChange={(next, error) => {
            setFen(next)
            onFenChange(next, error)
          }}
        />
      )
    }
    const { container } = renderWithTheme(<Harness />)

    await userEvent.click(screen.getByRole('radio', { name: 'White rook' }))
    await userEvent.click(square(container, 'h1'))
    expect(onFenChange).toHaveBeenLastCalledWith('4k3/8/8/8/8/8/8/4K2R w K - 0 1', null)

    await userEvent.click(screen.getByRole('radio', { name: 'Black to move' }))
    expect(onFenChange).toHaveBeenLastCalledWith('4k3/8/8/8/8/8/8/4K2R b K - 0 1', null)
    expect(validateFen(onFenChange.mock.lastCall?.[0] as string).ok).toBe(true)
  })

  it('reports a position that is not legal', async () => {
    const onFenChange = vi.fn()
    const { container } = renderWithTheme(
      <Board mode="setup" fen="4k3/8/8/8/8/8/8/4K3 w - - 0 1" onFenChange={onFenChange} />,
    )

    await userEvent.click(screen.getByRole('radio', { name: 'Erase' }))
    await userEvent.click(square(container, 'e8'))
    expect(onFenChange).toHaveBeenLastCalledWith('8/8/8/8/8/8/8/4K3 w - - 0 1', 'Invalid FEN: missing black king')
  })
})
