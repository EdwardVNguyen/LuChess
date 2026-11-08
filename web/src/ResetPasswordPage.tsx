import { Alert, Button, PasswordInput, Stack, Text, Title } from '@mantine/core'
import { useForm } from '@tanstack/react-form'
import { useMutation } from '@tanstack/react-query'
import { getRouteApi, Link } from '@tanstack/react-router'
import { z } from 'zod'
import { ApiError } from './api'
import { AuthCard } from './AuthCard'
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
    <AuthCard>
      <Title order={2}>This link doesn't work</Title>
      <Alert color="red">{message}</Alert>
      <Text size="sm">Reset links work once and expire after 1 hour.</Text>
      <Button component={Link} to="/forgot-password" variant="light">
        Send a new link
      </Button>
    </AuthCard>
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
      <AuthCard>
        <Title order={2}>Password changed</Title>
        <Text>Your new password is set. For your security, every device you were logged in on has been logged out.</Text>
        <Button component={Link} to="/login">
          Log in
        </Button>
      </AuthCard>
    )
  }

  return (
    <AuthCard>
      <Title order={2}>Choose a new password</Title>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          void form.handleSubmit()
        }}
      >
        <Stack>
          <form.Field name="password">
            {(field) => (
              <PasswordInput
                label="New password"
                description="10 to 128 characters."
                autoComplete="new-password"
                value={field.state.value}
                onChange={(e) => field.handleChange(e.currentTarget.value)}
                onBlur={field.handleBlur}
                error={field.state.meta.isTouched ? field.state.meta.errors[0]?.message : undefined}
              />
            )}
          </form.Field>
          <form.Field name="confirm">
            {(field) => (
              <PasswordInput
                label="Confirm new password"
                autoComplete="new-password"
                value={field.state.value}
                onChange={(e) => field.handleChange(e.currentTarget.value)}
                onBlur={field.handleBlur}
                error={field.state.meta.isTouched ? field.state.meta.errors[0]?.message : undefined}
              />
            )}
          </form.Field>

          {reset.isError && <Alert color="red">{errorMessage(reset.error)}</Alert>}

          <Button type="submit" loading={reset.isPending}>
            Set new password
          </Button>
        </Stack>
      </form>
    </AuthCard>
  )
}
