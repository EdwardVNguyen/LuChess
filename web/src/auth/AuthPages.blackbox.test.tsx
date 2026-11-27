// Black-box tests for #174: the auth pages' split layout with a dark form panel
// and a photo. Written from the issue and design/pages/DESIGN.md ("Log in and
// Sign up"), against the pages' public surface only: their exports, their
// routes, the session and the API client.
//
// Layout, colours, sizes and breakpoints need a real browser (jsdom has no
// layout), so they are left to `npm run shots`; that includes the password
// button's 44x44 size. These tests check what the
// markup has to say: labels, hints, the password toggle, the logo, the photo
// credit, the quotes, what's left out, and that the old flows still work.
import { MantineProvider } from '@mantine/core'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMemoryHistory, createRootRoute, createRoute, createRouter, Outlet, RouterProvider } from '@tanstack/react-router'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { ApiError } from '../api'
import { api } from '../apiClient'
import { ForgotPasswordPage } from '../ForgotPasswordPage'
import { LoginPage } from '../LoginPage'
import { ResetPasswordPage } from '../ResetPasswordPage'
import type { Session, SessionState } from '../session'
import { SessionProvider } from '../session'
import { SignUpPage } from '../SignUpPage'
import { theme } from '../theme'
import { VerifyEmailPage } from '../VerifyEmailPage'

// --- The issue's values ------------------------------------------------------

const LOGIN_QUOTE = 'Remember chess the way you remember a good story.'
const SIGNUP_QUOTE = 'One note for every game, linked to the ideas behind it.'
const NAME_HINT = 'Shown to others. Must be unique.'
const PASSWORD_HINT = '10 to 128 characters.'
const CREDIT_HREF =
  'https://commons.wikimedia.org/wiki/File:Interzonaal_fide_schaaktoernooi_in_GAK_gebouw,_Tal_in_die_concentratie_te_midden,_Bestanddeelnr_916-4754.jpg'

// --- Rendering -----------------------------------------------------------------

const guest: SessionState = { status: 'guest' }

function guestSession(signIn: Session['signIn'] = async () => ({ id: 1, email: 'ada@example.com', name: 'Ada' })): Session {
  return {
    getState: () => guest,
    subscribe: () => () => {},
    restore: async () => {},
    signIn,
    signOut: async () => {},
    forget: () => {},
    authorized: () => Promise.reject(new Error('not used')),
  }
}

const tokenSearch = z.object({ token: z.string().optional() })

function renderAt(path: string, signIn?: Session['signIn']) {
  const root = createRootRoute({ component: Outlet })
  const router = createRouter({
    routeTree: root.addChildren([
      createRoute({ getParentRoute: () => root, path: '/', component: () => <p>/ page</p> }),
      createRoute({ getParentRoute: () => root, path: '/notes', component: () => <p>/notes page</p> }),
      createRoute({ getParentRoute: () => root, path: '/login', component: LoginPage }),
      createRoute({ getParentRoute: () => root, path: '/signup', component: SignUpPage }),
      createRoute({ getParentRoute: () => root, path: '/forgot-password', component: ForgotPasswordPage }),
      createRoute({ getParentRoute: () => root, path: '/verify-email', component: VerifyEmailPage, validateSearch: tokenSearch }),
      createRoute({ getParentRoute: () => root, path: '/reset-password', component: ResetPasswordPage, validateSearch: tokenSearch }),
    ]),
    history: createMemoryHistory({ initialEntries: [path] }),
  })
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  render(
    <MantineProvider theme={theme} env="test">
      <QueryClientProvider client={queryClient}>
        <SessionProvider session={guestSession(signIn)}>
          <RouterProvider router={router} />
        </SessionProvider>
      </QueryClientProvider>
    </MantineProvider>,
  )
  return router
}

afterEach(() => {
  vi.restoreAllMocks()
})

// --- Helpers -------------------------------------------------------------------

