import { z } from 'zod'

// These rules mirror the API's, so a problem shows before the form is sent.
// Lengths count characters (not UTF-16 units), as the API does.
const chars = (s: string) => [...s].length

export const signUpSchema = z.object({
  email: z
    .string()
    .trim()
    .max(254, 'Enter a valid email address')
    .pipe(z.email('Enter a valid email address')),
  name: z
    .string()
    .trim()
    .refine(
      (name) => chars(name) >= 2 && chars(name) <= 32 && !/\p{Cc}/u.test(name),
      'Display name must be 2 to 32 characters with no control characters',
    ),
  password: z
    .string()
    .refine((password) => chars(password) >= 10 && chars(password) <= 128, 'Password must be 10 to 128 characters'),
})

export type SignUpValues = z.infer<typeof signUpSchema>
