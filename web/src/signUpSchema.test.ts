import { describe, expect, it } from 'vitest'
import { signUpSchema } from './signUpSchema'

const valid = { email: 'ada@example.com', name: 'Ada', password: 'correct horse battery' }

function failedFields(input: Record<string, string>) {
  const result = signUpSchema.safeParse(input)
  if (result.success) return []
  return result.error.issues.map((issue) => String(issue.path[0]))
}

describe('signUpSchema', () => {
  it('accepts valid details and trims the email and name', () => {
    const result = signUpSchema.parse({ ...valid, email: '  ada@example.com ', name: '  Ada  ' })

    expect(result).toEqual(valid)
  })

  it.each([
    ['empty', ''],
    ['no @', 'ada.example.com'],
    ['no domain dot', 'ada@localhost'],
    ['with a display name', 'Ada <ada@example.com>'],
    ['too long', 'a'.repeat(250) + '@example.com'],
  ])('rejects an email that is %s', (_case, email) => {
    expect(failedFields({ ...valid, email })).toEqual(['email'])
  })

  it.each([
    ['blank', '   '],
    ['one character', 'A'],
    ['over 32 characters', 'a'.repeat(33)],
    ['containing a control character', 'Ada\u0000Lovelace'],
  ])('rejects a name that is %s', (_case, name) => {
    expect(failedFields({ ...valid, name })).toEqual(['name'])
  })

  it.each([
    ['under 10 characters', '123456789'],
    ['over 128 characters', 'a'.repeat(129)],
  ])('rejects a password that is %s', (_case, password) => {
    expect(failedFields({ ...valid, password })).toEqual(['password'])
  })

  it('accepts the length limits exactly, counting characters and not bytes', () => {
    expect(signUpSchema.safeParse({ ...valid, password: 'a'.repeat(10) }).success).toBe(true)
    expect(signUpSchema.safeParse({ ...valid, password: 'a'.repeat(128) }).success).toBe(true)
    expect(signUpSchema.safeParse({ ...valid, password: 'é'.repeat(100) }).success).toBe(true)
    expect(signUpSchema.safeParse({ ...valid, name: 'Zoë' }).success).toBe(true)
  })

  it('does not trim the password', () => {
    const result = signUpSchema.parse({ ...valid, password: '  spaces are fine  ' })

    expect(result.password).toBe('  spaces are fine  ')
  })
})
