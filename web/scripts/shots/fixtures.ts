import type { Folder, Note, PlyWriting, User } from '../../src/api.js'
import { fischerSpassky1972Game6 } from '../../src/chess/fixtures.js'

// Sample data only, per web/AGENTS.md: these names belong in fixtures and
// tests, never in product copy.
export const fischer: User = { id: 1, email: 'bobby@example.com', name: 'Bobby Fischer' }

export const loggedInSession = {
  accessToken: 'shots-access-token',
  user: fischer,
}

const at = '2026-11-01T12:00:00Z'

// Filed as in design/screens/Note.dc.html's sidebar.
export const sampleFolders: Folder[] = [
  { id: 1, parentId: null, name: 'Fischer' },
  { id: 2, parentId: null, name: 'Openings' },
  { id: 3, parentId: null, name: 'Concepts' },
  { id: 4, parentId: null, name: 'Endgames' },
  { id: 5, parentId: null, name: 'Personal games' },
  { id: 6, parentId: 2, name: 'Queen’s Gambit Declined' },
  { id: 7, parentId: null, name: 'Positions' },
]

export const sampleNotes: Note[] = [
  {
    id: 1,
    name: 'Fischer v. Spassky 1972',
    pgn: fischerSpassky1972Game6.replace('[Result "1-0"]', '[Result "1-0"]\n[Opening "Queen\'s Gambit Declined"]'),
    startFen: null,
    folderId: 1,
    createdAt: at,
    updatedAt: '2026-11-03T12:00:00Z',
  },
  {
    id: 2,
    name: 'Byrne v. Fischer 1956',
    pgn: '[Event "Rosenwald Memorial"]\n\n1. Nf3 Nf6 2. c4 g6 3. Nc3 Bg7 4. d4 O-O *',
    startFen: null,
    folderId: 1,
    createdAt: at,
    updatedAt: '2026-11-02T12:00:00Z',
  },
  {
    id: 3,
    name: 'Lucena position',
    pgn: '[SetUp "1"]\n[FEN "1K1k4/1P6/8/8/8/8/r7/2R5 w - - 0 1"]\n\n*',
    startFen: '1K1k4/1P6/8/8/8/8/r7/2R5 w - - 0 1',
    folderId: 4,
    createdAt: at,
    updatedAt: at,
  },
  // The targets of the Links in the design's Bodies, and the Note in its "Linked from".
  {
    id: 4,
    name: 'Tartakower Variation',
    pgn: '[Opening "Queen\'s Gambit Declined"]\n\n1. d4 d5 2. c4 e6 3. Nc3 Nf6 4. Bg5 Be7 5. e3 O-O 6. Nf3 h6 7. Bh4 b6 *',
    startFen: null,
    folderId: 6,
    createdAt: at,
    updatedAt: at,
  },
  {
    id: 5,
    name: 'Hanging pawns',
    pgn: '*',
    startFen: null,
    folderId: 3,
    createdAt: at,
    updatedAt: at,
  },
  {
    id: 6,
    name: 'Club night, October',
    pgn: '[Event "Club night"]\n[White "Lovelace, Ada"]\n[Black "Hopper, Grace"]\n[Date "2026.10.14"]\n\n1. c4 e6 2. Nc3 d5 3. d4 Nf6 4. cxd5 exd5 5. Bg5 Be7 6. e3 O-O 7. Bd3 b6 *',
    startFen: null,
    folderId: 5,
    createdAt: at,
    updatedAt: at,
  },
  {
    id: 7,
    name: 'Greek gift',
    pgn: '1. e4 e6 2. d4 d5 3. Nc3 Nf6 4. e5 Nfd7 *',
    startFen: null,
    folderId: 3,
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
      body: 'The [[note:4]]: Black fianchettoes and invites trades to relieve the cramp. A surprise from a lifelong 1.e4 player, who opens 1.c4.',
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
      body: 'Black gets [[note:5|hanging pawns]] on c5 and d5. They are strong while they can advance and weak the moment they are frozen.',
    }),
    writing(39, { moveGlyph: '!', positionGlyph: '±' }),
    writing(41, {
      body: 'Fischer trades the knight for the bishop that guarded d5, then strikes in the centre. The pawns stop being a strength and become targets.',
    }),
  ],
  // A Link to a Note since deleted, with and without its label.
  7: [
    writing(0, { body: 'A sacrifice to study next to [[note:98|the Evergreen]] and [[note:99]].' }),
  ],
  6: [
    writing(12, {
      comment: 'The same structure as in [[note:1|the 1972 game]]: hanging pawns on c5 and d5, and I froze them too late.',
    }),
  ],
}
