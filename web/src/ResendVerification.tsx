import { Alert, Button, Group, Stack, TextInput } from '@mantine/core'
import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'
import { ApiError } from './api'
import { api } from './apiClient'

function waitMessage(error: unknown): string {
  if (error instanceof ApiError && error.status === 429 && error.retryAfterSeconds) {
    const minutes = Math.ceil(error.retryAfterSeconds / 60)
    return `Too many requests. Try again in about ${minutes} minute${minutes === 1 ? '' : 's'}.`
  }
  return error instanceof Error ? error.message : 'Something went wrong. Please try again.'
}

// Asks for another verification email. When the address is already known (just
// after sign-up) it is a single button; otherwise it asks for the address.
export function ResendVerification({ email }: { email?: string }) {
  const [typedEmail, setTypedEmail] = useState('')
  const target = email ?? typedEmail.trim()

  const resend = useMutation({ mutationFn: () => api.resendVerification(target) })

  return (
    <Stack gap="xs">
      <Group align="flex-end">
        {email === undefined && (
          <TextInput
            label="Email address"
            type="email"
            value={typedEmail}
            onChange={(e) => setTypedEmail(e.currentTarget.value)}
          />
        )}
        <Button variant="light" loading={resend.isPending} disabled={target === ''} onClick={() => resend.mutate()}>
          Send a new link
        </Button>
      </Group>
      {resend.isSuccess && <Alert color="green">{resend.data.message}</Alert>}
      {resend.isError && <Alert color="red">{waitMessage(resend.error)}</Alert>}
    </Stack>
  )
}
