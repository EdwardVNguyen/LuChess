import { createLazyRoute } from '@tanstack/react-router'
import { EditPositionPage } from '../notes/EditPositionPage'
import { ImportPage } from '../notes/ImportPage'
import { NoteScreen } from '../notes/NoteScreen'
import { NotesIndex } from '../notes/NotesIndex'
import { NotesLayout } from '../notes/NotesLayout'
import { SettingsPage } from '../settings/SettingsPage'

// The signed-in app's chunk: the Notes area and Settings, so moving between
// them never waits for code.
export const notesRoute = createLazyRoute('/notes')({ component: NotesLayout })
export const notesIndexRoute = createLazyRoute('/notes/')({ component: NotesIndex })
export const importRoute = createLazyRoute('/notes/import')({ component: ImportPage })
export const noteRoute = createLazyRoute('/notes/$noteId')({ component: NoteScreen })
export const notePositionRoute = createLazyRoute('/notes/$noteId/position')({ component: EditPositionPage })
export const settingsRoute = createLazyRoute('/settings')({ component: SettingsPage })
