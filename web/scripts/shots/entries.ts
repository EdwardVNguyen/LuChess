import type { Page } from 'playwright'

export type FixtureSet = 'guest' | 'session'

/** The signed-in user's Notes: the samples, none, failing, or never answering (to show loading). */
export type NotesFixture = 'sample' | 'empty' | 'error' | 'pending'

/** The writing on a Note's Plies, separately from the Notes themselves. */
export type PliesFixture = 'sample' | 'error' | 'pending' | 'saveError'

/** Answers to Quick Find's search, separately from the Notes themselves. */
export type SearchFixture = 'sample' | 'error' | 'pending'

export type ShotEntry = {
  /** Matches a design screen name, e.g. `design/screenshots/<name>.png`. */
  name: string
  route: string
  fixtures: FixtureSet
  /** @default 'sample' */
  notes?: NotesFixture
  /** @default 'sample' */
  search?: SearchFixture
  /** @default 'sample' */
  plies?: PliesFixture
  /** What to wait for before setup; a never-answered request means networkidle never comes. @default 'networkidle' */
  waitUntil?: 'load' | 'networkidle'
  /** Extra steps after the page loads, e.g. opening a dialog. */
  setup?: (page: Page) => Promise<void>
}

// Start with the pages that already exist. Later tickets add their own entries
// as each screen is built.
export const entries: ShotEntry[] = [
  { name: 'HomeLoggedOut', route: '/', fixtures: 'guest' },
  { name: 'Login', route: '/login', fixtures: 'guest' },
  { name: 'SignUp', route: '/signup', fixtures: 'guest' },
  { name: 'VerifyEmail', route: '/verify-email', fixtures: 'guest' },
  // No matching design screens: password reset (#5) uses the auth card style.
  { name: 'ForgotPassword', route: '/forgot-password', fixtures: 'guest' },
  {
    name: 'ForgotPasswordError',
    route: '/forgot-password',
    fixtures: 'guest',
    setup: async (page) => {
      await page.getByRole('button', { name: 'Send reset link' }).click()
    },
  },
  {
    name: 'ForgotPasswordSent',
    route: '/forgot-password',
    fixtures: 'guest',
    setup: async (page) => {
      await page.getByLabel('Email').fill('ada@example.com')
      await page.getByRole('button', { name: 'Send reset link' }).click()
      await page.getByRole('heading', { name: 'Check your email' }).waitFor()
    },
  },
  { name: 'ResetPassword', route: '/reset-password?token=valid', fixtures: 'guest' },
  {
    name: 'ResetPasswordMismatch',
    route: '/reset-password?token=valid',
    fixtures: 'guest',
    setup: async (page) => {
      await page.getByLabel('New password', { exact: true }).fill('a brand new passphrase')
      await page.getByLabel('Confirm new password').fill('something else entirely')
      await page.getByLabel('New password', { exact: true }).click()
    },
  },
  {
    name: 'ResetPasswordDone',
    route: '/reset-password?token=valid',
    fixtures: 'guest',
    setup: async (page) => {
      await page.getByLabel('New password', { exact: true }).fill('a brand new passphrase')
      await page.getByLabel('Confirm new password').fill('a brand new passphrase')
      await page.getByRole('button', { name: 'Set new password' }).click()
      await page.getByRole('heading', { name: 'Password changed' }).waitFor()
    },
  },
  {
    name: 'ResetPasswordExpired',
    route: '/reset-password?token=expired',
    fixtures: 'guest',
    setup: async (page) => {
      await page.getByLabel('New password', { exact: true }).fill('a brand new passphrase')
      await page.getByLabel('Confirm new password').fill('a brand new passphrase')
      await page.getByRole('button', { name: 'Set new password' }).click()
      await page.getByRole('heading', { name: "This link doesn't work" }).waitFor()
    },
  },
  { name: 'ResetPasswordMissingToken', route: '/reset-password', fixtures: 'guest' },
  // No matching design screen: the home page is a placeholder until #14
  // builds the real one. This shows the logged-in app shell (header, avatar
  // menu) with no page content of its own yet.
  { name: 'HomeLoggedIn', route: '/', fixtures: 'session' },
  // No matching design screen: shows the theme's tokens and component
  // overrides (web/src/theme) next to the matching designs by hand. Opens
  // the modal so the dialog styling (radius, overlay, title font) shows up.
  {
    name: 'DevTheme',
    route: '/dev/theme',
    fixtures: 'guest',
    setup: async (page) => {
      await page.getByRole('button', { name: 'Open modal' }).click()
    },
  },
  // No matching design screen: ResponsivePopover, ResponsiveDialog and the
  // destructive ConfirmDialog (web/src/overlay) each open at all three sizes,
  // so a single setup per entry shows the popover/dialog/bottom-sheet switch
  // (#23's acceptance criteria).
  {
    name: 'DevOverlayPopover',
    route: '/dev/overlays',
    fixtures: 'guest',
    setup: async (page) => {
      await page.getByRole('button', { name: 'Save to folder' }).click()
    },
  },
  {
    name: 'DevOverlayDialog',
    route: '/dev/overlays',
    fixtures: 'guest',
    setup: async (page) => {
      await page.getByRole('button', { name: 'New folder' }).click()
    },
  },
  {
    name: 'DevOverlayConfirm',
    route: '/dev/overlays',
    fixtures: 'guest',
    setup: async (page) => {
      await page.getByRole('button', { name: 'Delete account' }).click()
    },
  },
  // No matching design screen: the shared Board (web/src/board) in each of
  // its three modes at all three sizes (#24). View mode matches the board in
  // design/screenshots/Note*.png; play shows a move just played.
  { name: 'DevBoardView', route: '/dev/board?mode=view', fixtures: 'guest' },
  {
    name: 'DevBoardPlay',
    route: '/dev/board?mode=play',
    fixtures: 'guest',
    setup: async (page) => {
      await page.locator('[id$="-square-e2"]').click()
      await page.locator('[id$="-square-e4"]').click()
      await page.locator('[id$="-square-g8"]').click()
    },
  },
  { name: 'DevBoardSetup', route: '/dev/board?mode=setup', fixtures: 'guest' },
  // The Note screen (#6), matching design/screenshots/Note*.png at the same Ply.
  {
    name: 'Note',
    route: '/notes/1',
    fixtures: 'session',
    setup: async (page) => {
      await page.getByRole('button', { name: 'exd5', exact: true }).click()
    },
  },
  // No matching design screens below: the Note screen's undesigned states,
  // the list of Notes and the New note page.
  { name: 'NotePosition', route: '/notes/3', fixtures: 'session' },
  {
    name: 'NoteAllNotes',
    route: '/notes/1',
    fixtures: 'session',
    setup: async (page) => {
      // Tablet and mobile only; desktop shows the sidebar instead.
      const button = page.getByRole('button', { name: 'All notes' })
      if (await button.isVisible()) await button.click()
    },
  },
  {
    name: 'NoteRename',
    route: '/notes/1',
    fixtures: 'session',
    setup: async (page) => {
      await page.getByRole('button', { name: 'Note actions' }).click()
      await page.getByRole('menuitem', { name: 'Rename' }).click()
    },
  },
  {
    name: 'NoteDelete',
    route: '/notes/1',
    fixtures: 'session',
    setup: async (page) => {
      await page.getByRole('button', { name: 'Note actions' }).click()
      await page.getByRole('menuitem', { name: 'Delete' }).click()
    },
  },
  {
    name: 'NoteLoading',
    route: '/notes/1',
    fixtures: 'session',
    notes: 'pending',
    waitUntil: 'load',
    setup: async (page) => {
      await page.getByLabel('Loading note', { exact: true }).waitFor()
    },
  },
  { name: 'NoteError', route: '/notes/1', fixtures: 'session', notes: 'error' },
  // Writing on a Ply (#8): the big idea highlighted at ply 0, a long Comment
  // opened with "more", a Note with no writing yet, and loading, load-error
  // and save-error states.
  {
    name: 'NoteAtPosition',
    route: '/notes/1',
    fixtures: 'session',
    setup: async (page) => {
      await page.getByRole('button', { name: 'First move' }).click()
    },
  },
  {
    name: 'NoteCommentMore',
    route: '/notes/1',
    fixtures: 'session',
    setup: async (page) => {
      await page.getByRole('button', { name: 'Qa3!', exact: true }).click()
      await page.getByRole('button', { name: 'more' }).click()
    },
  },
  {
    name: 'NoteNoWriting',
    route: '/notes/2',
    fixtures: 'session',
    setup: async (page) => {
      await page.getByRole('button', { name: 'Nf3', exact: true }).click()
    },
  },
  {
    name: 'NoteWritingLoading',
    route: '/notes/1',
    fixtures: 'session',
    plies: 'pending',
    waitUntil: 'load',
    setup: async (page) => {
      await page.getByLabel('Loading your writing', { exact: true }).waitFor()
    },
  },
  { name: 'NoteWritingError', route: '/notes/1', fixtures: 'session', plies: 'error' },
  {
    name: 'NoteSaveError',
    route: '/notes/1',
    fixtures: 'session',
    plies: 'saveError',
    setup: async (page) => {
      await page.getByRole('textbox', { name: /^Comment on/ }).fill('A thought that will not save.')
      await page.getByRole('button', { name: 'Blunder' }).focus()
      await page.getByText('Your writing was not saved').waitFor()
    },
  },
  { name: 'NoteNotFound', route: '/notes/999', fixtures: 'session' },
  { name: 'Notes', route: '/notes', fixtures: 'session' },
  { name: 'NotesEmpty', route: '/notes', fixtures: 'session', notes: 'empty' },
  { name: 'NotesGuest', route: '/notes', fixtures: 'guest' },
  { name: 'NewNote', route: '/notes/new', fixtures: 'session' },
  {
    name: 'NewNotePasted',
    route: '/notes/new',
    fixtures: 'session',
    setup: async (page) => {
      await page.getByRole('textbox', { name: 'PGN' }).fill('[White "Lovelace, Ada"]\n[Black "Hopper, Grace"]\n[Date "1952.03.01"]\n\n1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 *')
    },
  },
  {
    name: 'NewNoteInvalid',
    route: '/notes/new',
    fixtures: 'session',
    setup: async (page) => {
      await page.getByRole('textbox', { name: 'PGN' }).fill('1. e4 e5 2. Ke3 *')
      await page.getByRole('button', { name: 'Create note' }).click()
    },
  },
  {
    name: 'NewNotePlay',
    route: '/notes/new',
    fixtures: 'session',
    setup: async (page) => {
      await page.getByText('Play moves').click()
      await page.locator('[id$="-square-e2"]').click()
      await page.locator('[id$="-square-e4"]').click()
    },
  },
  {
    name: 'NewNotePosition',
    route: '/notes/new',
    fixtures: 'session',
    setup: async (page) => {
      await page.getByText('Set up a position').click()
    },
  },
  // Quick Find (#7), matching design/screenshots/QuickFind*.png. The
  // undesigned states follow: before typing, searching, nothing found, failed.
  {
    name: 'QuickFind',
    route: '/notes/1',
    fixtures: 'session',
    setup: async (page) => {
      await openQuickFind(page, 'spsky')
      await page.getByRole('option').first().waitFor()
    },
  },
  {
    name: 'QuickFindPlayer',
    route: '/notes/1',
    fixtures: 'session',
    setup: async (page) => {
      await openQuickFind(page, 'Boris')
      await page.getByRole('option').first().waitFor()
    },
  },
  {
    name: 'QuickFindStart',
    route: '/notes/1',
    fixtures: 'session',
    setup: async (page) => {
      await openQuickFind(page, '')
    },
  },
  {
    name: 'QuickFindLoading',
    route: '/notes/1',
    fixtures: 'session',
    search: 'pending',
    setup: async (page) => {
      await openQuickFind(page, 'spsky')
      await page.getByLabel('Finding notes').waitFor()
    },
  },
  {
    name: 'QuickFindNoResults',
    route: '/notes/1',
    fixtures: 'session',
    setup: async (page) => {
      await openQuickFind(page, 'Najdorf')
      await page.getByRole('status').waitFor()
    },
  },
  {
    name: 'QuickFindError',
    route: '/notes/1',
    fixtures: 'session',
    search: 'error',
    setup: async (page) => {
      await openQuickFind(page, 'spsky')
      await page.getByRole('alert').waitFor()
    },
  },
]

async function openQuickFind(page: Page, query: string) {
  await page.keyboard.press('Control+K')
  const input = page.getByRole('combobox', { name: 'Find a note' })
  await input.waitFor()
  if (query) await input.fill(query)
}
