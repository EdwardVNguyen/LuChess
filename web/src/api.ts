import { z } from 'zod'

const healthSchema = z.object({ status: z.string() })
const userSchema = z.object({ id: z.number(), email: z.string(), name: z.string() })
const messageSchema = z.object({ message: z.string() })
const errorBodySchema = z.object({ error: z.string() })
const sessionResponseSchema = z.object({ accessToken: z.string(), user: userSchema })
const noteSummarySchema = z.object({
  id: z.number(),
  name: z.string(),
  folderId: z.number().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
})
const folderSchema = z.object({ id: z.number(), parentId: z.number().nullable(), name: z.string() })
const noteSearchResultSchema = z.object({
  id: z.number(),
  name: z.string(),
  white: z.string().nullable(),
  black: z.string().nullable(),
  date: z.string().nullable(),
  folderPath: z.array(z.string()),
})
const noteSchema = noteSummarySchema.extend({
  tags: z.array(z.tuple([z.string(), z.string()])),
  startFen: z.string().nullable(),
})
const drawingSchema = z.object({
  from: z.string(),
  to: z.string().optional(),
  brush: z.enum(['green', 'red', 'blue', 'yellow']),
})
const moveRowSchema = z.object({
  id: z.number(),
  parentId: z.number().nullable(),
  san: z.string().nullable(),
  comment: z.string().nullable(),
  body: z.string().nullable(),
  moveGlyph: z.string().nullable(),
  positionGlyph: z.string().nullable(),
  drawings: z.array(drawingSchema),
  updatedAt: z.string(),
})
const noteLinksSchema = z.object({
  targets: z.array(noteSearchResultSchema.omit({ folderPath: true })),
  backlinks: z.array(
    z.object({
      noteId: z.number(),
      name: z.string(),
      startFen: z.string().nullable(),
      moveId: z.number(),
      san: z.string().nullable(),
      ply: z.number(),
      part: z.enum(['comment', 'body']),
    }),
  ),
})

export type Health = z.infer<typeof healthSchema>
export type User = z.infer<typeof userSchema>
export type SessionResponse = z.infer<typeof sessionResponseSchema>
/** folderId is null for a Note at the root, in no Folder. */
export type NoteSummary = z.infer<typeof noteSummarySchema>
/** A Folder; parentId is null at the root. */
export type Folder = z.infer<typeof folderSchema>
/** tags are the PGN tag pairs in order; the moves are the Note's tree, from listMoves. */
export type Note = z.infer<typeof noteSchema>
/**
 * white, black and date come from the PGN headers, and are null when it has
 * none. folderPath names the Folders the Note is filed in, root first.
 */
export type NoteSearchResult = z.infer<typeof noteSearchResultSchema>
/**
 * One row of a Note's tree: a Move, or the root (the Position) when parentId
 * and san are null, with its writing. Rows list the root first and siblings in order.
 */
export type MoveRow = z.infer<typeof moveRowSchema>
/**
 * A Note's Links: `targets` are the Notes its Comments and Bodies link to that
 * still exist (a Link to any other is unresolved), and `backlinks` the
 * Comments and Bodies in other Notes that link to it.
 */
export type NoteLinks = z.infer<typeof noteLinksSchema>
export type LinkTarget = NoteLinks['targets'][number]
export type Backlink = NoteLinks['backlinks'][number]

export type SignUpInput = { email: string; name: string; password: string }
export type LoginInput = { email: string; password: string }
export type ResetPasswordInput = { token: string; password: string }
/** The writing on a Move or the Position, as the API takes it. Null or blank clears a field. */
export type WritingInput = Pick<MoveRow, 'comment' | 'body' | 'moveGlyph' | 'positionGlyph' | 'drawings'>

/**
 * A new Note: its Position (startFen null for the standard start), its PGN
 * tag pairs, the writing on the Position, and the Moves after it. Each Move
 * names its parent by its index in the list, or null for the Position, so a
 * parent comes before its children; siblings keep their order. folderId null
 * or absent files the Note at the root.
 */
export type NewNoteInput = {
  name: string
  startFen: string | null
  tags: [string, string][]
  folderId?: number | null
  position: Partial<WritingInput>
  moves: ({ parent: number | null; san: string } & Partial<WritingInput>)[]
}

/** What deleting a Move and its subtree would delete, by kind. */
export type WritingCounts = { comments: number; bodies: number; glyphs: number; drawings: number }
/** A delete either happened, or was refused until confirmed because it would delete writing. */
export type MoveDeleteResult = { status: 'deleted' } | ({ status: 'needsConfirmation'; message: string } & WritingCounts)

const deleteConflictSchema = z.object({
  error: z.string(),
  comments: z.number().int().nonnegative(),
  bodies: z.number().int().nonnegative(),
  glyphs: z.number().int().nonnegative(),
  drawings: z.number().int().nonnegative(),
})

