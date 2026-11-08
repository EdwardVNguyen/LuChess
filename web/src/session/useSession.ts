import { useContext, useSyncExternalStore } from 'react'
import { SessionContext } from './sessionContext'

export function useSession() {
  const session = useContext(SessionContext)
  if (!session) throw new Error('useSession must be used inside SessionProvider')

  const state = useSyncExternalStore(session.subscribe, session.getState)
  return { state, restore: session.restore, signIn: session.signIn, signOut: session.signOut }
}
