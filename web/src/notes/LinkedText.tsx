import { VisuallyHidden } from '@mantine/core'
import { Link } from '@tanstack/react-router'
import { DELETED_NOTE, type ShownPart } from './links'
import styles from './Notes.module.css'

// A Comment or Body with its Links: each in the accent colour with a dotted
// underline (design/screens/Note.dc.html), opening its target. An Unresolved
// Link has no design; it stays in the text, muted and struck through.
export function LinkedText({ parts }: { parts: readonly ShownPart[] }) {
  return parts.map((part, index) => {
    if (part.link === null) return part.text
    if (part.link.status === 'unresolved') {
      return (
        <span key={index} className={styles.unresolved} title="The note this linked to was deleted">
          {part.text}
          {part.text !== DELETED_NOTE && <VisuallyHidden> (deleted note)</VisuallyHidden>}
        </span>
      )
    }
    return (
      <Link key={index} to="/notes/$noteId" params={{ noteId: String(part.link.target) }} className={styles.link}>
        {part.text}
      </Link>
    )
  })
}
