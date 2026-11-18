import { describe, expect, it } from 'vitest'
import { withoutToken, withoutTokens } from './scrub'

describe('withoutToken', () => {
  it.each([
    ['https://luchess.example/reset-password?token=abc', 'https://luchess.example/reset-password'],
    ['https://luchess.example/verify-email?token=abc&x=1', 'https://luchess.example/verify-email?x=1'],
    ['https://luchess.example/verify-email?x=1&token=abc', 'https://luchess.example/verify-email?x=1'],
    ['https://luchess.example/verify-email?x=1&token=abc&y=2', 'https://luchess.example/verify-email?x=1&y=2'],
    ['https://luchess.example/reset-password?token=abc#top', 'https://luchess.example/reset-password#top'],
    ['/reset-password?token=abc', '/reset-password'],
  ])('removes the token from %s', (url, expected) => {
    expect(withoutToken(url)).toBe(expected)
  })

  it.each(['https://luchess.example/notes/4?move=12', 'https://luchess.example/?mytoken=1', 'a token=1 in text'])(
    'leaves %s as it is',
    (text) => {
      expect(withoutToken(text)).toBe(text)
    },
  )
})

describe('withoutTokens', () => {
  it('removes tokens from every URL in an event, nested ones too', () => {
    const event = {
      event: '$pageview',
      properties: {
        $current_url: 'https://luchess.example/reset-password?token=abc',
        $referrer: 'https://luchess.example/verify-email?token=def',
        $set_once: { $initial_current_url: 'https://luchess.example/verify-email?token=def' },
        list: ['https://luchess.example/verify-email?token=def'],
        count: 3,
        missing: null,
      },
    }

    expect(withoutTokens(event)).toEqual({
      event: '$pageview',
      properties: {
        $current_url: 'https://luchess.example/reset-password',
        $referrer: 'https://luchess.example/verify-email',
        $set_once: { $initial_current_url: 'https://luchess.example/verify-email' },
        list: ['https://luchess.example/verify-email'],
        count: 3,
        missing: null,
      },
    })
  })
})
