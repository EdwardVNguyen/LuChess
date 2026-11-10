import { fireEvent, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { gameFromMoves, parsePgn, START_FEN, validateFen, type Game } from '../chess/chess'
import { fischerSpassky1972Game6 } from '../chess/fixtures'
import { renderWithTheme } from '../overlay/testUtils'
import { Board } from './Board'

function square(container: HTMLElement, name: string): HTMLElement {
  const element = container.querySelector<HTMLElement>(`[id$="-square-${name}"]`)
  if (!element) throw new Error(`no square ${name}`)
  return element
}

// What is drawn on a square: a target dot or capture ring, or the glow of a
// king in check. react-chessboard puts squareStyles on the square's inner div.
function marks(container: HTMLElement, name: string): string[] {
  const style = square(container, name).querySelector<HTMLElement>(':scope > div')?.style.backgroundImage ?? ''
  return [
    style.includes('var(--cn-board-target) 0 16%') && 'dot',
    style.includes('var(--cn-board-target) 80%') && 'ring',
    style.includes('var(--cn-board-check)') && 'check',
  ].filter((mark): mark is string => Boolean(mark))
}

// Which pieces the board lets be pressed; Board.module.css turns off text
// selection over the board and the cursor on the pieces that can't move.
function movable(container: HTMLElement): string | null {
  return container.querySelector('[data-movable]')?.getAttribute('data-movable') ?? null
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

  it('lets no piece be moved', () => {
    const { container } = renderWithTheme(<Board mode="view" game={game} ply={20} onPlyChange={() => {}} />)
    expect(movable(container)).toBe('none')
  })

  it('disables going back at the Position', () => {
    renderWithTheme(<Board mode="view" game={game} ply={0} onPlyChange={() => {}} />)
    expect(screen.getByText('Start position')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Previous move' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Next move' })).toBeEnabled()
  })
})

describe('Board in view mode, check', () => {
  // 1.e4 f5 2.Qh5+
  const checkGame = (() => {
    const result = gameFromMoves(START_FEN, ['e4', 'f5', 'Qh5+'])
    if (!result.ok) throw new Error(result.error)
    return result.value
  })()

  // Each position is a fresh render: changing it animates, which needs real layout.
  it('highlights the king in check at the Ply shown', () => {
    const inCheck = renderWithTheme(<Board mode="view" game={checkGame} ply={3} onPlyChange={() => {}} />)
    expect(marks(inCheck.container, 'e8')).toEqual(['check'])
    inCheck.unmount()

    const before = renderWithTheme(<Board mode="view" game={checkGame} ply={2} onPlyChange={() => {}} />)
    expect(marks(before.container, 'e8')).toEqual([])
  })
})

