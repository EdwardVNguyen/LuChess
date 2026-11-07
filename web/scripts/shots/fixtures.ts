import type { User } from '../../src/api.js'

// Sample data only, per web/AGENTS.md: these names belong in fixtures and
// tests, never in product copy.
export const fischer: User = { id: 1, email: 'bobby@example.com', name: 'Bobby Fischer' }

export const loggedInSession = {
  accessToken: 'shots-access-token',
  user: fischer,
}
