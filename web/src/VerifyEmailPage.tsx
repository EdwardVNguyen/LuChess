import { Loader } from '@mantine/core'
import { useMutation } from '@tanstack/react-query'
import { getRouteApi } from '@tanstack/react-router'
import { useEffect, useRef } from 'react'
import { AuthAlert, AuthStack, AuthText, AuthTitle } from './auth/AuthForm'
import { AuthLayout } from './auth/AuthLayout'
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
      <AuthLayout>
        <AuthTitle>Verify your email</AuthTitle>
        <AuthStack>
          <AuthAlert tone="error">This link is incomplete. Open the link from your email, or request a new one.</AuthAlert>
        </AuthStack>
        <ResendVerification />
      </AuthLayout>
    )
  }

  if (verify.isSuccess) {
    return (
      <AuthLayout>
        <AuthTitle>Email verified</AuthTitle>
        <AuthText>Thanks, your email address is confirmed.</AuthText>
      </AuthLayout>
    )
  }

  if (verify.isError) {
    return (
      <AuthLayout>
        <AuthTitle>We could not verify your email</AuthTitle>
        <AuthStack>
          <AuthAlert tone="error">{verify.error.message}</AuthAlert>
          <AuthText quiet>Links work once and expire after 24 hours. Request a new one:</AuthText>
        </AuthStack>
        <ResendVerification />
      </AuthLayout>
    )
  }

  return (
    <AuthLayout>
      <AuthStack>
        <Loader color="var(--cn-panel-tan)" mx="auto" />
        <AuthText>Verifying your email…</AuthText>
      </AuthStack>
    </AuthLayout>
  )
}
