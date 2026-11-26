// Black-box tests for #122 (not-found and error pages). They go through the
// app's public surface only: the exported `router` (its route tree and its
// default not-found / error components), `Layout`, and the Session provider.
import { MantineProvider } from '@mantine/core'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
  type AnyRoute,
} from '@tanstack/react-router'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from './api'
import { Layout } from './Layout'
import { router as appRouter } from './router'
import type { Session, SessionState } from './session'
import { SessionProvider } from './session'
import { theme } from './theme'

// The notes area loads the Note list, folders, the Note and its Moves. Every
// Note is missing; every list is empty.
vi.mock('./apiClient', () => ({
  api: new Proxy(
    {},
    {
      get: (_target, name) => {
        if (name === 'then') return undefined
        if (name === 'getNote') return () => Promise.reject(new ApiError('Note not found', 404))
        if (name === 'listMoves') return () => Promise.reject(new ApiError('Note not found', 404))
        if (name === 'getLinks') return () => Promise.resolve({ outgoing: [], incoming: [], backlinks: [] })
        return () => Promise.resolve([])
      },
    },
  ),
}))

const ada = { id: 1, email: 'ada@example.com', name: 'Ada' }
const guest: SessionState = { status: 'guest' }
const signedIn: SessionState = { status: 'authenticated', user: ada }
const restoring: SessionState = { status: 'restoring' }
const restoreFailed: SessionState = { status: 'restore-failed', error: new ApiError('Something went wrong', 500) }

function sessionIn(state: SessionState): Session {
  return {
    getState: () => state,
    subscribe: () => () => {},
    restore: async () => {},
    signIn: async () => ada,
    signOut: async () => {},
    forget: () => {},
    authorized: (call) => call('token'),
  }
}

const TANSTACK_DEFAULTS = [/^Not Found$/i, /Something went wrong!/, /Show Error/i, /Hide Error/i]

function mount(router: ReturnType<typeof createRouter>, state: SessionState) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <MantineProvider theme={theme} env="test">
      <QueryClientProvider client={queryClient}>
        <SessionProvider session={sessionIn(state)}>
          <RouterProvider router={router} />
        </SessionProvider>
      </QueryClientProvider>
    </MantineProvider>,
  )
}

/** The app's real route tree and defaults, on a memory history. */
function renderApp(path: string, state: SessionState) {
  const router = createRouter({
    ...appRouter.options,
    routeTree: appRouter.routeTree,
    history: createMemoryHistory({ initialEntries: [path] }),
  })
  mount(router as unknown as ReturnType<typeof createRouter>, state)
  return router
}

/** The app's defaults (not-found, error, pending) with the given routes under the shell. */
function renderWithRoutes(path: string, state: SessionState, children: (root: AnyRoute) => AnyRoute[]) {
  const root = createRootRoute({ component: Layout })
  const router = createRouter({
    defaultNotFoundComponent: appRouter.options.defaultNotFoundComponent,
    defaultErrorComponent: appRouter.options.defaultErrorComponent,
    routeTree: root.addChildren(children(root)),
    history: createMemoryHistory({ initialEntries: [path] }),
  })
  mount(router as unknown as ReturnType<typeof createRouter>, state)
  return router
}

/** The way back is a link or a button; either is fine, so long as it goes to the right place. */
function action(name: string): HTMLElement {
  return screen.queryByRole('link', { name }) ?? screen.getByRole('button', { name })
}

function expectNoTanStackDefaults() {
  const text = document.body.textContent ?? ''
  for (const pattern of TANSTACK_DEFAULTS) {
    expect(screen.queryByText(pattern)).not.toBeInTheDocument()
  }
  expect(text).not.toMatch(/Something went wrong!/)
}

beforeEach(() => {
  // react-chessboard measures a square; jsdom has no layout.
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 40, 40))
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('the not-found page', () => {
  it.each([
    { path: '/nope', state: guest },
    { path: '/note/12', state: guest },
    { path: '/nope/deeper', state: guest },
    { path: '/settings/nope', state: guest },
    { path: '/login/x', state: guest },
    { path: '/nope', state: signedIn },
    { path: '/note/12', state: signedIn },
    // Under the signed-in Notes area, so logged in.
    { path: '/notes/1/position/x', state: signedIn },
  ])(
    'shows "Page not found" for $path ($state.status), inside the shell, with no TanStack default text',
    async ({ path, state }) => {
      renderApp(path, state)

      // Some of these sit under a lazily loaded page, whose chunk loads first.
      const title = await screen.findByRole('heading', { level: 2, name: 'Page not found' }, { timeout: 4000 })
      expect(screen.getByText("This page doesn't exist, or its address has changed.")).toBeInTheDocument()
      // Inside the shell: the header is still there, and the message is in the page body.
      expect(screen.getByRole('banner')).toBeInTheDocument()
      expect(screen.getByRole('main')).toContainElement(title)
      expectNoTanStackDefaults()
    },
    10000,
  )

  const cases: { who: string; state: SessionState; label: string; to: string; other: string }[] = [
    { who: 'a Guest', state: guest, label: 'Go to the home page', to: '/', other: 'Back to your notes' },
    { who: 'someone logged in', state: signedIn, label: 'Back to your notes', to: '/notes', other: 'Go to the home page' },
    { who: 'a Session being restored', state: restoring, label: 'Go to the home page', to: '/', other: 'Back to your notes' },
    { who: 'a Session that failed to restore', state: restoreFailed, label: 'Go to the home page', to: '/', other: 'Back to your notes' },
  ]

  it.each(cases)('offers $who "$label", which goes to $to', async ({ state, label, to, other }) => {
    const user = userEvent.setup()
    const router = renderApp('/nope', state)

    await screen.findByRole('heading', { level: 2, name: 'Page not found' })
    const back = action(label)
    expect(screen.queryByRole('link', { name: other })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: other })).not.toBeInTheDocument()
    if (back.tagName === 'A') expect(back).toHaveAttribute('href', to)

    await user.click(back)

    await waitFor(() => expect(router.state.location.pathname).toBe(to))
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Page not found' })).not.toBeInTheDocument())
  })

  it('still shows "Note not found" for a Note that does not exist', async () => {
    renderApp('/notes/999999', signedIn)

    expect(await screen.findByRole('heading', { name: 'Note not found' }, { timeout: 3000 })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Page not found' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Something went wrong' })).not.toBeInTheDocument()
  })

  it('leaves known pages alone', async () => {
    renderWithRoutes('/known', guest, (root) => [
      createRoute({ getParentRoute: () => root, path: '/known', component: () => <p>known page</p> }),
    ])

    expect(await screen.findByText('known page')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Page not found' })).not.toBeInTheDocument()
  })
})

