// The widths of the panes a reader can drag on desktop (#51): the sidebar,
// the board column and the margin. The moves column takes what is left.
// Chosen widths are remembered per device, in localStorage.

export type Pane = 'sidebar' | 'board' | 'margin'

/** Each pane's width before the reader chooses one, and how far it can be dragged either way. The board opens at its widest (#62). */
export const paneLimits: Record<Pane, { initial: number; min: number; max: number }> = {
  sidebar: { initial: 248, min: 200, max: 400 },
  board: { initial: 720, min: 360, max: 720 },
  margin: { initial: 304, min: 240, max: 480 },
}

/** The narrowest the moves column gets while the other panes can still give way. */
export const movesFloor = 320

/** The widths the reader has chosen; a pane left out is at its initial width. */
export type ChosenWidths = Partial<Record<Pane, number>>

export function limitWidth(pane: Pane, width: number): number {
  const { min, max } = paneLimits[pane]
  return Math.round(Math.min(max, Math.max(min, width)))
}

/** A pane's width and the range it can be dragged across right now. */
export type PaneFit = { width: number; min: number; max: number }

/**
 * The sidebar beside the Notes area `space` px wide (null while unmeasured):
 * it gives way so a Note's panes still fit at their narrowest.
 */
export function fitSidebar(chosen: ChosenWidths, space: number | null): PaneFit {
  const { initial, min, max } = paneLimits.sidebar
  const room = space === null ? max : space - paneLimits.board.min - paneLimits.margin.min - movesFloor
  const most = Math.max(min, Math.min(max, room))
  return { width: Math.min(limitWidth('sidebar', chosen.sidebar ?? initial), most), min, max: most }
}

/**
 * The board column and, when there is one, the margin, in a Note `space` px
 * wide (null while unmeasured). Where they and the moves' floor don't fit, the
 * margin gives way first, then the board, each no narrower than its minimum.
 * The chosen widths are kept, so they come back when there is room again.
 */
export function fitNote(
  chosen: ChosenWidths,
  space: number | null,
  hasMargin: boolean,
): { board: PaneFit; margin: PaneFit | null } {
  const board = limitWidth('board', chosen.board ?? paneLimits.board.initial)
  const margin = hasMargin ? limitWidth('margin', chosen.margin ?? paneLimits.margin.initial) : 0
  const budget = space === null ? Infinity : space - movesFloor

  const marginWidth = hasMargin ? Math.max(paneLimits.margin.min, Math.min(margin, budget - board)) : 0
  const boardWidth = Math.max(paneLimits.board.min, Math.min(board, budget - marginWidth))
  const most = (pane: Pane, beside: number) =>
    Math.max(paneLimits[pane].min, Math.min(paneLimits[pane].max, budget - beside))

  return {
    board: { width: boardWidth, min: paneLimits.board.min, max: most('board', marginWidth) },
    margin: hasMargin ? { width: marginWidth, min: paneLimits.margin.min, max: most('margin', boardWidth) } : null,
  }
}

/** Reads stored widths, dropping anything that isn't a width for a known pane. */
export function parseChosen(raw: string | null): ChosenWidths {
  if (!raw) return {}
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    return {}
  }
  if (typeof value !== 'object' || value === null) return {}
  const chosen: ChosenWidths = {}
  for (const pane of Object.keys(paneLimits) as Pane[]) {
    const width = (value as Record<string, unknown>)[pane]
    if (typeof width === 'number' && Number.isFinite(width)) chosen[pane] = limitWidth(pane, width)
  }
  return chosen
}

export const storageKey = 'chessnotes:pane-widths'

export type PaneWidthStore = {
  subscribe: (listener: () => void) => () => void
  get: () => ChosenWidths
  /** Changes a width now; `save` remembers it (at the end of a drag, not on every move). */
  set: (pane: Pane, width: number) => void
  /** Back to the pane's initial width, remembered at once. */
  reset: (pane: Pane) => void
  save: () => void
}

/**
 * The chosen widths, shared by every pane on the page. Storage can be missing
 * or refuse (private windows, blocked site data); the widths then last only
 * until the page is left.
 */
export function createPaneWidthStore(storage: () => Storage): PaneWidthStore {
  let chosen: ChosenWidths | null = null
  const listeners = new Set<() => void>()

  function get(): ChosenWidths {
    if (chosen === null) {
      try {
        chosen = parseChosen(storage().getItem(storageKey))
      } catch {
        chosen = {}
      }
    }
    return chosen
  }

  function update(next: ChosenWidths) {
    chosen = next
    for (const listener of listeners) listener()
  }

  function save() {
    try {
      storage().setItem(storageKey, JSON.stringify(get()))
    } catch {
      // Not remembered on this device; the widths still apply until the page is left.
    }
  }

  return {
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    get,
    set(pane, width) {
      const limited = limitWidth(pane, width)
      if (get()[pane] !== limited) update({ ...get(), [pane]: limited })
    },
    reset(pane) {
      const next = { ...get() }
      delete next[pane]
      update(next)
      save()
    },
    save,
  }
}

export const paneWidths = createPaneWidthStore(() => window.localStorage)
