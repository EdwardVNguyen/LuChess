import type { Note, PlyWriting, User } from '../../src/api.js'
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

function writing(ply: number, fields: Partial<PlyWriting>): PlyWriting {
  return { ply, comment: null, body: null, moveGlyph: null, positionGlyph: null, updatedAt: at, ...fields }
}

/** The writing on each sample Note's Plies, by Note ID; the Bodies follow design/screens/Note.dc.html. */
export const samplePlies: Record<number, PlyWriting[]> = {
  1: [
    writing(0, {
      body: 'Hanging pawns are strong only while they can advance. Trade off their defenders and freeze them, and they become the target.',
    }),
    writing(1, { moveGlyph: '!?', comment: 'A surprise from a lifelong 1.e4 player.' }),
    writing(14, {
      body: 'The Tartakower Variation: Black fianchettoes and invites trades to relieve the cramp. A surprise from a lifelong 1.e4 player, who opens 1.c4.',
    }),
    writing(20, {
      body: "The trades ease Black's position, but they leave a fixed pawn on d5, and that structure is what the rest of the game is about.",
    }),
    writing(25, {
      moveGlyph: '!',
      comment:
        "Hits c5 at once and ties Black's rook to its defence. A small move that already shows Fischer's plan: every white piece will aim at the pawns, and Black will run out of defenders before White runs out of attackers.",
    }),
    writing(30, {
      positionGlyph: '⩲',
      body: 'Black gets hanging pawns on c5 and d5. They are strong while they can advance and weak the moment they are frozen.',
    }),
    writing(39, { moveGlyph: '!', positionGlyph: '±' }),
    writing(41, {
      body: 'Fischer trades the knight for the bishop that guarded d5, then strikes in the centre. The pawns stop being a strength and become targets.',
    }),
  ],
}
