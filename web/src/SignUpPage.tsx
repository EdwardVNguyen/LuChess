import { useForm } from '@tanstack/react-form'
import { useMutation } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { analytics } from './analytics'
import { AuthAlert, AuthButton, AuthForm, AuthPasswordField, AuthStack, AuthText, AuthTextField, AuthTitle } from './auth/AuthForm'
import { AuthLayout } from './auth/AuthLayout'
import { ResendVerification } from './ResendVerification'
import { api } from './apiClient'
import { signUpSchema } from './signUpSchema'

const QUOTE = 'One note for every game, linked to the ideas behind it.'

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
      <AuthLayout quote={QUOTE}>
        <AuthTitle>Check your email</AuthTitle>
        <AuthStack>
          <AuthText>
            We sent a verification link to <strong>{signUp.data.email}</strong>. Open it within 24 hours to verify your
            account.
          </AuthText>
          <AuthText quiet>Didn't get it? Check your spam folder, or ask for a new link.</AuthText>
        </AuthStack>
        <ResendVerification email={signUp.data.email} />
      </AuthLayout>
    )
  }

  return (
    <AuthLayout quote={QUOTE}>
      <AuthTitle
        lead={
          <>
            Already have one? <Link to="/login">Log in</Link>
          </>
        }
      >
        Create your account
      </AuthTitle>
      <AuthForm onSubmit={() => void form.handleSubmit()}>
        <form.Field name="email">
          {(field) => (
            <AuthTextField
              label="Email"
              type="email"
              autoComplete="email"
              value={field.state.value}
              onChange={field.handleChange}
              onBlur={field.handleBlur}
              error={field.state.meta.isTouched ? field.state.meta.errors[0]?.message : undefined}
            />
          )}
        </form.Field>
        <form.Field name="name">
          {(field) => (
            <AuthTextField
              label="Display name"
              hint="Shown to others. Must be unique."
              autoComplete="nickname"
              value={field.state.value}
              onChange={field.handleChange}
              onBlur={field.handleBlur}
              error={field.state.meta.isTouched ? field.state.meta.errors[0]?.message : undefined}
            />
          )}
        </form.Field>
        <form.Field name="password">
          {(field) => (
            <AuthPasswordField
              label="Password"
              hint="10 to 128 characters."
              autoComplete="new-password"
              value={field.state.value}
              onChange={field.handleChange}
              onBlur={field.handleBlur}
              error={field.state.meta.isTouched ? field.state.meta.errors[0]?.message : undefined}
            />
          )}
        </form.Field>

        {signUp.isError && <AuthAlert tone="error">{signUp.error.message}</AuthAlert>}

        <AuthButton type="submit" loading={signUp.isPending}>
          Sign up
        </AuthButton>
      </AuthForm>
    </AuthLayout>
  )
}
