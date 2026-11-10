import {
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent,
  type PointerEvent,
  type Ref,
} from 'react'
import styles from './Notes.module.css'
import { collapseBeyond, isCollapsible, paneCollapse, railWidth, type Collapsed, type PaneCollapseStore } from './paneCollapse'
import { fitNote, fitSidebar, paneWidths, type ChosenWidths, type Pane, type PaneFit, type PaneWidthStore } from './paneWidths'

const labels: Record<Pane, string> = {
  sidebar: 'Resize the sidebar',
  board: 'Resize the board',
  margin: 'Resize the margin',
}

// How far an arrow key moves an edge, and with Shift held.
const step = 8
const bigStep = 40

type PaneEdgeProps = {
  pane: Pane
  /** For the board and the margin: whether the Note has a margin beside the moves. */
  hasMargin?: boolean
  store?: PaneWidthStore
  collapseStore?: PaneCollapseStore
  /** For the sidebar and the margin: called when a drag has snapped the pane shut. */
  onCollapsed?: () => void
}

// The draggable edge of a pane, on desktop only (#51). It sits between two
// columns of a flex row and sets its pane's width on that row, as
// `--sidebar-width`, `--board-width` or `--margin-width`. Dragging the
// sidebar's or the margin's edge well past its minimum collapses it (#61).
export function PaneEdge({
  pane,
  hasMargin = false,
  store = paneWidths,
  collapseStore = paneCollapse,
  onCollapsed,
}: PaneEdgeProps) {
  const ref = useRef<HTMLDivElement>(null)
  const chosen = useSyncExternalStore(store.subscribe, store.get)
  const collapsed = useSyncExternalStore(collapseStore.subscribe, collapseStore.get)
  const [space, setSpace] = useState<number | null>(null)

  // The row's width, so the panes leave the moves room as the window narrows.
  useLayoutEffect(() => {
    const row = ref.current?.parentElement
    if (!row) return
    const observer = new ResizeObserver(([entry]) => setSpace(entry.contentRect.width))
    observer.observe(row)
    return () => observer.disconnect()
  }, [])

  const fit = fitFor(pane, chosen, space, hasMargin, collapsed)
  const collapsible = isCollapsible(pane)

  useLayoutEffect(() => {
    const row = ref.current?.parentElement
    if (!row) return
    const name = `--${pane}-width`
    row.style.setProperty(name, `${fit.width}px`)
    return () => {
      row.style.removeProperty(name)
    }
  }, [pane, fit.width])

  return (
    <ResizeHandle
      ref={ref}
      label={labels[pane]}
      fit={fit}
      // The sidebar and the board grow to the right; the margin, to the left.
      grows={pane === 'margin' ? 'left' : 'right'}
      onResize={(width) => store.set(pane, width)}
      onCommit={() => {
        store.save()
        if (!collapsible) return
        collapseStore.save()
        if (collapseStore.get()[pane]) onCollapsed?.()
      }}
      onReset={() => store.reset(pane)}
      collapsed={collapsible ? Boolean(collapsed[pane]) : undefined}
      onCollapse={collapsible ? (shut) => collapseStore.set(pane, shut) : undefined}
    />
  )
}

function fitFor(
  pane: Pane,
  chosen: ChosenWidths,
  space: number | null,
  hasMargin: boolean,
  collapsed: Collapsed,
): PaneFit {
  if (pane === 'sidebar') return fitSidebar(chosen, space)
  if (pane === 'margin') return fitNote(chosen, space, true).margin as PaneFit
  // A collapsed margin leaves only its rail beside the moves.
  if (hasMargin && collapsed.margin) return fitNote(chosen, space === null ? null : space - railWidth, false).board
  return fitNote(chosen, space, hasMargin).board
}

type ResizeHandleProps = {
  ref?: Ref<HTMLDivElement>
  label: string
  fit: PaneFit
  grows: 'left' | 'right'
  /** While dragging, and on each arrow key. */
  onResize: (width: number) => void
  /** At the end of a drag and after an arrow key: the width to remember. */
  onCommit: () => void
  onReset: () => void
  /** Whether the pane is collapsed; only for a pane that can collapse. */
  collapsed?: boolean
  /** Snaps the pane shut, or open again, as a drag goes past its minimum and back. */
  onCollapse?: (collapsed: boolean) => void
}

// A window splitter (WAI-ARIA `separator`): drag it, move it with the arrow
// keys (Shift for bigger steps), Home and End for the narrowest and widest,
// and double-click or Enter to go back to the initial width. Given
// `onCollapse`, dragging well past the narrowest snaps the pane shut, keeping
// the width it had when the drag began; dragging back opens it again.
export function ResizeHandle({
  ref,
  label,
  fit,
  grows,
  onResize,
  onCommit,
  onReset,
  collapsed,
  onCollapse,
}: ResizeHandleProps) {
  const drag = useRef<{ x: number; width: number } | null>(null)
  const [dragging, setDragging] = useState(false)
  const direction = grows === 'right' ? 1 : -1
  const limit = (width: number) => Math.min(fit.max, Math.max(fit.min, width))

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return
    // No text selection while dragging.
    event.preventDefault()
    event.currentTarget.focus({ preventScroll: true })
    event.currentTarget.setPointerCapture?.(event.pointerId)
    drag.current = { x: event.clientX, width: fit.width }
    setDragging(true)
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    if (!drag.current) return
    const width = drag.current.width + (event.clientX - drag.current.x) * direction
    if (onCollapse) {
      const shut = width < fit.min - collapseBeyond
      if (shut) {
        onResize(drag.current.width)
        if (!collapsed) onCollapse(true)
        return
      }
      if (collapsed) onCollapse(false)
    }
    onResize(limit(width))
  }

  function endDrag() {
    if (!drag.current) return
    drag.current = null
    setDragging(false)
    onCommit()
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const by = event.shiftKey ? bigStep : step
    let width: number
    switch (event.key) {
      case 'ArrowLeft':
        width = fit.width - by * direction
        break
      case 'ArrowRight':
        width = fit.width + by * direction
        break
      case 'Home':
        width = fit.min
        break
      case 'End':
        width = fit.max
        break
      case 'Enter':
        event.preventDefault()
        onReset()
        return
      default:
        return
    }
    event.preventDefault()
    onResize(limit(width))
    onCommit()
  }

  return (
    <div
      ref={ref}
      className={styles.paneEdge}
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      aria-valuenow={fit.width}
      aria-valuemin={fit.min}
      aria-valuemax={fit.max}
      tabIndex={0}
      data-dragging={dragging || undefined}
      data-collapsed={collapsed || undefined}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onLostPointerCapture={endDrag}
      onDoubleClick={onReset}
      onKeyDown={onKeyDown}
    />
  )
}
