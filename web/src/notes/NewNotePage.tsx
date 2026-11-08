import { Alert, Box, Button, Group, SegmentedControl, Stack, Text, Textarea, TextInput, Title } from '@mantine/core'
import { useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { Board } from '../board'
import { gameFromMoves, parsePgn, pgnFromMoves, plyLabel, START_FEN, validateFen, type LegalMove } from '../chess/chess'
import { errorMessage } from '../errors'
import { suggestedName } from './details'
import styles from './Notes.module.css'
import { useCreateNote } from './queries'

type Source = 'pgn' | 'play' | 'position'

const MAX_NAME_LENGTH = 200

// Creating a Note has no design (#6): a page in the house style with three
// ways to start. The client validates the PGN; the API checks only its size.
export function NewNotePage() {
  const [source, setSource] = useState<Source>('pgn')
  const [name, setName] = useState('')
  const [pgn, setPgn] = useState('')
  const [moves, setMoves] = useState<LegalMove[]>([])
  const [fen, setFen] = useState(START_FEN)
  const [submitted, setSubmitted] = useState(false)
  const create = useCreateNote()
  const navigate = useNavigate()

  const pasted = pgn.trim() === '' ? null : parsePgn(pgn)
  const placeholderName = source === 'pgn' && pasted?.ok ? suggestedName(pasted.value.tags) : null
  const finalName = name.trim() || placeholderName || ''
  const nameError = submitted && finalName === '' ? 'Give the note a name' : undefined

  // What would be saved, or why it can't be.
  function draft(): { ok: true; pgn: string; startFen: string | null } | { ok: false; error: string } {
    switch (source) {
      case 'pgn': {
        if (!pasted) return { ok: false, error: 'Paste a game in PGN.' }
        if (!pasted.ok) return pasted
        const startFen = pasted.value.startFen === START_FEN ? null : pasted.value.startFen
        return { ok: true, pgn, startFen }
      }
      case 'play': {
        const result = pgnFromMoves(
          START_FEN,
          moves.map((move) => move.san),
        )
        return result.ok ? { ok: true, pgn: result.value, startFen: null } : result
      }
      case 'position': {
        const valid = validateFen(fen)
        if (!valid.ok) return { ok: false, error: 'Set up a legal position first.' }
        const result = pgnFromMoves(fen, [])
        return result.ok ? { ok: true, pgn: result.value, startFen: fen === START_FEN ? null : fen } : result
      }
    }
  }

  const current = draft()

  function submit() {
    setSubmitted(true)
    if (!current.ok || finalName === '') return
    create.mutate(
      { name: finalName, pgn: current.pgn, startFen: current.startFen },
      { onSuccess: (note) => void navigate({ to: '/notes/$noteId', params: { noteId: String(note.id) } }) },
    )
  }

  return (
    <div className={styles.newNote}>
      <form
        noValidate
        onSubmit={(event) => {
          event.preventDefault()
          submit()
        }}
      >
        <Stack gap="lg">
          <Title order={1}>New note</Title>
          <SegmentedControl
            fullWidth
            value={source}
            onChange={(value) => setSource(value as Source)}
            aria-label="Start from"
            data={[
              { value: 'pgn', label: 'Paste a PGN' },
              { value: 'play', label: 'Play moves' },
              { value: 'position', label: 'Set up a position' },
            ]}
          />

          {source === 'pgn' && (
            <Textarea
              label="PGN"
              description="A game exported from a database or another site."
              autosize
              minRows={8}
              maxRows={18}
              value={pgn}
              onChange={(event) => setPgn(event.currentTarget.value)}
              error={(submitted || (pasted && !pasted.ok)) && !current.ok ? current.error : undefined}
              styles={{ input: { fontFamily: 'var(--mantine-font-family-monospace)', fontSize: '14px' } }}
            />
          )}

          {source === 'play' && (
            <PlayMoves moves={moves} onChange={setMoves} error={submitted && !current.ok ? current.error : null} />
          )}

          {source === 'position' && (
            <Box className={styles.newBoard}>
              <Board mode="setup" fen={fen} onFenChange={(next) => setFen(next)} />
            </Box>
          )}

          <TextInput
            label="Name"
            value={name}
            placeholder={placeholderName ?? undefined}
            onChange={(event) => setName(event.currentTarget.value)}
            maxLength={MAX_NAME_LENGTH}
            error={nameError}
          />

          {create.isError && (
            <Alert color="red" title="Could not create the note">
              {errorMessage(create.error)}
            </Alert>
          )}

          <Group justify="flex-end">
            <Button type="submit" loading={create.isPending}>
              Create note
            </Button>
          </Group>
        </Stack>
      </form>
    </div>
  )
}

function PlayMoves({
  moves,
  onChange,
  error,
}: {
  moves: LegalMove[]
  onChange: (moves: LegalMove[]) => void
  error: string | null
}) {
  const played = gameFromMoves(
    START_FEN,
    moves.map((move) => move.san),
  )
  const labels = played.ok ? played.value.plies.slice(1).map(plyLabel) : []

  return (
    <Stack gap="md">
      <Box className={styles.newBoard}>
        <Board
          mode="play"
          fen={moves.at(-1)?.fen ?? START_FEN}
          lastMove={moves.at(-1)}
          onMove={(move) => onChange([...moves, move])}
        />
      </Box>
      <Text className={styles.playedMoves} aria-live="polite">
        {labels.length > 0 ? labels.join(' ') : 'Drag or click a piece to play a move. With no moves, the note studies the start position.'}
      </Text>
      <Group gap="xs">
        <Button variant="default" size="xs" disabled={moves.length === 0} onClick={() => onChange(moves.slice(0, -1))}>
          Take back
        </Button>
        <Button variant="default" size="xs" disabled={moves.length === 0} onClick={() => onChange([])}>
          Start over
        </Button>
      </Group>
      {error && (
        <Text c="accent" size="sm" role="alert">
          {error}
        </Text>
      )}
    </Stack>
  )
}
