import { useEffect, type ReactNode } from 'react'
import type { Session } from './session'
import { SessionContext } from './sessionContext'

export function SessionProvider({ session, children }: { session: Session; children: ReactNode }) {
  // On load there is no access token yet, but the refresh cookie may still be
  // valid. Ask for a Session once, so the first screen already knows who is here.
  useEffect(() => {
    void session.restore()
  }, [session])

  return <SessionContext value={session}>{children}</SessionContext>
}