// The text of everything an element's aria-describedby points at.
function description(el: HTMLElement): string {
  const ids = (el.getAttribute('aria-describedby') ?? '').split(/\s+/).filter(Boolean)
  return ids
    .map((id) => document.getElementById(id)?.textContent ?? '')
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// A field with a visible <label> whose text is `name`, not just an aria-label.
async function visiblyLabelled(name: string): Promise<HTMLInputElement> {
  const input = (await screen.findByLabelText(name, { exact: true })) as HTMLInputElement
  const labels = [...(input.labels ?? [])]
  expect(labels.length, `"${name}" has no <label> element`).toBeGreaterThan(0)
  expect(labels.some((l) => (l.textContent ?? '').includes(name))).toBe(true)
  return input
}

function logoLink(): HTMLAnchorElement {
  const links = screen.getAllByRole('link').filter((a) => a.getAttribute('href') === '/')
  const logo = links.find((a) => /luchess/i.test(a.textContent ?? '') || /luchess/i.test(a.getAttribute('aria-label') ?? ''))
  expect(logo, 'no link to / named LuChess').toBeDefined()
  return logo as HTMLAnchorElement
}

function expectSharedLayout() {
  // The logo links Home.
  expect(logoLink()).toHaveAttribute('href', '/')
  // The photo credit, linked to the Commons file.
  const credit = screen.getByRole('link', { name: 'Harry Pot for Anefo' })
  expect(credit).toHaveAttribute('href', CREDIT_HREF)
  const line = credit.closest('p, figcaption, small, div') as HTMLElement
  const text = (line.textContent ?? '').replace(/\s+/g, ' ')
  expect(text).toContain('Mikhail Tal, Amsterdam Interzonal 1964')
  expect(text).toContain('Photo: Harry Pot for Anefo, CC0, via Wikimedia Commons')
  // No site header on the auth pages.
  expect(screen.queryByRole('banner')).not.toBeInTheDocument()
}

function expectNoV1Leftovers() {
  const body = document.body.textContent ?? ''
  expect(body).not.toMatch(/articles?/i)
  expect(body).not.toMatch(/\bterms\b/i)
  expect(body).not.toMatch(/privacy/i)
  for (const a of screen.queryAllByRole('link')) {
    expect(a.getAttribute('href') ?? '').not.toMatch(/terms|privacy|articles/i)
  }
}

// --- Log in --------------------------------------------------------------------

describe('Log in (#174)', () => {
  it('has an h1, the "New here?" line, visible labels and a Forgot password link', async () => {
    renderAt('/login')
    expect(await screen.findByRole('heading', { level: 1, name: 'Log in' })).toBeInTheDocument()
    const signUp = screen.getByRole('link', { name: 'Create an account' })
    expect(signUp).toHaveAttribute('href', '/signup')
    expect(signUp.parentElement?.textContent).toMatch(/New here\?/)
    await visiblyLabelled('Email')
    await visiblyLabelled('Password')
    expect(screen.getByRole('link', { name: 'Forgot password?' })).toHaveAttribute('href', '/forgot-password')
    expect(screen.getByRole('button', { name: 'Log in' })).toHaveAttribute('type', 'submit')
  })

  it('uses the shared layout and the Log in quote', async () => {
    renderAt('/login')
    await screen.findByRole('heading', { level: 1, name: 'Log in' })
    expectSharedLayout()
    expect(screen.getByText(LOGIN_QUOTE, { exact: false })).toBeInTheDocument()
    expect(screen.queryByText(SIGNUP_QUOTE, { exact: false })).not.toBeInTheDocument()
  })

  it('leaves out Articles, Terms and Privacy', async () => {
    renderAt('/login')
    await screen.findByRole('heading', { level: 1, name: 'Log in' })
    expectNoV1Leftovers()
  })

  it('clicking the logo goes Home', async () => {
    const user = userEvent.setup()
    renderAt('/login')
    await screen.findByRole('heading', { level: 1, name: 'Log in' })
    await user.click(logoLink())
    expect(await screen.findByText('/ page')).toBeInTheDocument()
  })

  it('shows errors linked to their field with aria-describedby', async () => {
    const user = userEvent.setup()
    const signIn = vi.fn()
    renderAt('/login', signIn)
    await screen.findByRole('heading', { level: 1, name: 'Log in' })
    await user.click(screen.getByRole('button', { name: 'Log in' }))
    const email = screen.getByLabelText('Email', { exact: true })
    await waitFor(() => expect(description(email)).toContain('Enter your email'))
    expect(description(screen.getByLabelText('Password', { exact: true }))).toContain('Enter your password')
    expect(signIn).not.toHaveBeenCalled()
  })

  it('still logs in and goes to the notes page', async () => {
    const user = userEvent.setup()
    const signIn = vi.fn(async () => ({ id: 1, email: 'ada@example.com', name: 'Ada' }))
    renderAt('/login', signIn)
    await user.type(await screen.findByLabelText('Email', { exact: true }), 'ada@example.com')
    await user.type(screen.getByLabelText('Password', { exact: true }), 'correct horse')
    await user.click(screen.getByRole('button', { name: 'Log in' }))
    expect(await screen.findByText('/notes page')).toBeInTheDocument()
    expect(signIn).toHaveBeenCalledWith({ email: 'ada@example.com', password: 'correct horse' }, expect.anything())
  })

  it('a 403 still shows the message and a "Send a new link" button that resends to the typed email', async () => {
    const user = userEvent.setup()
    const signIn = vi.fn(async () => {
      throw new ApiError('Verify your email address before logging in.', 403)
    })
    const resend = vi.spyOn(api, 'resendVerification').mockResolvedValue({ message: 'If that account exists, we sent a new link.' })
    renderAt('/login', signIn)

    await user.type(await screen.findByLabelText('Email', { exact: true }), 'ada@example.com')
    await user.type(screen.getByLabelText('Password', { exact: true }), 'correct horse')
    await user.click(screen.getByRole('button', { name: 'Log in' }))

    expect(await screen.findByText('Verify your email address before logging in.')).toBeInTheDocument()
    // The email is already known, so no second Email address field.
    expect(screen.queryByLabelText('Email address')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Send a new link' }))
    expect(await screen.findByText('If that account exists, we sent a new link.')).toBeInTheDocument()
    expect(resend).toHaveBeenCalledWith('ada@example.com')
    expect(screen.queryByText('/notes page')).not.toBeInTheDocument()
  })

  it('a 403 with a failing resend shows the resend error', async () => {
    const user = userEvent.setup()
    const signIn = vi.fn(async () => {
      throw new ApiError('Verify your email address before logging in.', 403)
    })
    vi.spyOn(api, 'resendVerification').mockRejectedValue(new ApiError('Too many requests. Try again later.', 429))
    renderAt('/login', signIn)
    await user.type(await screen.findByLabelText('Email', { exact: true }), 'ada@example.com')
    await user.type(screen.getByLabelText('Password', { exact: true }), 'correct horse')
    await user.click(screen.getByRole('button', { name: 'Log in' }))
    await user.click(await screen.findByRole('button', { name: 'Send a new link' }))
    expect(await screen.findByText('Too many requests. Try again later.')).toBeInTheDocument()
  })

  it('any other error shows the message without the resend button', async () => {
    const user = userEvent.setup()
    const signIn = vi.fn(async () => {
      throw new ApiError('Wrong email or password.', 401)
    })
    renderAt('/login', signIn)
    await user.type(await screen.findByLabelText('Email', { exact: true }), 'ada@example.com')
    await user.type(screen.getByLabelText('Password', { exact: true }), 'wrong password')
    await user.click(screen.getByRole('button', { name: 'Log in' }))
    expect(await screen.findByText('Wrong email or password.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Send a new link' })).not.toBeInTheDocument()
  })
})

// --- The password show/hide button ----------------------------------------------

describe('Password show/hide (#174)', () => {
  const cases: Array<{ page: string; path: string; field: string }> = [
    { page: 'Log in', path: '/login', field: 'Password' },
    { page: 'Sign up', path: '/signup', field: 'Password' },
    { page: 'Reset password', path: '/reset-password?token=abc', field: 'New password' },
  ]

  for (const { page, path, field } of cases) {
    it(`${page}: toggles the input type, aria-pressed and aria-label`, async () => {
      const user = userEvent.setup()
      renderAt(path)
      const input = (await screen.findByLabelText(field, { exact: true })) as HTMLInputElement
      expect(input.type).toBe('password')

      // The button sits with its field.
      const toggle = within(input.parentElement as HTMLElement).getByRole('button', { name: /show|hide/i })
      expect(toggle).toHaveAttribute('type', 'button')
      expect(toggle).toHaveAttribute('aria-pressed', 'false')
      const hiddenLabel = toggle.getAttribute('aria-label')
      expect(hiddenLabel).toMatch(/show/i)

      await user.click(toggle)
      expect(input.type).toBe('text')
      expect(toggle).toHaveAttribute('aria-pressed', 'true')
      const shownLabel = toggle.getAttribute('aria-label')
      expect(shownLabel).toMatch(/hide/i)
      expect(shownLabel).not.toBe(hiddenLabel)

      await user.click(toggle)
      expect(input.type).toBe('password')
      expect(toggle).toHaveAttribute('aria-pressed', 'false')
      expect(toggle.getAttribute('aria-label')).toBe(hiddenLabel)
    })
  }

  it('toggling does not submit the form', async () => {
    const user = userEvent.setup()
    const signIn = vi.fn()
    renderAt('/login', signIn)
    await user.type(await screen.findByLabelText('Email', { exact: true }), 'ada@example.com')
    await user.type(screen.getByLabelText('Password', { exact: true }), 'correct horse')
    await user.click(screen.getByRole('button', { name: /show/i }))
    expect(signIn).not.toHaveBeenCalled()
  })
})

// --- Sign up -------------------------------------------------------------------

describe('Sign up (#174)', () => {
  it('has an h1, the "Already have one?" line and visible labels', async () => {
    renderAt('/signup')
    expect(await screen.findByRole('heading', { level: 1, name: 'Create your account' })).toBeInTheDocument()
    const logIn = screen.getByRole('link', { name: 'Log in' })
    expect(logIn).toHaveAttribute('href', '/login')
    expect(logIn.parentElement?.textContent).toMatch(/Already have one\?/)
    await visiblyLabelled('Email')
    await visiblyLabelled('Display name')
    await visiblyLabelled('Password')
    expect(screen.getByRole('button', { name: 'Sign up' })).toHaveAttribute('type', 'submit')
  })

  it('uses the shared layout and the Sign up quote', async () => {
    renderAt('/signup')
    await screen.findByRole('heading', { level: 1, name: 'Create your account' })
    expectSharedLayout()
    expect(screen.getByText(SIGNUP_QUOTE, { exact: false })).toBeInTheDocument()
    expect(screen.queryByText(LOGIN_QUOTE, { exact: false })).not.toBeInTheDocument()
  })

  it('leaves out Articles, Terms and Privacy', async () => {
    renderAt('/signup')
    await screen.findByRole('heading', { level: 1, name: 'Create your account' })
    expectNoV1Leftovers()
  })

  it('links the Display name and Password hints with aria-describedby', async () => {
    renderAt('/signup')
    const name = await screen.findByLabelText('Display name', { exact: true })
    const password = screen.getByLabelText('Password', { exact: true })
    expect(description(name)).toBe(NAME_HINT)
    expect(description(password)).toBe(PASSWORD_HINT)
    // The hints are on screen, not only in the accessibility tree.
    expect(screen.getByText(NAME_HINT)).toBeVisible()
    expect(screen.getByText(PASSWORD_HINT)).toBeVisible()
  })

  const errorCases = [
    {
      field: 'Display name',
      value: 'A',
      hint: NAME_HINT,
      error: 'Display name must be 2 to 32 characters with no control characters',
    },
    { field: 'Password', value: 'short', hint: PASSWORD_HINT, error: 'Password must be 10 to 128 characters' },
  ]

  for (const { field, value, hint, error } of errorCases) {
    it(`${field}: an error replaces the hint, still linked with aria-describedby, and the hint comes back once fixed`, async () => {
      const user = userEvent.setup()
      renderAt('/signup')
      const input = await screen.findByLabelText(field, { exact: true })
      await user.type(input, value)
      await user.tab()

      await waitFor(() => expect(description(input)).toContain(error))
      expect(description(input)).not.toContain(hint)
      expect(screen.queryByText(hint)).not.toBeInTheDocument()

      await user.type(input, 'abcdefghijk')
      await waitFor(() => expect(description(input)).toBe(hint))
      expect(screen.queryByText(error)).not.toBeInTheDocument()
    })
  }

  it('Email (no hint) still links its error with aria-describedby', async () => {
    const user = userEvent.setup()
    renderAt('/signup')
    const email = await screen.findByLabelText('Email', { exact: true })
    await user.type(email, 'not-an-email')
    await user.tab()
    await waitFor(() => expect(description(email)).toContain('Enter a valid email address'))
  })

  it('still signs up and shows "Check your email" with the resend button, in the same layout', async () => {
    const user = userEvent.setup()
    const signUp = vi.spyOn(api, 'signUp').mockResolvedValue({ id: 1, email: 'ada@example.com', name: 'Ada' } as never)
    const resend = vi.spyOn(api, 'resendVerification').mockResolvedValue({ message: 'Sent another link.' })
    renderAt('/signup')
    await user.type(await screen.findByLabelText('Email', { exact: true }), 'ada@example.com')
    await user.type(screen.getByLabelText('Display name', { exact: true }), 'Ada')
    await user.type(screen.getByLabelText('Password', { exact: true }), 'correct horse battery')
    await user.click(screen.getByRole('button', { name: 'Sign up' }))

    expect(await screen.findByText(/Check your email/)).toBeInTheDocument()
    expect(signUp).toHaveBeenCalledWith({ email: 'ada@example.com', name: 'Ada', password: 'correct horse battery' }, expect.anything())
    expectSharedLayout()
    await user.click(screen.getByRole('button', { name: 'Send a new link' }))
    expect(await screen.findByText('Sent another link.')).toBeInTheDocument()
    expect(resend).toHaveBeenCalledWith('ada@example.com')
  })

  it('shows a server error (e.g. email taken) and stays on the form', async () => {
    const user = userEvent.setup()
    vi.spyOn(api, 'signUp').mockRejectedValue(new ApiError('An account with that email already exists.', 409))
    renderAt('/signup')
    await user.type(await screen.findByLabelText('Email', { exact: true }), 'ada@example.com')
    await user.type(screen.getByLabelText('Display name', { exact: true }), 'Ada')
    await user.type(screen.getByLabelText('Password', { exact: true }), 'correct horse battery')
    await user.click(screen.getByRole('button', { name: 'Sign up' }))
    expect(await screen.findByText('An account with that email already exists.')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: 'Create your account' })).toBeInTheDocument()
  })
})

