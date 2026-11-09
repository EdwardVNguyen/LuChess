import type { Page } from 'playwright'
import type { Note, PlyWriting } from '../../src/api.js'
import { linkTargets } from '../../src/notes/links.js'
import type { FixtureSet, LinksFixture, NotesFixture, PliesFixture, SearchFixture } from './entries.js'
import { loggedInSession, sampleNotes, samplePlies } from './fixtures.js'

// Never reached over the network: every request to it is intercepted below.
// Vite still requires VITE_API_URL to be a well-formed http(s) URL.
export const API_BASE_URL = 'http://shots.invalid'

// Mocks the whole API surface the frontend calls, so the harness never needs a
// real server or database. `fixtures` picks between a logged-out visitor and a
// signed-in session (mocked refresh and /me).
export async function installApiMocks(
  page: Page,
  fixtures: FixtureSet,
  notesFixture: NotesFixture = 'sample',
  searchFixture: SearchFixture = 'sample',
  pliesFixture: PliesFixture = 'sample',
  linksFixture: LinksFixture = 'sample',
): Promise<void> {
  // Kept per page, so creating, renaming or deleting shows up in the list.
  let notes: Note[] = notesFixture === 'sample' ? structuredClone(sampleNotes) : []
  let nextId = 100
  const plies: Record<number, PlyWriting[]> = structuredClone(samplePlies)

  await page.route(`${API_BASE_URL}/**`, async (route) => {
    const request = route.request()
    const { pathname } = new URL(request.url())
    const method = request.method()
    const json = (status: number, body: unknown) =>
      route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })

    if (pathname === '/api/health' && method === 'GET') return json(200, { status: 'ok' })

    if (pathname === '/api/auth/refresh' && method === 'POST') {
      if (fixtures === 'restoring') return
      if (fixtures === 'restoreError') return json(500, { error: 'Something went wrong' })
      return fixtures === 'session' ? json(200, loggedInSession) : json(401, { error: 'No session' })
    }

    if (pathname === '/api/me' && method === 'GET') {
      return fixtures === 'session' ? json(200, loggedInSession.user) : json(401, { error: 'Not signed in' })
    }

    if (pathname === '/api/auth/signup' && method === 'POST') {
      const body = request.postDataJSON() as { email: string; name: string }
      return json(200, { id: 99, email: body.email, name: body.name })
    }

    if (pathname === '/api/auth/resend-verification' && method === 'POST') {
      return json(200, { message: 'A new link is on its way.' })
    }

    if (pathname === '/api/auth/forgot-password' && method === 'POST') {
      return json(200, { message: 'If that email belongs to an account, we have sent a link to reset its password.' })
    }

    if (pathname === '/api/auth/reset-password' && method === 'POST') {
      const body = request.postDataJSON() as { token: string }
      return body.token === 'expired'
        ? json(400, { error: 'This reset link is invalid or has expired' })
        : json(200, {})
    }

    if (pathname === '/api/auth/verify-email' && method === 'POST') return json(200, {})
    if (pathname === '/api/auth/login' && method === 'POST') return json(200, loggedInSession)
    if (pathname === '/api/auth/logout' && method === 'POST') return json(200, {})

    if (pathname === '/api/notes/search' && method === 'GET') {
      if (fixtures !== 'session') return json(401, { error: 'Unauthorized' })
      if (searchFixture === 'pending') return
      if (searchFixture === 'error') return json(500, { error: 'Could not search notes' })
      const query = new URL(request.url()).searchParams.get('q') ?? ''
      return json(200, searchNotes(notes, query))
    }

    const linksMatch = /^\/api\/notes\/(\d+)\/links$/.exec(pathname)
    if (linksMatch && method === 'GET') {
      if (fixtures !== 'session') return json(401, { error: 'Unauthorized' })
      const id = Number(linksMatch[1])
      if (!notes.some((n) => n.id === id)) return json(404, { error: 'Note not found' })
      if (linksFixture === 'pending') return
      if (linksFixture === 'error') return json(500, { error: "Could not load the note's links" })
      return json(200, noteLinks(notes, plies, id))
    }

    const pliesMatch = /^\/api\/notes\/(\d+)\/plies(?:\/(\d+))?$/.exec(pathname)
    if (pliesMatch) {
      if (fixtures !== 'session') return json(401, { error: 'Unauthorized' })
      const id = Number(pliesMatch[1])
      if (!notes.some((n) => n.id === id)) return json(404, { error: 'Note not found' })
      if (method === 'GET') {
        if (pliesFixture === 'pending') return
        if (pliesFixture === 'error') return json(500, { error: "Could not load the note's writing" })
        return json(200, plies[id] ?? [])
      }
      if (method === 'PUT' && pliesMatch[2]) {
        if (pliesFixture === 'saveError') return json(400, { error: 'Comment must be at most 20,000 characters' })
        const ply = Number(pliesMatch[2])
        const body = request.postDataJSON() as Omit<PlyWriting, 'ply' | 'updatedAt'>
        const blank = (v: string | null) => (v && v.trim() ? v.trim() : null)
        const written: PlyWriting = {
          ply,
          comment: blank(body.comment),
          body: blank(body.body),
          moveGlyph: blank(body.moveGlyph),
          positionGlyph: blank(body.positionGlyph),
          updatedAt: new Date().toISOString(),
        }
        const others = (plies[id] ?? []).filter((p) => p.ply !== ply)
        const kept = written.comment || written.body || written.moveGlyph || written.positionGlyph
        plies[id] = kept ? [...others, written].sort((a, b) => a.ply - b.ply) : others
        return json(200, written)
      }
    }

    const noteMatch = /^\/api\/notes(?:\/(\d+))?$/.exec(pathname)
    if (noteMatch) {
      if (fixtures !== 'session') return json(401, { error: 'Unauthorized' })
      // Left unanswered, so the screen stays loading for the screenshot.
      if (notesFixture === 'pending') return
      if (notesFixture === 'error') return json(500, { error: 'Could not load notes' })

      const id = noteMatch[1] ? Number(noteMatch[1]) : null
      const now = new Date().toISOString()
      if (id === null && method === 'GET') {
        return json(
          200,
          notes.map(({ id, name, createdAt, updatedAt }) => ({ id, name, createdAt, updatedAt })),
        )
      }
      if (id === null && method === 'POST') {
        const body = request.postDataJSON() as Pick<Note, 'name' | 'pgn' | 'startFen'>
        const note: Note = { ...body, id: nextId++, createdAt: now, updatedAt: now }
        notes = [note, ...notes]
        return json(201, note)
      }
      const note = notes.find((n) => n.id === id)
      if (!note) return json(404, { error: 'Note not found' })
      if (method === 'GET') return json(200, note)
      if (method === 'PATCH') {
        const body = request.postDataJSON() as { name: string }
        Object.assign(note, { name: body.name, updatedAt: now })
        return json(200, note)
      }
      if (method === 'DELETE') {
        notes = notes.filter((n) => n.id !== id)
        return route.fulfill({ status: 204 })
      }
    }

    return json(404, { error: `Not mocked for the screenshot harness: ${method} ${pathname}` })
  })
}

