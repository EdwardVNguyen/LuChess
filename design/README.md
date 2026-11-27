# Chess Notes: design handoff

Hi-fi designs for a chess notes web app, to be turned into React. Every screen exists at three sizes: desktop (1440px, files named `Name.dc.html`), tablet (834px, `Name-tablet.dc.html`) and mobile (390px, `Name-mobile.dc.html`).
Read the PNG in `screenshots/` first for the visual target, then the matching HTML in `screens/` for exact
styles (all styles are inline: colors, sizes, spacing and fonts can be copied straight out).

## Product in one paragraph
Chess Notes uses Luhmann's Zettelkasten method for chess. One note = one game (or position/endgame), notes link to
each other Obsidian-style, and the app should feel like reading a book. Core belief: people learn best from good
resources by real people (articles, stories behind games), not engines. Three logged-in areas (Library, Study, Play)
plus a logged-out homepage and public article pages.

## Folder layout
- `screenshots/` one PNG per screen (rendered from the HTML)
- `screens/` one HTML file per screen (`*.dc.html`). Strip the `<script>` tag and treat `<helmet>` as `<head>`.
  `screens/img/` holds the three product pictures used on the homepage.
- `wireframes/` the original rough sketches, for intent only. The hi-fi screens supersede them.
- `canvas.json` canvas positions; ignore for the build.
- `pages/` the newer handoff for the logged-out Home, Log in and Sign up pages: plain HTML, a shared `styles.css`
  and `DESIGN.md` (tokens, breakpoints, behaviour, image licences). It replaces the old `HomeLoggedOut*.dc.html`.
  Its photos go in `pages/img/`.

## Screens, suggested routes and states
Prototype links between screens are plain `href="Other.dc.html"` anchors; use them as the navigation map.

Logged out (public, no account needed to read articles)
- `HomeLoggedOut` `/`  dark photo hero (Sign up free, Try as a guest), How it works, 2 feature rows, article cards, FAQ, sign-up band, footer. Designed in `pages/home.html`, see `pages/DESIGN.md`
- `Login` `/login` and `SignUp` `/signup`  split layout: dark form panel and a photo. Designed in `pages/login.html` and `pages/signup.html`
- `ArticleList` `/articles`  public list of all articles: search, 3-col card grid, right filter panel (Phase, Type, Sort by), guest banner, bookmark leads to sign-up
- `ArticleGuest` `/articles/:id`  Read view of one article with guest banner; Save/Follow lead to sign-up

Study (logged in)
- `Note` `/study/:noteId`  game note: tree sidebar, board, line of thought, margin (sub-variation, reader notes, connections, linked from)
- `QuickFind`  same screen with the Cmd+K fuzzy-find overlay open

Library (logged in)
- `Library` `/library`  saved items: followed creators/topics, history, custom folders, filters
- `AllStudies` `/library/all`  everyone's studies; `AllStudiesSave` = bookmark popover "Save to folder"; `AllStudiesNewFolder` = popover with new-folder input
- `NewFolder`  new-folder dialog over Library
- `Article` `/articles/:id`  logged-in Read view; `ArticleSave`, `ArticleNewFolder` = save popover states
- `Settings` `/settings`  choose Study view or Read view for articles

Play (logged in)
- `PlayLobby` `/play`  time-format grid (1+0, 3+0, 10+0, 30+0, 2+1, 3+2, 10+5, 30+20), Custom, open challenges, bots; `PlayCustomTime` = custom-time dialog
- `NewChallenge` `/play/new`  pick opening, side, time (pre-selected from lobby), opponent, number of book moves
- `PlayWaiting` `/play/waiting`  waiting for an opponent to accept
- `PlayGameChallenger` `/play/game/:id`  challenger view (opening progress, attempts left, hint); `PlayGameOffBook` = off-book dialog; `PlayGameOpponent` = opponent view with cheat sheet (cannot deviate); `PlayResult` = game over dialog with rating change
- `PlaySettings` `/play/settings`  ChessNotes rating, penalty choice, attempts before penalty

## Rules the UI encodes (keep in the code)
- Only one rating: the ChessNotes rating. No Chess.com/Lichess rating anywhere.
- Opponent who accepts a challenge gets a cheat sheet and cannot leave the opening line.
- Challenger gets N take-backs ("attempts"), then a penalty (none / lose 30s / lose 5 rating points; chosen in Play settings).
- Articles are readable by anyone, no account. Saving, following, adding notes and playing need an account.
- Bookmark = save to a folder (Chrome-bookmark style popover, with "new folder").

## Design tokens
The tokens below are for the `*.dc.html` screens. The logged-out pages in `pages/` have their own tokens
(Source Serif 4 and Inter, a dark "night" panel with tan buttons) and their own breakpoints (mobile ≤ 640px,
tablet 641–1024px, desktop ≥ 1025px); see `pages/DESIGN.md`.

Colors: ink `#2A2620`, muted `#5F5748`, paper `#FAF6EC`, ground `#EFE8D8`, sidebar `#E7DEC9`, margin panel `#F3ECDC`,
rule `#D9CFB8`, card `#FFFCF5`, edge `#CFC3A6`, highlight `#EBDDB8`, link/accent oxblood `#8A2E24`.
Board squares light `#EDE2C8`, dark `#B9A47C`. Dark overlays `rgba(42,38,32,.45)`.
Fonts: Newsreader (serif, body and headings), Hanken Grotesk (sans, UI and labels), Noto Sans Symbols 2 (chess piece glyphs,
append U+FE0E for text presentation). Radii 8 (buttons), 10 to 12 (cards, dialogs). Nav bar 56px (64px on homepage).

## Notes for the build
- Pieces on the boards are Unicode glyphs; a real build will likely use a chess board library (e.g. chessground or react-chessboard) styled with the colors above.
- Chat, timers, ratings and article content are static sample data (Fischer v. Spassky 1972, Najdorf English Attack).
- Hover/focus/empty/error states are not designed; use sensible defaults in the same style.

## Responsive behavior (tablet 834px, mobile 390px)
- Same screens, same routes, same states as desktop; build one responsive component per screen, not three apps.
- Navigation: desktop and tablet use the top bar with Library / Study / Play tabs. Mobile uses a top bar (logo, find, new note, avatar) plus a bottom tab bar (Library, Study, Play). The bottom bar is hidden in a game.
- Desktop side panels collapse: the Library sidebar becomes a segmented control (Saved | All studies) plus pill rows for Following and Folders; the filter panel becomes a pill row; the Study notes tree becomes an "All notes" button.
- Card grids: 3 columns on desktop, 2 on tablet, 1 on mobile.
- Popovers and dialogs (save to folder, new folder, custom time, off the book, game result) are centered dialogs on tablet and bottom sheets on mobile.
- Study screen: desktop 3 columns; tablet board + line of thought side by side with the margin notes below; mobile one column in this order: board, big idea, line of thought, sub-variation, reader notes, connections, linked from.
- Game screen: tablet board left, opening/cheat sheet and moves right, chat below; mobile single column.
- Tall screens are drawn at full page height (scrolling content); the screenshot shows the whole page.
- Logged-out screens use a header with Log in and Sign up in place of the app tabs.
