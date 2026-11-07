import { Alert, Badge, Group, Loader, Stack, Text, Title } from '@mantine/core'
import { useQuery } from '@tanstack/react-query'
import { api } from './apiClient'
import { Page } from './Page'
import { useAuth } from './useAuth'

function SignedIn() {
  // Goes through the same path every protected call will: an expired access
  // token is replaced behind the scenes and the request retried.
  const me = useQuery({ queryKey: ['me'], queryFn: () => api.me(), retry: false })

  if (me.isPending) return <Loader size="sm" />
  if (me.isError) return <Alert color="red">{me.error.message}</Alert>
  return <Text>Signed in as {me.data.name} ({me.data.email}).</Text>
}

export function HomePage() {
  const { ready, user } = useAuth()
  const health = useQuery({ queryKey: ['health'], queryFn: () => api.health() })

  return (
    <Page>
      <Stack>
        <Title order={2}>{user ? `Welcome back, ${user.name}` : 'Welcome to ChessNotes'}</Title>
        <Text>Connect chess games the way Luhmann connected ideas.</Text>
        {ready && user && <SignedIn />}
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