// A stand-in for the server's Link index, read straight from the text.
function noteLinks(notes: Note[], plies: Record<number, PlyWriting[]>, id: number) {
  const ids = new Set((plies[id] ?? []).flatMap((p) => linkTargets(`${p.comment ?? ''}\n${p.body ?? ''}`)))
  const targets = notes.filter((n) => ids.has(n.id)).map((n) => searchRow(n))
  const backlinks = notes
    .filter((n) => n.id !== id)
    .flatMap((n) =>
      (plies[n.id] ?? []).flatMap((p) =>
        (['comment', 'body'] as const)
          .filter((part) => linkTargets(p[part] ?? '').includes(id))
          .map((part) => ({ noteId: n.id, name: n.name, startFen: n.startFen, ply: p.ply, part })),
      ),
    )
  return { targets, backlinks }
}

const tag = (pgn: string, name: string) => new RegExp(`^\\[${name} "([^"]*)"`, 'm').exec(pgn)?.[1] ?? null

function searchRow(note: Note) {
  return { id: note.id, name: note.name, white: tag(note.pgn, 'White'), black: tag(note.pgn, 'Black'), date: tag(note.pgn, 'Date') }
}

// A stand-in for the server's trigram search: a Note matches when the query's
// letters appear in order in its name, else in its players, name matches first.
function searchNotes(notes: Note[], query: string) {
  const q = query.trim().toLowerCase()
  const fuzzy = (text: string) => {
    let from = 0
    for (const char of q) {
      from = text.toLowerCase().indexOf(char, from) + 1
      if (from === 0) return false
    }
    return true
  }
  const rows = notes.map(searchRow)
  if (q === '') return []
  const byName = rows.filter((row) => fuzzy(row.name))
  const byPlayers = rows.filter((row) => !byName.includes(row) && fuzzy(`${row.white ?? ''} ${row.black ?? ''}`))
  return [...byName, ...byPlayers]
}
