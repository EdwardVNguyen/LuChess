import { AppShell, Container, Group, Title } from '@mantine/core'
import { Link, Outlet } from '@tanstack/react-router'

export function Layout() {
  return (
    <AppShell header={{ height: 60 }} padding="md">
      <AppShell.Header>
        <Group h="100%" px="md" component="nav">
          <Title order={3}>
            <Link to="/" style={{ color: 'inherit', textDecoration: 'none' }}>
              ChessNotes
            </Link>
          </Title>
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
