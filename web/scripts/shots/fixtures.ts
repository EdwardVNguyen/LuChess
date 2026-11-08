import type { Note, User } from '../../src/api.js'
import { fischerSpassky1972Game6 } from '../../src/chess/fixtures.js'

// Sample data only, per web/AGENTS.md: these names belong in fixtures and
// tests, never in product copy.
export const fischer: User = { id: 1, email: 'bobby@example.com', name: 'Bobby Fischer' }

export const loggedInSession = {
  accessToken: 'shots-access-token',
  user: fischer,
}

const at = '2026-11-01T12:00:00Z'

export const sampleNotes: Note[] = [
  {
    id: 1,
    name: 'Fischer v. Spassky 1972',
    pgn: fischerSpassky1972Game6.replace('[Result "1-0"]', '[Result "1-0"]\n[Opening "Queen\'s Gambit Declined"]'),
    startFen: null,
    createdAt: at,
    updatedAt: '2026-11-03T12:00:00Z',
  },
  {
    id: 2,
    name: 'Byrne v. Fischer 1956',
    pgn: '[Event "Rosenwald Memorial"]\n\n1. Nf3 Nf6 2. c4 g6 3. Nc3 Bg7 4. d4 O-O *',
    startFen: null,
    createdAt: at,
    updatedAt: '2026-11-02T12:00:00Z',
  },
  {
    id: 3,
    name: 'Lucena position',
    pgn: '[SetUp "1"]\n[FEN "1K1k4/1P6/8/8/8/8/r7/2R5 w - - 0 1"]\n\n*',
    startFen: '1K1k4/1P6/8/8/8/8/r7/2R5 w - - 0 1',
    createdAt: at,
    updatedAt: at,
  },
]
