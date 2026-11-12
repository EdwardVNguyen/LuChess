import { Button, Loader, Text } from '@mantine/core'
import { Link } from '@tanstack/react-router'
import { useMemo, type ReactNode } from 'react'
import type { LinkTarget } from '../api'
import { errorMessage } from '../errors'
import { backlinkPlace, connections, DELETED_NOTE } from './links'
import styles from './Notes.module.css'
import { useNoteLinks, usePlies } from './queries'
import { resultDetails } from './quickFindResults'

// The margin of a saved Note (design/screens/Note.dc.html "Connections" and
// "Linked from"): the Notes its Comments and Bodies link to, and the
// Comments and Bodies in other Notes that link to it. Each entry shows the
// players and date where the design shows a Folder path, until #11 adds
// Folders. Reader notes and Sub-variations are not in v1.
export function NoteMargin({ noteId }: { noteId: number }) {
  const plies = usePlies(noteId)
  const links = useNoteLinks(noteId)
  const targets = useMemo(() => connections(plies.data ?? []), [plies.data])
  const found = useMemo(() => new Map((links.data?.targets ?? []).map((t) => [t.id, t])), [links.data])

  const pending = (plies.isPending || links.isPending) && !links.isError
  const failed = links.isError && (
    <div className={styles.marginState}>
      <Text size="sm" role="alert">
        {errorMessage(links.error)}
      </Text>
      <Button variant="default" size="xs" onClick={() => void links.refetch()}>
        Try again
      </Button>
    </div>
  )
  const loading = pending && (
    <div className={styles.marginState}>
      <Loader size="sm" aria-label="Loading links" />
    </div>
  )

  return (
    <>
      <MarginSection title="Connections">
        {failed || loading || (
          <Entries empty="No links yet. Type [[ in a Comment or Body to link another note.">
            {targets.map(({ target: id, label }) => {
              const target = found.get(id)
              return target ? <TargetEntry key={id} target={target} /> : <UnresolvedEntry key={id} label={label} />
            })}
          </Entries>
        )}
      </MarginSection>
      <div className={styles.marginRule} />
      <MarginSection title="Linked from">
        {failed || loading || (
          <Entries empty="No other note links here yet.">
            {links.data?.backlinks.map((backlink) => (
              <li key={`${backlink.noteId}-${backlink.ply}-${backlink.part}`} className={styles.marginEntry}>
                <Link
                  to="/notes/$noteId"
                  params={{ noteId: String(backlink.noteId) }}
                  search={{ ply: backlink.ply }}
                  className={`${styles.link} ${styles.marginLink}`}
                >
                  {backlink.name}
                </Link>
                <span className={styles.marginDetails}>{backlinkPlace(backlink)}</span>
              </li>
            ))}
          </Entries>
        )}
      </MarginSection>
    </>
  )
}

function MarginSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className={styles.marginSection} aria-label={title}>
      <div className={styles.eyebrow}>{title}</div>
      {children}
    </section>
  )
}

function Entries({ empty, children }: { empty: string; children: ReactNode[] | undefined }) {
  if (!children || children.length === 0) return <p className={styles.marginEmpty}>{empty}</p>
  return <ul className={styles.marginEntries}>{children}</ul>
}

function TargetEntry({ target }: { target: LinkTarget }) {
  const details = resultDetails(target)
  return (
    <li className={styles.marginEntry}>
      <Link to="/notes/$noteId" params={{ noteId: String(target.id) }} className={`${styles.link} ${styles.marginLink}`}>
        {target.name}
      </Link>
      {details && <span className={styles.marginDetails}>{details}</span>}
    </li>
  )
}

// A deleted target, shown by the label the text gave it, if any.
function UnresolvedEntry({ label }: { label: string | null }) {
  return (
    <li className={styles.marginEntry}>
      <span className={`${styles.unresolved} ${styles.marginLink}`}>{label ?? DELETED_NOTE}</span>
      <span className={styles.marginDetails}>Deleted. Its links stay in the text, unresolved.</span>
    </li>
  )
}
