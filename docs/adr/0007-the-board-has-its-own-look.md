# The board has its own look

The shared `Board` deliberately departs from `design/`. The designs draw a beige board with a 1px ink border, Noto Sans Symbols 2 glyphs for pieces, and coordinates in a gutter outside the board. We replaced all of these, looking at how the major chess sites draw their boards, but the result is our own board and not a copy of any of them:

- **Pieces:** the cburnett set (Colin M.L. Burnett, on Wikimedia Commons), used under the BSD 3-Clause option of its GFDL/BSD/GPL licence. That option fits this repo's MIT licence; the GPL and GFDL options don't. The notice is in `THIRD_PARTY_NOTICES.md`.
- **Squares:** a warm brown of our own (`boardLight`, `boardDark`) that sits on the app's paper colour. The usual chess-site brown looked cold next to it.
- **Frame:** no border and square corners, with a soft shadow (`boardShadow`).
- **Coordinates:** drawn inside, on the edge squares (files along the bottom, ranks down the right), each in the other square's colour. They flip with orientation and scale with the board.
- **Highlights:** our accent colours, not the usual greens: amber for the last move and oxblood for the selected square. Both are translucent so they read on both square colours.
- **Drawings:** the four brushes are named green, red, blue and yellow (Shift, Alt or both pick the last three), since those are what PGN's `[%cal]`/`[%csl]` store. Their colours are board tokens of our own (`brushGreen` and so on), warmed to the paper palette and the same in every theme: the default brush draws a light orange, then brick red, slate blue and ochre. A left-click on the board clears them. Arrows are react-chessboard's; circles are rings drawn as square styles (#77).

We chose this look from a throwaway prototype (#56, branch `board-style-prototype`) that switched each of these options live on the Note page and `/dev/board`. Interactions (capture rings, check glow, drag-over, Ply animation) follow the common conventions of chess sites (#55). Chessground stays rejected (ADR 0006).

## Consequences

The board no longer matches `design/screenshots/`, so screenshot comparisons that show a board will differ there by design. This supersedes the part of ADR 0006 that says the board uses the design's Noto Sans Symbols 2 glyphs. The font, its `--cn-font-symbols` variable and the piece-fill tokens are gone. Because the coordinates are inside the board, it now fills its container's full width with no 22px gutter, and the move controls line up with its left edge.
