import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { Session, SessionState } from './session'
import { SessionProvider } from './SessionProvider'
import { useSession } from './useSession'

function fakeSession(initial: SessionState) {
  let state = initial
  const listeners = new Set<() => void>()

  const session: Session = {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    restore: vi.fn(async () => undefined),
    signIn: vi.fn(async () => ({ id: 7, email: 'ada@example.com', name: 'Ada' })),
    signOut: vi.fn(async () => undefined),
    forget: vi.fn(),
    authorized: vi.fn(async (call) => call('token')),
  }

  return {
    session,
    setState(next: SessionState) {
      state = next
      listeners.forEach((listener) => listener())
    },
  }
}

function wrapper(session: Session) {
  return ({ children }: { children: ReactNode }) => <SessionProvider session={session}>{children}</SessionProvider>
}

describe('useSession', () => {
  it('asks the Session to restore once and reads its state', async () => {
    const { session } = fakeSession({ status: 'restoring' })
    const { result } = renderHook(() => useSession(), { wrapper: wrapper(session) })

    await waitFor(() => expect(session.restore).toHaveBeenCalledTimes(1))
    expect(result.current.state).toEqual({ status: 'restoring' })
  })

  it('re-renders when the Session changes', () => {
    const { session, setState } = fakeSession({ status: 'restoring' })
    const { result } = renderHook(() => useSession(), { wrapper: wrapper(session) })

    act(() => setState({ status: 'guest' }))

    expect(result.current.state).toEqual({ status: 'guest' })
  })
})
