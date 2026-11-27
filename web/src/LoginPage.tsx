import { useForm } from '@tanstack/react-form'
import { useMutation } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { z } from './zod.ts'
import { ApiError } from './api'
import { AuthAlert, AuthButton, AuthForm, AuthPasswordField, AuthRowEnd, AuthTextField, AuthTitle } from './auth/AuthForm'
import { AuthLayout } from './auth/AuthLayout'
import { ResendVerification } from './ResendVerification'
import { errorMessage } from './errors'
import { useSession } from './session'

// Login only checks that something was typed. The password rules apply when
// choosing a password, and the server decides whether these credentials are right.
const loginSchema = z.object({
  email: z.string().trim().min(1, 'Enter your email'),
  password: z.string().min(1, 'Enter your password'),
})

export function LoginPage() {
  const navigate = useNavigate()
  const { signIn } = useSession()
  const login = useMutation({ mutationFn: signIn })

  const form = useForm({
    defaultValues: { email: '', password: '' },
    validators: { onSubmit: loginSchema },
    onSubmit: async ({ value }) => {
      try {
        await login.mutateAsync(loginSchema.parse(value))
        await navigate({ to: '/notes' })
      } catch {
        // The error is shown from the mutation state below
      }
    },
  })

  const needsVerification = login.error instanceof ApiError && login.error.status === 403

  return (
    <AuthLayout quote="Remember chess the way you remember a good story.">
      <AuthTitle
        lead={
          <>
            New here? <Link to="/signup">Create an account</Link>
          </>
        }
      >
        Log in
      </AuthTitle>
      <AuthForm onSubmit={() => void form.handleSubmit()}>
        <form.Field name="email">
          {(field) => (
            <AuthTextField
              label="Email"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              value={field.state.value}
              onChange={field.handleChange}
              onBlur={field.handleBlur}
              error={field.state.meta.errors[0]?.message}
            />
          )}
        </form.Field>
        <form.Field name="password">
          {(field) => (
            <AuthPasswordField
              label="Password"
              autoComplete="current-password"
              value={field.state.value}
              onChange={field.handleChange}
              onBlur={field.handleBlur}
              error={field.state.meta.errors[0]?.message}
            />
          )}
        </form.Field>

        <AuthRowEnd>
          <Link to="/forgot-password">Forgot password?</Link>
        </AuthRowEnd>

        {login.isError && (
          <AuthAlert tone={needsVerification ? 'warning' : 'error'}>{errorMessage(login.error)}</AuthAlert>
        )}

        <AuthButton type="submit" loading={login.isPending}>
          Log in
        </AuthButton>
      </AuthForm>

      {needsVerification && (
        <form.Subscribe selector={(state) => state.values.email.trim()}>
          {(email) => <ResendVerification email={email || undefined} />}
        </form.Subscribe>
      )}
    </AuthLayout>
  )
}
