import type { Page } from 'playwright'
import type { Folder, MoveRow, NewNoteInput, Note, ResetTree, TreeInput, WritingInput } from '../../src/api.js'
import { importPgn } from '../../src/chess/pgnImport.ts'
import { mainLine, moveOf, type MoveId } from '../../src/chess/tree.ts'
import { linkTargets } from '../../src/notes/links.js'
import type { FixtureSet, LinksFixture, MovesFixture, NotesFixture, SearchFixture } from './entries.js'
import {
  landingFolders,
  landingNotes,
  landingSession,
  landingWriting,
  loggedInSession,
  sampleFolders,
  sampleNotes,
  sampleWriting,
  type SampleNote,
  type SampleWriting,
} from './fixtures.js'

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
  movesFixture: MovesFixture = 'sample',
  linksFixture: LinksFixture = 'sample',
): Promise<void> {
  // Kept per page, so creating, renaming or deleting shows up in the list.
  const landing = notesFixture === 'landing'
  const session = landing ? landingSession : loggedInSession
  const samples = notesFixture === 'sample' ? sampleNotes : landing ? landingNotes : []
  const moves = new MoveStore()
  let notes: Note[] = samples.map((sample) =>
    moves.loadSample(sample, (landing ? landingWriting : sampleWriting)[sample.id] ?? []),
  )
  let folders: Folder[] = notesFixture === 'sample' ? structuredClone(sampleFolders) : landing ? structuredClone(landingFolders) : []
  let nextId = 100

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
      return fixtures === 'session' ? json(200, session) : json(401, { error: 'No session' })
    }

    if (pathname === '/api/me' && method === 'GET') {
      return fixtures === 'session' ? json(200, session.user) : json(401, { error: 'Not signed in' })
    }

    // Deleting the account (#12): "wrong password" is refused, "offline" fails
    // with a server error, anything else deletes it.
    if (pathname === '/api/me' && method === 'DELETE') {
      if (fixtures !== 'session') return json(401, { error: 'Unauthorized' })
      const body = request.postDataJSON() as { password: string }
      if (body.password === 'wrong password') return json(403, { error: 'That password is not correct' })
      if (body.password === 'offline') return json(500, { error: 'Could not delete your account' })
      return route.fulfill({ status: 204 })
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
      return json(200, searchNotes(notes, folders, query))
    }

    // Folders, as the API keeps them (#11): deleting one that isn't empty is
    // refused with the counts until confirmed, and its Notes go to the root.
    const folderMatch = /^\/api\/folders(?:\/(\d+))?$/.exec(pathname)
    if (folderMatch) {
      if (fixtures !== 'session') return json(401, { error: 'Unauthorized' })
      if (notesFixture === 'pending') return
      if (notesFixture === 'error') return json(500, { error: 'Could not load folders' })
      const id = folderMatch[1] ? Number(folderMatch[1]) : null
      if (id === null && method === 'GET') return json(200, folders)
      if (id === null && method === 'POST') {
        const body = request.postDataJSON() as { name: string; parentId: number | null }
        const folder: Folder = { id: nextId++, name: body.name, parentId: body.parentId }
        folders = [...folders, folder]
        return json(201, folder)
      }
      const folder = folders.find((f) => f.id === id)
      if (!folder) return json(404, { error: 'Folder not found' })
      if (method === 'PATCH') {
        Object.assign(folder, request.postDataJSON() as Partial<Folder>)
        return json(200, folder)
      }
      if (method === 'DELETE') {
        const inside = new Set([folder.id])
        for (let grew = true; grew; ) {
          grew = false
          for (const f of folders) {
            if (f.parentId !== null && inside.has(f.parentId) && !inside.has(f.id)) {
              inside.add(f.id)
              grew = true
            }
          }
        }
        const filed = notes.filter((n) => n.folderId !== null && inside.has(n.folderId))
        const confirm = new URL(request.url()).searchParams.get('confirm') === 'true'
        if ((inside.size > 1 || filed.length > 0) && !confirm) {
          return json(409, { error: 'Deleting this folder moves its notes to the root', folders: inside.size - 1, notes: filed.length })
        }
        folders = folders.filter((f) => !inside.has(f.id))
        for (const n of filed) n.folderId = null
        return route.fulfill({ status: 204 })
      }
    }

    const noteFolderMatch = /^\/api\/notes\/(\d+)\/folder$/.exec(pathname)
    if (noteFolderMatch && method === 'PUT') {
      if (fixtures !== 'session') return json(401, { error: 'Unauthorized' })
      const note = notes.find((n) => n.id === Number(noteFolderMatch[1]))
      if (!note) return json(404, { error: 'Note not found' })
      const body = request.postDataJSON() as { folderId: number | null }
      if (body.folderId !== null && !folders.some((f) => f.id === body.folderId)) return json(404, { error: 'Folder not found' })
      note.folderId = body.folderId
      return json(200, note)
    }

    const linksMatch = /^\/api\/notes\/(\d+)\/links$/.exec(pathname)
    if (linksMatch && method === 'GET') {
      if (fixtures !== 'session') return json(401, { error: 'Unauthorized' })
      const id = Number(linksMatch[1])
      if (!notes.some((n) => n.id === id)) return json(404, { error: 'Note not found' })
      if (linksFixture === 'pending') return
      if (linksFixture === 'error') return json(500, { error: "Could not load the note's links" })
      return json(200, noteLinks(notes, moves, id))
    }

    // A Note's tree of Moves, as the API keeps it (ADR 0009): playing a SAN
    // already there answers that Move, and deleting a subtree with writing in
    // it is refused with the counts until confirmed.
    const movesMatch = /^\/api\/notes\/(\d+)\/moves(?:\/(\d+)(\/writing|\/promote)?)?$/.exec(pathname)
    if (movesMatch) {
      if (fixtures !== 'session') return json(401, { error: 'Unauthorized' })
      // The moves load with the Note, so they wait or fail with it.
      if (notesFixture === 'pending') return
      if (notesFixture === 'error') return json(500, { error: "Could not load the note's moves" })
      const id = Number(movesMatch[1])
      const note = notes.find((n) => n.id === id)
      if (!note) return json(404, { error: 'Note not found' })
      const touch = () => (note.updatedAt = new Date().toISOString())
      const moveId = movesMatch[2] ? Number(movesMatch[2]) : null
      const action = movesMatch[3] ?? null
      if (moveId === null && method === 'GET') {
        if (movesFixture === 'pending') return
        if (movesFixture === 'error') return json(500, { error: "Could not load the note's moves" })
        return json(200, moves.list(id))
      }
      if (moveId === null && method === 'POST') {
        if (movesFixture === 'editError') return json(500, { error: 'Could not save the move' })
        const body = request.postDataJSON() as { parentId: number; san: string }
        const { row, created } = moves.add(id, body.parentId, body.san)
        if (created) touch()
        return json(created ? 201 : 200, row)
      }
      const row = moveId === null ? undefined : moves.get(id, moveId)
      if (!row) return json(404, { error: 'Move not found' })
      if (action === '/writing' && method === 'PUT') {
        if (movesFixture === 'saveError') return json(400, { error: 'Comment must be at most 20,000 characters' })
        moves.write(row, request.postDataJSON() as WritingInput)
        touch()
        return json(200, row)
      }
      if (action === '/promote' && method === 'POST') {
        moves.promote(row)
        touch()
        return route.fulfill({ status: 204 })
      }
      if (action === null && method === 'DELETE') {
        if (movesFixture === 'editError') return json(500, { error: 'Could not delete the move' })
        const confirm = new URL(request.url()).searchParams.get('confirm') === 'true'
        const counts = moves.writingUnder(row)
        const total = counts.comments + counts.bodies + counts.glyphs + counts.drawings
        if (total > 0 && !confirm) return json(409, { error: `This will delete ${describeWriting(counts)}`, ...counts })
        moves.remove(row)
        touch()
        return route.fulfill({ status: 204 })
      }
    }

    // A new Position resets the Note (docs/adr/0010): refused with the counts
    // while it has Moves or writing, until confirmed.
    const positionMatch = /^\/api\/notes\/(\d+)\/position$/.exec(pathname)
    if (positionMatch && method === 'PUT') {
      if (fixtures !== 'session') return json(401, { error: 'Unauthorized' })
      const id = Number(positionMatch[1])
      const note = notes.find((n) => n.id === id)
      if (!note) return json(404, { error: 'Note not found' })
      const confirm = new URL(request.url()).searchParams.get('confirm') === 'true'
      const counts = moves.resetCounts(id)
      if (Object.values(counts).some((n) => n > 0) && !confirm) return json(409, { error: 'This will delete them', ...counts })
      const body = request.postDataJSON() as { startFen: string | null } & Partial<ResetTree>
      moves.reset(id, body)
      Object.assign(note, { startFen: body.startFen, tags: body.tags ?? [], updatedAt: new Date().toISOString() })
      return json(200, note)
    }

    // A PGN with the same Position, matched to the Note (#109): refused with
    // what it would delete until confirmed. The writing it would replace isn't
    // counted here; the shots only need the confirmation to show.
    const treeMatch = /^\/api\/notes\/(\d+)\/tree$/.exec(pathname)
    if (treeMatch && method === 'PUT') {
      if (fixtures !== 'session') return json(401, { error: 'Unauthorized' })
      const id = Number(treeMatch[1])
      const note = notes.find((n) => n.id === id)
      if (!note) return json(404, { error: 'Note not found' })
      const confirm = new URL(request.url()).searchParams.get('confirm') === 'true'
      const input = request.postDataJSON() as TreeInput
      const gone = moves.unmatched(id, input)
      const counts = { moves: 0, comments: 0, bodies: 0, glyphs: 0, drawings: 0, links: 0 }
      for (const row of gone) {
        const under = moves.writingUnder(row)
        counts.moves += moves.size(row)
        counts.comments += under.comments
        counts.bodies += under.bodies
        counts.glyphs += under.glyphs
        counts.drawings += under.drawings
      }
      if (gone.length > 0 && !confirm) return json(409, { error: 'This will delete them', ...counts })
      for (const row of gone) moves.remove(row)
      Object.assign(note, { tags: input.tags, updatedAt: new Date().toISOString() })
      return json(200, { note, moves: moves.list(id) })
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
          notes.map(({ id, name, folderId, createdAt, updatedAt }) => ({ id, name, folderId, createdAt, updatedAt })),
        )
      }
      if (id === null && method === 'POST') {
        const body = request.postDataJSON() as NewNoteInput
        const note: Note = {
          id: nextId++,
          name: body.name,
          startFen: body.startFen,
          tags: body.tags,
          folderId: body.folderId ?? null,
          createdAt: now,
          updatedAt: now,
        }
        moves.create(note.id, body)
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
function noteLinks(notes: Note[], moves: MoveStore, id: number) {
  const ids = new Set(moves.list(id).flatMap((row) => linkTargets(`${row.comment ?? ''}\n${row.body ?? ''}`)))
  const targets = notes
    .filter((n) => ids.has(n.id))
    .map((n) => ({ id: n.id, name: n.name, white: tag(n, 'White'), black: tag(n, 'Black'), date: tag(n, 'Date') }))
  const backlinks = notes
    .filter((n) => n.id !== id)
    .flatMap((n) =>
      moves.list(n.id).flatMap((row) =>
        (['comment', 'body'] as const)
          .filter((part) => linkTargets(row[part] ?? '').includes(id))
          .map((part) => ({
            noteId: n.id,
            name: n.name,
            startFen: n.startFen,
            moveId: row.id,
            san: row.san,
            ply: moves.ply(row),
            part,
          })),
      ),
    )
  return { targets, backlinks }
}

const tag = (note: Note, name: string) => note.tags.find(([key]) => key === name)?.[1] ?? null

type Stored = MoveRow & { noteId: number; ord: number }
type Counts = { comments: number; bodies: number; glyphs: number; drawings: number }

const blank = (v: string | null | undefined) => (v && v.trim() ? v.trim() : null)

// Every Note's Moves, as the API's moves table keeps them: one root per Note,
// siblings ordered by `ord`, ids shared across Notes.
class MoveStore {
  private rows = new Map<number, Stored>()
  private nextId = 1
  private at = new Date().toISOString()

  /** A sample Note as the API would serve it, its PGN read into rows with the sample writing on its Main line. */
  loadSample(sample: SampleNote, writing: SampleWriting[]): Note {
    const imported = importPgn(sample.pgn)
    if (!imported.ok) throw new Error(`Sample note ${sample.id}: ${imported.error}`)
    const { tree, tags } = imported.value
    const ids = new Map<MoveId, number>()
    const stack: MoveId[] = [tree.root]
    while (stack.length > 0) {
      const move = moveOf(tree, stack.pop() as MoveId)
      const parentId = move.parent === null ? null : (ids.get(move.parent) as number)
      const ord = move.parent === null ? 0 : moveOf(tree, move.parent).children.indexOf(move.id)
      ids.set(move.id, this.insert(sample.id, parentId, move.san, ord, imported.value.writing.get(move.id)).id)
      stack.push(...[...move.children].reverse())
    }
    const line = mainLine(tree)
    for (const { ply, ...fields } of writing) {
      const row = this.rows.get(ids.get(line[ply].id) as number) as Stored
      this.write(row, { ...writingOf(row), ...fields })
    }
    const { pgn: _pgn, ...note } = structuredClone(sample)
    return { ...note, tags }
  }

  /** A new Note's tree, from the moves listed with their parents' indices. */
  create(noteId: number, input: NewNoteInput) {
    const root = this.insert(noteId, null, null, 0, input.position)
    const ids: number[] = []
    for (const move of input.moves) {
      const parentId = move.parent === null ? root.id : ids[move.parent]
      ids.push(this.insert(noteId, parentId, move.san, this.children(parentId).length, move).id)
    }
  }

  list(noteId: number): MoveRow[] {
    return [...this.rows.values()]
      .filter((row) => row.noteId === noteId)
      .sort((a, b) => (a.parentId ?? -1) - (b.parentId ?? -1) || a.ord - b.ord || a.id - b.id)
      .map(({ noteId: _noteId, ord: _ord, ...row }) => row)
  }

  get(noteId: number, id: number): Stored | undefined {
    const row = this.rows.get(id)
    return row?.noteId === noteId ? row : undefined
  }

  add(noteId: number, parentId: number, san: string): { row: Stored; created: boolean } {
    const existing = this.children(parentId).find((row) => row.san === san)
    if (existing) return { row: existing, created: false }
    const ords = this.children(parentId).map((row) => row.ord)
    return { row: this.insert(noteId, parentId, san, ords.length > 0 ? Math.max(...ords) + 1 : 0), created: true }
  }

  write(row: Stored, input: Partial<WritingInput>) {
    Object.assign(row, {
      comment: blank(input.comment),
      body: blank(input.body),
      moveGlyph: blank(input.moveGlyph),
      positionGlyph: blank(input.positionGlyph),
      drawings: input.drawings ?? [],
      updatedAt: new Date().toISOString(),
    })
  }

  promote(row: Stored) {
    for (let at: Stored | undefined = row; at && at.parentId !== null; at = this.rows.get(at.parentId)) {
      const siblings = this.children(at.parentId)
      if (siblings[0] !== at) at.ord = Math.min(...siblings.map((s) => s.ord)) - 1
    }
  }

  writingUnder(row: Stored): Counts {
    const counts: Counts = { comments: 0, bodies: 0, glyphs: 0, drawings: 0 }
    for (const at of this.subtree(row)) {
      if (at.comment) counts.comments += 1
      if (at.body) counts.bodies += 1
      if (at.moveGlyph) counts.glyphs += 1
      if (at.positionGlyph) counts.glyphs += 1
      counts.drawings += at.drawings.length
    }
    return counts
  }

  /** What resetting a Note to a new Position would delete: every Move, and all the writing. */
  resetCounts(noteId: number): Counts & { moves: number } {
    const root = [...this.rows.values()].find((row) => row.noteId === noteId && row.parentId === null) as Stored
    return { moves: this.subtree(root).length - 1, ...this.writingUnder(root) }
  }

  /** A Note's tree replaced by a new one: an empty root, or the tree of the PGN that gave the new Position. */
  reset(noteId: number, tree: Partial<ResetTree>) {
    for (const row of [...this.rows.values()]) if (row.noteId === noteId) this.rows.delete(row.id)
    this.create(noteId, { position: tree.position ?? {}, moves: tree.moves ?? [] } as NewNoteInput)
  }

  /** The stored Moves an applied tree no longer has, the top of each subtree that would go. */
  unmatched(noteId: number, input: TreeInput): Stored[] {
    const root = [...this.rows.values()].find((row) => row.noteId === noteId && row.parentId === null) as Stored
    const matched: (Stored | undefined)[] = []
    const kept = new Set<Stored>([root])
    for (const move of input.moves) {
      const parent = move.parent === null ? root : matched[move.parent]
      const row = parent && this.children(parent.id).find((child) => child.san === move.san)
      matched.push(row)
      if (row) kept.add(row)
    }
    return [...kept].flatMap((row) => this.children(row.id).filter((child) => !kept.has(child)))
  }

  /** How many Moves are in a Move's subtree, itself included. */
  size(row: Stored): number {
    return this.subtree(row).length
  }

  remove(row: Stored) {
    for (const at of this.subtree(row)) this.rows.delete(at.id)
  }

  ply(row: MoveRow): number {
    let ply = 0
    for (let at = this.rows.get(row.id); at && at.parentId !== null; at = this.rows.get(at.parentId)) ply += 1
    return ply
  }

  private children(parentId: number): Stored[] {
    return [...this.rows.values()].filter((row) => row.parentId === parentId).sort((a, b) => a.ord - b.ord || a.id - b.id)
  }

  private subtree(row: Stored): Stored[] {
    const all = [row]
    for (let i = 0; i < all.length; i += 1) all.push(...this.children(all[i].id))
    return all
  }

  private insert(noteId: number, parentId: number | null, san: string | null, ord: number, writing?: Partial<WritingInput>): Stored {
    const row: Stored = {
      noteId,
      ord,
      id: this.nextId++,
      parentId,
      san,
      comment: null,
      body: null,
      moveGlyph: null,
      positionGlyph: null,
      drawings: [],
      updatedAt: this.at,
    }
    this.rows.set(row.id, row)
    if (writing) {
      this.write(row, writing)
      row.updatedAt = this.at
    }
    return row
  }
}

function writingOf(row: MoveRow): WritingInput {
  const { comment, body, moveGlyph, positionGlyph, drawings } = row
  return { comment, body, moveGlyph, positionGlyph, drawings }
}

function describeWriting(counts: Counts): string {
  const parts = (
    [
      [counts.comments, 'Comment', 'Comments'],
      [counts.bodies, 'Body', 'Bodies'],
      [counts.glyphs, 'Glyph', 'Glyphs'],
      [counts.drawings, 'Drawing', 'Drawings'],
    ] as const
  )
    .filter(([n]) => n > 0)
    .map(([n, one, many]) => `${n} ${n === 1 ? one : many}`)
  return parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`
}

function searchRow(note: Note, folders: Folder[]) {
  const folderPath: string[] = []
  for (let f = folders.find((x) => x.id === note.folderId); f; f = folders.find((x) => x.id === f!.parentId)) folderPath.unshift(f.name)
  return { id: note.id, name: note.name, white: tag(note, 'White'), black: tag(note, 'Black'), date: tag(note, 'Date'), folderPath }
}

// A stand-in for the server's trigram search: a Note matches when the query's
// letters appear in order in its name, else in its players, else in its
// Folders; name matches first.
function searchNotes(notes: Note[], folders: Folder[], query: string) {
  const q = query.trim().toLowerCase()
  const fuzzy = (text: string) => {
    let from = 0
    for (const char of q) {
      from = text.toLowerCase().indexOf(char, from) + 1
      if (from === 0) return false
    }
    return true
  }
  const rows = notes.map((note) => searchRow(note, folders))
  if (q === '') return []
  const byName = rows.filter((row) => fuzzy(row.name))
  const byPlayers = rows.filter((row) => !byName.includes(row) && fuzzy(`${row.white ?? ''} ${row.black ?? ''}`))
  const byFolder = rows.filter((row) => !byName.includes(row) && !byPlayers.includes(row) && fuzzy(row.folderPath.join(' / ')))
  return [...byName, ...byPlayers, ...byFolder]
}
