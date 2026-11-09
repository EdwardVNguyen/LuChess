import { describe, expect, it, vi } from 'vitest'
import { ApiError, type SessionResponse, type User } from '../api'
import { createSession, type SessionTransport } from './session'

const ada: User = { id: 7, email: 'ada@example.com', name: 'Ada' }
const grace: User = { id: 8, email: 'grace@example.com', name: 'Grace' }

const response = (accessToken: string, user: User = ada): SessionResponse => ({ accessToken, user })

function fakeTransport(overrides: Partial<SessionTransport> = {}): SessionTransport {
  return {
    login: vi.fn(async () => response('token-1')),
    refresh: vi.fn(async () => response('token-2')),
    logout: vi.fn(async () => undefined),
    ...overrides,
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

const credentials = { email: ada.email, password: 'correct horse battery' }

describe('restore', () => {
  it('restores a Session from the refresh cookie', async () => {
    const transport = fakeTransport()
    const session = createSession({ transport })

    await session.restore()

    expect(session.getState()).toEqual({ status: 'authenticated', user: ada })
    expect(transport.refresh).toHaveBeenCalledTimes(1)
  })

  it('treats a 401 as a confirmed Guest, without ending anything', async () => {
    const onSessionEnded = vi.fn()
    const transport = fakeTransport({
      refresh: vi.fn(async () => {
        throw new ApiError('No session', 401)
      }),
    })
    const session = createSession({ transport, onSessionEnded })

    await session.restore()

    expect(session.getState()).toEqual({ status: 'guest' })
    expect(onSessionEnded).not.toHaveBeenCalled()
  })

  it('reports restore-failed when the server cannot be reached, after one retry', async () => {
    const refresh = vi.fn(async () => {
      throw new ApiError('Could not reach the server. Check your connection and try again.', 0)
    })
    const session = createSession({ transport: fakeTransport({ refresh }) })

    await session.restore()

    expect(refresh).toHaveBeenCalledTimes(2)
    expect(session.getState()).toMatchObject({ status: 'restore-failed', error: { status: 0 } })
  })

  it.each([429, 500])('reports restore-failed for a %i without retrying', async (status) => {
    const refresh = vi.fn(async () => {
      throw new ApiError('nope', status)
    })
    const session = createSession({ transport: fakeTransport({ refresh }) })

    await session.restore()

    expect(refresh).toHaveBeenCalledTimes(1)
    expect(session.getState()).toMatchObject({ status: 'restore-failed', error: { status } })
  })

  it('runs inside the lock it is given, so tabs take turns', async () => {
    const order: string[] = []
    const lock = async <T,>(fn: () => Promise<T>) => {
      order.push('lock acquired')
      try {
        return await fn()
      } finally {
        order.push('lock released')
      }
    }
    const refresh = vi.fn(async () => {
      order.push('request')
      return response('token-2')
    })
    const session = createSession({ transport: fakeTransport({ refresh }), lock })

    await session.restore()

    expect(order).toEqual(['lock acquired', 'request', 'lock released'])
  })

  it('takes the lock once for the first attempt and the retry together', async () => {
    const order: string[] = []
    const lock = async <T,>(fn: () => Promise<T>) => {
      order.push('lock acquired')
      try {
        return await fn()
      } finally {
        order.push('lock released')
      }
    }
    const refresh = vi
      .fn()
      .mockRejectedValueOnce(new ApiError('Failed to fetch', 0))
      .mockImplementationOnce(async () => {
        order.push('request 2')
        return response('token-2')
      })
    const session = createSession({ transport: fakeTransport({ refresh }), lock })

    await session.restore()

    expect(order).toEqual(['lock acquired', 'request 2', 'lock released'])
  })

  it('sends one request when several callers restore at once', async () => {
    const refresh = vi.fn(async () => response('token-2'))
    const session = createSession({ transport: fakeTransport({ refresh }) })

    const results = await Promise.all([session.restore(), session.restore(), session.restore()])

    expect(refresh).toHaveBeenCalledTimes(1)
    expect(results).toHaveLength(3)
  })

  it('ends an authenticated Session when a later refresh is refused', async () => {
    const transport = fakeTransport()
    const onSessionEnded = vi.fn()
    const session = createSession({ transport, onSessionEnded })
    await session.signIn(credentials)

    transport.refresh = vi.fn(async () => {
      throw new ApiError('Unauthorized', 401)
    })
    await session.restore()

    expect(session.getState()).toEqual({ status: 'guest' })
    expect(onSessionEnded).toHaveBeenCalledTimes(1)
  })

  it('keeps an authenticated Session when a later refresh cannot reach the server', async () => {
    const transport = fakeTransport()
    const onSessionEnded = vi.fn()
    const session = createSession({ transport, onSessionEnded })
    await session.signIn(credentials)

    transport.refresh = vi.fn(async () => {
      throw new ApiError('offline', 0)
    })
    await session.restore()

    expect(session.getState()).toEqual({ status: 'authenticated', user: ada })
    expect(onSessionEnded).not.toHaveBeenCalled()
  })

  it('discards a refresh that resolves after a sign-in', async () => {
    const pending = deferred<SessionResponse>()
    const session = createSession({ transport: fakeTransport({ refresh: () => pending.promise }) })

    const restoring = session.restore()
    await session.signIn(credentials)
    pending.resolve(response('stale-token', grace))
    await restoring

    expect(session.getState()).toEqual({ status: 'authenticated', user: ada })
  })

  it('discards a refresh that resolves after a sign-out', async () => {
    const pending = deferred<SessionResponse>()
    const transport = fakeTransport()
    const session = createSession({ transport })
    await session.signIn(credentials)

    transport.refresh = () => pending.promise
    const restoring = session.restore()
    await session.signOut()
    pending.resolve(response('stale-token', grace))
    await restoring

    expect(session.getState()).toEqual({ status: 'guest' })
  })
})

describe('signIn', () => {
  it('posts the credentials and publishes the authenticated Session', async () => {
    const transport = fakeTransport()
    const session = createSession({ transport })

    const user = await session.signIn(credentials)

    expect(user).toEqual(ada)
    expect(session.getState()).toEqual({ status: 'authenticated', user: ada })
    expect(transport.login).toHaveBeenCalledWith(credentials)
  })

  it('stays a Guest when the credentials are refused', async () => {
    const transport = fakeTransport({
      refresh: vi.fn(async () => {
        throw new ApiError('No session', 401)
      }),
      login: vi.fn(async () => {
        throw new ApiError('Invalid email or password', 401)
      }),
    })
    const session = createSession({ transport })
    await session.restore()

    await expect(session.signIn(credentials)).rejects.toMatchObject({ status: 401 })

    expect(session.getState()).toEqual({ status: 'guest' })
  })
})

describe('signOut', () => {
  it('ends the Session only after the server confirms', async () => {
    const transport = fakeTransport()
    const onSessionEnded = vi.fn()
    const session = createSession({ transport, onSessionEnded })
    await session.signIn(credentials)

    await session.signOut()

    expect(transport.logout).toHaveBeenCalledTimes(1)
    expect(session.getState()).toEqual({ status: 'guest' })
    expect(onSessionEnded).toHaveBeenCalledTimes(1)
  })

  it('keeps the authenticated Session when the server cannot be told', async () => {
    const transport = fakeTransport({
      logout: vi.fn(async () => {
        throw new ApiError('Could not reach the server. Check your connection and try again.', 0)
      }),
    })
    const onSessionEnded = vi.fn()
    const session = createSession({ transport, onSessionEnded })
    await session.signIn(credentials)

    await expect(session.signOut()).rejects.toMatchObject({ status: 0 })

    expect(session.getState()).toEqual({ status: 'authenticated', user: ada })
    expect(onSessionEnded).not.toHaveBeenCalled()
  })

  it('takes the refresh lock before telling the server', async () => {
    const order: string[] = []
    const lock = async <T,>(fn: () => Promise<T>) => {
      order.push('lock acquired')
      try {
        return await fn()
      } finally {
        order.push('lock released')
      }
    }
    const transport = fakeTransport({
      logout: vi.fn(async () => {
        order.push('logout')
      }),
    })
    const session = createSession({ transport, lock })
    await session.signIn(credentials)

    await session.signOut()

    expect(order).toEqual(['lock acquired', 'logout', 'lock released'])
  })

  it('tells the server even when already a Guest, without ending anything', async () => {
    const transport = fakeTransport({
      refresh: vi.fn(async () => {
        throw new ApiError('No session', 401)
      }),
    })
    const onSessionEnded = vi.fn()
    const session = createSession({ transport, onSessionEnded })
    await session.restore()

    await session.signOut()

    expect(transport.logout).toHaveBeenCalledTimes(1)
    expect(session.getState()).toEqual({ status: 'guest' })
    expect(onSessionEnded).not.toHaveBeenCalled()
  })

  it('still ends the Session when cleanup throws', async () => {
    const session = createSession({
      transport: fakeTransport(),
      onSessionEnded: () => {
        throw new Error('cache unavailable')
      },
    })
    await session.signIn(credentials)

    await session.signOut()

    expect(session.getState()).toEqual({ status: 'guest' })
  })
})

describe('subscribe', () => {
  it('tells listeners when the Session starts, changes and ends', async () => {
    const session = createSession({ transport: fakeTransport() })
    const listener = vi.fn()
    const unsubscribe = session.subscribe(listener)

    await session.restore()
    expect(listener).toHaveBeenCalledTimes(1)
    await session.signOut()
    expect(listener).toHaveBeenCalledTimes(2)

    unsubscribe()
    await session.signIn(credentials)
    expect(listener).toHaveBeenCalledTimes(2)
  })

  it('returns the same state object until it changes', async () => {
    const session = createSession({ transport: fakeTransport() })
    const first = session.getState()

    expect(session.getState()).toBe(first)

    await session.restore()

    expect(session.getState()).not.toBe(first)
  })
})

describe('authorized', () => {
  it('calls with the current access token', async () => {
    const session = createSession({ transport: fakeTransport() })
    await session.signIn(credentials)

    const result = await session.authorized(async (token) => `called with ${token}`)

    expect(result).toBe('called with token-1')
  })

  it('refuses without calling when there is no Session', async () => {
    const session = createSession({ transport: fakeTransport() })
    const call = vi.fn()

    await expect(session.authorized(call)).rejects.toMatchObject({ status: 401 })
    expect(call).not.toHaveBeenCalled()
  })

  it('refreshes an expired token once and retries', async () => {
    const transport = fakeTransport()
    const session = createSession({ transport })
    await session.signIn(credentials)
    const call = vi.fn(async (token: string) => {
      if (token === 'token-1') throw new ApiError('Unauthorized', 401)
      return token
    })

    await expect(session.authorized(call)).resolves.toBe('token-2')
    expect(transport.refresh).toHaveBeenCalledTimes(1)
    expect(call).toHaveBeenCalledTimes(2)
  })

  it('ends the Session when the refresh is refused', async () => {
    const transport = fakeTransport({
      refresh: vi.fn(async () => {
        throw new ApiError('No session', 401)
      }),
    })
    const session = createSession({ transport })
    await session.signIn(credentials)

    await expect(
      session.authorized(async () => {
        throw new ApiError('Unauthorized', 401)
      }),
    ).rejects.toMatchObject({ status: 401 })
    expect(session.getState()).toEqual({ status: 'guest' })
  })

  it('passes other errors through without refreshing', async () => {
    const transport = fakeTransport()
    const session = createSession({ transport })
    await session.signIn(credentials)

    await expect(
      session.authorized(async () => {
        throw new ApiError('Note not found', 404)
      }),
    ).rejects.toMatchObject({ status: 404 })
    expect(transport.refresh).not.toHaveBeenCalled()
  })
})

describe('forget', () => {
  it('ends the Session without telling the server, which already ended it', async () => {
    const transport = fakeTransport()
    const onSessionEnded = vi.fn()
    const session = createSession({ transport, onSessionEnded })
    await session.signIn(credentials)

    session.forget()

    expect(session.getState()).toEqual({ status: 'guest' })
    expect(onSessionEnded).toHaveBeenCalledTimes(1)
    expect(transport.logout).not.toHaveBeenCalled()
    const call = vi.fn(async () => 'answer')
    await expect(session.authorized(call)).rejects.toMatchObject({ status: 401 })
    expect(call).not.toHaveBeenCalled()
  })

  it('wins over a restore already in flight', async () => {
    const transport = fakeTransport()
    const session = createSession({ transport })
    await session.signIn(credentials)
    const pending = deferred<SessionResponse>()
    transport.refresh = () => pending.promise
    const restoring = session.restore()

    session.forget()
    pending.resolve(response('stale-token'))
    await restoring

    expect(session.getState()).toEqual({ status: 'guest' })
  })
})
