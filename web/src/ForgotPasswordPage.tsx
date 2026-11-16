import { Alert, Button, Stack, Text, TextInput, Title } from '@mantine/core'
import { useForm } from '@tanstack/react-form'
import { useMutation } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { z } from './zod.ts'
import { AuthCard } from './AuthCard'
import { api } from './apiClient'
import { errorMessage } from './errors'

const forgotPasswordSchema = z.object({
  email: z.string().trim().min(1, 'Enter your email'),
})

export function ForgotPasswordPage() {
  const forgot = useMutation({ mutationFn: api.forgotPassword })

  const form = useForm({
    defaultValues: { email: '' },
    validators: { onSubmit: forgotPasswordSchema },
    onSubmit: async ({ value }) => {
      await forgot.mutateAsync(forgotPasswordSchema.parse(value).email).catch(() => {
        // The error is shown from the mutation state below
      })
    },
  })

  if (forgot.isSuccess) {
    return (
      <AuthCard>
        <Title order={2}>Check your email</Title>
        <Text>{forgot.data.message}</Text>
        <Text size="sm" c="dimmed">
          The link works once and expires after 1 hour. Didn't get it? Check your spam folder, or{' '}
          <Link to="/forgot-password" onClick={() => forgot.reset()}>
            try again
          </Link>
          .
        </Text>
        <Text size="sm">
          <Link to="/login">Back to log in</Link>
        </Text>
      </AuthCard>
    )
  }

  return (
    <AuthCard>
      <Title order={2}>Forgot your password?</Title>
      <Text size="sm" c="dimmed">
        Enter the email you signed up with and we'll send you a link to choose a new password.
      </Text>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          void form.handleSubmit()
        }}
      >
        <Stack>
          <form.Field name="email">
            {(field) => (
              <TextInput
                label="Email"
                type="email"
                autoComplete="email"
                value={field.state.value}
                onChange={(e) => field.handleChange(e.currentTarget.value)}
                onBlur={field.handleBlur}
                error={field.state.meta.errors[0]?.message}
              />
            )}
          </form.Field>

          {forgot.isError && <Alert color="red">{errorMessage(forgot.error)}</Alert>}

          <Button type="submit" loading={forgot.isPending}>
            Send reset link
          </Button>
        </Stack>
      </form>
      <Text size="sm">
        Remembered it? <Link to="/login">Log in</Link>
      </Text>
    </AuthCard>
  )
}