// --- Verify email, Forgot password, Reset password ------------------------------

describe('Other auth pages use the same layout (#174)', () => {
  it('Verify email without a token: the layout, a message and the resend form with a visible label', async () => {
    const user = userEvent.setup()
    const resend = vi.spyOn(api, 'resendVerification').mockResolvedValue({ message: 'Sent.' })
    renderAt('/verify-email')
    expect(await screen.findByRole('heading', { level: 1, name: /verify your email/i })).toBeInTheDocument()
    expectSharedLayout()
    expectNoV1Leftovers()
    expect(screen.getByText(/link is incomplete/i)).toBeInTheDocument()
    const email = await visiblyLabelled('Email address')
    await user.type(email, 'ada@example.com')
    await user.click(screen.getByRole('button', { name: 'Send a new link' }))
    expect(await screen.findByText('Sent.')).toBeInTheDocument()
    expect(resend).toHaveBeenCalledWith('ada@example.com')
  })

  it('Verify email with a token: sends it once and shows "Email verified" in the layout', async () => {
    const verify = vi.spyOn(api, 'verifyEmail').mockResolvedValue()
    renderAt('/verify-email?token=tok123')
    expect(await screen.findByRole('heading', { level: 1, name: 'Email verified' })).toBeInTheDocument()
    expect(verify).toHaveBeenCalledTimes(1)
    expect(verify.mock.calls[0][0]).toBe('tok123')
    expectSharedLayout()
  })

  it('Verify email with a bad token: shows the error and the resend form in the layout', async () => {
    vi.spyOn(api, 'verifyEmail').mockRejectedValue(new ApiError('This link has expired.', 400))
    renderAt('/verify-email?token=old')
    expect(await screen.findByText('This link has expired.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Send a new link' })).toBeInTheDocument()
    expectSharedLayout()
  })

  it('Forgot password: h1, visible label, layout, and "Check your email" after sending', async () => {
    const user = userEvent.setup()
    const forgot = vi.spyOn(api, 'forgotPassword').mockResolvedValue({ message: 'If that account exists, we sent a link.' })
    renderAt('/forgot-password')
    expect(await screen.findByRole('heading', { level: 1, name: 'Forgot your password?' })).toBeInTheDocument()
    expectSharedLayout()
    expectNoV1Leftovers()
    await user.type(await visiblyLabelled('Email'), 'ada@example.com')
    await user.click(screen.getByRole('button', { name: /send/i }))
    expect(await screen.findByText('If that account exists, we sent a link.')).toBeInTheDocument()
    expect(forgot.mock.calls[0][0]).toBe('ada@example.com')
    expectSharedLayout()
  })

  it('Forgot password: a server error is shown', async () => {
    const user = userEvent.setup()
    vi.spyOn(api, 'forgotPassword').mockRejectedValue(new ApiError('Too many requests. Try again later.', 429))
    renderAt('/forgot-password')
    await user.type(await screen.findByLabelText('Email', { exact: true }), 'ada@example.com')
    await user.click(screen.getByRole('button', { name: /send/i }))
    expect(await screen.findByText('Too many requests. Try again later.')).toBeInTheDocument()
  })

  it('Reset password without a token: "This link doesn\'t work" in the layout, linking to Forgot password', async () => {
    renderAt('/reset-password')
    expect(await screen.findByRole('heading', { level: 1, name: "This link doesn't work" })).toBeInTheDocument()
    expectSharedLayout()
    expectNoV1Leftovers()
    expect(screen.getByRole('link', { name: 'Send a new link' })).toHaveAttribute('href', '/forgot-password')
  })

  it('Reset password with a token: h1, visible labels, layout, and "Password changed" after saving', async () => {
    const user = userEvent.setup()
    const reset = vi.spyOn(api, 'resetPassword').mockResolvedValue()
    renderAt('/reset-password?token=abc')
    expect(await screen.findByRole('heading', { level: 1, name: 'Choose a new password' })).toBeInTheDocument()
    expectSharedLayout()
    expectNoV1Leftovers()
    await user.type(await visiblyLabelled('New password'), 'correct horse battery')
    await user.type(await visiblyLabelled('Confirm new password'), 'correct horse battery')
    await user.click(document.querySelector('button[type="submit"]') as HTMLButtonElement)
    expect(await screen.findByRole('heading', { level: 1, name: 'Password changed' })).toBeInTheDocument()
    expect(reset.mock.calls[0][0]).toEqual({ token: 'abc', password: 'correct horse battery' })
    expectSharedLayout()
  })

  it('Reset password: mismatched passwords show an error linked to the confirm field', async () => {
    const user = userEvent.setup()
    const reset = vi.spyOn(api, 'resetPassword').mockResolvedValue()
    renderAt('/reset-password?token=abc')
    await user.type(await screen.findByLabelText('New password', { exact: true }), 'correct horse battery')
    const confirm = screen.getByLabelText('Confirm new password', { exact: true })
    await user.type(confirm, 'something else entirely')
    await user.tab()
    await waitFor(() => expect(description(confirm)).toContain('Passwords do not match'))
    expect(reset).not.toHaveBeenCalled()
  })
})
