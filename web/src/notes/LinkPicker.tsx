import { Button, Loader, Text, TextInput } from '@mantine/core'
import { useDebouncedValue } from '@mantine/hooks'
import { useId, useState, type KeyboardEvent } from 'react'
import type { NoteSearchResult } from '../api'
import { errorMessage } from '../errors'
import { SearchIcon } from '../header/icons'
import styles from './LinkPicker.module.css'
import { useNoteSearch } from './queries'
import { resultDetails } from './quickFind'

type Props = {
  /** The Note being written on, left out of the results. */
  noteId: number
  onPick: (target: number, label: string) => void
}

// The picker opened by typing [[ in a Comment or Body: fuzzy-find one of the
// user's Notes by name, players or Folder, and optionally give the Link a
// label. Same-named Notes are told apart by their Folder path, or at the root
// by their players and date.
export function LinkPicker({ noteId, onPick }: Props) {
  const ids = useId()
  const [query, setQuery] = useState('')
  const [label, setLabel] = useState('')
  const [debounced] = useDebouncedValue(query.trim(), 150)
  const search = useNoteSearch(debounced)
  const results = debounced === '' ? [] : (search.data ?? []).filter((note) => note.id !== noteId)
  const [active, setActive] = useState({ for: '', index: 0 })
  const activeIndex = active.for === debounced ? Math.min(active.index, results.length - 1) : 0
  const optionId = (index: number) => `${ids}-option-${index}`

  function pick(result: NoteSearchResult) {
    onPick(result.id, label)
  }

  // Arrows move through the results from either field; Enter links the highlighted one.
  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (results.length === 0) return
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      const step = event.key === 'ArrowDown' ? 1 : -1
      setActive({ for: debounced, index: (activeIndex + step + results.length) % results.length })
    } else if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
      event.preventDefault()
      pick(results[activeIndex])
    }
  }

  return (
    <div className={styles.picker}>
      <div className={styles.inputRow}>
        <SearchIcon />
        <input
          className={styles.input}
          value={query}
          onChange={(event) => setQuery(event.currentTarget.value)}
          onKeyDown={onKeyDown}
          aria-label="Find a note to link"
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

      {debounced === '' && <p className={styles.state}>Type to find the note to link.</p>}
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
        <p className={styles.state} role="status">
          No other notes match “{debounced}”.
        </p>
      )}

      {results.length > 0 && (
        <ul className={styles.options} id={`${ids}-results`} role="listbox" aria-label="Notes to link">
          {results.map((result, index) => {
            const details = resultDetails(result)
            return (
              <li
                key={result.id}
                id={optionId(index)}
                role="option"
                aria-selected={index === activeIndex}
                className={styles.option}
                onMouseMove={() => index !== activeIndex && setActive({ for: debounced, index })}
                // Keep focus in the field, so the picker's focus trap doesn't jump.
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => pick(result)}
              >
                <span className={styles.name}>{result.name}</span>
                {details && <span className={styles.details}>{details}</span>}
              </li>
            )
          })}
        </ul>
      )}

      <TextInput
        label="Label"
        description="Optional. Shown instead of the note's name."
        value={label}
        onChange={(event) => setLabel(event.currentTarget.value)}
        onKeyDown={onKeyDown}
        maxLength={200}
        classNames={{ label: styles.fieldLabel, description: styles.fieldDescription }}
      />
      <div className={styles.footer}>↑↓ to move · ↵ to link · Esc to cancel</div>
    </div>
  )
}
