import { MantineProvider } from '@mantine/core'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { collapseStorageKey, createPaneCollapseStore, parseCollapsed, type CollapsiblePane } from './paneCollapse'
import { PaneToggle } from './PaneToggle'
import { useCollapsible } from './useCollapsible'

beforeEach(() => {
  window.localStorage.clear()
})

function Pane({ pane, store }: { pane: CollapsiblePane; store: ReturnType<typeof createPaneCollapseStore> }) {
  const state = useCollapsible(pane, store)
  return (
    <div id="pane" data-testid="pane" data-collapsed={state.collapsed || undefined}>
      <PaneToggle
        pane={pane}
        collapsed={state.collapsed}
        onToggle={state.toggle}
        focusRequests={state.focusRequests}
        controls="pane"
      />
    </div>
  )
}

function renderPane(pane: CollapsiblePane, stored?: string) {
  if (stored !== undefined) window.localStorage.setItem(collapseStorageKey, stored)
  const store = createPaneCollapseStore(() => window.localStorage)
  render(
    <MantineProvider env="test">
      <Pane pane={pane} store={store} />
    </MantineProvider>,
  )
  return { remembered: () => parseCollapsed(window.localStorage.getItem(collapseStorageKey)) }
}

describe('PaneToggle', () => {
  it('collapses an open pane, keeps focus on its expand button, and remembers it', async () => {
    const user = userEvent.setup()
    const { remembered } = renderPane('sidebar')
    const collapse = screen.getByRole('button', { name: 'Collapse the sidebar' })
    expect(collapse).toHaveAttribute('aria-expanded', 'true')
    expect(collapse).toHaveAttribute('aria-controls', 'pane')

    await user.click(collapse)
    const expand = screen.getByRole('button', { name: 'Expand the sidebar' })
    expect(expand).toHaveAttribute('aria-expanded', 'false')
    expect(expand).toHaveFocus()
    expect(screen.getByTestId('pane')).toHaveAttribute('data-collapsed')
    expect(remembered()).toEqual({ sidebar: true })
  })

  it('expands a pane remembered as collapsed, from the keyboard', async () => {
    const user = userEvent.setup()
    const { remembered } = renderPane('margin', '{"margin":true}')
    expect(screen.getByTestId('pane')).toHaveAttribute('data-collapsed')

    await user.tab()
    expect(screen.getByRole('button', { name: 'Expand the margin' })).toHaveFocus()
    await user.keyboard('{Enter}')
    expect(screen.getByRole('button', { name: 'Collapse the margin' })).toHaveFocus()
    expect(screen.getByTestId('pane')).not.toHaveAttribute('data-collapsed')
    expect(remembered()).toEqual({})
  })

  it('opens when what is stored is corrupt', () => {
    renderPane('sidebar', '{"sidebar":')
    expect(screen.getByRole('button', { name: 'Collapse the sidebar' })).toHaveAttribute('aria-expanded', 'true')
  })
})