describe('the error page', () => {
  const SECRET = 'kaboom: secret internal detail 7f3a'

  it('shows "Something went wrong" inside the shell, never the thrown message, and logs it', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
    const thrown = new Error(SECRET)
    renderWithRoutes('/broken', guest, (root) => [
      createRoute({
        getParentRoute: () => root,
        path: '/broken',
        component: () => {
          throw thrown
        },
      }),
    ])

    const title = await screen.findByRole('heading', { level: 2, name: 'Something went wrong' })
    expect(screen.getByText('This page hit an unexpected problem. Your saved notes are safe.')).toBeInTheDocument()
    expect(screen.getByRole('banner')).toBeInTheDocument()
    expect(screen.getByRole('main')).toContainElement(title)
    expect(document.body.textContent).not.toContain(SECRET)
    expect(document.body.innerHTML).not.toContain(SECRET)
    expect(document.body.textContent).not.toMatch(/at .*\.tsx?:\d+/) // no stack
    expectNoTanStackDefaults()
    expect(within(screen.getByRole('main')).getByRole('button', { name: 'Try again' })).toBeInTheDocument()
    expect(within(screen.getByRole('main')).getByRole('button', { name: 'Reload the page' })).toBeInTheDocument()
    expect(logged.mock.calls.some((args) => args.some((arg) => arg === thrown || String(arg).includes(SECRET)))).toBe(true)
  })

  it('hides the message of a non-Error throw too', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    renderWithRoutes('/broken', guest, (root) => [
      createRoute({
        getParentRoute: () => root,
        path: '/broken',
        component: () => {
          throw SECRET
        },
      }),
    ])

    await screen.findByRole('heading', { level: 2, name: 'Something went wrong' })
    expect(document.body.textContent).not.toContain(SECRET)
  })

  it('shows the page again on Try again once it no longer throws', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const user = userEvent.setup()
    let broken = true
    renderWithRoutes('/flaky', guest, (root) => [
      createRoute({
        getParentRoute: () => root,
        path: '/flaky',
        component: () => {
          if (broken) throw new Error(SECRET)
          return <p>flaky page content</p>
        },
      }),
    ])

    await screen.findByRole('heading', { level: 2, name: 'Something went wrong' })
    broken = false
    await user.click(screen.getByRole('button', { name: 'Try again' }))

    expect(await screen.findByText('flaky page content')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Something went wrong' })).not.toBeInTheDocument()
  })

  it('stays on the error page on Try again while it still throws', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const user = userEvent.setup()
    renderWithRoutes('/broken', guest, (root) => [
      createRoute({
        getParentRoute: () => root,
        path: '/broken',
        component: () => {
          throw new Error(SECRET)
        },
      }),
    ])

    await screen.findByRole('heading', { level: 2, name: 'Something went wrong' })
    await user.click(screen.getByRole('button', { name: 'Try again' }))

    expect(await screen.findByRole('heading', { level: 2, name: 'Something went wrong' })).toBeInTheDocument()
    expect(document.body.textContent).not.toContain(SECRET)
  })

  it('recovers on Try again when a loader failed and then succeeds', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const user = userEvent.setup()
    let fail = true
    renderWithRoutes('/loaded', guest, (root) => [
      createRoute({
        getParentRoute: () => root,
        path: '/loaded',
        loader: () => {
          if (fail) throw new Error(SECRET)
          return 'ok'
        },
        component: () => <p>loaded page content</p>,
      }),
    ])

    await screen.findByRole('heading', { level: 2, name: 'Something went wrong' })
    expect(document.body.textContent).not.toContain(SECRET)
    fail = false
    await user.click(screen.getByRole('button', { name: 'Try again' }))

    expect(await screen.findByText('loaded page content')).toBeInTheDocument()
  })

  it('reloads the page on Reload the page', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const user = userEvent.setup()
    const reload = vi.fn()
    const original = window.location
    Object.defineProperty(window, 'location', { configurable: true, value: { ...original, reload } })
    try {
      renderWithRoutes('/broken', guest, (root) => [
        createRoute({
          getParentRoute: () => root,
          path: '/broken',
          component: () => {
            throw new Error(SECRET)
          },
        }),
      ])

      await screen.findByRole('heading', { level: 2, name: 'Something went wrong' })
      await user.click(screen.getByRole('button', { name: 'Reload the page' }))

      expect(reload).toHaveBeenCalledTimes(1)
    } finally {
      Object.defineProperty(window, 'location', { configurable: true, value: original })
    }
  })

  it('/dev/error (present in dev and test builds) shows the error page', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    renderApp('/dev/error', guest)

    expect(await screen.findByRole('heading', { level: 2, name: 'Something went wrong' }, { timeout: 3000 })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Page not found' })).not.toBeInTheDocument()
  })
})
