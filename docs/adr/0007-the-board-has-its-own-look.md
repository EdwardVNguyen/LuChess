# The board has its own look, with Lichess as the reference

The shared `Board` deliberately departs from `design/`. The designs draw a beige board with a 1px ink border, Noto Sans Symbols 2 glyphs for pieces, and coordinates in a gutter outside the board. We replaced all of these, using Lichess as the reference, but the result is our own board and not a copy of Lichess:

- **Pieces:** the cburnett set (Colin M.L. Burnett, on Wikimedia Commons), used under the BSD 3-Clause option of its GFDL/BSD/GPL licence. That option fits this repo's MIT licence; the GPL and GFDL options don't. The notice is in `THIRD_PARTY_NOTICES.md`.
- **Squares:** a warm brown of our own (`boardLight`, `boardDark`) that sits on the app's paper colour. Lichess's brown looked cold next to it.
- **Frame:** no border and square corners, with a soft shadow (`boardShadow`).
- **Coordinates:** drawn inside, on the edge squares (files along the bottom, ranks down the right), each in the other square's colour. They flip with orientation and scale with the board.
- **Highlights:** our accent colours, not Lichess's greens: amber for the last move and oxblood for the selected square. Both are translucent so they read on both square colours.

We chose this look from a throwaway prototype (#56, branch `board-style-prototype`) that switched each of these options live on the Note page and `/dev/board`. Interactions (capture rings, check glow, drag-over, Ply animation) follow Lichess too (#55). Chessground stays rejected (ADR 0006).

## Consequences

The board no longer matches `design/screenshots/`, so screenshot comparisons that show a board will differ there by design. This supersedes the part of ADR 0006 that says the board uses the design's Noto Sans Symbols 2 glyphs. The font, its `--cn-font-symbols` variable and the piece-fill tokens are gone. Because the coordinates are inside the board, it now fills its container's full width with no 22px gutter, and the move controls line up with its left edge.
