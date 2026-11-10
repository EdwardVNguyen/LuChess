// Whether the sidebar and the margin are collapsed to a rail on desktop (#61).
// The board column doesn't collapse. Like the widths (paneWidths.ts), this is
// remembered per device, in localStorage; a collapsed pane keeps its width
// there, so it comes back at that width.

import { spacingTokens } from '../theme/tokens'
import type { Pane } from './paneWidths'

export type CollapsiblePane = Extract<Pane, 'sidebar' | 'margin'>

export const collapsiblePanes: readonly CollapsiblePane[] = ['sidebar', 'margin']

export function isCollapsible(pane: Pane): pane is CollapsiblePane {
  return (collapsiblePanes as readonly Pane[]).includes(pane)
}

/** How wide a collapsed pane's rail is, in px. */
export const railWidth = parseFloat(spacingTokens.paneRail)

/** How far past its minimum a pane's edge is dragged before the pane snaps shut, in px. */
export const collapseBeyond = 96

/** The panes that are collapsed; a pane left out is open. */
export type Collapsed = Partial<Record<CollapsiblePane, true>>

/** Reads stored collapsed panes; anything missing or not understood is open. */
export function parseCollapsed(raw: string | null): Collapsed {
  if (!raw) return {}
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    return {}
  }
  if (typeof value !== 'object' || value === null) return {}
  const collapsed: Collapsed = {}
  for (const pane of collapsiblePanes) {
    if ((value as Record<string, unknown>)[pane] === true) collapsed[pane] = true
  }
  return collapsed
}

export const collapseStorageKey = 'chessnotes:pane-collapsed'

export type PaneCollapseStore = {
  subscribe: (listener: () => void) => () => void
  get: () => Collapsed
  /** Opens or collapses a pane now; `save` remembers it (a drag only at its end). */
  set: (pane: CollapsiblePane, collapsed: boolean) => void
  save: () => void
}

/**
 * Which panes are collapsed, shared by every pane on the page. Storage can be
 * missing or refuse; the state then lasts only until the page is left.
 */
export function createPaneCollapseStore(storage: () => Storage): PaneCollapseStore {
  let state: Collapsed | null = null
  const listeners = new Set<() => void>()

  function get(): Collapsed {
    if (state === null) {
      try {
        state = parseCollapsed(storage().getItem(collapseStorageKey))
      } catch {
        state = {}
      }
    }
    return state
  }

  return {
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    get,
    set(pane, collapsed) {
      if (Boolean(get()[pane]) === collapsed) return
      const next = { ...get() }
      if (collapsed) next[pane] = true
      else delete next[pane]
      state = next
      for (const listener of listeners) listener()
    },
    save() {
      try {
        storage().setItem(collapseStorageKey, JSON.stringify(get()))
      } catch {
        // Not remembered on this device; the state still applies until the page is left.
      }
    },
  }
}

export const paneCollapse = createPaneCollapseStore(() => window.localStorage)