describe('Board in view mode with moves to play', () => {
  it('plays a legal move from the Ply shown', async () => {
    const onMove = vi.fn()
    const { container } = renderWithTheme(
      <Board mode="view" game={game} ply={0} onPlyChange={() => {}} onMove={onMove} />,
    )

    await userEvent.click(square(container, 'e2'))
    await userEvent.click(square(container, 'e4'))
    expect(onMove).toHaveBeenCalledWith(expect.objectContaining({ san: 'e4', from: 'e2', to: 'e4' }))
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

  it('marks empty targets with a dot and captures with a ring', async () => {
    // 1.e4 d5: the e4 pawn can take on d5 or push to e5. En passant on f6,
    // after 2.e5 f5, takes from an empty square, so it gets a dot.
    const capture = renderWithTheme(
      <Board mode="play" fen="rnbqkbnr/ppp1pppp/8/3p4/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2" onMove={() => {}} />,
    )
    await userEvent.click(square(capture.container, 'e4'))
    expect(marks(capture.container, 'd5')).toEqual(['ring'])
    expect(marks(capture.container, 'e5')).toEqual(['dot'])
    expect(marks(capture.container, 'e6')).toEqual([])
    capture.unmount()

    const enPassant = renderWithTheme(
      <Board mode="play" fen="rnbqkbnr/ppp1p1pp/8/3pPp2/8/8/PPPP1PPP/RNBQKBNR w KQkq f6 0 3" onMove={() => {}} />,
    )
    await userEvent.click(square(enPassant.container, 'e5'))
    expect(marks(enPassant.container, 'f6')).toEqual(['dot'])
    expect(marks(enPassant.container, 'e6')).toEqual(['dot'])
  })

  it('highlights the king in check, and only while it is in check', () => {
    const inCheck = renderWithTheme(
      <Board mode="play" fen="rnbqkbnr/ppppp1pp/8/5p1Q/4P3/8/PPPP1PPP/RNB1KBNR b KQkq - 1 2" onMove={() => {}} />,
    )
    expect(marks(inCheck.container, 'e8')).toEqual(['check'])
    expect(marks(inCheck.container, 'e1')).toEqual([])
    inCheck.unmount()

    const start = renderWithTheme(<Board mode="play" fen={START_FEN} onMove={() => {}} />)
    expect(marks(start.container, 'e8')).toEqual([])
  })

  it("lets only the side to move's pieces be moved", () => {
    const white = renderWithTheme(<Board mode="play" fen={START_FEN} onMove={() => {}} />)
    expect(movable(white.container)).toBe('w')
    const black = renderWithTheme(
      <Board mode="play" fen="rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1" onMove={() => {}} />,
    )
    expect(movable(black.container)).toBe('b')
  })

  const promotionFen = '7k/P7/8/8/8/8/8/K7 w - - 0 1'

  it('asks which piece to promote to, and underpromotes', async () => {
    const onMove = vi.fn()
    const { container } = renderWithTheme(<Board mode="play" fen={promotionFen} onMove={onMove} />)

    await userEvent.click(square(container, 'a7'))
    await userEvent.click(square(container, 'a8'))
    expect(onMove).not.toHaveBeenCalled()
    const picker = screen.getByRole('group', { name: 'Promote to' })
    expect(within(picker).getAllByRole('button').map((button) => button.getAttribute('aria-label'))).toEqual([
      'Queen',
      'Rook',
      'Bishop',
      'Knight',
    ])

    await userEvent.click(within(picker).getByRole('button', { name: 'Knight' }))
    expect(onMove).toHaveBeenCalledWith(expect.objectContaining({ san: 'a8=N', from: 'a7', to: 'a8' }))
    expect(screen.queryByRole('group', { name: 'Promote to' })).not.toBeInTheDocument()
  })

  it('promotes for Black on a flipped board', async () => {
    const onMove = vi.fn()
    const { container } = renderWithTheme(
      <Board mode="play" fen="k7/8/8/8/8/8/p7/7K b - - 0 1" orientation="black" onMove={onMove} />,
    )

    await userEvent.click(square(container, 'a2'))
    await userEvent.click(square(container, 'a1'))
    await userEvent.click(screen.getByRole('button', { name: 'Rook' }))
    expect(onMove).toHaveBeenCalledWith(expect.objectContaining({ san: 'a1=R+' }))
  })

  it('plays no move when the picker is cancelled with Esc or a click away', async () => {
    const onMove = vi.fn()
    const { container } = renderWithTheme(<Board mode="play" fen={promotionFen} onMove={onMove} />)

    await userEvent.click(square(container, 'a7'))
    await userEvent.click(square(container, 'a8'))
    expect(screen.getByRole('button', { name: 'Queen' })).toHaveFocus()
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('group', { name: 'Promote to' })).not.toBeInTheDocument()

    await userEvent.click(square(container, 'a7'))
    await userEvent.click(square(container, 'a8'))
    await userEvent.click(document.body)
    expect(screen.queryByRole('group', { name: 'Promote to' })).not.toBeInTheDocument()
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
