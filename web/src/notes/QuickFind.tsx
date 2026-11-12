import { Button, Loader, Text, UnstyledButton } from '@mantine/core'
import { useDebouncedValue, useDisclosure, useHotkeys, useOs } from '@mantine/hooks'
import { useNavigate } from '@tanstack/react-router'
import { useId, useState, type KeyboardEvent } from 'react'
import type { NoteSearchResult } from '../api'
import { errorMessage } from '../errors'
import { SearchIcon } from '../header/icons'
import { ResponsivePanel, useOverlaySize } from '../overlay'
import { useNoteSearch } from './noteSearch'
import { highlight, resultDetails } from './quickFindResults'
import styles from './QuickFind.module.css'

// The "Find a note" box in the header (an icon on mobile) and the overlay it
// opens, also on ⌘K / Ctrl+K: fuzzy-find a Note by name, players or Folder
// and open it (design/screenshots/QuickFind*.png), with its Folder path (or,
// at the root, its players and date) under each result.
export function QuickFind() {
  const size = useOverlaySize()
  const os = useOs()
  const [opened, { open, close }] = useDisclosure(false)
  // Also while typing in a Comment or Body, so no tags are ignored.
  useHotkeys([['mod+K', open]], [])
  const shortcut = os === 'macos' || os === 'ios' ? '⌘K' : 'Ctrl K'

  return (
    <>
      <UnstyledButton className={styles.findBox} onClick={open} aria-keyshortcuts="Meta+K Control+K">
        <SearchIcon />
        <span className={styles.findLabel}>Find a note</span>
        <kbd className={styles.shortcut}>{shortcut}</kbd>
      </UnstyledButton>
      <UnstyledButton className={styles.findIcon} onClick={open} aria-label="Find a note">
        <SearchIcon />
      </UnstyledButton>
      <ResponsivePanel size={size} opened={opened} onClose={close} label="Find a note">
        {opened && <FindNotes onDone={close} />}
      </ResponsivePanel>
    </>
  )
}

function FindNotes({ onDone }: { onDone: () => void }) {
  const navigate = useNavigate()
  const ids = useId()
  const [query, setQuery] = useState('')
  const [debounced] = useDebouncedValue(query.trim(), 150)
  const search = useNoteSearch(debounced)
  const results = debounced === '' ? [] : (search.data ?? [])
  // The highlighted row goes back to the top whenever the results change.
  const [active, setActive] = useState({ for: '', index: 0 })
  const activeIndex = active.for === debounced ? Math.min(active.index, results.length - 1) : 0
  const optionId = (index: number) => `${ids}-option-${index}`

  function openNote(result: NoteSearchResult) {
    onDone()
    void navigate({ to: '/notes/$noteId', params: { noteId: String(result.id) } })
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (results.length === 0) return
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      const step = event.key === 'ArrowDown' ? 1 : -1
      setActive({ for: debounced, index: (activeIndex + step + results.length) % results.length })
    } else if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
      event.preventDefault()
      openNote(results[activeIndex])
    }
  }

  return (
    <div className={styles.find}>
      <div className={styles.inputRow}>
        <SearchIcon />
        <input
          className={styles.input}
          value={query}
          onChange={(event) => setQuery(event.currentTarget.value)}
          onKeyDown={onKeyDown}
          aria-label="Find a note"
          placeholder="A note's name or a player"
          role="combobox"
          aria-expanded={results.length > 0}
          aria-controls={`${ids}-results`}
          aria-autocomplete="list"
          aria-activedescendant={results.length > 0 ? optionId(activeIndex) : undefined}
          autoComplete="off"
          spellCheck={false}
          maxLength={100}
          data-autofocus
        />
      </div>

      {debounced === '' && (
        <Text className={styles.state} size="sm" c="var(--cn-muted)">
          Type to find a note by its name or the players in its game.
        </Text>
      )}
      {debounced !== '' && search.isPending && (
        <div className={styles.state}>
          <Loader size="sm" aria-label="Finding notes" />
        </div>
      )}
      {debounced !== '' && search.isError && (
        <div className={styles.state}>
          <Text size="sm" role="alert">
            {errorMessage(search.error)}
          </Text>
          <Button variant="default" size="xs" onClick={() => void search.refetch()}>
            Try again
          </Button>
        </div>
      )}
      {debounced !== '' && search.isSuccess && results.length === 0 && (
        <Text className={styles.state} size="sm" c="var(--cn-muted)" role="status">
          No notes match “{debounced}”.
        </Text>
      )}

      {results.length > 0 && (
      <div className={styles.results}>
        <div className={styles.eyebrow} aria-hidden="true">
          Best matches
        </div>
        <ul className={styles.options} id={`${ids}-results`} role="listbox" aria-label="Notes found">
          {results.map((result, index) => (
            <li
              key={result.id}
              id={optionId(index)}
              role="option"
              aria-selected={index === activeIndex}
              className={styles.option}
              onMouseMove={() => index !== activeIndex && setActive({ for: debounced, index })}
              onClick={() => openNote(result)}
            >
              <ResultText query={debounced} result={result} />
            </li>
          ))}
        </ul>
      </div>
      )}

      <div className={styles.footer}>
        <span>↑↓ to move</span>
        <span>↵ to open</span>
        <UnstyledButton className={styles.close} onClick={onDone}>
          Esc to close
        </UnstyledButton>
      </div>
    </div>
  )
}

function ResultText({ query, result }: { query: string; result: NoteSearchResult }) {
  const name = highlight(query, result.name)
  const details = resultDetails(result)
  // Mark the players only when the name doesn't explain the match.
  const nameMatched = name.some((segment) => segment.match)

  return (
    <>
      <span className={styles.name}>
        <Marked segments={name} />
      </span>
      {details && (
        <span className={styles.details}>
          {nameMatched ? details : <Marked segments={highlight(query, details)} />}
        </span>
      )}
    </>
  )
}

function Marked({ segments }: { segments: ReturnType<typeof highlight> }) {
  return segments.map((segment, index) =>
    segment.match ? (
      <mark key={index} className={styles.match}>
        {segment.text}
      </mark>
    ) : (
      segment.text
    ),
  )
}
