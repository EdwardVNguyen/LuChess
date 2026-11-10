import { useCallback, useState, useSyncExternalStore } from 'react'
import { paneCollapse, type CollapsiblePane, type PaneCollapseStore } from './paneCollapse'

/**
 * Whether a pane is collapsed, and how to collapse or expand it. After the
 * reader does, `focusRequests` counts up so the pane's toggle (PaneToggle,
 * now in the pane's other state) takes focus; `focusToggle` asks for this
 * after a drag has snapped the pane shut.
 */
export function useCollapsible(pane: CollapsiblePane, store: PaneCollapseStore = paneCollapse) {
  const collapsed = Boolean(useSyncExternalStore(store.subscribe, store.get)[pane])
  const [focusRequests, setFocusRequests] = useState(0)
  const focusToggle = useCallback(() => setFocusRequests((n) => n + 1), [])

  function toggle() {
    store.set(pane, !collapsed)
    store.save()
    focusToggle()
  }

  return { collapsed, toggle, focusToggle, focusRequests }
}
