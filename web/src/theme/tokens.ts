// The one place raw hex values are allowed to live. Everything else should
// read colors from the Mantine theme (`src/theme/theme.ts`) or the CSS
// variables this theme exposes.

/** The site's themes (docs/adr/0008). Night is the default. */
export type ThemeName = 'night' | 'cool' | 'warm'

// What one theme paints the page with. The board keeps its own colours in
// every theme (`boardTokens`, docs/adr/0007).
export type Palette = {
  /** Night is dark: Mantine's dark scheme, and the browser's dark scrollbars and form controls. */
  scheme: 'light' | 'dark'
  /** The text colour, and the fill of primary buttons. */
  ink: string
  muted: string
  paper: string
  ground: string
  sidebar: string
  marginPanel: string
  rule: string
  card: string
  edge: string
  highlight: string
  /** The dashed border of an editor waiting for writing (Note.dc.html "Add a thought"). */
  dashed: string
  /** Links, and anything calling out a link or a destructive action. */
  accent: string
  avatar: string
  /** Long-form copy on the landing page (HomeLoggedOut.dc.html), a shade softer than ink. */
  prose: string
  /** The outline button's border on the ink sign-up band (HomeLoggedOut.dc.html). */
  bandEdge: string
  /** The three dots on the browser frame around a picture of the app (HomeLoggedOut.dc.html). */
  windowDot: string
  /** What the overlay and the shadows are made from: ink on a light theme, black on a dark one. */
  shadowBase: string
  /** The lightest and darkest shades of Mantine's 10-shade ramps around ink and accent (src/theme/colors.ts). */
  inkRamp: [string, string]
  accentRamp: [string, string]
}

export const palettes: Record<ThemeName, Palette> = {
  // After Tokyo Night: deep navy surfaces, pale blue-grey text, a blue accent.
  night: {
    scheme: 'dark',
    ink: '#C0CAF5',
    muted: '#9AA5CE',
    paper: '#1A1B26',
    ground: '#16161E',
    sidebar: '#13131A',
    marginPanel: '#1F2030',
    rule: '#292E42',
    card: '#1F2335',
    edge: '#3B4261',
    highlight: '#283457',
    dashed: '#545C7E',
    accent: '#7AA2F7',
    avatar: '#414868',
    prose: '#A9B1D6',
    bandEdge: '#737AA2',
    windowDot: '#414868',
    shadowBase: '#000000',
    inkRamp: ['#FFFFFF', '#1A1B26'],
    accentRamp: ['#C9DAFF', '#1E2740'],
  },
  // An off-white page, slate ink and a deep blue accent.
  cool: {
    scheme: 'light',
    ink: '#1F2933',
    muted: '#52606D',
    paper: '#F7F8FA',
    ground: '#ECEFF3',
    sidebar: '#E2E7ED',
    marginPanel: '#F0F3F6',
    rule: '#D4DBE3',
    card: '#FFFFFF',
    edge: '#C3CDD8',
    highlight: '#DAE5F3',
    dashed: '#97A3B0',
    accent: '#1F4E8C',
    avatar: '#CAD3DE',
    prose: '#3E4C59',
    bandEdge: '#5A6876',
    windowDot: '#C3CDD8',
    shadowBase: '#1F2933',
    inkRamp: ['#F7F8FA', '#0E141A'],
    accentRamp: ['#E8EEF7', '#0F2747'],
  },
  // The design's original palette (design/README.md): paper, ink, oxblood.
  warm: {
    scheme: 'light',
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
    dashed: '#A99C7E',
    accent: '#8A2E24',
    avatar: '#D6C8A6',
    prose: '#4A443A',
    bandEdge: '#6B6353',
    windowDot: '#CDBF9F',
    shadowBase: '#2A2620',
    inkRamp: ['#FAF6EC', '#15120E'],
    accentRamp: ['#F3ECE0', '#4A1811'],
  },
}

// The board's own look (docs/adr/0007), the same in every theme.
export const boardTokens = {
  // A warm brown.
  light: '#ECDAB6',
  dark: '#AD855C',
  // The board has no border; this lifts it off the page.
  shadow: '0 2px 10px rgba(42, 38, 32, .28)',
  // The last move's from and to squares, and the selected piece's square.
  // Translucent, so each reads on both square colours.
  lastMove: 'rgba(222, 160, 50, .5)',
  selected: 'rgba(138, 46, 36, .38)',
  // A legal target square: a dot when empty, a ring when it holds a piece to capture.
  target: 'rgba(42, 38, 32, .35)',
  // The square under a piece being dragged.
  dragOver: 'rgba(42, 38, 32, .2)',
  // The glow on the square of a king in check.
  check: '#D9402B',
} as const

export const fontTokens = {
  // All text (docs/adr/0008).
  sans: "'Inter', system-ui, sans-serif",
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
  // How wide a collapsed sidebar or margin is: a rail with its expand button (#61).
  paneRail: '32px',
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
