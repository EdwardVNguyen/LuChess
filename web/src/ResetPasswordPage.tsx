import { useForm } from '@tanstack/react-form'
import { useMutation } from '@tanstack/react-query'
import { getRouteApi } from '@tanstack/react-router'
import { z } from './zod.ts'
import { ApiError } from './api'
import { AuthAlert, AuthButton, AuthButtonLink, AuthForm, AuthPasswordField, AuthStack, AuthText, AuthTitle } from './auth/AuthForm'
import { AuthLayout } from './auth/AuthLayout'
import { api } from './apiClient'
import { errorMessage } from './errors'
import { passwordSchema } from './signUpSchema'

const route = getRouteApi('/reset-password')

const resetPasswordSchema = z
  .object({ password: passwordSchema, confirm: z.string() })
  .refine((v) => v.password === v.confirm, { message: 'Passwords do not match', path: ['confirm'] })

// The token is spent only when the new password is accepted, so a password the
// API rejects can be fixed and sent again; any other 400 means the link is dead.
function isDeadLink(error: unknown) {
  return error instanceof ApiError && error.status === 400 && !error.message.startsWith('Password')
}

function InvalidLink({ message }: { message: string }) {
  return (
    <AuthLayout>
      <AuthTitle>This link doesn't work</AuthTitle>
      <AuthStack>
        <AuthAlert tone="error">{message}</AuthAlert>
        <AuthText quiet>Reset links work once and expire after 1 hour.</AuthText>
        <AuthButtonLink to="/forgot-password" variant="secondary">
          Send a new link
        </AuthButtonLink>
      </AuthStack>
    </AuthLayout>
  )
}

export function ResetPasswordPage() {
  const { token } = route.useSearch()
  const reset = useMutation({ mutationFn: api.resetPassword })

  const form = useForm({
    defaultValues: { password: '', confirm: '' },
    validators: { onChange: resetPasswordSchema },
    onSubmit: async ({ value }) => {
      if (!token) return
      await reset.mutateAsync({ token, password: value.password }).catch(() => {
        // The error is shown from the mutation state below
      })
    },
  })

  if (!token) {
    return <InvalidLink message="This link is incomplete. Open the link from your email, or request a new one." />
  }

  if (reset.isError && isDeadLink(reset.error)) {
    return <InvalidLink message={reset.error.message} />
  }

  if (reset.isSuccess) {
    return (
      <AuthLayout>
        <AuthTitle>Password changed</AuthTitle>
        <AuthStack>
          <AuthText>Your new password is set. For your security, every device you were logged in on has been logged out.</AuthText>
          <AuthButtonLink to="/login">Log in</AuthButtonLink>
        </AuthStack>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout>
      <AuthTitle>Choose a new password</AuthTitle>
      <AuthForm onSubmit={() => void form.handleSubmit()}>
        <form.Field name="password">
          {(field) => (
            <AuthPasswordField
              label="New password"
              hint="10 to 128 characters."
              autoComplete="new-password"
              value={field.state.value}
              onChange={field.handleChange}
              onBlur={field.handleBlur}
              error={field.state.meta.isTouched ? field.state.meta.errors[0]?.message : undefined}
            />
          )}
        </form.Field>
        <form.Field name="confirm">
          {(field) => (
            <AuthPasswordField
              label="Confirm new password"
              autoComplete="new-password"
              value={field.state.value}
              onChange={field.handleChange}
              onBlur={field.handleBlur}
              error={field.state.meta.isTouched ? field.state.meta.errors[0]?.message : undefined}
            />
          )}
        </form.Field>

        {reset.isError && <AuthAlert tone="error">{errorMessage(reset.error)}</AuthAlert>}

        <AuthButton type="submit" loading={reset.isPending}>
          Set new password
        </AuthButton>
      </AuthForm>
    </AuthLayout>
  )
}
