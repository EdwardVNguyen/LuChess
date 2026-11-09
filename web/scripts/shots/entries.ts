import type { Page } from 'playwright'
import { fischerSpassky1972Game6 } from '../../src/chess/fixtures.js'

/** A logged-out visitor, a signed-in session, or a visitor whose Session restore never answers or fails. */
export type FixtureSet = 'guest' | 'session' | 'restoring' | 'restoreError'

/** The signed-in user's Notes: the samples, none, failing, or never answering (to show loading). */
export type NotesFixture = 'sample' | 'empty' | 'error' | 'pending'

/** The writing on a Note's Plies, separately from the Notes themselves. */
export type PliesFixture = 'sample' | 'error' | 'pending' | 'saveError'

/** Answers to Quick Find's search, separately from the Notes themselves. */
export type SearchFixture = 'sample' | 'error' | 'pending'

/** A Note's Links (its targets and Backlinks), separately from the Notes themselves. */
export type LinksFixture = 'sample' | 'error' | 'pending'

/** Answers to editing a Note's moves: as the API would, or failing. */
export type MovesFixture = 'sample' | 'saveError'

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
  /** @default 'sample' */
  links?: LinksFixture
  /** @default 'sample' */
  moves?: MovesFixture
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
  // Settings (#12): the design's layout, with only the Delete account section in v1.
  { name: 'Settings', route: '/settings', fixtures: 'session' },
  {
    name: 'SettingsMenu',
    route: '/settings',
    fixtures: 'session',
    setup: async (page) => {
      await page.getByRole('button', { name: 'Account and settings' }).click()
      await page.getByRole('menuitem', { name: 'Settings' }).waitFor()
    },
  },
  {
    name: 'SettingsNoPassword',
    route: '/settings',
    fixtures: 'session',
    setup: async (page) => {
      await page.getByRole('button', { name: 'Delete account' }).click()
      await page.getByText('Enter your password').waitFor()
    },
  },
  {
    name: 'SettingsConfirmDelete',
    route: '/settings',
    fixtures: 'session',
    setup: async (page) => {
      await deleteAccount(page, 'correct horse battery')
    },
  },
  {
    name: 'SettingsWrongPassword',
    route: '/settings',
    fixtures: 'session',
    setup: async (page) => {
      await deleteAccount(page, 'wrong password')
      await page.getByRole('dialog').getByRole('button', { name: 'Delete account' }).click()
      await page.getByText('That password is not correct').waitFor()
      await page.getByRole('dialog').waitFor({ state: 'detached' })
    },
  },
  {
    name: 'SettingsDeleteError',
    route: '/settings',
    fixtures: 'session',
    setup: async (page) => {
      await deleteAccount(page, 'offline')
      await page.getByRole('dialog').getByRole('button', { name: 'Delete account' }).click()
      await page.getByRole('dialog').getByRole('alert').waitFor()
    },
  },
  {
    name: 'SettingsDeleted',
    route: '/settings',
    fixtures: 'session',
    setup: async (page) => {
      await deleteAccount(page, 'correct horse battery')
      await page.getByRole('dialog').getByRole('button', { name: 'Delete account' }).click()
      await page.getByRole('link', { name: 'Sign up' }).waitFor()
    },
  },
  { name: 'SettingsLoading', route: '/settings', fixtures: 'restoring', waitUntil: 'load' },
  { name: 'SettingsGuest', route: '/settings', fixtures: 'guest' },
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
  // Play mode's promotion picker (#30), open over a8 after a7–a8.
  {
    name: 'DevBoardPromotion',
    route: `/dev/board?mode=play&fen=${encodeURIComponent('7k/P7/8/8/8/8/8/K7 w - - 0 1')}`,
    fixtures: 'guest',
    setup: async (page) => {
      await page.locator('[id$="-square-a7"]').click()
      await page.locator('[id$="-square-a8"]').click()
      await page.getByRole('group', { name: 'Promote to' }).waitFor()
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
  // Folders (#11). NewFolder matches design/screenshots/NewFolder*.png, with
  // the Folder tree behind it in place of the Library (not in v1). The rest
  // have no design: the tree opened down to a subfolder and an empty Folder,
  // a Folder's menu, renaming, moving and deleting a Folder, and moving a Note.
  {
    name: 'NewFolder',
    route: '/notes/1',
    fixtures: 'session',
    setup: async (page) => {
      await openTree(page)
      await page.getByRole('button', { name: 'New folder' }).click()
      await page.getByRole('textbox', { name: 'Folder name' }).fill('Rook endgame basics')
    },
  },
  {
    name: 'NoteTreeOpened',
    route: '/notes/1',
    fixtures: 'session',
    setup: async (page) => {
      await openTree(page)
      await page.getByRole('button', { name: 'Openings', exact: true }).click()
      await page.getByRole('button', { name: 'Queen’s Gambit Declined', exact: true }).click()
      await page.getByRole('button', { name: 'Positions', exact: true }).click()
    },
  },
  {
    name: 'FolderActions',
    route: '/notes/1',
    fixtures: 'session',
    setup: async (page) => {
      await openTree(page)
      await page.getByRole('button', { name: 'Folder actions: Openings' }).click()
      await page.getByRole('menuitem', { name: 'New subfolder' }).waitFor()
    },
  },
  {
    name: 'FolderRename',
    route: '/notes/1',
    fixtures: 'session',
    setup: async (page) => {
      await openFolderAction(page, 'Openings', 'Rename')
    },
  },
  {
    name: 'FolderMove',
    route: '/notes/1',
    fixtures: 'session',
    setup: async (page) => {
      await openFolderAction(page, 'Queen’s Gambit Declined', 'Move', 'Openings')
    },
  },
  {
    name: 'FolderDelete',
    route: '/notes/1',
    fixtures: 'session',
    setup: async (page) => {
      await openFolderAction(page, 'Fischer', 'Delete')
    },
  },
  {
    name: 'NoteMoveToFolder',
    route: '/notes/1',
    fixtures: 'session',
    setup: async (page) => {
      await page.getByRole('button', { name: 'Note actions' }).click()
      await page.getByRole('menuitem', { name: 'Move to folder' }).click()
      await page.getByRole('dialog', { name: 'Move note' }).getByRole('radio').first().waitFor()
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
  // Editing moves (#10): the draft with 10…exd5 deleted, the writing it would
  // delete left out of the preview; the confirmation the API asks for; and a
  // save that fails.
  {
    name: 'NoteEditMoves',
    route: '/notes/1',
    fixtures: 'session',
    setup: async (page) => {
      await page.getByRole('button', { name: 'Note actions' }).click()
      await page.getByRole('menuitem', { name: 'Edit moves' }).click()
      await page.getByRole('button', { name: 'exd5', exact: true }).click()
      await page.getByRole('button', { name: 'Delete 10…exd5' }).click()
    },
  },
  {
    name: 'NoteEditMovesConfirm',
    route: '/notes/1',
    fixtures: 'session',
    setup: async (page) => {
      await page.getByRole('button', { name: 'Note actions' }).click()
      await page.getByRole('menuitem', { name: 'Edit moves' }).click()
      await page.getByRole('button', { name: 'exd5', exact: true }).click()
      await page.getByRole('button', { name: 'Delete 10…exd5' }).click()
      await page.getByRole('button', { name: 'Save moves' }).click()
      await page.getByRole('dialog', { name: 'Delete your writing?' }).waitFor()
    },
  },
  {
    name: 'NoteEditMovesError',
    route: '/notes/1',
    fixtures: 'session',
    moves: 'saveError',
    setup: async (page) => {
      await page.getByRole('button', { name: 'Note actions' }).click()
      await page.getByRole('menuitem', { name: 'Edit moves' }).click()
      await page.getByRole('button', { name: 'Delete 41.Qf4' }).click()
      await page.getByRole('button', { name: 'Save moves' }).click()
      await page.getByText('Could not save the moves').waitFor()
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
  // Guest mode (#13): the Note screen without the sidebar, under the banner
  // from design/screenshots/ArticleGuest*.png. No design matches the whole
  // screen. The start form, its error, a Guest's Note with writing on it, the
  // sign-up prompt on Save, and the loading and failed Session restore.
  { name: 'GuestStart', route: '/try', fixtures: 'guest' },
  {
    name: 'GuestStartInvalid',
    route: '/try',
    fixtures: 'guest',
    setup: async (page) => {
      await page.getByRole('button', { name: 'Start writing' }).click()
    },
  },
  {
    name: 'GuestNote',
    route: '/try',
    fixtures: 'guest',
    setup: startGuestNote,
  },
  {
    name: 'GuestSignUpPrompt',
    route: '/try',
    fixtures: 'guest',
    setup: async (page) => {
      await startGuestNote(page)
      await page.getByRole('button', { name: 'Save' }).click()
      await page.getByRole('dialog', { name: 'Sign up to save' }).waitFor()
    },
  },
  {
    name: 'GuestLoading',
    route: '/try',
    fixtures: 'restoring',
    waitUntil: 'load',
    setup: async (page) => {
      await page.getByLabel('Loading', { exact: true }).waitFor()
    },
  },
  {
    name: 'GuestRestoreError',
    route: '/try',
    fixtures: 'restoreError',
    setup: async (page) => {
      await page.getByText('Could not check your session').waitFor()
    },
  },
  // Links and Backlinks (#9). The Note entry above matches the design's margin
  // and the Links in its Bodies. No design matches the rest: the [[ picker
  // (found, before typing, loading, failed), an Unresolved Link, a Note with
  // no Links either way, the margin loading and failing, and a Note opened
  // from a Backlink at the linking Comment.
  {
    name: 'NoteLinkPicker',
    route: '/notes/1',
    fixtures: 'session',
    setup: async (page) => {
      await openLinkPicker(page, 'hang')
      await page.getByRole('option').first().waitFor()
    },
  },
  {
    name: 'NoteLinkPickerStart',
    route: '/notes/1',
    fixtures: 'session',
    setup: async (page) => {
      await openLinkPicker(page, '')
    },
  },
  {
    name: 'NoteLinkPickerLoading',
    route: '/notes/1',
    fixtures: 'session',
    search: 'pending',
    setup: async (page) => {
      await openLinkPicker(page, 'hang')
      await page.getByLabel('Finding notes').waitFor()
    },
  },
  {
    name: 'NoteLinkPickerError',
    route: '/notes/1',
    fixtures: 'session',
    search: 'error',
    setup: async (page) => {
      await openLinkPicker(page, 'hang')
      await page.getByRole('alert').waitFor()
    },
  },
  {
    name: 'NoteUnresolvedLink',
    route: '/notes/7',
    fixtures: 'session',
    setup: async (page) => {
      await page.getByRole('region', { name: 'Connections' }).getByText('Deleted note').first().waitFor()
    },
  },
  { name: 'NoteLinksEmpty', route: '/notes/2', fixtures: 'session' },
  {
    name: 'NoteLinksLoading',
    route: '/notes/1',
    fixtures: 'session',
    links: 'pending',
    waitUntil: 'load',
    setup: async (page) => {
      await page.getByLabel('Loading links').first().waitFor()
    },
  },
  {
    name: 'NoteLinksError',
    route: '/notes/1',
    fixtures: 'session',
    links: 'error',
    setup: async (page) => {
      await page.getByRole('alert').first().waitFor()
    },
  },
  {
    name: 'NoteFromBacklink',
    route: '/notes/1',
    fixtures: 'session',
    setup: async (page) => {
      await page.getByRole('region', { name: 'Linked from' }).getByRole('link', { name: 'Club night, October' }).click()
      await page.getByRole('heading', { name: 'Club night, October' }).waitFor()
      await page.waitForLoadState('networkidle')
      // Full-page shots start at the top; the highlighted Comment is on screen there too.
      await page.evaluate(() => window.scrollTo(0, 0))
    },
  },
]

/** Types the password on Settings and opens the confirm dialog to delete the account. */
async function deleteAccount(page: Page, password: string) {
  await page.getByLabel('Your password').fill(password)
  await page.getByRole('button', { name: 'Delete account' }).click()
  await page.getByRole('dialog', { name: 'Delete your account?' }).waitFor()
}

/** Opens the [[ picker from the Comment on 10…exd5, then searches for `query`. */
async function openLinkPicker(page: Page, query: string) {
  await page.getByRole('button', { name: 'exd5', exact: true }).click()
  await page.getByRole('textbox', { name: /^Comment on/ }).click()
  await page.keyboard.type('Compare [[')
  const search = page.getByRole('combobox', { name: 'Find a note to link' })
  await search.waitFor()
  if (query) await search.fill(query)
  // Not scrolled back to the top as elsewhere: the anchored popover hides
  // when its editor leaves the screen, so the header shows mid-page here.
}

/** Starts a Guest's Note from a pasted game and writes on one of its moves. */
async function startGuestNote(page: Page) {
  await page.getByRole('textbox', { name: 'PGN' }).fill(fischerSpassky1972Game6)
  await page.getByRole('button', { name: 'Start writing' }).click()
  await page.getByRole('button', { name: 'exd5', exact: true }).click()
  await page.getByRole('group', { name: 'Position Glyph' }).getByRole('button').first().click()
  await page.getByRole('textbox', { name: /^Comment on/ }).fill('The pawn on d5 is fixed now; everything after is about it.')
  await page.getByRole('button', { name: 'Previous move' }).focus()
  // Writing scrolled the page; a full-page shot would catch the fixed header mid-page.
  await page.evaluate(() => window.scrollTo(0, 0))
}

async function openQuickFind(page: Page, query: string) {
  await page.keyboard.press('Control+K')
  const input = page.getByRole('combobox', { name: 'Find a note' })
  await input.waitFor()
  if (query) await input.fill(query)
}

// The Folder tree: the sidebar on desktop, behind "All notes" on tablet and mobile.
async function openTree(page: Page) {
  const button = page.getByRole('button', { name: 'All notes' })
  if (await button.isVisible()) await button.click()
  await page.getByRole('button', { name: 'New folder' }).waitFor()
}

async function openFolderAction(page: Page, folder: string, action: string, openFirst?: string) {
  await openTree(page)
  if (openFirst) await page.getByRole('button', { name: openFirst, exact: true }).click()
  await page.getByRole('button', { name: `Folder actions: ${folder}` }).click()
  await page.getByRole('menuitem', { name: action }).click()
  await page.getByRole('dialog').last().waitFor()
}
