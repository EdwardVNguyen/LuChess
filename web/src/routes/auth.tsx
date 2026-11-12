import { createLazyRoute } from '@tanstack/react-router'
import { ForgotPasswordPage } from '../ForgotPasswordPage'
import { LoginPage } from '../LoginPage'
import { ResetPasswordPage } from '../ResetPasswordPage'
import { SignUpPage } from '../SignUpPage'
import { VerifyEmailPage } from '../VerifyEmailPage'

// The auth pages' chunk. They are the only users of TanStack Form.
export const signUpRoute = createLazyRoute('/signup')({ component: SignUpPage })
export const loginRoute = createLazyRoute('/login')({ component: LoginPage })
export const verifyEmailRoute = createLazyRoute('/verify-email')({ component: VerifyEmailPage })
export const forgotPasswordRoute = createLazyRoute('/forgot-password')({ component: ForgotPasswordPage })
export const resetPasswordRoute = createLazyRoute('/reset-password')({ component: ResetPasswordPage })
