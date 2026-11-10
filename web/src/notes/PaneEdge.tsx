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
}

// The draggable edge of a pane, on desktop only (#51). It sits between two
// columns of a flex row and sets its pane's width on that row, as
// `--sidebar-width`, `--board-width` or `--margin-width`.
export function PaneEdge({ pane, hasMargin = false, store = paneWidths }: PaneEdgeProps) {
  const ref = useRef<HTMLDivElement>(null)
  const chosen = useSyncExternalStore(store.subscribe, store.get)
  const [space, setSpace] = useState<number | null>(null)

  // The row's width, so the panes leave the moves room as the window narrows.
  useLayoutEffect(() => {
    const row = ref.current?.parentElement
    if (!row) return
    const observer = new ResizeObserver(([entry]) => setSpace(entry.contentRect.width))
    observer.observe(row)
    return () => observer.disconnect()
  }, [])

  const fit = fitFor(pane, chosen, space, hasMargin)

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
      onCommit={store.save}
      onReset={() => store.reset(pane)}
    />
  )
}

function fitFor(pane: Pane, chosen: ChosenWidths, space: number | null, hasMargin: boolean): PaneFit {
  if (pane === 'sidebar') return fitSidebar(chosen, space)
  const note = fitNote(chosen, space, hasMargin || pane === 'margin')
  return pane === 'board' ? note.board : (note.margin as PaneFit)
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
}

// A window splitter (WAI-ARIA `separator`): drag it, move it with the arrow
// keys (Shift for bigger steps), Home and End for the narrowest and widest,
// and double-click or Enter to go back to the initial width.
export function ResizeHandle({ ref, label, fit, grows, onResize, onCommit, onReset }: ResizeHandleProps) {
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
    onResize(limit(drag.current.width + (event.clientX - drag.current.x) * direction))
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
