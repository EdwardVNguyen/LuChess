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
  // The dashed border of an editor waiting for writing (Note.dc.html "Add a thought").
  dashed: '#A99C7E',
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
  // The lift under a dialog that floats over the page (QuickFind.dc.html).
  dialogShadow: '0 24px 60px rgba(42, 38, 32, .28)',
  // Long-form copy on the landing page (HomeLoggedOut.dc.html), a shade lighter than ink.
  prose: '#4A443A',
  // The outline button's border on the ink sign-up band (HomeLoggedOut.dc.html).
  bandEdge: '#6B6353',
  // The three dots on the browser frame around a picture of the app (HomeLoggedOut.dc.html).
  windowDot: '#CDBF9F',
  // The landing hero's cards: the Note card, and the smaller linked cards around it.
  liftShadow: '0 22px 50px rgba(42, 38, 32, .18)',
  cardShadow: '0 10px 26px rgba(42, 38, 32, .12)',
  // The browser frame around a picture of the app.
  pictureShadow: '0 18px 44px rgba(42, 38, 32, .16)',
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

export const spacingTokens = {
  // How far each level of the Folder tree is indented (Note.dc.html's sidebar).
  treeIndent: '22px',
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
