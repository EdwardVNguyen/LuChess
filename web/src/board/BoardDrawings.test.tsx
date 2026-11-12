import { fireEvent } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { parsePgn, type Game } from '../chess/chess'
import type { Drawing } from '../chess/pgn'
import { renderWithTheme } from '../overlay/testUtils'
import { Board } from './Board'
import { BRUSH_COLORS } from './drawings'

const game = (() => {
  const result = parsePgn('1. e4 e5 2. Nf3 Nc6 *')
  if (!result.ok) throw new Error(result.error)
  return result.value as Game
})()

function square(container: HTMLElement, name: string): HTMLElement {
  const element = container.querySelector<HTMLElement>(`[id$="-square-${name}"]`)
  if (!element) throw new Error(`no square ${name}`)
  return element
}

/** The brush of the circle on a square, if any; react-chessboard puts squareStyles on the square's inner div. */
function circleOn(container: HTMLElement, name: string): string | null {
  const style = square(container, name).querySelector<HTMLElement>(':scope > div')?.style.backgroundImage ?? ''
  return /var\(--cn-board-brush-(\w+)\)/.exec(style)?.[1] ?? null
}

/** The arrows drawn over the board, as their colours. */
function arrowColors(container: HTMLElement): string[] {
  return [...container.querySelectorAll('path[marker-end]')].map((path) => path.getAttribute('stroke') ?? '')
}

type Keys = { shiftKey?: boolean; altKey?: boolean }

/** Right-press on one square and let go on another (or the same one, for a circle). */
function rightDrag(container: HTMLElement, from: string, to: string, keys: Keys = {}) {
  fireEvent.mouseDown(square(container, from), { button: 2, buttons: 2, ...keys })
  if (to !== from) fireEvent.mouseOver(square(container, to), { button: 2, buttons: 2, ...keys })
  fireEvent.mouseUp(square(container, to), { button: 2, ...keys })
  fireEvent.contextMenu(square(container, to), { button: 2, ...keys })
}

// A board whose Drawings change as they are drawn, as on a Note.
function Drawable({ initial = [], onChange }: { initial?: Drawing[]; onChange?: (drawings: Drawing[]) => void }) {
  const [drawings, setDrawings] = useState<Drawing[]>(initial)
  return (
    <Board
      mode="view"
      game={game}
      ply={4}
      onPlyChange={() => {}}
      drawings={drawings}
      onDrawingsChange={(next) => {
        setDrawings(next)
        onChange?.(next)
      }}
    />
  )
}

describe('Board Drawings', () => {
  it('shows the Drawings it is given: arrows in their brush, circles as rings on their square', () => {
    const { container } = renderWithTheme(
      <Board
        mode="view"
        game={game}
        ply={4}
        onPlyChange={() => {}}
        drawings={[
          { from: 'f3', to: 'e5', brush: 'red' },
          { from: 'e5', brush: 'blue' },
          { from: 'c6', brush: 'yellow' },
        ]}
      />,
    )
    expect(arrowColors(container)).toEqual([BRUSH_COLORS.red])
    expect(circleOn(container, 'e5')).toBe('blue')
    expect(circleOn(container, 'c6')).toBe('yellow')
    expect(circleOn(container, 'e4')).toBeNull()
  })

  it('draws an arrow with a right-drag and a circle with a right-click, green by default', () => {
    const onChange = vi.fn()
    const { container } = renderWithTheme(<Drawable onChange={onChange} />)

    rightDrag(container, 'f3', 'g5')
    expect(onChange).toHaveBeenLastCalledWith([{ from: 'f3', to: 'g5', brush: 'green' }])
    rightDrag(container, 'f7', 'f7')
    expect(onChange).toHaveBeenLastCalledWith([
      { from: 'f3', to: 'g5', brush: 'green' },
      { from: 'f7', brush: 'green' },
    ])
    expect(arrowColors(container)).toEqual([BRUSH_COLORS.green])
    expect(circleOn(container, 'f7')).toBe('green')
  })

  it('draws red with Shift, blue with Alt and yellow with Shift+Alt', () => {
    const onChange = vi.fn()
    const { container } = renderWithTheme(<Drawable onChange={onChange} />)

    rightDrag(container, 'd2', 'd4', { shiftKey: true })
    rightDrag(container, 'c1', 'g5', { altKey: true })
    rightDrag(container, 'e5', 'e5', { shiftKey: true, altKey: true })
    expect(onChange).toHaveBeenLastCalledWith([
      { from: 'd2', to: 'd4', brush: 'red' },
      { from: 'c1', to: 'g5', brush: 'blue' },
      { from: 'e5', brush: 'yellow' },
    ])
    expect(arrowColors(container)).toEqual([BRUSH_COLORS.red, BRUSH_COLORS.blue])
  })

  it('clears every Drawing with a left-click on the board', () => {
    const onChange = vi.fn()
    const { container } = renderWithTheme(
      <Drawable
        initial={[
          { from: 'f3', to: 'e5', brush: 'green' },
          { from: 'e5', brush: 'red' },
        ]}
        onChange={onChange}
      />,
    )

    fireEvent.mouseDown(square(container, 'a3'), { button: 0, buttons: 1 })
    expect(onChange).toHaveBeenLastCalledWith([])
    expect(arrowColors(container)).toEqual([])
    expect(circleOn(container, 'e5')).toBeNull()

    // With nothing drawn, a left-click saves nothing.
    fireEvent.mouseDown(square(container, 'a3'), { button: 0, buttons: 1 })
    expect(onChange).toHaveBeenCalledTimes(1)
  })

  it('removes a Drawing drawn again, and recolours one drawn with another brush', () => {
    const onChange = vi.fn()
    const { container } = renderWithTheme(
      <Drawable
        initial={[
          { from: 'f3', to: 'e5', brush: 'green' },
          { from: 'e5', brush: 'green' },
        ]}
        onChange={onChange}
      />,
    )

    rightDrag(container, 'f3', 'e5')
    expect(onChange).toHaveBeenLastCalledWith([{ from: 'e5', brush: 'green' }])
    expect(arrowColors(container)).toEqual([])

    rightDrag(container, 'e5', 'e5', { shiftKey: true })
    expect(onChange).toHaveBeenLastCalledWith([{ from: 'e5', brush: 'red' }])
    rightDrag(container, 'e5', 'e5', { shiftKey: true })
    expect(onChange).toHaveBeenLastCalledWith([])
    expect(circleOn(container, 'e5')).toBeNull()
  })

  it('draws nothing with a left click, or when the Drawings are only shown', () => {
    const onChange = vi.fn()
    const drawable = renderWithTheme(<Drawable onChange={onChange} />)
    fireEvent.mouseDown(square(drawable.container, 'e4'), { button: 0, buttons: 1 })
    fireEvent.mouseUp(square(drawable.container, 'e4'), { button: 0 })
    expect(onChange).not.toHaveBeenCalled()
    drawable.unmount()

    const shown = renderWithTheme(
      <Board mode="view" game={game} ply={4} onPlyChange={() => {}} drawings={[{ from: 'e4', brush: 'green' }]} />,
    )
    rightDrag(shown.container, 'e4', 'e4')
    rightDrag(shown.container, 'g1', 'f3')
    expect(circleOn(shown.container, 'e4')).toBe('green')
    expect(arrowColors(shown.container)).toEqual([])
  })
})
