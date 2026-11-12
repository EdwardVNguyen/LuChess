import type { Page } from 'playwright'
import { fischerSpassky1972Game6 } from '../../src/chess/fixtures.js'

/** A logged-out visitor, a signed-in session, or a visitor whose Session restore never answers or fails. */
export type FixtureSet = 'guest' | 'session' | 'restoring' | 'restoreError'

/**
 * The signed-in user's Notes: the samples, none, failing, or never answering (to show loading).
 * `landing` is a separate user and set of Notes, for the landing page's picture of the Note screen.
 */
export type NotesFixture = 'sample' | 'landing' | 'empty' | 'error' | 'pending'

/**
 * A Note's tree of Moves and their writing, separately from the Notes themselves:
 * as the API would answer, failing to load, never answering, refusing to save
 * writing (`saveError`), or failing to add or delete a Move (`editError`).
 */
export type MovesFixture = 'sample' | 'error' | 'pending' | 'saveError' | 'editError'

/** Answers to Quick Find's search, separately from the Notes themselves. */
export type SearchFixture = 'sample' | 'error' | 'pending'

/** A Note's Links (its targets and Backlinks), separately from the Notes themselves. */
export type LinksFixture = 'sample' | 'error' | 'pending'

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
  links?: LinksFixture
  /** @default 'sample' */
  moves?: MovesFixture
  /** What to wait for before setup; a never-answered request means networkidle never comes. @default 'networkidle' */
  waitUntil?: 'load' | 'networkidle'
  /** The theme saved on the device before the page loads (docs/adr/0008). @default Warm paper, the site's default */
  theme?: 'night' | 'cool'
  /** Extra steps after the page loads, e.g. opening a dialog. */
  setup?: (page: Page) => Promise<void>
}

