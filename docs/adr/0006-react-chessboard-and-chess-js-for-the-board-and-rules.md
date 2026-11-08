# react-chessboard draws the board and chess.js handles the rules

The board is drawn with **react-chessboard** (MIT), and chess rules come from **chess.js** (BSD-2): legal moves, reading and checking PGN, and FEN. Both have licences that fit this repo's MIT licence, both are widely used and maintained, and react-chessboard lets us style squares and swap in our own pieces, so the board can use the theme's board colours and the Noto Sans Symbols 2 glyphs from the design. We rejected Lichess's **chessground**, the most polished board, because it is GPL-3.0: shipping it would mean relicensing the project under the GPL. We also decided not to write our own rules engine, because move legality, PGN parsing and FEN are easy to get subtly wrong and chess.js already does them.

## Consequences

chess.js is used only inside the pure chess module (`web/src/chess`), and react-chessboard only inside the shared `Board` (`web/src/board`), so either can be replaced without touching screens. chess.js reads only a PGN's main line; variations in a pasted PGN are skipped, which fits ADR 0003 (Notes own a single line of moves). Play mode promotes pawns to a queen until a promotion picker is built (#30).