/** A Folder's new name, parent (null for the root), or both. */
export type FolderUpdate = { name?: string; parentId?: number | null }
/**
 * Deleting a Folder either happened, or was refused until confirmed because
 * it would delete `folders` subfolders and move `notes` Notes to the root.
 */
export type FolderDeleteResult =
  { status: 'deleted' } | { status: 'needsConfirmation'; folders: number; notes: number; message: string }

const folderConflictSchema = z.object({
  error: z.string(),
  folders: z.number().int().nonnegative(),
  notes: z.number().int().nonnegative(),
})

export class ApiError extends Error {
  readonly status: number
  readonly retryAfterSeconds?: number
  /** The response body, for errors that carry more than a message. */
  readonly body?: unknown

  constructor(message: string, status: number, retryAfterSeconds?: number, body?: unknown) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.retryAfterSeconds = retryAfterSeconds
    this.body = body
  }
}

type RequestInput = { method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'; body?: unknown; accessToken?: string }

// The transport adapter: HTTP paths, credentials, schemas and ApiError. It
// holds no Session state; the Session module decides when to call it.
export function createApiClient(baseUrl: string, fetchFn: typeof fetch = fetch) {
  async function request(path: string, { method, body, accessToken }: RequestInput = {}): Promise<Response> {
    const headers: Record<string, string> = {}
    if (body !== undefined) headers['Content-Type'] = 'application/json'
    if (accessToken) headers.Authorization = `Bearer ${accessToken}`

    let res: Response
    try {
      res = await fetchFn(`${baseUrl}${path}`, {
        credentials: 'include',
        method: method ?? (body === undefined ? 'GET' : 'POST'),
        ...(Object.keys(headers).length > 0 ? { headers } : {}),
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      })
    } catch {
      throw new ApiError('Could not reach the server. Check your connection and try again.', 0)
    }
    if (res.ok) return res

    // Only trust the message if the body is the API's own error shape
    const errorBody: unknown = await res.json().catch(() => null)
    const parsed = errorBodySchema.safeParse(errorBody)
    const retryAfter = Number(res.headers.get('Retry-After'))
    throw new ApiError(
      parsed.success ? parsed.data.error : `Something went wrong (status ${res.status}). Please try again.`,
      res.status,
      Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : undefined,
      errorBody,
    )
  }

  return {
    async health(): Promise<Health> {
      const res = await request('/api/health')
      return healthSchema.parse(await res.json())
    },

    async signUp(input: SignUpInput): Promise<User> {
      const res = await request('/api/auth/signup', { body: input })
      return userSchema.parse(await res.json())
    },

    async verifyEmail(token: string): Promise<void> {
      await request('/api/auth/verify-email', { body: { token } })
    },

    async resendVerification(email: string): Promise<{ message: string }> {
      const res = await request('/api/auth/resend-verification', { body: { email } })
      return messageSchema.parse(await res.json())
    },

    async forgotPassword(email: string): Promise<{ message: string }> {
      const res = await request('/api/auth/forgot-password', { body: { email } })
      return messageSchema.parse(await res.json())
    },

    async resetPassword(input: ResetPasswordInput): Promise<void> {
      await request('/api/auth/reset-password', { body: input })
    },

    async login(input: LoginInput): Promise<SessionResponse> {
      const res = await request('/api/auth/login', { body: input })
      return sessionResponseSchema.parse(await res.json())
    },

    async refresh(): Promise<SessionResponse> {
      const res = await request('/api/auth/refresh', { method: 'POST' })
      return sessionResponseSchema.parse(await res.json())
    },

    async logout(): Promise<void> {
      await request('/api/auth/logout', { method: 'POST' })
    },

    async me(accessToken: string): Promise<User> {
      const res = await request('/api/me', { accessToken })
      return userSchema.parse(await res.json())
    },

    /**
     * Permanently deletes the signed-in user's account and everything in it,
     * once they re-enter their password. Every Session ends with it.
     */
    async deleteAccount(accessToken: string, password: string): Promise<void> {
      await request('/api/me', { method: 'DELETE', body: { password }, accessToken })
    },

    async listNotes(accessToken: string): Promise<NoteSummary[]> {
      const res = await request('/api/notes', { accessToken })
      return z.array(noteSummarySchema).parse(await res.json())
    },

    async searchNotes(accessToken: string, query: string): Promise<NoteSearchResult[]> {
      const res = await request(`/api/notes/search?q=${encodeURIComponent(query)}`, { accessToken })
      return z.array(noteSearchResultSchema).parse(await res.json())
    },

    async getNote(accessToken: string, id: number): Promise<Note> {
      const res = await request(`/api/notes/${id}`, { accessToken })
      return noteSchema.parse(await res.json())
    },

    /** Creates a Note with its whole tree of Moves and their writing, in one request. */
    async createNote(accessToken: string, input: NewNoteInput): Promise<Note> {
      const res = await request('/api/notes', { body: input, accessToken })
      return noteSchema.parse(await res.json())
    },

    async renameNote(accessToken: string, id: number, name: string): Promise<Note> {
      const res = await request(`/api/notes/${id}`, { method: 'PATCH', body: { name }, accessToken })
      return noteSchema.parse(await res.json())
    },

    async deleteNote(accessToken: string, id: number): Promise<void> {
      await request(`/api/notes/${id}`, { method: 'DELETE', accessToken })
    },

    /** A Note's tree: the root (the Position) first, then every Move after its parent, siblings in order. */
    async listMoves(accessToken: string, noteId: number): Promise<MoveRow[]> {
      const res = await request(`/api/notes/${noteId}/moves`, { accessToken })
      return z.array(moveRowSchema).parse(await res.json())
    },

    /**
     * Plays a Move by SAN after a Move or the Position, as its last child. If
     * that parent already has a Move with the SAN, that Move is answered.
     */
    async addMove(accessToken: string, noteId: number, parentId: number, san: string): Promise<MoveRow> {
      const res = await request(`/api/notes/${noteId}/moves`, { body: { parentId, san }, accessToken })
      return moveRowSchema.parse(await res.json())
    },

    /** Replaces all the writing on a Move or the Position; sending every field empty deletes it. */
    async putWriting(accessToken: string, noteId: number, moveId: number, writing: WritingInput): Promise<MoveRow> {
      const res = await request(`/api/notes/${noteId}/moves/${moveId}/writing`, { method: 'PUT', body: writing, accessToken })
      return moveRowSchema.parse(await res.json())
    },

    /**
     * Deletes a Move and its whole subtree. Without `confirm`, a delete that
     * would delete any writing is refused with what it would delete.
     */
    async deleteMove(accessToken: string, noteId: number, moveId: number, confirm: boolean): Promise<MoveDeleteResult> {
      try {
        await request(`/api/notes/${noteId}/moves/${moveId}${confirm ? '?confirm=true' : ''}`, { method: 'DELETE', accessToken })
        return { status: 'deleted' }
      } catch (error) {
        const conflict = error instanceof ApiError && error.status === 409 && deleteConflictSchema.safeParse(error.body)
        if (conflict && conflict.success) {
          const { error: message, ...counts } = conflict.data
          return { status: 'needsConfirmation', message, ...counts }
        }
        throw error
      }
    },

    /** Puts a Move on the Main line: it and each of its ancestors becomes its parent's first child. */
    async promoteMove(accessToken: string, noteId: number, moveId: number): Promise<void> {
      await request(`/api/notes/${noteId}/moves/${moveId}/promote`, { method: 'POST', accessToken })
    },

    async getLinks(accessToken: string, noteId: number): Promise<NoteLinks> {
      const res = await request(`/api/notes/${noteId}/links`, { accessToken })
      return noteLinksSchema.parse(await res.json())
    },

    /** Files a Note in a Folder, or at the root when folderId is null. */
    async moveNote(accessToken: string, noteId: number, folderId: number | null): Promise<Note> {
      const res = await request(`/api/notes/${noteId}/folder`, { method: 'PUT', body: { folderId }, accessToken })
      return noteSchema.parse(await res.json())
    },

    async listFolders(accessToken: string): Promise<Folder[]> {
      const res = await request('/api/folders', { accessToken })
      return z.array(folderSchema).parse(await res.json())
    },

    async createFolder(accessToken: string, input: { name: string; parentId: number | null }): Promise<Folder> {
      const res = await request('/api/folders', { body: input, accessToken })
      return folderSchema.parse(await res.json())
    },

    async updateFolder(accessToken: string, id: number, update: FolderUpdate): Promise<Folder> {
      const res = await request(`/api/folders/${id}`, { method: 'PATCH', body: update, accessToken })
      return folderSchema.parse(await res.json())
    },

    /**
     * Deletes a Folder and its subfolders, moving their Notes to the root.
     * Without `confirm`, deleting one that isn't empty is refused.
     */
    async deleteFolder(accessToken: string, id: number, confirm: boolean): Promise<FolderDeleteResult> {
      try {
        await request(`/api/folders/${id}${confirm ? '?confirm=true' : ''}`, { method: 'DELETE', accessToken })
        return { status: 'deleted' }
      } catch (error) {
        const conflict = error instanceof ApiError && error.status === 409 && folderConflictSchema.safeParse(error.body)
        if (conflict && conflict.success) {
          const { folders, notes, error: message } = conflict.data
          return { status: 'needsConfirmation', folders, notes, message }
        }
        throw error
      }
    },
  }
}
