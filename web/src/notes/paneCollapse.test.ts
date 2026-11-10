import { describe, expect, it } from 'vitest'
import { collapseStorageKey, createPaneCollapseStore, parseCollapsed } from './paneCollapse'

describe('parseCollapsed', () => {
  it('reads the collapsed panes', () => {
    expect(parseCollapsed('{"sidebar":true,"margin":true}')).toEqual({ sidebar: true, margin: true })
  })

  it('falls back to open for anything missing or not understood', () => {
    expect(parseCollapsed(null)).toEqual({})
    expect(parseCollapsed('not json')).toEqual({})
    expect(parseCollapsed('null')).toEqual({})
    expect(parseCollapsed('[true]')).toEqual({})
    expect(parseCollapsed('{"sidebar":"yes","margin":1,"board":true}')).toEqual({})
  })
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

describe('createPaneCollapseStore', () => {
  it('starts from what this device remembers', () => {
    const store = createPaneCollapseStore(() => memoryStorage({ [collapseStorageKey]: '{"margin":true}' }))
    expect(store.get()).toEqual({ margin: true })
  })

  it('collapses and opens panes, telling listeners, and remembers only on save', () => {
    const storage = memoryStorage()
    const store = createPaneCollapseStore(() => storage)
    let calls = 0
    store.subscribe(() => calls++)

    store.set('sidebar', true)
    expect(store.get()).toEqual({ sidebar: true })
    expect(calls).toBe(1)
    expect(storage.getItem(collapseStorageKey)).toBeNull()

    store.set('sidebar', true)
    expect(calls).toBe(1)

    store.save()
    expect(parseCollapsed(storage.getItem(collapseStorageKey))).toEqual({ sidebar: true })

    store.set('sidebar', false)
    store.save()
    expect(parseCollapsed(storage.getItem(collapseStorageKey))).toEqual({})
  })

  it('still works when storage refuses', () => {
    const store = createPaneCollapseStore(() => {
      throw new Error('blocked')
    })
    expect(store.get()).toEqual({})
    store.set('margin', true)
    expect(() => store.save()).not.toThrow()
    expect(store.get()).toEqual({ margin: true })
  })
})
