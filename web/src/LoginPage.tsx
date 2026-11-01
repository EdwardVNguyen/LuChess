import { Alert, Button, PasswordInput, Stack, Text, TextInput, Title } from '@mantine/core'
import { useForm } from '@tanstack/react-form'
import { useMutation } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { z } from 'zod'
import { ApiError } from './api'
import { ResendVerification } from './ResendVerification'
import { api } from './apiClient'
import { errorMessage } from './errors'

// Login only checks that something was typed. The password rules apply when
// choosing a password, and the server decides whether these credentials are right.
const loginSchema = z.object({
  email: z.string().trim().min(1, 'Enter your email'),
  password: z.string().min(1, 'Enter your password'),
})

export function LoginPage() {
  const navigate = useNavigate()
  const login = useMutation({ mutationFn: api.login })

  const form = useForm({
    defaultValues: { email: '', password: '' },
    validators: { onSubmit: loginSchema },
    onSubmit: async ({ value }) => {
      try {
        await login.mutateAsync(loginSchema.parse(value))
        await navigate({ to: '/' })
      } catch {
        // The error is shown from the mutation state below
      }
    },
  })

  const needsVerification = login.error instanceof ApiError && login.error.status === 403

  return (
    <Stack maw={420}>
      <Title order={2}>Log in</Title>
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
          <form.Field name="password">
            {(field) => (
              <PasswordInput
                label="Password"
                autoComplete="current-password"
                value={field.state.value}
                onChange={(e) => field.handleChange(e.currentTarget.value)}
                onBlur={field.handleBlur}
                error={field.state.meta.errors[0]?.message}
              />
            )}
          </form.Field>

          {login.isError && <Alert color={needsVerification ? 'yellow' : 'red'}>{errorMessage(login.error)}</Alert>}

          <Button type="submit" loading={login.isPending}>
            Log in
          </Button>
        </Stack>
      </form>

      {needsVerification && (
        <form.Subscribe selector={(state) => state.values.email.trim()}>
          {(email) => <ResendVerification email={email || undefined} />}
        </form.Subscribe>
      )}

      <Text size="sm">
        New here? <Link to="/signup">Create an account</Link>
      </Text>
    </Stack>
  )
}
