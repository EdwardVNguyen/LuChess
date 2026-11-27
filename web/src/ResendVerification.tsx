import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'
import { AuthAlert, AuthButton, AuthStack, AuthTextField } from './auth/AuthForm'
import { api } from './apiClient'
import { errorMessage } from './errors'

// Asks for another verification email. When the address is already known (just
// after sign-up) it is a single button; otherwise it asks for the address.
export function ResendVerification({ email }: { email?: string }) {
  const [typedEmail, setTypedEmail] = useState('')
  const target = email ?? typedEmail.trim()

  const resend = useMutation({ mutationFn: () => api.resendVerification(target) })

  return (
    <AuthStack>
      {email === undefined && (
        <AuthTextField label="Email address" type="email" autoComplete="email" value={typedEmail} onChange={setTypedEmail} />
      )}
      <AuthButton variant="secondary" loading={resend.isPending} disabled={target === ''} onClick={() => resend.mutate()}>
        Send a new link
      </AuthButton>
      {resend.isSuccess && <AuthAlert tone="success">{resend.data.message}</AuthAlert>}
      {resend.isError && <AuthAlert tone="error">{errorMessage(resend.error)}</AuthAlert>}
    </AuthStack>
  )
}
