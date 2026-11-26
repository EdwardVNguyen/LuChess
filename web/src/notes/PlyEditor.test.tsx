import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { gameFromMoves, START_FEN } from '../chess/chess'
import { NO_WRITING, type Writing } from '../chess/pgn'
import { renderWithTheme } from '../overlay/testUtils'
import { PlyEditor } from './PlyEditor'
import { leavingAsks } from './testUtils'

const result = gameFromMoves(START_FEN, ['e4', 'e5'])
if (!result.ok) throw new Error(result.error)
const game = result.value

function written(fields: Partial<Writing>): Writing {
  return { ...NO_WRITING, ...fields }
}

describe('PlyEditor', () => {
  it('saves a Body when the editor loses focus, and has no Comment editor (#97)', async () => {
    const onSave = vi.fn()
    renderWithTheme(<PlyEditor ply={game.plies[1]} writing={written({ comment: 'Best by test.' })} onSave={onSave} />)

    expect(screen.queryByRole('textbox', { name: /^Comment/ })).not.toBeInTheDocument()
    await userEvent.type(screen.getByRole('textbox', { name: 'Body after 1.e4' }), 'Then Black decides.')
    expect(onSave).not.toHaveBeenCalled()
    await userEvent.tab()
    expect(onSave).toHaveBeenCalledWith({ body: 'Then Black decides.' })
  })

  it('does not save unchanged text, and deletes saved text', async () => {
    const onSave = vi.fn()
    renderWithTheme(<PlyEditor ply={game.plies[1]} writing={written({ body: 'Then…' })} onSave={onSave} />)

    await userEvent.click(screen.getByRole('textbox', { name: 'Body after 1.e4' }))
    await userEvent.tab()
    expect(onSave).not.toHaveBeenCalled()

    await userEvent.click(screen.getByRole('button', { name: 'Delete' }))
    expect(onSave).toHaveBeenCalledWith({ body: null })
  })

  it('sets, replaces and clears a Glyph', async () => {
    const onSave = vi.fn()
    function Saving() {
      const [writing, setWriting] = useState<Writing | undefined>(undefined)
      return (
        <PlyEditor
          ply={game.plies[2]}
          writing={writing}
          onSave={(change) => {
            onSave(change)
            setWriting(written({ ...writing, ...change }))
          }}
        />
      )
    }
    renderWithTheme(<Saving />)

    await userEvent.click(screen.getByRole('button', { name: 'Dubious move' }))
    expect(onSave).toHaveBeenLastCalledWith({ moveGlyph: '?!' })
    expect(screen.getByRole('button', { name: 'Dubious move' })).toHaveAttribute('aria-pressed', 'true')
    await userEvent.click(screen.getByRole('button', { name: 'Blunder' }))
    expect(onSave).toHaveBeenLastCalledWith({ moveGlyph: '??' })
    expect(screen.getByRole('button', { name: 'Dubious move' })).toHaveAttribute('aria-pressed', 'false')
    await userEvent.click(screen.getByRole('button', { name: 'Blunder' }))
    expect(onSave).toHaveBeenLastCalledWith({ moveGlyph: null })
  })

  it('offers only a position Glyph at ply 0', () => {
    renderWithTheme(<PlyEditor ply={game.plies[0]} writing={undefined} onSave={() => {}} />)
    expect(screen.queryByRole('group', { name: 'Move Glyph' })).not.toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Position Glyph' })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Body opening the note' })).toBeInTheDocument()
  })
})

describe('Leaving with an unsaved Body (#120)', () => {
  // Keeps what is saved, as a Note or a Guest's page does.
  function Saving() {
    const [writing, setWriting] = useState<Writing | undefined>(undefined)
    return <PlyEditor ply={game.plies[1]} writing={writing} onSave={(change) => setWriting(written({ ...writing, ...change }))} />
  }

  it('asks while the draft differs from what is saved, and not once it is saved', async () => {
    renderWithTheme(<Saving />)
    expect(leavingAsks()).toBe(false)

    await userEvent.type(screen.getByRole('textbox', { name: 'Body after 1.e4' }), 'Then Black decides.')
    expect(leavingAsks()).toBe(true)
    await userEvent.tab()
    expect(leavingAsks()).toBe(false)
  })

  it('does not ask once Escape undoes the draft, or for whitespace alone', async () => {
    renderWithTheme(<Saving />)
    const body = screen.getByRole('textbox', { name: 'Body after 1.e4' })

    await userEvent.type(body, 'Then…')
    expect(leavingAsks()).toBe(true)
    await userEvent.type(body, '{Escape}')
    expect(body).toHaveValue('')
    expect(leavingAsks()).toBe(false)

    await userEvent.type(body, '   ')
    expect(leavingAsks()).toBe(false)
  })

  it('listens for beforeunload only while something is unsaved', async () => {
    const listen = vi.spyOn(window, 'addEventListener')
    const unlisten = vi.spyOn(window, 'removeEventListener')
    const unloads = (spy: typeof listen) => spy.mock.calls.filter(([type]) => type === 'beforeunload').length
    renderWithTheme(<Saving />)
    expect(unloads(listen)).toBe(0)

    await userEvent.type(screen.getByRole('textbox', { name: 'Body after 1.e4' }), 'Then.')
    expect(unloads(listen)).toBe(1)
    await userEvent.tab()
    expect(unloads(unlisten)).toBe(1)
    listen.mockRestore()
    unlisten.mockRestore()
  })
})
