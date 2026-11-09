import { Alert, Badge, Button, Group, Loader, Stack, Text, Title } from '@mantine/core'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { api } from './apiClient'
import { LandingPage } from './landing/LandingPage'
import noteStyles from './notes/Notes.module.css'
import { Page } from './Page'
import { useSession } from './session'
import type { User } from './api'

// `/`: the landing page for a Guest, the home page for someone logged in.
export function HomePage() {
  const { state } = useSession()

  if (state.status === 'restoring') {
    return (
      <div className={noteStyles.centered}>
        <Loader aria-label="Loading" />
      </div>
    )
  }
  // Not yet known to be a Guest (GLOSSARY.md); the shell shows the error with a Retry button.
  if (state.status === 'restore-failed') return null
  if (state.status === 'guest') return <LandingPage />
  return <SignedInHome user={state.user} />
}

function SignedInHome({ user }: { user: User }) {
  const health = useQuery({ queryKey: ['health'], queryFn: () => api.health() })

  return (
    <Page>
      <Stack>
        <Title order={2}>Welcome back, {user.name}</Title>
        <Text>Connect chess games the way Luhmann connected ideas.</Text>
        <Text>
          Signed in as {user.name} ({user.email}).
        </Text>
        <Group>
          <Button component={Link} to="/notes">
            Your notes
          </Button>
        </Group>
        <Group>
          <Text fw={500}>API status:</Text>
          {health.isPending && <Loader size="sm" />}
          {health.isSuccess && <Badge color="green">{health.data.status}</Badge>}
          {health.isError && <Badge color="red">unreachable</Badge>}
        </Group>
        {health.isError && (
          <Alert color="red" title="Cannot reach the API">
            {health.error.message}
          </Alert>
        )}
      </Stack>
    </Page>
  )
}
