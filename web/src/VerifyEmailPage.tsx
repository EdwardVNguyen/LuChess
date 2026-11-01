import { Alert, Loader, Stack, Text, Title } from '@mantine/core'
import { useMutation } from '@tanstack/react-query'
import { getRouteApi } from '@tanstack/react-router'
import { useEffect, useRef } from 'react'
import { ResendVerification } from './ResendVerification'
import { api } from './apiClient'

const route = getRouteApi('/verify-email')

export function VerifyEmailPage() {
  const { token } = route.useSearch()
  const verify = useMutation({ mutationFn: api.verifyEmail })

  // A token works once, so it must be sent exactly once even though React
  // StrictMode runs effects twice in development.
  const sent = useRef(false)
  useEffect(() => {
    if (token && !sent.current) {
      sent.current = true
      verify.mutate(token)
    }
  }, [token, verify])

  if (!token) {
    return (
      <Stack>
        <Title order={2}>Verify your email</Title>
        <Alert color="red">This link is incomplete. Open the link from your email, or request a new one.</Alert>
        <ResendVerification />
      </Stack>
    )
  }

  if (verify.isSuccess) {
    return (
      <Stack>
        <Title order={2}>Email verified</Title>
        <Text>Thanks, your email address is confirmed.</Text>
      </Stack>
    )
  }

  if (verify.isError) {
    return (
      <Stack>
        <Title order={2}>We could not verify your email</Title>
        <Alert color="red">{verify.error.message}</Alert>
        <Text size="sm">Links work once and expire after 24 hours. Request a new one:</Text>
        <ResendVerification />
      </Stack>
    )
  }

  return (
    <Stack align="center">
      <Loader />
      <Text>Verifying your email…</Text>
    </Stack>
  )
}
