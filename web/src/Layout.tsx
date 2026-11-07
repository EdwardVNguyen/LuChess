import { Alert, AppShell } from '@mantine/core'
import { useQueryClient } from '@tanstack/react-query'
import { Outlet, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { api } from './apiClient'
import { Header } from './header/Header'
import { useAuth } from './useAuth'

export function Layout() {
  const { ready, user } = useAuth()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [logoutFailed, setLogoutFailed] = useState(false)

  async function logOut() {
    setLogoutFailed(false)
    try {
      await api.logout()
    } catch {
      // The browser is logged out locally, but the server may not have heard
      setLogoutFailed(true)
    }
    queryClient.clear() // nothing from the old session should linger on screen
    await navigate({ to: '/' })
  }

  return (
    <AppShell
      header={{ height: 56 }}
      padding={0}
      styles={{
        header: { backgroundColor: 'var(--cn-ground)', borderBottom: '1px solid var(--cn-rule)' },
        main: { backgroundColor: 'var(--cn-paper)' },
      }}
    >
      <AppShell.Header>
        <Header ready={ready} user={user} onLogOut={() => void logOut()} />
      </AppShell.Header>
      <AppShell.Main>
        {logoutFailed && (
          <Alert color="red" m="md">
            Could not reach the server to end your session.
          </Alert>
        )}
        <Outlet />
      </AppShell.Main>
    </AppShell>
  )
}
