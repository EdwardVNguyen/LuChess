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
const noteSchema = noteSummarySchema.extend({ pgn: z.string(), startFen: z.string().nullable() })
const plyWritingSchema = z.object({
  ply: z.number(),
  comment: z.string().nullable(),
  body: z.string().nullable(),
  moveGlyph: z.string().nullable(),
  positionGlyph: z.string().nullable(),
  updatedAt: z.string(),
})
const noteLinksSchema = z.object({
  targets: z.array(noteSearchResultSchema.omit({ folderPath: true })),
  backlinks: z.array(
    z.object({
      noteId: z.number(),
      name: z.string(),
      startFen: z.string().nullable(),
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
export type Note = z.infer<typeof noteSchema>
/**
 * white, black and date come from the PGN headers, and are null when it has
 * none. folderPath names the Folders the Note is filed in, root first.
 */
export type NoteSearchResult = z.infer<typeof noteSearchResultSchema>
/** The writing on one Ply; a field is null when the Ply has none of it. */
export type PlyWriting = z.infer<typeof plyWritingSchema>
/**
 * A Note's Links: `targets` are the Notes its Comments and Bodies link to that
 * still exist (a Link to any other is unresolved), and `backlinks` the
 * Comments and Bodies in other Notes that link to it.
 */
export type NoteLinks = z.infer<typeof noteLinksSchema>
export type LinkTarget = NoteLinks['targets'][number]
export type Backlink = NoteLinks['backlinks'][number]
/** Everything written on a Ply. Null or blank clears a field. */
export type PlyWritingInput = Pick<PlyWriting, 'comment' | 'body' | 'moveGlyph' | 'positionGlyph'>

export type SignUpInput = { email: string; name: string; password: string }
export type LoginInput = { email: string; password: string }
export type ResetPasswordInput = { token: string; password: string }
/** startFen is null for the standard start. */
export type NewNoteInput = { name: string; pgn: string; startFen: string | null }

/** Editing moves: the new PGN and the first Ply that changed (ADR 0003). */
export type MovesEditInput = { pgn: string; firstChangedPly: number; confirm: boolean }
/**
 * An edit either saved, or was refused until confirmed because it would
 * delete the Glyphs, Comments or Bodies on `plies` Plies.
 */
export type MovesEditResult =
  { status: 'saved'; note: Note } | { status: 'needsConfirmation'; plies: number; message: string }

const movesConflictSchema = z.object({ error: z.string(), plies: z.number().int().positive() })

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

    /**
     * Replaces a Note's moves, deleting the writing at and after the first
     * changed Ply. Without `confirm`, an edit that would delete any is refused.
     */
    async editMoves(accessToken: string, noteId: number, input: MovesEditInput): Promise<MovesEditResult> {
      try {
        const res = await request(`/api/notes/${noteId}/moves`, { method: 'PUT', body: input, accessToken })
        return { status: 'saved', note: noteSchema.parse(await res.json()) }
      } catch (error) {
        const conflict = error instanceof ApiError && error.status === 409 && movesConflictSchema.safeParse(error.body)
        if (conflict && conflict.success) {
          return { status: 'needsConfirmation', plies: conflict.data.plies, message: conflict.data.error }
        }
        throw error
      }
    },

    async listPlies(accessToken: string, noteId: number): Promise<PlyWriting[]> {
      const res = await request(`/api/notes/${noteId}/plies`, { accessToken })
      return z.array(plyWritingSchema).parse(await res.json())
    },

    /** Replaces all the writing on a Ply; sending every field empty deletes it. */
    async putPly(accessToken: string, noteId: number, ply: number, input: PlyWritingInput): Promise<PlyWriting> {
      const res = await request(`/api/notes/${noteId}/plies/${ply}`, { method: 'PUT', body: input, accessToken })
      return plyWritingSchema.parse(await res.json())
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
