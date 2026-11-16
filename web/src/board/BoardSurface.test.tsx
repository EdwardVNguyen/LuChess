import { MantineProvider } from '@mantine/core'
import { render, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { START_FEN } from '../chess/chess'
import { theme } from '../theme'
import { BoardSurface } from './BoardSurface'

const AFTER_E4 = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1'

/** A device that does, or doesn't, ask for reduced motion. */
function preferReducedMotion(reduce: boolean) {
  const matchMedia = window.matchMedia
  window.matchMedia = ((query: string) => ({
    ...matchMedia(query),
    media: query,
    matches: reduce && query === '(prefers-reduced-motion: reduce)',
  })) as typeof window.matchMedia
  return () => {
    window.matchMedia = matchMedia
  }
}

function pieceOn(container: HTMLElement, square: string): HTMLElement | null {
  return container.querySelector<HTMLElement>(`[data-square="${square}"] [data-piece]`)
}

function play(reduce: boolean) {
  restore = preferReducedMotion(reduce)
  const board = (fen: string) => (
    <MantineProvider theme={theme} env="test">
      <BoardSurface fen={fen} orientation="white" />
    </MantineProvider>
  )
  const { container, rerender } = render(board(START_FEN))
  rerender(board(AFTER_E4))
  return container
}

let restore = () => {}

describe('BoardSurface moving a piece', () => {
  beforeEach(() => {
    // jsdom has no layout; react-chessboard measures a square to know how far
    // to slide a piece, so give every element a square's size.
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(
      DOMRect.fromRect({ x: 0, y: 0, width: 50, height: 50 }),
    )
  })
  afterEach(() => {
    restore()
    vi.restoreAllMocks()
  })

  it('slides the piece to its new square', async () => {
    const container = play(false)

    // Still on e2, on its way two squares up.
    const moving = pieceOn(container, 'e2')
    expect(moving).toHaveAttribute('data-piece', 'wP')
    expect(moving?.style.transform).toBe('translate(0px, -100px)')
    expect(moving?.style.transition).toBe('transform 150ms')
    expect(pieceOn(container, 'e4')).toBeNull()

    await waitFor(() => expect(pieceOn(container, 'e4')).toHaveAttribute('data-piece', 'wP'))
    expect(pieceOn(container, 'e2')).toBeNull()
  })

  it('puts the piece straight on its new square when reduced motion is preferred', () => {
    const container = play(true)

    const moved = pieceOn(container, 'e4')
    expect(moved).toHaveAttribute('data-piece', 'wP')
    expect(moved?.style.transform).toBe('')
    expect(pieceOn(container, 'e2')).toBeNull()
  })
})
