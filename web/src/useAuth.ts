import { useContext, useSyncExternalStore } from 'react'
import { api } from './apiClient'
import { ReadyContext } from './authContext'

// ready is false until the first attempt to restore the session has finished.
export function useAuth() {
  const ready = useContext(ReadyContext)
  const session = useSyncExternalStore(api.subscribe, api.getSession)
  return { ready, user: session?.user ?? null }
}
