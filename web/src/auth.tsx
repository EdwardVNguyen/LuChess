import { useEffect, useState, type ReactNode } from 'react'
import { api } from './apiClient'
import { ReadyContext } from './authContext'

// On load there is no access token yet, but the refresh cookie may still be
// valid. Ask for a session once, so the first screen already knows who is here.
export function AuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let active = true
    api
      .refresh()
      .catch(() => undefined) // not being able to restore a session just means logged out
      .finally(() => {
        if (active) setReady(true)
      })
    return () => {
      active = false
    }
  }, [])

  return <ReadyContext value={ready}>{children}</ReadyContext>
}
