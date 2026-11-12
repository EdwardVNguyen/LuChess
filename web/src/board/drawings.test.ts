import { describe, expect, it } from 'vitest'
import type { Drawing } from '../chess/pgn'
import { brushOf, toggleDrawing } from './drawings'

describe('brushOf', () => {
  it('draws green by default, red with Shift, blue with Alt and yellow with both', () => {
    expect(brushOf({ shiftKey: false, altKey: false })).toBe('green')
    expect(brushOf({ shiftKey: true, altKey: false })).toBe('red')
    expect(brushOf({ shiftKey: false, altKey: true })).toBe('blue')
    expect(brushOf({ shiftKey: true, altKey: true })).toBe('yellow')
  })
})

describe('toggleDrawing', () => {
  const arrow: Drawing = { from: 'e2', to: 'e4', brush: 'green' }
  const circle: Drawing = { from: 'd5', brush: 'red' }

  it('adds a Drawing that is not there, after the others', () => {
    expect(toggleDrawing([], arrow)).toEqual([arrow])
    expect(toggleDrawing([arrow], circle)).toEqual([arrow, circle])
  })

  it('removes the same Drawing drawn again', () => {
    expect(toggleDrawing([arrow, circle], { from: 'e2', to: 'e4', brush: 'green' })).toEqual([circle])
    expect(toggleDrawing([arrow, circle], { from: 'd5', brush: 'red' })).toEqual([arrow])
  })

  it('recolours a Drawing drawn again with another brush, in its place', () => {
    expect(toggleDrawing([arrow, circle], { from: 'e2', to: 'e4', brush: 'blue' })).toEqual([
      { from: 'e2', to: 'e4', brush: 'blue' },
      circle,
    ])
  })

  it('tells an arrow from a circle on its square, and an arrow from the one coming back', () => {
    expect(toggleDrawing([arrow], { from: 'e2', brush: 'green' })).toEqual([arrow, { from: 'e2', brush: 'green' }])
    expect(toggleDrawing([arrow], { from: 'e4', to: 'e2', brush: 'green' })).toEqual([
      arrow,
      { from: 'e4', to: 'e2', brush: 'green' },
    ])
  })
})
