import { Box, Button, Group, SegmentedControl, Stack, Text, Textarea, TextInput, Title } from '@mantine/core'
import { useState, type ReactNode } from 'react'
import { Board } from '../board'
import { gameFromMoves, plyLabel, START_FEN, validateFen, type LegalMove, type Result } from '../chess/chess'
import { importPgn, tagRecord, type TagPair } from '../chess/pgn'
import { addMove, newTree, type MoveId, type MoveTree } from '../chess/tree'
import { suggestedName } from './details'
import type { NoteStart } from './newNote'
import styles from './Notes.module.css'

type Source = 'pgn' | 'play' | 'position'

const MAX_NAME_LENGTH = 200

type Props = {
  title: string
  submitLabel: string
  onSubmit: (input: NoteStart) => void
  pending?: boolean
  /** Why the last submit failed, shown above the button. */
  error?: ReactNode
  /** More fields, after the name. */
  children?: ReactNode
}

// Starting a Note has no design (#6): a page in the house style with three
// ways to start. The client reads the PGN, with its Variations and writing,
// into a tree of Moves; the API trusts it (ADR 0009).
// Shared by the New note page and a Guest's start (#13), so both start alike.
export function NoteStartForm({ title, submitLabel, onSubmit, pending = false, error, children }: Props) {
  const [source, setSource] = useState<Source>('pgn')
  const [name, setName] = useState('')
  const [pgn, setPgn] = useState('')
  const [moves, setMoves] = useState<LegalMove[]>([])
  const [fen, setFen] = useState(START_FEN)
  const [submitted, setSubmitted] = useState(false)

  const pasted = pgn.trim() === '' ? null : importPgn(pgn)
  const placeholderName = source === 'pgn' && pasted?.ok ? suggestedName(tagRecord(pasted.value.tags)) : null
  const finalName = name.trim() || placeholderName || ''
  const nameError = submitted && finalName === '' ? 'Give the note a name' : undefined

  // What would be saved, or why it can't be.
  function draft(): Result<Omit<NoteStart, 'name'>> {
    switch (source) {
      case 'pgn': {
        if (!pasted) return { ok: false, error: 'Paste a game in PGN.' }
        if (!pasted.ok) return pasted
        const { startFen, tags, tree, writing } = pasted.value
        return { ok: true, value: { startFen: startFen === START_FEN ? null : startFen, tags, tree, writing } }
      }
      case 'play': {
        const tree = playedTree(moves.map((move) => move.san))
        return tree.ok ? { ok: true, value: { startFen: null, tags: [], tree: tree.value, writing: new Map() } } : tree
      }
      case 'position': {
        const valid = validateFen(fen)
        if (!valid.ok) return { ok: false, error: 'Set up a legal position first.' }
        const tags: TagPair[] = fen === START_FEN ? [] : [['SetUp', '1'], ['FEN', fen]]
        return { ok: true, value: { startFen: fen === START_FEN ? null : fen, tags, tree: newTree(fen, 0), writing: new Map() } }
      }
    }
  }

  const current = draft()

  function submit() {
    setSubmitted(true)
    if (!current.ok || finalName === '') return
    onSubmit({ name: finalName, ...current.value })
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
          <Title order={1}>{title}</Title>
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

          {children}

          {error}

          <Group justify="flex-end">
            <Button type="submit" loading={pending}>
              {submitLabel}
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
          fen={START_FEN}
          moves={moves}
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

/** The Main line of moves played from the start. */
function playedTree(sans: readonly string[]): Result<MoveTree> {
  let tree = newTree(START_FEN, 0)
  let parent: MoveId = 0
  for (const san of sans) {
    const added = addMove(tree, parent, san, parent + 1)
    if (!added.ok) return added
    tree = added.value.tree
    parent = added.value.id
  }
  return { ok: true, value: tree }
}
