import { Alert, AppShell, Button, Group, Text } from '@mantine/core'
import { Outlet, useNavigate, useRouterState } from '@tanstack/react-router'
import { useState } from 'react'
import { errorMessage } from './errors'
import { Header } from './header/Header'
import { useSession } from './session'
import { pageBreakpointTokens } from './theme'

// The auth pages have no site header: their logo links back to Home
// (design/pages/DESIGN.md, "Log in and Sign up").
const AUTH_PATHS = ['/login', '/signup', '/verify-email', '/forgot-password', '/reset-password']

export function Layout() {
  const { state, restore, signOut } = useSession()
  const navigate = useNavigate()
  const [logoutFailed, setLogoutFailed] = useState(false)
  // A Guest at `/` sees the landing page, whose header is taller and on the
  // page's paper (design/pages/home.html): 64px on mobile, 74px from the
  // logged-out pages' tablet size.
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const landing = pathname === '/' && state.status === 'guest'
  const withHeader = !AUTH_PATHS.includes(pathname)

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
      header={
        withHeader
          ? { height: landing ? { base: 64, [pageBreakpointTokens.tablet]: 74 } : 56 }
          : undefined
      }
      padding={0}
      styles={{
        header: {
          backgroundColor: landing ? 'var(--cn-paper)' : 'var(--cn-ground)',
          borderBottom: '1px solid var(--cn-rule)',
        },
        main: { backgroundColor: 'var(--cn-paper)' },
      }}
    >
      {withHeader && (
        <AppShell.Header>
          <Header state={state} landing={landing} onLogOut={() => void logOut()} />
        </AppShell.Header>
      )}
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
