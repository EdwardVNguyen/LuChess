import { ApiError, type LoginInput, type SessionResponse, type User } from '../api'

// The narrow port the Session module needs from the transport. The full api
// client also has health, sign-up, verification, resend and me; the Session
// lifecycle must not depend on them.
export type SessionTransport = {
  login(input: LoginInput): Promise<SessionResponse>
  refresh(): Promise<SessionResponse>
  logout(): Promise<void>
}

export type SessionState =
  | { status: 'restoring' }
  | { status: 'guest' }
  | { status: 'restore-failed'; error: ApiError }
  | { status: 'authenticated'; user: User }

export type Session = {
  getState(): SessionState
  subscribe(listener: () => void): () => void
  /** Restores the Session, or refreshes it when one is already authenticated. */
  restore(): Promise<void>
  signIn(input: LoginInput): Promise<User>
  /** Ends the Session only after the server confirms; rejects if it cannot. */
  signOut(): Promise<void>
  /**
   * Ends the Session in this browser once the server has already ended it,
   * as deleting the account does. Tells the server nothing.
   */
  forget(): void
  /**
   * Calls the API with the access token. An expired token is refreshed once and
   * the call retried; a refused refresh ends the Session.
   */
  authorized<T>(call: (accessToken: string) => Promise<T>): Promise<T>
}

type Options = {
  transport: SessionTransport
  lock?: <T>(fn: () => Promise<T>) => Promise<T>
  /** Runs after the Session ends, before Guest is published. */
  onSessionEnded?: () => void
}

// Runs fn while holding a lock shared by every tab of this browser, when the
// browser supports it. Refresh tokens rotate, so two tabs refreshing at once
// would race; taking turns means the second tab uses the cookie the first set.
export function browserLock<T>(fn: () => Promise<T>): Promise<T> {
  if (typeof navigator !== 'undefined' && navigator.locks) {
    return navigator.locks.request('chessnotes-refresh', fn)
  }
  return fn()
}

export function createSession({ transport, lock = browserLock, onSessionEnded = () => {} }: Options): Session {
  let state: SessionState = { status: 'restoring' }
  // The access token lives only in this variable: never in storage, so a script
  // injected into the page cannot read a long-lived credential from disk.
  let accessToken: string | null = null
  let revision = 0
  let restoring: Promise<void> | null = null
  const listeners = new Set<() => void>()

  function publish(next: SessionState) {
    state = next
    listeners.forEach((listener) => listener())
  }

  function endSession() {
    const wasAuthenticated = state.status === 'authenticated'
    revision += 1
    accessToken = null
    if (wasAuthenticated) {
      try {
        onSessionEnded()
      } catch {
        // Cleanup is best-effort; the Session must still end.
      }
    }
    publish({ status: 'guest' })
  }

  // The server may have rotated the token while the response was lost, so one
  // retry lets the leeway window (ADR 0004) hand back a fresh one.
  async function requestRefresh(): Promise<SessionResponse> {
    try {
      return await transport.refresh()
    } catch (error) {
      if (!(error instanceof ApiError) || error.status !== 0) throw error
      return transport.refresh()
    }
  }

  function restore(): Promise<void> {
    // Callers that arrive while a restore is under way share it, so the
    // single-use refresh token is spent once.
    if (restoring) return restoring

    const captured = revision
    restoring = lock(async () => {
      try {
        const next = await requestRefresh()
        // A sign-in or sign-out committed while this was in flight wins.
        if (captured !== revision) return
        revision += 1
        accessToken = next.accessToken
        publish({ status: 'authenticated', user: next.user })
      } catch (error) {
        if (captured !== revision) return
        if (error instanceof ApiError && error.status === 401) {
          // A 401 while a token is held means the Session was revoked; with no
          // token this was only the initial restore, so the person is a Guest.
          if (accessToken !== null) {
            endSession()
          } else {
            revision += 1
            publish({ status: 'guest' })
          }
          return
        }
        // A network or server failure is not proof of being a Guest, but it
        // must not throw away an authenticated Session.
        if (state.status === 'authenticated') return
        revision += 1
        publish({
          status: 'restore-failed',
          error: error instanceof ApiError ? error : new ApiError('Could not restore the session.', 0),
        })
      }
    }).finally(() => {
      restoring = null
    })
    return restoring
  }

  async function signIn(input: LoginInput): Promise<User> {
    const next = await transport.login(input)
    revision += 1
    accessToken = next.accessToken
    publish({ status: 'authenticated', user: next.user })
    return next.user
  }

  async function signOut(): Promise<void> {
    // Pessimistic: the Session stays authenticated until the server confirms.
    // Take the same lock as restore, so a refresh already in flight has spent
    // and rotated the cookie before logout revokes it.
    await lock(() => transport.logout())
    endSession()
  }

  async function authorized<T>(call: (accessToken: string) => Promise<T>): Promise<T> {
    if (accessToken === null) throw new ApiError('You are not logged in.', 401)
    const used = accessToken
    try {
      return await call(used)
    } catch (error) {
      if (!(error instanceof ApiError) || error.status !== 401) throw error
      // Another call may already have refreshed the token
      if (accessToken === used) await restore()
      if (accessToken === null || accessToken === used) throw error
      return call(accessToken)
    }
  }

  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    restore,
    signIn,
    signOut,
    forget: endSession,
    authorized,
  }
}
