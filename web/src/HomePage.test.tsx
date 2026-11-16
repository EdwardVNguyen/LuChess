import { MantineProvider } from '@mantine/core'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMemoryHistory, createRoute, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from './api'
import { HomePage } from './HomePage'
import { heroGame, heroPly } from './landing/heroGame'
import { Layout } from './Layout'
import type { Session, SessionState } from './session'
import { SessionProvider } from './session'
import { theme } from './theme'

beforeEach(() => {
  // react-chessboard measures a square to animate a move; jsdom has no layout.
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 40, 40))
})

afterEach(() => {
  vi.restoreAllMocks()
})

function sessionIn(state: SessionState): Session {
  return {
    getState: () => state,
    subscribe: () => () => {},
    restore: async () => {},
    signIn: async () => ({ id: 1, email: 'ada@example.com', name: 'Ada' }),
    signOut: async () => {},
    forget: () => {},
    authorized: () => Promise.reject(new Error('not used')),
  }
}

// The routes the landing page links to, so a link to anything else shows up.
const ROUTES = ['/try', '/signup', '/login', '/notes', '/notes/import', '/settings']

function renderAt(state: SessionState, path = '/') {
  const root = createRootRoute({ component: Layout })
  const router = createRouter({
    routeTree: root.addChildren([
      createRoute({ getParentRoute: () => root, path: '/', component: HomePage }),
      ...ROUTES.map((route) => createRoute({ getParentRoute: () => root, path: route, component: () => <p>{route} page</p> })),
    ]),
    history: createMemoryHistory({ initialEntries: [path] }),
  })
  render(
    <MantineProvider theme={theme} env="test">
      <QueryClientProvider client={new QueryClient()}>
        <SessionProvider session={sessionIn(state)}>
          <RouterProvider router={router} />
        </SessionProvider>
      </QueryClientProvider>
    </MantineProvider>,
  )
}

const landingTitle = { name: 'Remember chess the way you remember a good story.' }

describe('HomePage', () => {
  it('shows a Guest the landing page, with ways to try it and to sign up', async () => {
    renderAt({ status: 'guest' })

    expect(await screen.findByRole('heading', { level: 1, ...landingTitle })).toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: 'Try as a Guest' })[0]).toHaveAttribute('href', '/try')
    expect(screen.getAllByRole('link', { name: 'Sign up free' })[0]).toHaveAttribute('href', '/signup')
  })

  it('links the header to How it works and the FAQ on the page', async () => {
    renderAt({ status: 'guest' })

    const nav = await screen.findByRole('navigation', { name: 'Main' })
    expect(within(nav).getByRole('link', { name: 'How it works' })).toHaveAttribute('href', '/#how-it-works')
    expect(within(nav).getByRole('link', { name: 'FAQ' })).toHaveAttribute('href', '/#faq')
    expect(document.getElementById('how-it-works')).toContainElement(screen.getByRole('heading', { name: /^Write\sit/ }))
    expect(document.getElementById('faq')).toContainElement(screen.getByRole('heading', { name: 'Questions, answered.' }))
  })

  it('has only footer links that go somewhere', async () => {
    renderAt({ status: 'guest' })

    const footer = await screen.findByRole('navigation', { name: 'Footer' })
    const hrefs = within(footer)
      .getAllByRole('link')
      .map((link) => link.getAttribute('href'))
    expect(hrefs.length).toBeGreaterThan(0)
    for (const href of hrefs) {
      expect(['/#how-it-works', '/#faq', ...ROUTES]).toContain(href)
    }
  })

  it('opens one FAQ answer at a time', async () => {
    const user = userEvent.setup()
    renderAt({ status: 'guest' })

    const first = await screen.findByRole('button', { name: 'What is a note?' })
    const privacy = screen.getByRole('button', { name: 'Who can see my notes?' })
    expect(first).toHaveAttribute('aria-expanded', 'true')
    expect(privacy).toHaveAttribute('aria-expanded', 'false')

    await user.click(privacy)

    expect(privacy).toHaveAttribute('aria-expanded', 'true')
    expect(first).toHaveAttribute('aria-expanded', 'false')
  })

  it('sends someone logged in straight to their notes, not the landing page', async () => {
    renderAt({ status: 'authenticated', user: { id: 1, email: 'ada@example.com', name: 'Ada' } })

    expect(await screen.findByText('/notes page')).toBeInTheDocument()
    expect(screen.queryByRole('heading', landingTitle)).not.toBeInTheDocument()
  })

  it('shows neither page while the Session is being restored', async () => {
    renderAt({ status: 'restoring' })

    expect(await screen.findByLabelText('Loading')).toBeInTheDocument()
    expect(screen.queryByRole('heading', landingTitle)).not.toBeInTheDocument()
    expect(screen.queryByText('/notes page')).not.toBeInTheDocument()
  })

  it('shows only the retry alert when restoring the Session failed', async () => {
    renderAt({ status: 'restore-failed', error: new ApiError('Something went wrong', 500) })

    expect(await screen.findByText('Could not check your session')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', landingTitle)).not.toBeInTheDocument()
    expect(screen.queryByText('/notes page')).not.toBeInTheDocument()
  })

  it('keeps the section links out of the header on other pages', async () => {
    renderAt({ status: 'guest' }, '/try')

    expect(await screen.findByText('/try page')).toBeInTheDocument()
    expect(screen.queryByRole('navigation', { name: 'Main' })).not.toBeInTheDocument()
  })
})

describe('the landing page’s game', () => {
  it('plays out to the knight landing in front of the isolated pawn', () => {
    expect(heroGame.plies[heroPly].san).toBe('Nxd4')
  })
})
