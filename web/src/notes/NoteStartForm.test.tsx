import { MantineProvider } from '@mantine/core'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PgnImport } from '../chess/pgn'
import { importPgn } from '../chess/pgnImport'
import { theme } from '../theme'
import type { NoteStart } from './newNote'
import { NoteStartForm } from './NoteStartForm'

// The PGN reader loads as its own chunk (#84); here each test decides when,
// and whether, it arrives.
const loadPgnImport = vi.fn<() => Promise<PgnImport>>()
vi.mock('../chess/pgn', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../chess/pgn')>()),
  loadPgnImport: () => loadPgnImport(),
}))

const GAME = '[White "Lovelace, Ada"]\n[Black "Hopper, Grace"]\n\n1. e4 e5 (1... c5 $1 {Sharp} {The Sicilian.}) 2. Nf3 *'

function deferred() {
  let resolve!: (value: PgnImport) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<PgnImport>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

function renderForm() {
  const onSubmit = vi.fn<(input: NoteStart) => void>()
  render(
    <MantineProvider theme={theme}>
      <NoteStartForm title="New note" submitLabel="Create note" onSubmit={onSubmit} />
    </MantineProvider>,
  )
  return onSubmit
}

async function paste(text: string) {
  await userEvent.click(screen.getByRole('textbox', { name: 'PGN' }))
  await userEvent.paste(text)
}

beforeEach(() => {
  loadPgnImport.mockReset()
})

describe('NoteStartForm', () => {
  it('shows the preview as pending while the PGN reader loads, and Create waits for it', async () => {
    const load = deferred()
    loadPgnImport.mockReturnValue(load.promise)
    const onSubmit = renderForm()
    expect(loadPgnImport).toHaveBeenCalled()

    await paste(GAME)
    expect(screen.getByRole('status')).toHaveTextContent('Reading the PGN…')
    expect(screen.getByRole('textbox', { name: 'PGN' })).not.toHaveAttribute('aria-invalid', 'true')

    await userEvent.click(screen.getByRole('button', { name: 'Create note' }))
    expect(onSubmit).not.toHaveBeenCalled()
    expect(screen.queryByText('Give the note a name')).not.toBeInTheDocument()

    load.resolve(importPgn)
    await waitFor(() => expect(onSubmit).toHaveBeenCalled())
    const input = onSubmit.mock.calls[0][0]
    expect(input.name).toBe('Lovelace v. Hopper')
    expect(input.tree.moves.size).toBe(5) // the root and four Moves, one in a Variation
    expect(input.writing.get(3)).toMatchObject({ comment: 'Sharp', body: 'The Sicilian.', moveGlyph: '!' })
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Name' })).toHaveAttribute('placeholder', 'Lovelace v. Hopper')
  })

  it('says when the PGN reader fails to load, keeps what was typed, and tries again on Create', async () => {
    loadPgnImport.mockRejectedValue(new TypeError('Failed to fetch dynamically imported module'))
    const onSubmit = renderForm()

    const pgnField = screen.getByRole('textbox', { name: 'PGN' })
    expect(await screen.findByText(/Could not load the PGN reader/)).toBeInTheDocument()
    await paste(GAME)
    await userEvent.type(screen.getByRole('textbox', { name: 'Name' }), 'Two knights')
    expect(pgnField).toHaveValue(GAME)

    // Still offline: the form says so again and keeps everything.
    await userEvent.click(screen.getByRole('button', { name: 'Create note' }))
    expect(await screen.findByText(/Could not load the PGN reader/)).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
    expect(pgnField).toHaveValue(GAME)
    expect(screen.getByRole('textbox', { name: 'Name' })).toHaveValue('Two knights')

    // Back online.
    loadPgnImport.mockResolvedValue(importPgn)
    await userEvent.click(screen.getByRole('button', { name: 'Create note' }))
    await waitFor(() => expect(onSubmit).toHaveBeenCalled())
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ name: 'Two knights' })
    expect(screen.queryByText(/Could not load the PGN reader/)).not.toBeInTheDocument()
  })
})
