import { describe, expect, it } from 'vitest'
import { createPaneWidthStore, fitNote, fitSidebar, movesFloor, parseChosen, storageKey } from './paneWidths'

describe('fitNote', () => {
  it('shows the initial widths when nothing is chosen and there is room', () => {
    const fit = fitNote({}, 1192, true)
    expect(fit.board.width).toBe(464)
    expect(fit.margin?.width).toBe(304)
  })

  it('shows chosen widths, within each pane’s limits', () => {
    const fit = fitNote({ board: 600, margin: 260 }, 1400, true)
    expect(fit.board.width).toBe(600)
    expect(fit.margin?.width).toBe(260)
  })

  it('lets each pane grow only as far as leaves the moves their floor', () => {
    const fit = fitNote({}, 1192, true)
    expect(fit.board.max).toBe(1192 - movesFloor - 304)
    expect(fit.margin?.max).toBe(1192 - movesFloor - 464)
  })

  it('narrows the margin first, then the board, as the Note narrows', () => {
    expect(fitNote({ board: 600, margin: 400 }, 1200, true)).toMatchObject({
      board: { width: 600 },
      margin: { width: 280 },
    })
    expect(fitNote({ board: 600, margin: 400 }, 1000, true)).toMatchObject({
      board: { width: 440 },
      margin: { width: 240 },
    })
  })

  it('stops at each pane’s minimum when even that does not fit', () => {
    const fit = fitNote({}, 700, true)
    expect(fit.board).toEqual({ width: 360, min: 360, max: 360 })
    expect(fit.margin).toEqual({ width: 240, min: 240, max: 240 })
  })

  it('gives the board the margin’s room when there is no margin', () => {
    const fit = fitNote({ board: 720, margin: 480 }, 1000, false)
    expect(fit.board.width).toBe(680)
    expect(fit.margin).toBeNull()
  })

  it('applies only the limits until the Note is measured', () => {
    expect(fitNote({ board: 900 }, null, true).board).toEqual({ width: 720, min: 360, max: 720 })
  })
})

describe('fitSidebar', () => {
  it('shows the chosen width when there is room', () => {
    expect(fitSidebar({ sidebar: 320 }, 1440).width).toBe(320)
  })

  it('gives way so a Note’s panes fit at their narrowest', () => {
    expect(fitSidebar({ sidebar: 400 }, 1200)).toEqual({ width: 280, min: 200, max: 280 })
    expect(fitSidebar({}, 1024).width).toBe(200)
  })
})

describe('parseChosen', () => {
  it('reads stored widths and limits them', () => {
    expect(parseChosen(JSON.stringify({ sidebar: 300, board: 9999, margin: 10 }))).toEqual({
      sidebar: 300,
      board: 720,
      margin: 240,
    })
  })

  it.each([null, '', 'not json', '42', 'null', '[]', JSON.stringify({ board: 'wide', other: 300 })])(
    'ignores what isn’t a width: %s',
    (raw) => {
      expect(parseChosen(raw)).toEqual({})
    },
  )
})

function memoryStorage(initial: Record<string, string> = {}): Storage {
  const items = new Map(Object.entries(initial))
  return {
    get length() {
      return items.size
    },
    clear: () => items.clear(),
    getItem: (key) => items.get(key) ?? null,
    key: (index) => [...items.keys()][index] ?? null,
    removeItem: (key) => void items.delete(key),
    setItem: (key, value) => void items.set(key, value),
  }
}

describe('createPaneWidthStore', () => {
  it('remembers a width once saved, not while dragging', () => {
    const storage = memoryStorage()
    const store = createPaneWidthStore(() => storage)
    store.set('board', 500)
    expect(store.get()).toEqual({ board: 500 })
    expect(storage.getItem(storageKey)).toBeNull()
    store.save()
    expect(parseChosen(storage.getItem(storageKey))).toEqual({ board: 500 })
  })

  it('reads what an earlier visit remembered', () => {
    const store = createPaneWidthStore(() => memoryStorage({ [storageKey]: JSON.stringify({ margin: 400 }) }))
    expect(store.get()).toEqual({ margin: 400 })
  })

  it('resets a pane and remembers that at once', () => {
    const storage = memoryStorage({ [storageKey]: JSON.stringify({ board: 500, margin: 400 }) })
    const store = createPaneWidthStore(() => storage)
    store.reset('board')
    expect(store.get()).toEqual({ margin: 400 })
    expect(parseChosen(storage.getItem(storageKey))).toEqual({ margin: 400 })
  })

  it('tells subscribers about each change', () => {
    const store = createPaneWidthStore(() => memoryStorage())
    let calls = 0
    const unsubscribe = store.subscribe(() => calls++)
    store.set('sidebar', 300)
    store.set('sidebar', 300)
    store.reset('sidebar')
    unsubscribe()
    store.set('sidebar', 320)
    expect(calls).toBe(2)
  })

  it('still works when storage refuses', () => {
    const store = createPaneWidthStore(() => {
      throw new Error('blocked')
    })
    expect(store.get()).toEqual({})
    store.set('board', 500)
    store.save()
    expect(store.get()).toEqual({ board: 500 })
  })
})
