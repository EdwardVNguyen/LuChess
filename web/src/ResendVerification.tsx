import { Alert, Button, Group, Stack, TextInput } from '@mantine/core'
import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'
import { api } from './apiClient'
import { errorMessage } from './errors'

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
      {resend.isError && <Alert color="red">{errorMessage(resend.error)}</Alert>}
    </Stack>
  )
}
