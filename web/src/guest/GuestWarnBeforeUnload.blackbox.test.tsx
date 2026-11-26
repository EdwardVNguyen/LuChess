// Black-box tests for #120 in Guest mode: a Guest's writing is kept in the
// browser, so the page warns only while a draft has not been handed over.
import { MantineProvider } from '@mantine/core'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMemoryHistory, createRootRoute, createRoute, createRouter, Outlet, RouterProvider } from '@tanstack/react-router'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Session, SessionState } from '../session'
import { SessionProvider } from '../session'
import { theme } from '../theme'
import { GuestPage } from './GuestPage'

const apiCalls: string[] = []
vi.mock('../apiClient', () => ({
  api: new Proxy(
    {},
    {
      get:
        (_target, name) =>
        (...args: unknown[]) => {
          apiCalls.push(String(name))
          return Promise.reject(new Error(`unexpected api.${String(name)}(${args.length})`))
        },
    },
  ),
}))

function unloadIsCancelled(): boolean {
  const event = new Event('beforeunload', { cancelable: true })
  window.dispatchEvent(event)
  return event.defaultPrevented
}

let beforeUnloadListeners = new Set<unknown>()

beforeEach(() => {
  apiCalls.length = 0
  vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('unexpected fetch'))))
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 40, 40))
  beforeUnloadListeners = new Set()
  const add = window.addEventListener.bind(window)
  const remove = window.removeEventListener.bind(window)
  vi.spyOn(window, 'addEventListener').mockImplementation((type: string, listener: unknown, options?: unknown) => {
    if (type === 'beforeunload') beforeUnloadListeners.add(listener)
    add(type, listener as EventListener, options as AddEventListenerOptions)
  })
  vi.spyOn(window, 'removeEventListener').mockImplementation((type: string, listener: unknown, options?: unknown) => {
    if (type === 'beforeunload') beforeUnloadListeners.delete(listener)
    remove(type, listener as EventListener, options as EventListenerOptions)
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

const guestState: SessionState = { status: 'guest' }
const guestSession: Session = {
  getState: () => guestState,
  subscribe: () => () => {},
  restore: async () => {},
  signIn: async () => ({ id: 1, email: 'ada@example.com', name: 'Ada' }),
  signOut: async () => {},
  forget: () => {},
  authorized: () => Promise.reject(new Error('a Guest has no Session')),
}

function renderGuestPage() {
  const root = createRootRoute({ component: Outlet })
  const router = createRouter({
    routeTree: root.addChildren([createRoute({ getParentRoute: () => root, path: '/try', component: GuestPage })]),
    history: createMemoryHistory({ initialEntries: ['/try'] }),
  })
  render(
    <MantineProvider theme={theme} env="test">
      <QueryClientProvider client={new QueryClient()}>
        <SessionProvider session={guestSession}>
          <RouterProvider router={router} />
        </SessionProvider>
      </QueryClientProvider>
    </MantineProvider>,
  )
}

async function startFromPgn(pgn: string, name: string) {
  await userEvent.click(await screen.findByRole('button', { name: 'Note actions' }))
  await userEvent.click(await screen.findByRole('menuitem', { name: 'Import…' }))
  await userEvent.click(await screen.findByRole('textbox', { name: 'PGN' }))
  await userEvent.paste(pgn)
  await userEvent.click(screen.getByRole('textbox', { name: 'Name' }))
  await userEvent.paste(name)
  await userEvent.click(screen.getByRole('button', { name: 'Start writing' }))
  await screen.findByRole('heading', { name })
}

describe('#120 Guest mode', () => {
  it('does not warn on a fresh Guest page', async () => {
    renderGuestPage()
    await screen.findByRole('heading', { name: 'Untitled' })
    expect(unloadIsCancelled()).toBe(false)
    expect(beforeUnloadListeners.size).toBe(0)
  })

  it('warns while a Body draft has not been handed over, and not after', async () => {
    const user = userEvent.setup()
    renderGuestPage()
    await startFromPgn('1. e4 e5 2. Nf3 *', 'Open games')
    await user.click(screen.getByRole('button', { name: 'e5' }))

    await user.type(screen.getByRole('textbox', { name: 'Body after 1…e5' }), 'Now the knight comes out.')
    expect(unloadIsCancelled()).toBe(true)

    await user.tab()
    expect(screen.getByText('Now the knight comes out.', { selector: 'p' })).toBeInTheDocument()
    expect(unloadIsCancelled()).toBe(false)
    expect(beforeUnloadListeners.size).toBe(0)
    expect(apiCalls).toEqual([])
  })

  it('warns while a Comment draft has not been handed over, and not after', async () => {
    const user = userEvent.setup()
    renderGuestPage()
    await startFromPgn('1. e4 e5 2. Nf3 *', 'Open games')

    fireEvent.contextMenu(screen.getByRole('button', { name: 'e5' }))
    await user.click(screen.getByRole('menuitem', { name: 'Add comment' }))
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Comment on 1…e5' })).toHaveFocus())
    await user.keyboard('The classical reply.')
    expect(unloadIsCancelled()).toBe(true)

    await user.keyboard('{Enter}')
    expect(screen.getByText('The classical reply.', { selector: 'span' })).toBeInTheDocument()
    expect(unloadIsCancelled()).toBe(false)
    expect(beforeUnloadListeners.size).toBe(0)
  })

  it('does not warn after moving to another Move once the draft was handed over', async () => {
    const user = userEvent.setup()
    renderGuestPage()
    await startFromPgn('1. e4 e5 2. Nf3 *', 'Open games')
    await user.click(screen.getByRole('button', { name: 'e5' }))

    await user.type(screen.getByRole('textbox', { name: 'Body after 1…e5' }), 'Symmetry.')
    // Hand the draft over first: a click on another Move straight from the
    // editor does not move on a Guest page (the same on main, not #120).
    await user.tab()
    await user.click(screen.getByRole('button', { name: 'Nf3' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Nf3' })).toHaveAttribute('aria-current', 'step'))
    expect(unloadIsCancelled()).toBe(false)
    expect(apiCalls).toEqual([])
  })
})
