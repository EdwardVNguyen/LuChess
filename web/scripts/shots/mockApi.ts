import type { Page } from 'playwright'
import type { Note } from '../../src/api.js'
import type { FixtureSet, NotesFixture } from './entries.js'
import { loggedInSession, sampleNotes } from './fixtures.js'

// Never reached over the network: every request to it is intercepted below.
// Vite still requires VITE_API_URL to be a well-formed http(s) URL.
export const API_BASE_URL = 'http://shots.invalid'

// Mocks the whole API surface the frontend calls, so the harness never needs a
// real server or database. `fixtures` picks between a logged-out visitor and a
// signed-in session (mocked refresh and /me).
export async function installApiMocks(page: Page, fixtures: FixtureSet, notesFixture: NotesFixture = 'sample'): Promise<void> {
  // Kept per page, so creating, renaming or deleting shows up in the list.
  let notes: Note[] = notesFixture === 'sample' ? structuredClone(sampleNotes) : []
  let nextId = 100

  await page.route(`${API_BASE_URL}/**`, async (route) => {
    const request = route.request()
    const { pathname } = new URL(request.url())
    const method = request.method()
    const json = (status: number, body: unknown) =>
      route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })

    if (pathname === '/api/health' && method === 'GET') return json(200, { status: 'ok' })

    if (pathname === '/api/auth/refresh' && method === 'POST') {
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
