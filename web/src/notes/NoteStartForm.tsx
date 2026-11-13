import { Button, Group, Loader, SegmentedControl, Stack, Text, Textarea, TextInput, Title } from '@mantine/core'
import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { START_FEN, validateFen, type Result } from '../chess/chess'
import { loadPgnImport, tagRecord, type ImportedNote, type PgnImport, type TagPair } from '../chess/pgn'
import { newTree } from '../chess/tree'
import { suggestedName } from './details'
import type { NoteStart } from './newNote'
import styles from './Notes.module.css'

type Source = 'pgn' | 'fen'

const MAX_NAME_LENGTH = 200

const READER_FAILED = 'Could not load the PGN reader. Check your connection and try again. What you typed is kept.'

type Props = {
  title: string
  submitLabel: string
  onSubmit: (input: NoteStart) => void
  pending?: boolean
  /** Why the last submit failed, shown above the button. */
  error?: ReactNode
  /** More fields, after the name. */
  children?: ReactNode
  /** Shown as a Cancel button beside submit, e.g. to go back to the Note being studied. */
  onCancel?: () => void
}

// Import… (#106), which has no design (#6): a page in the house style with
// two ways to bring in a Note: a game in PGN or a position in FEN. (New note
// itself starts on a blank board, and Edit position sets one up, #108.) The client
// reads the PGN, with its Variations and writing, into a tree of Moves; the
// API trusts it (ADR 0009).
// Shared by the Import page and a Guest's Import… (#13), so both import alike.
export function NoteStartForm({ title, submitLabel, onSubmit, pending = false, error, children, onCancel }: Props) {
  const [source, setSource] = useState<Source>('pgn')
  const [name, setName] = useState('')
  const [pgn, setPgn] = useState('')
  const [fenText, setFenText] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [reader, loadReader] = usePgnReader()
  // Create was pressed while the PGN reader was still loading.
  const [waiting, setWaiting] = useState(false)

  const hasPgn = pgn.trim() !== ''
  // The preview waits for the reader rather than showing an error.
  const reading = source === 'pgn' && hasPgn && reader.status === 'loading'
  const { pasted, placeholderName, finalName, current } = read(reader.status === 'ready' ? reader.importPgn : null)
  // Until the PGN is read, its tags may yet name the Note.
  const unread = source === 'pgn' && hasPgn && reader.status !== 'ready'
  const nameError = submitted && !unread && finalName === '' ? 'Give the note a name' : undefined

  // What the form holds, read with `importPgn` (null while it isn't loaded):
  // the pasted game, the name it would get, and what would be saved or why it can't be.
  function read(importPgn: PgnImport | null) {
    const pasted = hasPgn && importPgn ? importPgn(pgn) : null
    const placeholderName = source === 'pgn' && pasted?.ok ? suggestedName(tagRecord(pasted.value.tags)) : null
    const finalName = name.trim() || placeholderName || ''
    return { pasted, placeholderName, finalName, current: draft(pasted) }
  }

  function draft(pasted: Result<ImportedNote> | null): Result<Omit<NoteStart, 'name'>> {
    switch (source) {
      case 'pgn': {
        if (!hasPgn) return { ok: false, error: 'Paste a game in PGN.' }
        if (!pasted) return { ok: false, error: reader.status === 'failed' ? READER_FAILED : 'Reading the PGN…' }
        if (!pasted.ok) return pasted
        const { startFen, tags, tree, writing } = pasted.value
        return { ok: true, value: { startFen: startFen === START_FEN ? null : startFen, tags, tree, writing } }
      }
      case 'fen': {
        const typed = fenText.trim().replace(/\s+/g, ' ')
        if (typed === '') return { ok: false, error: 'Paste a position in FEN.' }
        const valid = validateFen(typed)
        return valid.ok ? atPosition(typed) : { ok: false, error: valid.error }
      }
    }
  }

  async function submit() {
    setSubmitted(true)
    let ready = { finalName, current }
    if (unread) {
      // Create waits for the reader, then reads what was there when pressed.
      setWaiting(true)
      const importPgn = await loadReader()
      setWaiting(false)
      if (!importPgn) return
      ready = read(importPgn)
    }
    if (!ready.current.ok || ready.finalName === '') return
    onSubmit({ name: ready.finalName, ...ready.current.value })
  }

  const fenError =
    source === 'fen' && (submitted || fenText.trim() !== '') && !current.ok ? current.error : undefined

  const pgnError =
    reader.status === 'failed'
      ? READER_FAILED
      : !reading && (submitted || (pasted && !pasted.ok)) && !current.ok
        ? current.error
        : undefined

  return (
    <div className={styles.newNote}>
      <form
        noValidate
        onSubmit={(event) => {
          event.preventDefault()
          void submit()
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
              { value: 'pgn', label: 'PGN' },
              { value: 'fen', label: 'FEN' },
            ]}
          />

          {source === 'pgn' && (
            <Stack gap="xs">
              <Textarea
                label="PGN"
                description="A game exported from a database or another site."
                autosize
                minRows={8}
                maxRows={18}
                value={pgn}
                onChange={(event) => setPgn(event.currentTarget.value)}
                onFocus={() => {
                  if (reader.status === 'failed') void loadReader()
                }}
                error={pgnError}
                styles={{ input: { fontFamily: 'var(--mantine-font-family-monospace)', fontSize: '14px' } }}
              />
              {reading && (
                <Group gap="xs" role="status">
                  <Loader size="xs" />
                  <Text size="sm" c="dimmed">
                    Reading the PGN…
                  </Text>
                </Group>
              )}
            </Stack>
          )}

          {source === 'fen' && (
            <TextInput
              label="FEN"
              description="A position exported from a database or another site. The note studies it with no moves."
              value={fenText}
              onChange={(event) => setFenText(event.currentTarget.value)}
              error={fenError}
              spellCheck={false}
              autoComplete="off"
              styles={{ input: { fontFamily: 'var(--mantine-font-family-monospace)', fontSize: '14px' } }}
            />
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
            {onCancel && (
              <Button variant="default" onClick={onCancel}>
                Cancel
              </Button>
            )}
            <Button type="submit" loading={pending || waiting}>
              {submitLabel}
            </Button>
          </Group>
        </Stack>
      </form>
    </div>
  )
}

type PgnReader = { status: 'loading' } | { status: 'ready'; importPgn: PgnImport } | { status: 'failed' }

/**
 * The PGN reader, which loads as its own chunk (#84) as soon as the form
 * opens, and a way to load it again: it answers the reader, or null when it
 * failed to load (offline, say).
 */
function usePgnReader(): [PgnReader, () => Promise<PgnImport | null>] {
  const [reader, setReader] = useState<PgnReader>({ status: 'loading' })
  const load = useCallback(
    () =>
      loadPgnImport().then(
        (importPgn) => {
          setReader({ status: 'ready', importPgn })
          return importPgn
        },
        () => {
          setReader({ status: 'failed' })
          return null
        },
      ),
    [],
  )
  useEffect(() => {
    void load()
  }, [load])
  return [
    reader,
    useCallback(() => {
      setReader({ status: 'loading' })
      return load()
    }, [load]),
  ]
}

/** A Note at a Position, with no Moves. */
function atPosition(fen: string): Result<Omit<NoteStart, 'name'>> {
  const tags: TagPair[] = fen === START_FEN ? [] : [['SetUp', '1'], ['FEN', fen]]
  return { ok: true, value: { startFen: fen === START_FEN ? null : fen, tags, tree: newTree(fen, 0), writing: new Map() } }
}
