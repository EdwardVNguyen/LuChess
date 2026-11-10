import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { collapseStorageKey, createPaneCollapseStore, parseCollapsed } from './paneCollapse'
import { PaneEdge } from './PaneEdge'
import { createPaneWidthStore, parseChosen, storageKey, type Pane } from './paneWidths'

beforeEach(() => {
  window.localStorage.clear()
})

// jsdom has no layout, so the row is never measured: only each pane's own limits apply.
function renderEdge(pane: Pane, stored?: object) {
  if (stored) window.localStorage.setItem(storageKey, JSON.stringify(stored))
  const store = createPaneWidthStore(() => window.localStorage)
  const collapseStore = createPaneCollapseStore(() => window.localStorage)
  const onCollapsed = vi.fn()
  render(
    <div data-testid="row">
      <PaneEdge pane={pane} hasMargin store={store} collapseStore={collapseStore} onCollapsed={onCollapsed} />
    </div>,
  )
  return {
    store,
    collapseStore,
    onCollapsed,
    collapsedRemembered: () => parseCollapsed(window.localStorage.getItem(collapseStorageKey)),
    edge: screen.getByRole('separator'),
    width: () => screen.getByTestId('row').style.getPropertyValue(`--${pane}-width`),
    remembered: () => parseChosen(window.localStorage.getItem(storageKey)),
  }
}

describe('PaneEdge', () => {
  it('is a named, focusable window splitter at the pane’s width', () => {
    const { edge, width } = renderEdge('board')
    expect(edge).toHaveAccessibleName('Resize the board')
    expect(edge).toHaveAttribute('aria-orientation', 'vertical')
    expect(edge).toHaveAttribute('aria-valuenow', '464')
    expect(edge).toHaveAttribute('aria-valuemin', '360')
    expect(edge).toHaveAttribute('aria-valuemax', '720')
    expect(edge).toHaveAttribute('tabindex', '0')
    expect(width()).toBe('464px')
  })

  it('starts at the width remembered on this device', () => {
    const { edge, width } = renderEdge('sidebar', { sidebar: 320 })
    expect(edge).toHaveAttribute('aria-valuenow', '320')
    expect(width()).toBe('320px')
  })

  it('moves with the arrow keys, further with Shift, and remembers it', async () => {
    const user = userEvent.setup()
    const { edge, width, remembered } = renderEdge('board')
    edge.focus()
    await user.keyboard('{ArrowRight}')
    expect(width()).toBe('472px')
    await user.keyboard('{Shift>}{ArrowLeft}{/Shift}')
    expect(width()).toBe('432px')
    expect(remembered()).toEqual({ board: 432 })
  })

  it('grows the margin, which sits right of its edge, with the left arrow', async () => {
    const user = userEvent.setup()
    const { edge, width } = renderEdge('margin')
    edge.focus()
    await user.keyboard('{ArrowLeft}')
    expect(width()).toBe('312px')
  })

  it('goes to the narrowest and widest with Home and End', async () => {
    const user = userEvent.setup()
    const { edge, width } = renderEdge('sidebar')
    edge.focus()
    await user.keyboard('{End}')
    expect(width()).toBe('400px')
    await user.keyboard('{Home}')
    expect(width()).toBe('200px')
  })

  it('resets with Enter or a double-click', async () => {
    const user = userEvent.setup()
    const { edge, width, remembered } = renderEdge('board', { board: 600 })
    edge.focus()
    await user.keyboard('{Enter}')
    expect(width()).toBe('464px')
    expect(remembered()).toEqual({})

    await user.keyboard('{End}')
    await user.dblClick(edge)
    expect(width()).toBe('464px')
  })

  it('follows a drag, within its limits, and remembers it when the drag ends', () => {
    const { edge, width, remembered } = renderEdge('board')
    fireEvent.pointerDown(edge, { button: 0, pointerId: 1, clientX: 500 })
    fireEvent.pointerMove(edge, { pointerId: 1, clientX: 560 })
    expect(width()).toBe('524px')
    expect(edge).toHaveAttribute('data-dragging')
    expect(remembered()).toEqual({})

    fireEvent.pointerMove(edge, { pointerId: 1, clientX: 2000 })
    expect(width()).toBe('720px')
    fireEvent.pointerUp(edge, { pointerId: 1, clientX: 2000 })
    expect(edge).not.toHaveAttribute('data-dragging')
    expect(remembered()).toEqual({ board: 720 })
  })

  it('snaps the sidebar shut when dragged well past its narrowest, keeping its width for later', () => {
    const { edge, width, remembered, collapsedRemembered, onCollapsed } = renderEdge('sidebar', { sidebar: 320 })
    fireEvent.pointerDown(edge, { button: 0, pointerId: 1, clientX: 320 })
    fireEvent.pointerMove(edge, { pointerId: 1, clientX: 150 })
    expect(width()).toBe('200px')
    expect(edge).not.toHaveAttribute('data-collapsed')

    fireEvent.pointerMove(edge, { pointerId: 1, clientX: 60 })
    expect(edge).toHaveAttribute('data-collapsed')
    expect(width()).toBe('320px')
    expect(collapsedRemembered()).toEqual({})

    fireEvent.pointerUp(edge, { pointerId: 1, clientX: 60 })
    expect(collapsedRemembered()).toEqual({ sidebar: true })
    expect(remembered()).toEqual({ sidebar: 320 })
    expect(onCollapsed).toHaveBeenCalledOnce()
  })

  it('opens again if the same drag comes back', () => {
    const { edge, width, collapsedRemembered, onCollapsed } = renderEdge('margin')
    fireEvent.pointerDown(edge, { button: 0, pointerId: 1, clientX: 1000 })
    fireEvent.pointerMove(edge, { pointerId: 1, clientX: 1200 })
    expect(edge).toHaveAttribute('data-collapsed')
    fireEvent.pointerMove(edge, { pointerId: 1, clientX: 1050 })
    expect(edge).not.toHaveAttribute('data-collapsed')
    expect(width()).toBe('254px')
    fireEvent.pointerUp(edge, { pointerId: 1, clientX: 1050 })
    expect(collapsedRemembered()).toEqual({})
    expect(onCollapsed).not.toHaveBeenCalled()
  })

  it('never collapses the board', () => {
    const { edge, width } = renderEdge('board')
    fireEvent.pointerDown(edge, { button: 0, pointerId: 1, clientX: 500 })
    fireEvent.pointerMove(edge, { pointerId: 1, clientX: 0 })
    expect(edge).not.toHaveAttribute('data-collapsed')
    expect(width()).toBe('360px')
  })
})