// Start with the pages that already exist. Later tickets add their own entries
// as each screen is built.
export const entries: ShotEntry[] = [
  // The landing page (#42), matching design/screenshots/HomeLoggedOut*.png. No
  // design matches the rest: the page while the Session is being restored and
  // when restoring it fails, a later FAQ answer opened, and the picture of the
  // Note screen the page shows. To update that picture, run this entry and
  // `magick shots/LandingNotePicture.png -crop 1440x1080+0+0 +repage -quality 82 src/landing/note-screen.webp`.
  { name: 'HomeLoggedOut', route: '/', fixtures: 'guest' },
  {
    name: 'HomeLoading',
    route: '/',
    fixtures: 'restoring',
    waitUntil: 'load',
    setup: async (page) => {
      await page.getByLabel('Loading', { exact: true }).waitFor()
    },
  },
  {
    name: 'HomeRestoreError',
    route: '/',
    fixtures: 'restoreError',
    setup: async (page) => {
      await page.getByText('Could not check your session').waitFor()
    },
  },
  {
    name: 'HomeFaq',
    route: '/',
    fixtures: 'guest',
    setup: async (page) => {
      await page.getByRole('button', { name: 'Who can see my notes?' }).click()
      await page.getByText('Only you.').waitFor()
      // Opening it scrolled the page; a full-page shot would catch the fixed header mid-page.
      await page.evaluate(() => window.scrollTo(0, 0))
    },
  },
  {
    name: 'LandingNotePicture',
    route: '/notes/1',
    fixtures: 'session',
    notes: 'landing',
    setup: async (page) => {
      await page.getByRole('button', { name: 'Nxd4!', exact: true }).click()
    },
  },
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
      // The header's: the landing page behind it has more Sign up links.
      await page.getByRole('banner').getByRole('link', { name: 'Sign up' }).waitFor()
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
  // its three modes at all three sizes (#24), in the board's own look rather
  // than the design's (docs/adr/0007); play shows a move just played.
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
  // Lichess-style highlights (#55). After 1.e4 d5, the e4 pawn selected: a
  // ring on d5, which it can capture, and a dot on e5.
  {
    name: 'DevBoardCapture',
    route: `/dev/board?mode=play&fen=${encodeURIComponent('rnbqkbnr/ppp1pppp/8/3p4/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2')}`,
    fixtures: 'guest',
    setup: async (page) => {
      await page.locator('[id$="-square-e4"]').click()
    },
  },
  // After 1.e4 f5 2.Qh5+: the black king glows, and g7 is selected to block.
  {
    name: 'DevBoardCheck',
    route: `/dev/board?mode=play&fen=${encodeURIComponent('rnbqkbnr/ppppp1pp/8/5p1Q/4P3/8/PPPP1PPP/RNB1KBNR b KQkq - 1 2')}`,
    fixtures: 'guest',
    setup: async (page) => {
      await page.locator('[id$="-square-g7"]').click()
    },
  },
  // Mid-drag: the knight, picked up by its corner, is centred on the pointer
  // over f3, which is highlighted; g1 is selected and the knight's targets show.
  {
    name: 'DevBoardDrag',
    route: `/dev/board?mode=play&fen=${encodeURIComponent('rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2')}`,
    fixtures: 'guest',
    setup: async (page) => {
      const from = await page.locator('[id$="-square-g1"]').boundingBox()
      const over = await page.locator('[id$="-square-f3"]').boundingBox()
      if (!from || !over) throw new Error('board squares not found')
      await page.mouse.move(from.x + 4, from.y + 4)
      await page.mouse.down()
      await page.mouse.move(over.x + over.width * 0.3, over.y + over.height * 0.6, { steps: 12 })
    },
  },
  // A finished game (#73): after 1.f3 e5 2.g4 Qh4#, the result under the
  // board, and a click on a white piece selects nothing.
  {
    name: 'DevBoardCheckmate',
    route: '/dev/board?mode=play',
    fixtures: 'guest',
    setup: async (page) => {
      for (const square of ['f2', 'f3', 'e7', 'e5', 'g2', 'g4', 'd8', 'h4', 'e1']) {
        await page.locator(`[id$="-square-${square}"]`).click()
      }
      await page.getByText('Checkmate · Black wins').waitFor()
    },
  },
  // A draw ends the game too: the start position for the third time, after
  // 1.Nf3 Nf6 2.Ng1 Ng8 3.Nf3 Nf6 4.Ng1 Ng8.
  {
    name: 'DevBoardRepetition',
    route: '/dev/board?mode=play',
    fixtures: 'guest',
    setup: async (page) => {
      for (let i = 0; i < 2; i += 1) {
        for (const square of ['g1', 'f3', 'g8', 'f6', 'f3', 'g1', 'f6', 'g8']) {
          await page.locator(`[id$="-square-${square}"]`).click()
        }
      }
      await page.getByText('Draw by threefold repetition').waitFor()
    },
  },
  { name: 'DevBoardSetup', route: '/dev/board?mode=setup', fixtures: 'guest' },
  // The Note screen (#6), matching design/screenshots/Note*.png at the same Ply,
  // except for the board (docs/adr/0007) and, on desktop, the column widths:
  // the board column opens at its widest (#62).
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
  // Resizable panes (#51), desktop only: the edges are hidden on tablet and
  // mobile, so there those shots match `Note`. A narrower sidebar and board
  // (which opens at its widest), then an edge hovered, focused and being dragged.
  {
    name: 'NoteResized',
    route: '/notes/1',
    fixtures: 'session',
    setup: async (page) => {
      const sidebar = page.getByRole('separator', { name: 'Resize the sidebar' })
      if (!(await sidebar.isVisible())) return
      await sidebar.focus()
      await page.keyboard.press('Home')
      await page.getByRole('separator', { name: 'Resize the board' }).focus()
      await page.keyboard.press('Home')
      await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
    },
  },
  {
    name: 'NotePaneEdgeHover',
    route: '/notes/1',
    fixtures: 'session',
    setup: async (page) => {
      const edge = page.getByRole('separator', { name: 'Resize the board' })
      if (await edge.isVisible()) await edge.hover()
    },
  },
  {
    name: 'NotePaneEdgeFocus',
    route: '/notes/1',
    fixtures: 'session',
    setup: async (page) => {
      const edge = page.getByRole('separator', { name: 'Resize the margin' })
      if (await edge.isVisible()) await edge.focus()
    },
  },
  {
    name: 'NotePaneEdgeDragging',
    route: '/notes/1',
    fixtures: 'session',
    setup: async (page) => {
      const edge = page.getByRole('separator', { name: 'Resize the sidebar' })
      if (!(await edge.isVisible())) return
      const box = await edge.boundingBox()
      if (!box) return
      await page.mouse.move(box.x, box.y + 300)
      await page.mouse.down()
      await page.mouse.move(box.x + 100, box.y + 300, { steps: 8 })
    },
  },
  // Collapsible sidebar and margin (#61), desktop only: the buttons are hidden
  // on tablet and mobile, so there these shots match `Note`. Each pane
  // collapsed to its rail, both, and a collapse button hovered and an expand
  // button focused.
  {
    name: 'NoteSidebarCollapsed',
    route: '/notes/1',
    fixtures: 'session',
    setup: async (page) => {
      const button = page.getByRole('button', { name: 'Collapse the sidebar' })
      if (!(await button.isVisible())) return
      await button.click()
      await page.mouse.move(0, 0)
      await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
    },
  },
  {
    name: 'NoteMarginCollapsed',
    route: '/notes/1',
    fixtures: 'session',
    setup: async (page) => {
      const button = page.getByRole('button', { name: 'Collapse the margin' })
      if (!(await button.isVisible())) return
      await button.click()
      await page.mouse.move(0, 0)
      await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
    },
  },
  {
    name: 'NoteBothCollapsed',
    route: '/notes/1',
    fixtures: 'session',
    setup: async (page) => {
      const sidebar = page.getByRole('button', { name: 'Collapse the sidebar' })
      if (!(await sidebar.isVisible())) return
      await sidebar.click()
      await page.getByRole('button', { name: 'Collapse the margin' }).click()
      await page.mouse.move(0, 0)
      await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
    },
  },
  {
    name: 'NotePaneToggleHover',
    route: '/notes/1',
    fixtures: 'session',
    setup: async (page) => {
      const button = page.getByRole('button', { name: 'Collapse the margin' })
      if (await button.isVisible()) await button.hover()
    },
  },
  {
    name: 'NotePaneToggleFocus',
    route: '/notes/1',
    fixtures: 'session',
    setup: async (page) => {
      const button = page.getByRole('button', { name: 'Collapse the sidebar' })
      if (!(await button.isVisible())) return
      // From the keyboard, so focus shows as it does for a keyboard user.
      await button.focus()
      await page.keyboard.press('Enter')
      await page.mouse.move(0, 0)
    },
  },
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
  // The right-click menu (#74): on a Folder, and on the empty space of the
  // sidebar (or the "All notes" overlay). No design; it is the "…" menu's look.
  {
    name: 'FolderContextMenu',
    route: '/notes/1',
    fixtures: 'session',
    setup: async (page) => {
      await openTree(page)
      await page.getByRole('button', { name: 'Openings', exact: true }).click({ button: 'right', position: { x: 60, y: 20 } })
      await page.getByRole('menuitem', { name: 'New note here' }).waitFor()
    },
  },
  {
    name: 'NoteTreeContextMenu',
    route: '/notes/1',
    fixtures: 'session',
    setup: async (page) => {
      await openTree(page)
      const space = page.getByRole('button', { name: 'New folder' }).locator('..')
      const box = (await space.boundingBox())!
      await space.click({ button: 'right', position: { x: 60, y: box.height - 8 } })
      await page.getByRole('menuitem', { name: 'New note', exact: true }).waitFor()
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
  { name: 'NoteMovesError', route: '/notes/1', fixtures: 'session', moves: 'error' },
  {
    name: 'NoteSaveError',
    route: '/notes/1',
    fixtures: 'session',
    moves: 'saveError',
    setup: async (page) => {
      await page.getByRole('textbox', { name: /^Comment on/ }).fill('A thought that will not save.')
      await page.getByRole('button', { name: 'Blunder' }).focus()
      await page.getByText('Your writing was not saved').waitFor()
    },
  },
  // Playing on the board (#75): there is no "Edit moves" step. A move played
  // from 10…exd5 starts a new Variation and is saved at once; and a move
  // that could not be saved.
  {
    name: 'NotePlayMove',
    route: '/notes/1',
    fixtures: 'session',
    setup: async (page) => {
      // 10.Nxd5; 8…Nxd5 comes first.
      await page.getByRole('button', { name: 'Nxd5', exact: true }).nth(1).click()
      for (const square of ['c7', 'c6']) await page.locator(`[id$="-square-${square}"]`).click()
      await page.getByRole('button', { name: 'c6', exact: true }).waitFor()
    },
  },
  {
    name: 'NotePlayMoveError',
    route: '/notes/1',
    fixtures: 'session',
    moves: 'editError',
    setup: async (page) => {
      await page.getByRole('button', { name: 'Nxd5', exact: true }).nth(1).click()
      for (const square of ['c7', 'c6']) await page.locator(`[id$="-square-${square}"]`).click()
      await page.getByText('Could not save the move').waitFor()
    },
  },
  // Variations (#71): the move list on a move inside the nested Variation.
  {
    name: 'NoteVariations',
    route: '/notes/1',
    fixtures: 'session',
    setup: async (page) => {
      await page.getByRole('button', { name: 'Nxd2', exact: true }).click()
    },
  },
  { name: 'NoteNotFound', route: '/notes/999', fixtures: 'session' },
  { name: 'Notes', route: '/notes', fixtures: 'session' },
  { name: 'NotesEmpty', route: '/notes', fixtures: 'session', notes: 'empty' },
  { name: 'NotesGuest', route: '/notes', fixtures: 'guest' },
  { name: 'NewNote', route: '/notes/new', fixtures: 'session' },
  // From a Folder's "New note here" (#74), with that Folder chosen.
  { name: 'NewNoteInFolder', route: '/notes/new?folder=6', fixtures: 'session' },
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
  // The PGN reader loads as its own chunk (#84): a pasted game while it is
  // still loading, and when it failed to load (offline).
  {
    name: 'NewNotePgnLoading',
    route: '/notes/new',
    fixtures: 'session',
    setup: async (page) => {
      await withPgnReader(page, 'pending')
      await page.getByRole('textbox', { name: 'PGN' }).fill('[White "Lovelace, Ada"]\n[Black "Hopper, Grace"]\n\n1. e4 e5 2. Nf3 Nc6 *')
      await page.getByRole('button', { name: 'Create note' }).click()
      await page.getByRole('status').filter({ hasText: 'Reading the PGN' }).waitFor()
    },
  },
  {
    name: 'NewNotePgnLoadFailed',
    route: '/notes/new',
    fixtures: 'session',
    setup: async (page) => {
      await withPgnReader(page, 'failed')
      await page.getByText('Could not load the PGN reader').waitFor()
      await page.getByRole('textbox', { name: 'PGN' }).fill('[White "Lovelace, Ada"]\n[Black "Hopper, Grace"]\n\n1. e4 e5 2. Nf3 Nc6 *')
      await page.getByRole('textbox', { name: 'Name' }).click()
      await page.getByText('Could not load the PGN reader').waitFor()
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
  // A Guest plays on the board too (#75), and the new Variation is kept in the browser.
  {
    name: 'GuestPlayMove',
    route: '/try',
    fixtures: 'guest',
    setup: async (page) => {
      await startGuestNote(page)
      await page.getByRole('button', { name: 'Nxd5', exact: true }).nth(1).click()
      for (const square of ['c7', 'c6']) await page.locator(`[id$="-square-${square}"]`).click()
      await page.getByRole('button', { name: 'c6', exact: true }).waitFor()
      await page.evaluate(() => window.scrollTo(0, 0))
    },
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
  // The site in its other themes (docs/adr/0008); every other entry shows
  // Warm paper, the default. The Note screen, the landing page and Settings
  // in Night and Cool paper.
  ...(['night', 'cool'] as const).flatMap((theme): ShotEntry[] => {
    const suffix = theme === 'night' ? 'Night' : 'CoolPaper'
    return [
      {
        name: `Note-${suffix}`,
        route: '/notes/1',
        fixtures: 'session',
        theme,
        setup: async (page) => {
          await page.getByRole('button', { name: 'exd5', exact: true }).click()
        },
      },
      { name: `HomeLoggedOut-${suffix}`, route: '/', fixtures: 'guest', theme },
      { name: `Settings-${suffix}`, route: '/settings', fixtures: 'session', theme },
    ]
  }),
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

/**
 * Reloads the page with the PGN reader's chunk never arriving or failing to
 * load, as the form starts loading it as soon as it opens.
 */
async function withPgnReader(page: Page, reader: 'pending' | 'failed') {
  // Shots run against a production build, where the chunk is hashed.
  await page.route('**/assets/pgnImport-*.js', async (route) => {
    if (reader === 'failed') await route.abort('internetdisconnected')
    // Pending: never answered.
  })
  await page.reload({ waitUntil: 'load' })
  await page.evaluate(() => document.fonts.ready)
  await page.addStyleTag({
    content: '*, *::before, *::after { animation-duration: 0s !important; animation-delay: 0s !important; transition-duration: 0s !important; caret-color: transparent !important; }',
  })
  await page.getByRole('textbox', { name: 'PGN' }).waitFor()
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
