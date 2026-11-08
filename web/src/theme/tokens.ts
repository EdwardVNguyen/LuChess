// The one place raw hex values are allowed to live. Everything else should
// read colors from the Mantine theme (`src/theme/theme.ts`) or the CSS
// variables this theme exposes. Values come from `design/README.md`.
export const colorTokens = {
  ink: '#2A2620',
  muted: '#5F5748',
  paper: '#FAF6EC',
  ground: '#EFE8D8',
  sidebar: '#E7DEC9',
  marginPanel: '#F3ECDC',
  rule: '#D9CFB8',
  card: '#FFFCF5',
  edge: '#CFC3A6',
  highlight: '#EBDDB8',
  accent: '#8A2E24',
  avatar: '#D6C8A6',
  boardLight: '#EDE2C8',
  boardDark: '#B9A47C',
  // The last move's from and to squares on the board.
  boardLastMove: '#DDB87A',
  // Piece glyph fills; white pieces also get an `ink` outline.
  pieceLight: '#FFFDF6',
  pieceDark: '#1F1B16',
  overlay: 'rgba(42, 38, 32, .45)',
} as const

export const fontTokens = {
  // Body text and headings.
  serif: "'Newsreader', Georgia, serif",
  // UI chrome: buttons, inputs, labels, nav.
  sans: "'Hanken Grotesk', system-ui, sans-serif",
  // Chess piece glyphs; append U+FE0E to force the text presentation.
  symbols: "'Noto Sans Symbols 2', 'Hanken Grotesk', system-ui, sans-serif",
} as const

export const radiusTokens = {
  // Buttons.
  sm: '8px',
  // Cards.
  md: '10px',
  // Dialogs (Modal, Drawer, Popover).
  lg: '12px',
  // Pills (filter chips, badges).
  xl: '20px',
} as const

// Chosen so 390px (mobile), 834px (tablet) and 1440px (desktop) each land in
// a different band: below `sm`, between `sm` and `lg`, and at or above `lg`.
export const breakpointTokens = {
  xs: '26.25em', // 420px
  sm: '48em', // 768px
  md: '64em', // 1024px
  lg: '90em', // 1440px
  xl: '100em', // 1600px
} as const
