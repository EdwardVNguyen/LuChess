import { screen, waitFor, within } from '@testing-library/react'

// Queries for the tests that drive a whole Note screen (NoteScreen or the
// GuestPage). Such a page holds some 50 buttons, 32 of them react-chessboard's
// pieces (role="button" with no name, which it gives no way to change), and a
// named *ByRole query computes the accessible name of every candidate before
// matching. In jsdom that is a getComputedStyle per node visited, each a walk
// up the tree against the default stylesheet, so one page-wide named button
// query costs ~100ms. Scoped to the landmark that holds the element, it costs
// a few ms (#151).

/** The move list: the Writing section, where each Move is a button. */
export function moveList() {
  return within(screen.getByRole('region', { name: 'Writing' }))
}

/** The Move's button in the move list. */
export function move(san: string): HTMLElement {
  return moveList().getByRole('button', { name: san })
}

/** The Move's button, once the move list shows it. */
export function findMove(san: string): Promise<HTMLElement> {
  return waitFor(() => move(san))
}

/**
 * The form that starts a Note from PGN or FEN, by its title. On the GuestPage
 * it shows over the Note it would replace, which stays in the document.
 */
export function startForm(title: string) {
  return within(screen.getByRole('form', { name: title }))
}

/** The Tools region under the board: the current Move's editor, the FEN and the PGN. */
export function tools() {
  return within(screen.getByRole('region', { name: 'Tools' }))
}

/**
 * The Note's title menu button. Its name is an aria-label, so the label query
 * finds it without computing the name of every button on the page.
 */
export function noteActions(): HTMLElement {
  return screen.getByLabelText('Note actions')
}

/** The Note's title, the button that starts a rename, once the Note screen has loaded. */
export function findTitle(name: string): Promise<HTMLElement> {
  return waitFor(() => within(screen.getByRole('heading', { name })).getByRole('button', { name }))
}

/** The Note's title menu button, once the Note screen has loaded. */
export function findNoteActions(): Promise<HTMLElement> {
  return screen.findByLabelText('Note actions')
}

/** One of the stepping buttons under the board, by its label, as for noteActions. */
export function boardControl(label: 'First move' | 'Previous move' | 'Next move' | 'Last move'): HTMLElement {
  return screen.getByLabelText(label)
}

/** The board's square, as react-chessboard draws it. */
export function square(name: string): HTMLElement {
  const element = document.querySelector<HTMLElement>(`[id$="-square-${name}"]`)
  if (!element) throw new Error(`no square ${name}`)
  return element
}
