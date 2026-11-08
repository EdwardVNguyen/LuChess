import { Alert, Badge, Group, Loader, Stack, Text, Title } from '@mantine/core'
import { useQuery } from '@tanstack/react-query'
import { api } from './apiClient'
import { Page } from './Page'
import { useSession } from './session'

export function HomePage() {
  const { state } = useSession()
  const health = useQuery({ queryKey: ['health'], queryFn: () => api.health() })
  const user = state.status === 'authenticated' ? state.user : null

  return (
    <Page>
      <Stack>
        <Title order={2}>{user ? `Welcome back, ${user.name}` : 'Welcome to ChessNotes'}</Title>
        <Text>Connect chess games the way Luhmann connected ideas.</Text>
        {state.status === 'authenticated' && (
          <Text>
            Signed in as {state.user.name} ({state.user.email}).
          </Text>
        )}
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
