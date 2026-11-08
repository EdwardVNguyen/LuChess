import type { Page } from 'playwright'

export type FixtureSet = 'guest' | 'session'

export type ShotEntry = {
  /** Matches a design screen name, e.g. `design/screenshots/<name>.png`. */
  name: string
  route: string
  fixtures: FixtureSet
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
]
