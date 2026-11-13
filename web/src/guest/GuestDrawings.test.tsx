import { MantineProvider } from '@mantine/core'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMemoryHistory, createRootRoute, createRoute, createRouter, Outlet, RouterProvider } from '@tanstack/react-router'
import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Session } from '../session'
import { SessionProvider } from '../session'
import { theme } from '../theme'
import { GuestPage } from './GuestPage'

// A Guest's Drawings (#77) are kept in the browser with the rest of their writing.

const apiCalls: string[] = []
vi.mock('../apiClient', () => ({
  api: new Proxy({}, { get: (_target, name) => () => { apiCalls.push(String(name)); return Promise.reject(new Error(`unexpected api.${String(name)}`)) } }),
}))

const guestState = { status: 'guest' } as const
const guest: Session = {
  getState: () => guestState,
  subscribe: () => () => {},
  restore: async () => {},
  signIn: async () => ({ id: 1, email: 'ada@example.com', name: 'Ada' }),
  signOut: async () => {},
  forget: () => {},
  authorized: () => Promise.reject(new Error('a Guest has no Session')),
}

beforeEach(() => {
  apiCalls.length = 0
  // react-chessboard measures a square to animate a move; jsdom has no layout.
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 40, 40))
})

afterEach(() => {
  vi.restoreAllMocks()
})

function renderGuestPage() {
  const root = createRootRoute({ component: Outlet })
  const router = createRouter({
    routeTree: root.addChildren([createRoute({ getParentRoute: () => root, path: '/try', component: GuestPage })]),
    history: createMemoryHistory({ initialEntries: ['/try'] }),
  })
  render(
    <MantineProvider theme={theme}>
      <QueryClientProvider client={new QueryClient()}>
        <SessionProvider session={guest}>
          <RouterProvider router={router} />
        </SessionProvider>
      </QueryClientProvider>
    </MantineProvider>,
  )
}

function square(name: string): HTMLElement {
  const element = document.querySelector<HTMLElement>(`[id$="-square-${name}"]`)
  if (!element) throw new Error(`no square ${name}`)
  return element
}

function draw(from: string, to: string) {
  fireEvent.mouseDown(square(from), { button: 2, buttons: 2 })
  if (to !== from) fireEvent.mouseOver(square(to), { button: 2, buttons: 2 })
  fireEvent.mouseUp(square(to), { button: 2 })
}

const arrows = () => document.querySelectorAll('path[marker-end]').length

describe('A Guest’s Drawings', () => {
  // Through Import… and typed key by key: over the default 5 seconds on a busy run.
  it('are kept on their Move in the browser, from the PGN and drawn on the board, and go into the PGN', async () => {
    renderGuestPage()
    await userEvent.click(await screen.findByRole('button', { name: 'Note actions' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Import…' }))
    await userEvent.click(await screen.findByRole('textbox', { name: 'PGN' }))
    await userEvent.paste('1. e4 {[%cal Gg1f3]} e5 *')
    await userEvent.type(screen.getByRole('textbox', { name: 'Name' }), 'Open games')
    await userEvent.click(screen.getByRole('button', { name: 'Start writing' }))

    // The board opens on 1…e5; 1.e4's arrow came with the PGN.
    expect(arrows()).toBe(0)
    draw('b8', 'c6')
    expect(arrows()).toBe(1)
    await userEvent.click(screen.getByRole('button', { name: 'e4' }))
    expect(arrows()).toBe(1)
    await userEvent.click(screen.getByRole('button', { name: 'e5' }))
    expect(arrows()).toBe(1)

    const pgn = within(screen.getByRole('region', { name: 'Tools' })).getByRole('textbox', { name: 'PGN' })
    expect(pgn).toHaveValue('1. e4 {[%cal Gg1f3]} 1... e5 {[%cal Gb8c6]} *')
    expect(apiCalls).toEqual([])
  }, 15_000)
})
