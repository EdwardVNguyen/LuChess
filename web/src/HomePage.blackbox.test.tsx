// Black-box tests for #175: the logged-out Home page redesign (photo hero, new
// sections and header). Written from the issue and design/pages/DESIGN.md and
// home.html, against the public surface only (HomePage, Layout, the session and
// the theme).
import { MantineProvider } from '@mantine/core'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMemoryHistory, createRoute, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { HomePage } from './HomePage'
import { Layout } from './Layout'
import type { Session, SessionState } from './session'
import { SessionProvider } from './session'
import { theme } from './theme'

beforeEach(() => {
  // jsdom has no layout; some components measure themselves.
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

// Every page the app has (web/src/router.tsx), minus the dev-only ones.
const PAGES = ['/signup', '/login', '/verify-email', '/forgot-password', '/reset-password', '/settings', '/notes', '/notes/import', '/try']
const SECTION_LINKS = ['/#how-it-works', '/#faq']

async function renderHome() {
  const root = createRootRoute({ component: Layout })
  const router = createRouter({
    routeTree: root.addChildren([
      createRoute({ getParentRoute: () => root, path: '/', component: HomePage }),
      ...PAGES.map((path) => createRoute({ getParentRoute: () => root, path, component: () => <p>{path} page</p> })),
    ]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  render(
    <MantineProvider theme={theme} env="test">
      <QueryClientProvider client={new QueryClient()}>
        <SessionProvider session={sessionIn({ status: 'guest' })}>
          <RouterProvider router={router} />
        </SessionProvider>
      </QueryClientProvider>
    </MantineProvider>,
  )
  await screen.findByRole('heading', { level: 1 })
  return router
}

const header = () => screen.getByRole('banner')
const main = () => screen.getByRole('main')
const footer = () => screen.getByRole('contentinfo')
const hrefOf = (el: HTMLElement) => el.getAttribute('href')
const norm = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, ' ').trim()

// The section whose heading matches, walking up to the nearest <section>.
function sectionWithHeading(name: RegExp): HTMLElement {
  const heading = screen.getByRole('heading', { name })
  const section = heading.closest('section')
  expect(section, `no <section> around heading ${name}`).not.toBeNull()
  return section as HTMLElement
}

// --- 1. Header ------------------------------------------------------------------

describe('logged-out header', () => {
  it('has the LuChess wordmark linking home', async () => {
    await renderHome()
    const wordmark = within(header()).getAllByRole('link', { name: /luchess/i })[0]
    expect(hrefOf(wordmark)).toBe('/')
  })

  it.each([
    ['How it works', '/#how-it-works'],
    ['FAQ', '/#faq'],
  ])('has a "%s" anchor to %s', async (name, href) => {
    await renderHome()
    const nav = within(header()).getByRole('navigation', { name: 'Main' })
    expect(hrefOf(within(nav).getByRole('link', { name }))).toBe(href)
  })

  it.each([
    ['Log in', '/login'],
    ['Sign up', '/signup'],
  ])('has a "%s" link to %s', async (name, href) => {
    await renderHome()
    const links = within(header()).getAllByRole('link', { name })
    expect(links.length).toBeGreaterThan(0)
    for (const link of links) expect(hrefOf(link)).toBe(href)
  })

  it('has no Articles link', async () => {
    await renderHome()
    expect(within(header()).queryByRole('link', { name: /articles/i })).not.toBeInTheDocument()
    for (const link of within(header()).queryAllByRole('link')) {
      expect(hrefOf(link)).not.toMatch(/articles/)
    }
  })

  it('anchors point at sections that exist on the page', async () => {
    await renderHome()
    expect(document.getElementById('how-it-works')).not.toBeNull()
    expect(document.getElementById('faq')).not.toBeNull()
  })
})

// --- 1b. Mobile menu ------------------------------------------------------------

describe('mobile menu', () => {
  it('a menu button opens a dropdown with the same links', async () => {
    const user = userEvent.setup()
    await renderHome()
    const button = within(header()).getByRole('button', { name: /menu/i })
    expect(button).toHaveAttribute('aria-expanded', 'false')

    const before = new Set(within(header()).queryAllByRole('link'))
    await user.click(button)
    expect(button).toHaveAttribute('aria-expanded', 'true')

    // The dropdown is either what the button's aria-controls names, or the
    // links that appeared after the click.
    const controls = button.getAttribute('aria-controls')
    let names: string[]
    let hrefs: Array<string | null>
    if (controls && document.getElementById(controls)) {
      const menu = document.getElementById(controls)!
      const links = within(menu).getAllByRole('link')
      names = links.map((l) => norm(l.textContent))
      hrefs = links.map(hrefOf)
    } else {
      const added = within(header())
        .getAllByRole('link')
        .filter((l) => !before.has(l))
      names = added.map((l) => norm(l.textContent))
      hrefs = added.map(hrefOf)
    }
    // DESIGN.md (Home, section 1): on mobile the nav and "Log in" are hidden
    // and the dropdown has "the same links plus Log in"; the dark Sign up
    // button stays in the bar.
    expect(names).toEqual(expect.arrayContaining(['How it works', 'FAQ', 'Log in']))
    expect(hrefs).toEqual(expect.arrayContaining(['/#how-it-works', '/#faq', '/login']))
    expect(names.some((n) => /articles/i.test(n))).toBe(false)
  })

  it('keeps a Sign up link in the header while the menu is open', async () => {
    const user = userEvent.setup()
    await renderHome()
    await user.click(within(header()).getByRole('button', { name: /menu/i }))
    const signUps = within(header()).getAllByRole('link', { name: 'Sign up' })
    expect(signUps.length).toBeGreaterThan(0)
    for (const link of signUps) expect(hrefOf(link)).toBe('/signup')
  })

  it('closes again from the same button', async () => {
    const user = userEvent.setup()
    await renderHome()
    const button = within(header()).getByRole('button', { name: /menu/i })
    await user.click(button)
    await user.click(button)
    expect(button).toHaveAttribute('aria-expanded', 'false')
  })
})

// --- 2. Hero --------------------------------------------------------------------

describe('hero', () => {
  it('has the serif h1', async () => {
    await renderHome()
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Remember chess the way you remember a good story.')
  })

  it('"Sign up free" goes to /signup', async () => {
    await renderHome()
    const hero = screen.getByRole('heading', { level: 1 }).closest('section') as HTMLElement
    expect(hrefOf(within(hero).getByRole('link', { name: 'Sign up free' }))).toBe('/signup')
  })

  it('"Try as a guest" goes to /try', async () => {
    await renderHome()
    const hero = screen.getByRole('heading', { level: 1 }).closest('section') as HTMLElement
    expect(hrefOf(within(hero).getByRole('link', { name: /^try as a guest$/i }))).toBe('/try')
  })

  it('shows the Fischer v. Tal photo', async () => {
    await renderHome()
    const hero = screen.getByRole('heading', { level: 1 }).closest('section') as HTMLElement
    const img = within(hero).getByRole('img', { name: /fischer/i })
    expect(img.getAttribute('src')).toMatch(/hero-fischer-tal-1960/)
  })

  it('drops the "Read one now" note and the interactive board', async () => {
    await renderHome()
    expect(screen.queryByText(/read one now/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /read one now/i })).not.toBeInTheDocument()
  })
})

// --- 2b. Photo credit -----------------------------------------------------------

describe('hero photo credit (CC BY-SA 3.0 DE)', () => {
  const COMMONS =
    'https://commons.wikimedia.org/wiki/File:Bundesarchiv_Bild_183-76052-0335,_Schacholympiade,_Tal_(UdSSR)_gegen_Fischer_(USA).jpg'
  const LICENCE = 'https://creativecommons.org/licenses/by-sa/3.0/de/deed.en'

  it('names the game and the photo', async () => {
    await renderHome()
    expect(norm(main().textContent)).toContain('Fischer v. Tal, Leipzig 1960')
  })

  it('links the author to the Commons file', async () => {
    await renderHome()
    const link = screen.getByRole('link', { name: 'Bundesarchiv, Bild 183-76052-0335 / Kohls, Ulrich' })
    expect(hrefOf(link)).toBe(COMMONS)
  })

  it('links the licence', async () => {
    await renderHome()
    const link = screen.getByRole('link', { name: 'CC BY-SA 3.0 DE' })
    expect(hrefOf(link)).toBe(LICENCE)
  })

  it('says the photo was cropped and toned', async () => {
    await renderHome()
    expect(norm(main().textContent)).toMatch(/cropped and toned/)
  })

  it('sits in the hero with the photo', async () => {
    await renderHome()
    const hero = screen.getByRole('heading', { level: 1 }).closest('section') as HTMLElement
    expect(hero).toContainElement(screen.getByRole('link', { name: 'CC BY-SA 3.0 DE' }))
  })
})

// --- 3. How it works ------------------------------------------------------------

describe('How it works', () => {
  it('shows the v1 steps Write / Link / Find it again, in order', async () => {
    await renderHome()
    const section = document.getElementById('how-it-works')!
    const steps = within(section)
      .getAllByRole('heading', { level: 3 })
      .map((h) => norm(h.textContent))
    expect(steps).toEqual(['Write', 'Link', 'Find it again'])
  })

  it('not the design’s Read / Connect / Play', async () => {
    await renderHome()
    const section = document.getElementById('how-it-works')!
    for (const name of ['Read', 'Connect', 'Play']) {
      expect(within(section).queryByRole('heading', { level: 3, name })).not.toBeInTheDocument()
    }
    expect(norm(section.textContent)).not.toMatch(/Read it\. Connect it\. Play it\./)
  })
})

// --- 4. Luhmann's method --------------------------------------------------------

describe('Luhmann’s method', () => {
  it('has the heading, a checklist and the Study view image', async () => {
    await renderHome()
    const section = sectionWithHeading(/ideas stick when\s*they connect/i)
    expect(norm(section.textContent)).toMatch(/Luhmann/)
    expect(within(section).getAllByRole('listitem').length).toBeGreaterThan(0)
    const img = within(section).getByRole('img')
    expect(img.getAttribute('src')).toMatch(/study-view/)
    expect(img.getAttribute('alt')).toBeTruthy()
  })
})

// --- 5. Dropped sections ----------------------------------------------------------

describe('dropped sections', () => {
  it('has no "Learn from people" section', async () => {
    await renderHome()
    expect(screen.queryByText(/learn from people/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/good resources beat/i)).not.toBeInTheDocument()
  })

  it('has no "Open to everyone" section or article cards', async () => {
    await renderHome()
    expect(screen.queryByText(/open to everyone/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/read before you sign up/i)).not.toBeInTheDocument()
    for (const link of screen.queryAllByRole('link')) expect(hrefOf(link)).not.toMatch(/articles/)
  })
})

// --- 6. FAQ ---------------------------------------------------------------------

describe('FAQ', () => {
  const faq = () => document.getElementById('faq')!

  it('is headed "Questions, answered."', async () => {
    await renderHome()
    expect(within(faq()).getByRole('heading', { name: /questions,\s*answered\./i })).toBeInTheDocument()
  })

  it('has no articles questions', async () => {
    await renderHome()
    expect(norm(faq().textContent)).not.toMatch(/article/i)
  })

  it('has no Chess.com questions', async () => {
    await renderHome()
    const questions = within(faq())
      .getAllByRole('button')
      .map((b) => norm(b.textContent))
    expect(questions.filter((q) => /chess\.com/i.test(q))).toEqual([])
  })

  // The "+" / "–" glyph is drawn by CSS on an empty aria-hidden span, which
  // jsdom can't compute, so this checks the accordion state that drives it.
  it('toggles a question open and shut', async () => {
    const user = userEvent.setup()
    await renderHome()
    const buttons = within(faq()).getAllByRole('button')
    expect(buttons.length).toBeGreaterThan(1)

    const closed = buttons.find((b) => b.getAttribute('aria-expanded') === 'false')
    expect(closed, 'expected a closed question').toBeDefined()

    await user.click(closed!)
    expect(closed).toHaveAttribute('aria-expanded', 'true')

    await user.click(closed!)
    expect(closed).toHaveAttribute('aria-expanded', 'false')
  })
})

// --- 7. Closing CTA ---------------------------------------------------------------

describe('closing CTA', () => {
  it('has "Sign up free" to /signup and "Log in" to /login', async () => {
    await renderHome()
    const faq = document.getElementById('faq')!
    // The CTA comes after the FAQ: take the last section in <main> that has both.
    const sections = [...main().querySelectorAll('section')].filter(
      (s) => faq.compareDocumentPosition(s) & Node.DOCUMENT_POSITION_FOLLOWING && !faq.contains(s),
    )
    const cta = sections.find(
      (s) => within(s).queryByRole('link', { name: 'Sign up free' }) && within(s).queryByRole('link', { name: 'Log in' }),
    )
    expect(cta, 'no section after the FAQ with Sign up free and Log in').toBeDefined()
    expect(hrefOf(within(cta!).getByRole('link', { name: 'Sign up free' }))).toBe('/signup')
    expect(hrefOf(within(cta!).getByRole('link', { name: 'Log in' }))).toBe('/login')
  })
})

// --- 8. Footer --------------------------------------------------------------------

describe('footer', () => {
  it('has the brand and tagline', async () => {
    await renderHome()
    expect(within(footer()).getAllByText(/luchess/i).length).toBeGreaterThan(0)
  })

  it('links only to pages that exist', async () => {
    await renderHome()
    const links = within(footer()).getAllByRole('link')
    expect(links.length).toBeGreaterThan(1)
    for (const link of links) {
      expect(['/', ...SECTION_LINKS, ...PAGES], norm(link.textContent)).toContain(hrefOf(link))
    }
  })

  it('has none of the design’s missing pages', async () => {
    await renderHome()
    for (const name of [/articles/i, /creators/i, /topics/i, /contact/i, /terms/i, /privacy/i]) {
      expect(within(footer()).queryByRole('link', { name })).not.toBeInTheDocument()
    }
  })

  it.each([...SECTION_LINKS, '/try', '/signup'])('a footer link to %s navigates', async (href) => {
    const user = userEvent.setup()
    const router = await renderHome()
    const link = within(footer())
      .queryAllByRole('link')
      .find((l) => hrefOf(l) === href)
    if (!link) return // the issue doesn't require every page to be linked
    await user.click(link)
    const [path] = href.split('#')
    expect(router.state.location.pathname).toBe(path)
  })
})

// --- Every link on the page goes somewhere ------------------------------------------

describe('every link on the page', () => {
  it('goes to a page that exists, a section, or an external credit', async () => {
    await renderHome()
    for (const link of screen.getAllByRole('link')) {
      const href = hrefOf(link) ?? ''
      if (/^https?:\/\//.test(href)) continue
      expect(['/', ...SECTION_LINKS, ...PAGES], norm(link.textContent)).toContain(href)
    }
  })
})
