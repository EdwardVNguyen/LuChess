import { Alert, Button, PasswordInput, Stack, Text, TextInput, Title } from '@mantine/core'
import { useForm } from '@tanstack/react-form'
import { useMutation } from '@tanstack/react-query'
import { analytics } from './analytics'
import { AuthCard } from './AuthCard'
import { ResendVerification } from './ResendVerification'
import { api } from './apiClient'
import { signUpSchema } from './signUpSchema'

export function SignUpPage() {
  const signUp = useMutation({ mutationFn: api.signUp, onSuccess: () => analytics.capture('signed_up') })

  const form = useForm({
    defaultValues: { email: '', name: '', password: '' },
    validators: { onChange: signUpSchema },
    onSubmit: async ({ value }) => {
      await signUp.mutateAsync(signUpSchema.parse(value)).catch(() => {
        // The error is shown from the mutation state below
      })
    },
  })

  if (signUp.isSuccess) {
    return (
      <AuthCard>
        <Title order={2}>Check your email</Title>
        <Text>
          We sent a verification link to <strong>{signUp.data.email}</strong>. Open it within 24 hours to verify your account.
        </Text>
        <Text size="sm" c="dimmed">
          Didn't get it? Check your spam folder, or ask for a new link.
        </Text>
        <ResendVerification email={signUp.data.email} />
      </AuthCard>
    )
  }

  return (
    <AuthCard>
      <Title order={2}>Create your account</Title>
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
                error={field.state.meta.isTouched ? field.state.meta.errors[0]?.message : undefined}
              />
            )}
          </form.Field>
          <form.Field name="name">
            {(field) => (
              <TextInput
                label="Display name"
                description="Shown to others. Must be unique."
                autoComplete="nickname"
                value={field.state.value}
                onChange={(e) => field.handleChange(e.currentTarget.value)}
                onBlur={field.handleBlur}
                error={field.state.meta.isTouched ? field.state.meta.errors[0]?.message : undefined}
              />
            )}
          </form.Field>
          <form.Field name="password">
            {(field) => (
              <PasswordInput
                label="Password"
                description="10 to 128 characters."
                autoComplete="new-password"
                value={field.state.value}
                onChange={(e) => field.handleChange(e.currentTarget.value)}
                onBlur={field.handleBlur}
                error={field.state.meta.isTouched ? field.state.meta.errors[0]?.message : undefined}
              />
            )}
          </form.Field>

          {signUp.isError && <Alert color="red">{signUp.error.message}</Alert>}

          <Button type="submit" loading={signUp.isPending}>
            Sign up
          </Button>
        </Stack>
      </form>
    </AuthCard>
  )
}
