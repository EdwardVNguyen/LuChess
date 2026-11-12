import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { gameFromMoves, START_FEN } from '../chess/chess'
import { NO_WRITING, type Writing } from '../chess/pgn'
import { renderWithTheme } from '../overlay/testUtils'
import { PlyEditor } from './PlyEditor'

const result = gameFromMoves(START_FEN, ['e4', 'e5'])
if (!result.ok) throw new Error(result.error)
const game = result.value

function written(fields: Partial<Writing>): Writing {
  return { ...NO_WRITING, ...fields }
}

describe('PlyEditor', () => {
  it('saves a Comment when the editor loses focus', async () => {
    const onSave = vi.fn()
    renderWithTheme(<PlyEditor ply={game.plies[1]} writing={undefined} onSave={onSave} />)

    await userEvent.type(screen.getByRole('textbox', { name: 'Comment on 1.e4' }), 'Best by test.')
    expect(onSave).not.toHaveBeenCalled()
    await userEvent.tab()
    expect(onSave).toHaveBeenCalledWith({ comment: 'Best by test.' })
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
