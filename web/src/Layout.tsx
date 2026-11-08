import { Alert, AppShell, Button, Group, Text } from '@mantine/core'
import { Outlet, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { errorMessage } from './errors'
import { Header } from './header/Header'
import { useSession } from './session'

export function Layout() {
  const { state, restore, signOut } = useSession()
  const navigate = useNavigate()
  const [logoutFailed, setLogoutFailed] = useState(false)

  async function logOut() {
    setLogoutFailed(false)
    try {
      await signOut()
    } catch {
      // Pessimistic logout: the Session is still authenticated, so stay here
      // and let the person retry.
      setLogoutFailed(true)
      return
    }
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
        <Header state={state} onLogOut={() => void logOut()} />
      </AppShell.Header>
      <AppShell.Main>
        {state.status === 'restore-failed' && (
          <Alert color="yellow" m="md" title="Could not check your session">
            <Group justify="space-between" gap="md">
              <Text size="sm">{errorMessage(state.error)}</Text>
              <Button variant="light" onClick={() => void restore()}>
                Retry
              </Button>
            </Group>
          </Alert>
        )}
        {logoutFailed && (
          <Alert color="red" m="md">
            Could not end your session. Check your connection and try again.
          </Alert>
        )}
        <Outlet />
      </AppShell.Main>
    </AppShell>
  )
}
