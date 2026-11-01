import { Alert, Badge, Group, Loader, Stack, Text, Title } from '@mantine/core'
import { useQuery } from '@tanstack/react-query'
import { api } from './apiClient'

export function HomePage() {
  const health = useQuery({ queryKey: ['health'], queryFn: () => api.health() })

  return (
    <Stack>
      <Title order={2}>Welcome to ChessNotes</Title>
      <Text>Connect chess games the way Luhmann connected ideas.</Text>
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
  )
}
