import { UnstyledButton } from '@mantine/core'
import { useLayoutEffect, useRef } from 'react'
import { PaneChevronIcon } from './icons'
import styles from './Notes.module.css'
import type { CollapsiblePane } from './paneCollapse'

const names: Record<CollapsiblePane, string> = {
  sidebar: 'the sidebar',
  margin: 'the margin',
}

type PaneToggleProps = {
  pane: CollapsiblePane
  collapsed: boolean
  onToggle: () => void
  /** The id of the pane it opens and collapses. */
  controls: string
  /** Takes focus each time this counts up (useCollapsible). */
  focusRequests: number
}

// The button at the top of a pane that collapses it, or, on the collapsed
// pane's rail, expands it again. Desktop only (#61).
export function PaneToggle({ pane, collapsed, onToggle, controls, focusRequests }: PaneToggleProps) {
  const ref = useRef<HTMLButtonElement>(null)
  useLayoutEffect(() => {
    if (focusRequests > 0) ref.current?.focus()
  }, [focusRequests])

  const label = `${collapsed ? 'Expand' : 'Collapse'} ${names[pane]}`
  // The sidebar sits at the left: it collapses leftwards and expands rightwards. The margin, the reverse.
  const pointing = (pane === 'sidebar') === collapsed ? 'right' : 'left'
  return (
    <UnstyledButton
      ref={ref}
      className={styles.paneToggle}
      aria-label={label}
      title={label}
      aria-expanded={!collapsed}
      aria-controls={controls}
      onClick={onToggle}
    >
      <PaneChevronIcon pointing={pointing} />
    </UnstyledButton>
  )
}
