import { useForm } from '@tanstack/react-form'
import { useMutation } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { z } from './zod.ts'
import { AuthAlert, AuthButton, AuthForm, AuthStack, AuthText, AuthTextField, AuthTitle } from './auth/AuthForm'
import { AuthLayout } from './auth/AuthLayout'
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
      <AuthLayout>
        <AuthTitle>Check your email</AuthTitle>
        <AuthStack>
          <AuthText>{forgot.data.message}</AuthText>
          <AuthText quiet>
            The link works once and expires after 1 hour. Didn't get it? Check your spam folder, or{' '}
            <Link to="/forgot-password" onClick={() => forgot.reset()}>
              try again
            </Link>
            .
          </AuthText>
          <AuthText>
            <Link to="/login">Back to log in</Link>
          </AuthText>
        </AuthStack>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout>
      <AuthTitle
        lead={
          <>
            Remembered it? <Link to="/login">Log in</Link>
          </>
        }
      >
        Forgot your password?
      </AuthTitle>
      <AuthForm onSubmit={() => void form.handleSubmit()}>
        <AuthText>Enter the email you signed up with and we'll send you a link to choose a new password.</AuthText>
        <form.Field name="email">
          {(field) => (
            <AuthTextField
              label="Email"
              type="email"
              autoComplete="email"
              value={field.state.value}
              onChange={field.handleChange}
              onBlur={field.handleBlur}
              error={field.state.meta.errors[0]?.message}
            />
          )}
        </form.Field>

        {forgot.isError && <AuthAlert tone="error">{errorMessage(forgot.error)}</AuthAlert>}

        <AuthButton type="submit" loading={forgot.isPending}>
          Send reset link
        </AuthButton>
      </AuthForm>
    </AuthLayout>
  )
}
