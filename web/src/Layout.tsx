import { AppShell, Button, Container, Group, Text, Title } from '@mantine/core'
import { useQueryClient } from '@tanstack/react-query'
import { Link, Outlet, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { api } from './apiClient'
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
    <AppShell header={{ height: 60 }} padding="md">
      <AppShell.Header>
        <Group h="100%" px="md" component="nav">
          <Title order={3}>
            <Link to="/" style={{ color: 'inherit', textDecoration: 'none' }}>
              ChessNotes
            </Link>
          </Title>
          <Group ml="auto" gap="xs">
            {ready && user && (
              <>
                {logoutFailed && (
                  <Text size="sm" c="red">
                    Could not reach the server to end your session.
                  </Text>
                )}
                <Text size="sm" fw={500}>
                  {user.name}
                </Text>
                <Button variant="subtle" onClick={() => void logOut()}>
                  Log out
                </Button>
              </>
            )}
            {ready && !user && (
              <>
                <Button component={Link} to="/login" variant="subtle">
                  Log in
                </Button>
                <Button component={Link} to="/signup" variant="light">
                  Sign up
                </Button>
              </>
            )}
          </Group>
        </Group>
      </AppShell.Header>
      <AppShell.Main>
        <Container>
          <Outlet />
        </Container>
      </AppShell.Main>
    </AppShell>
  )
}
